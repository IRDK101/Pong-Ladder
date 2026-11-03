// Self-hosted mode: the game's own site, with Firebase for sign-in (Google or
// an emailed link), the database and the live lobby. It installs the same
// `window.claude.use(name)` services the claude.ai viewer gives a page (db,
// user, room), plus `signin`, so the rest of the game runs unchanged.
//
// Storage: every document is kept as `{ j: <JSON text>, s?: <status>, by: <uid> }`
// in the Realtime Database (JSON text keeps arrays, empty lists and nulls exact;
// `s` lets the security rules read an approval's status). The lobby is
// `rooms/lobby/<peer>` = `{ by, p: <presence JSON>, t }`, removed when the
// page closes. What each person may read and write is enforced by the
// database rules (see database.rules.template.json), not by this code.

import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithCredential,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  child,
  connectDatabaseEmulator,
  get,
  getDatabase,
  onDisconnect,
  onValue,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  type Database,
} from 'firebase/database';
import { presenceIssue } from './online';

export interface HostConfig {
  firebase: FirebaseOptions;
  /** Use the local emulators (development and tests only). */
  emulator?: boolean;
}

/** The sign-in service the profile screen uses. */
export interface SignIn {
  signedIn: boolean;
  email: string | null;
  google(): Promise<void>;
  /** Send a sign-in link to this address. */
  emailLink(email: string): Promise<void>;
  signOut(): Promise<void>;
}

const LINK_EMAIL_KEY = 'pong-zimulator/sign-in-email';

type Json = unknown;
interface Stored {
  j?: string;
  s?: string;
  by?: string;
}

const parse = (v: Stored | null | undefined): Record<string, Json> | undefined => {
  if (!v || typeof v.j !== 'string') return undefined;
  try {
    return JSON.parse(v.j) as Record<string, Json>;
  } catch {
    return undefined;
  }
};

const code = (e: unknown) => {
  const c = String((e as { code?: string })?.code ?? (e as Error)?.message ?? '').toLowerCase();
  return c.includes('permission') ? 'invalid_argument' : 'upstream_error';
};

function deepMerge(a: Record<string, Json>, b: Record<string, Json>): Record<string, Json> {
  const out: Record<string, Json> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur) ? deepMerge(cur as Record<string, Json>, v as Record<string, Json>) : v;
  }
  return out;
}

function stored(data: Record<string, Json>, uid: string | null): Stored {
  const s: Stored = { j: JSON.stringify(data) };
  if (typeof data.status === 'string') s.s = data.status;
  if (uid) s.by = uid;
  return s;
}

function makeDb(db: Database, uid: () => string | null) {
  const snapOf = (id: string, v: Stored | null) => ({ id, exists: !!v && typeof v.j === 'string', data: () => parse(v), metadata: { fromCache: false } });
  return {
    doc(path: string) {
      const r = ref(db, path);
      const id = path.split('/').pop() ?? '';
      return {
        set: (data: Record<string, Json>) => set(r, stored(data, uid())).catch((e) => Promise.reject({ code: code(e) })),
        update: (data: Record<string, Json>) =>
          runTransaction(r, (cur: Stored | null) => stored(deepMerge(parse(cur) ?? {}, data), uid())).then(
            () => undefined,
            (e) => Promise.reject({ code: code(e) }),
          ),
        delete: () => remove(r).catch((e) => Promise.reject({ code: code(e) })),
        onSnapshot: (next: (s: ReturnType<typeof snapOf>) => void, error?: (e: { code: string }) => void) =>
          onValue(
            r,
            (snap) => next(snapOf(id, snap.val() as Stored | null)),
            () => error?.({ code: 'not_granted' }),
          ),
      };
    },
    collection(path: string) {
      return {
        onSnapshot: (next: (s: { docs: ReturnType<typeof snapOf>[]; metadata: { fromCache: boolean } }) => void, error?: (e: { code: string }) => void) =>
          onValue(
            ref(db, path),
            (snap) => {
              const docs: ReturnType<typeof snapOf>[] = [];
              snap.forEach((c) => {
                const v = c.val() as Stored | null;
                if (v && typeof v.j === 'string') docs.push(snapOf(c.key ?? '', v));
              });
              next({ docs, metadata: { fromCache: false } });
            },
            () => error?.({ code: 'not_granted' }),
          ),
      };
    },
  };
}

interface Peer {
  peer: string;
  by: string | null;
  isMe: boolean;
  sameTab: boolean;
  kind: 'viewer';
  guest: boolean;
  presence: Readonly<Record<string, Json>>;
  updatedAt: number;
}
interface PeersChange {
  peers: readonly Peer[];
  joined: readonly Peer[];
  left: readonly Peer[];
  updated: readonly Peer[];
}

/** A room: presence per open page, like the claude.ai room's presence arm. `me` is this page's peer label in every room. */
function makeRoom(db: Database, uid: string, path: string, me: string) {
  const lobby = ref(db, path);
  const stops: (() => void)[] = [];
  const mine = child(lobby, me);
  let mineObj: Record<string, Json> = {};
  let others = new Map<string, { by: string | null; p: Record<string, Json>; raw: string }>();
  let snapshot: readonly Peer[] = Object.freeze([]);
  let isConnected = false;
  const handlers = new Set<{ fn: (c: PeersChange) => void; err?: (e: { code: string }) => void }>();
  const connHandlers = new Set<(c: boolean) => void>();
  let listening = false;
  let failed = '';
  let prev = new Map<string, Peer>();
  let frame = 0;
  let writeTimer: ReturnType<typeof setTimeout> | null = null;
  let writeWaiters: { ok: () => void; no: (e: unknown) => void }[] = [];
  let disconnectSet = false;

  const build = () => {
    const list: Peer[] = [];
    const now = Date.now();
    const old = prev;
    const next = new Map<string, Peer>();
    const add = (peer: string, by: string | null, p: Record<string, Json>, raw: string) => {
      const was = old.get(peer);
      const same = was && JSON.stringify(was.presence) === raw;
      const item: Peer = same ? was! : Object.freeze({ peer, by, isMe: by === uid, sameTab: peer === me, kind: 'viewer', guest: false, presence: Object.freeze(p), updatedAt: now });
      next.set(peer, item);
      list.push(item);
    };
    add(me, uid, { ...mineObj }, JSON.stringify(mineObj));
    for (const [peer, o] of others) if (peer !== me) add(peer, o.by, o.p, o.raw);
    const joined = list.filter((p) => !old.has(p.peer));
    const left = [...old.values()].filter((p) => !next.has(p.peer));
    const updated = list.filter((p) => old.has(p.peer) && old.get(p.peer) !== p);
    prev = next;
    snapshot = Object.freeze(list);
    return { peers: snapshot, joined, left, updated };
  };
  const deliver = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const change = build();
      if (!change.joined.length && !change.left.length && !change.updated.length) return;
      for (const h of handlers) h.fn(change);
    });
  };
  const listen = () => {
    if (listening) return;
    listening = true;
    stops.push(onValue(
      lobby,
      (snap) => {
        const m = new Map<string, { by: string | null; p: Record<string, Json>; raw: string }>();
        snap.forEach((c) => {
          const v = c.val() as { by?: string; p?: string } | null;
          if (!v || typeof v.p !== 'string' || !c.key) return;
          try {
            m.set(c.key, { by: typeof v.by === 'string' ? v.by : null, p: JSON.parse(v.p), raw: v.p });
          } catch {
            /* skip a malformed card */
          }
        });
        others = m;
        deliver();
      },
      () => {
        failed = 'not_granted';
        for (const h of handlers) h.err?.({ code: 'not_granted' });
      },
    ));
    stops.push(onValue(ref(db, '.info/connected'), (s) => {
      isConnected = s.val() === true;
      for (const h of connHandlers) h(isConnected);
      // Re-assert our card after a reconnect (the server removed it on disconnect).
      if (isConnected && Object.keys(mineObj).length) flush();
    }));
  };
  const flush = () => {
    writeTimer = null;
    const waiters = writeWaiters;
    writeWaiters = [];
    const empty = !Object.keys(mineObj).length;
    const done = empty ? remove(mine) : set(mine, { by: uid, p: JSON.stringify(mineObj), t: serverTimestamp() });
    if (!empty && !disconnectSet) {
      disconnectSet = true;
      void onDisconnect(mine).remove();
    }
    done.then(
      () => waiters.forEach((w) => w.ok()),
      (e) => waiters.forEach((w) => w.no({ code: code(e) === 'invalid_argument' ? 'not_permitted' : 'upstream_error', message: 'The lobby refused this update (is your profile approved?)' })),
    );
  };

  const onHide = () => void remove(mine);
  window.addEventListener('pagehide', onHide);
  const rooms = new Map<string, ReturnType<typeof makeRoom>>();

  return {
    name: path.split('/').pop() ?? '',
    /** Each match gets its own room under rooms/m/, read only by those who join it. */
    matchRooms: true,
    async join(name: string) {
      let r = rooms.get(name);
      if (!r) rooms.set(name, (r = makeRoom(db, uid, `rooms/m/${name}`, me)));
      return r;
    },
    async leave() {
      window.removeEventListener('pagehide', onHide);
      for (const s of stops.splice(0)) s();
      handlers.clear();
      connHandlers.clear();
      listening = false;
      if (writeTimer) clearTimeout(writeTimer);
      mineObj = {};
      await onDisconnect(mine).cancel().catch(() => {});
      await remove(mine).catch(() => {});
    },
    presence(patch: Record<string, Json | null>): Promise<void> {
      const next = { ...mineObj };
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete next[k];
        else next[k] = v;
      }
      const issue = presenceIssue(next);
      if (issue) return Promise.reject({ code: 'invalid_argument', message: issue });
      mineObj = next;
      listen();
      deliver();
      return new Promise<void>((ok, no) => {
        writeWaiters.push({ ok, no });
        if (!writeTimer) writeTimer = setTimeout(flush, 33);
      });
    },
    peers: () => snapshot,
    onPeers(fn: (c: PeersChange) => void, err?: (e: { code: string }) => void) {
      const h = { fn, err };
      handlers.add(h);
      listen();
      if (failed) queueMicrotask(() => err?.({ code: failed }));
      else
        queueMicrotask(() => {
          if (!handlers.has(h)) return;
          // The first delivery presents the room so far, as on claude.ai.
          const peers = snapshot.length ? snapshot : build().peers;
          fn({ peers, joined: peers, left: [], updated: [] });
        });
      return () => void handlers.delete(h);
    },
    connected: () => isConnected,
    onConnection(fn: (c: boolean) => void) {
      connHandlers.add(fn);
      listen();
      queueMicrotask(() => fn(isConnected));
      return () => void connHandlers.delete(fn);
    },
    emit: () => Promise.resolve(),
    on: () => () => {},
  };
}

/** Set up Firebase and install the page services. Resolves once sign-in state is known. */
export async function installFirebaseHost(cfg: HostConfig): Promise<void> {
  const app = initializeApp(cfg.firebase);
  const auth = getAuth(app);
  const db = getDatabase(app);
  if (cfg.emulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(db, '127.0.0.1', 9000);
  }

  // Finish an emailed sign-in link, if this visit is one.
  if (isSignInWithEmailLink(auth, location.href)) {
    let email = '';
    try {
      email = localStorage.getItem(LINK_EMAIL_KEY) ?? '';
    } catch {
      /* private mode */
    }
    if (!email) email = window.prompt('Confirm the email address you asked for the sign-in link with') ?? '';
    if (email) {
      await signInWithEmailLink(auth, email, location.href).catch(() => {});
      try {
        localStorage.removeItem(LINK_EMAIL_KEY);
      } catch {
        /* ignore */
      }
    }
    history.replaceState(null, '', location.pathname);
  }

  const user: User | null = await new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, (u) => {
      stop();
      resolve(u);
    });
  });
  const uid = () => auth.currentUser?.uid ?? null;

  let owner: Promise<boolean> | null = null;
  const isOwner = () => (owner ??= user ? get(ref(db, 'modcheck')).then(() => true, () => false) : Promise.resolve(false));

  const services: Record<string, unknown> = {
    db: makeDb(db, uid),
    user: {
      isOwner,
      canEdit: isOwner,
      id: async () => uid(),
      me: async () => ({ name: user?.displayName || (user?.email ? user.email.split('@')[0] : ''), email: user?.email ?? null }),
      can: async (name: string) => (name === 'data.write' ? !!user : null),
      profiles: async () => ({}),
    },
    room: user ? makeRoom(db, user.uid, 'rooms/lobby', Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => 'abcdefghijklmnopqrstuvwxyz234567'[b % 32]).join('')) : null,
    signin: {
      signedIn: !!user,
      email: user?.email ?? null,
      async google() {
        await signInWithPopup(auth, new GoogleAuthProvider());
        location.reload();
      },
      async emailLink(email: string) {
        await sendSignInLinkToEmail(auth, email, { url: location.origin + location.pathname, handleCodeInApp: true });
        try {
          localStorage.setItem(LINK_EMAIL_KEY, email);
        } catch {
          /* the link still works; it asks for the address again */
        }
      },
      async signOut() {
        await signOut(auth);
        location.reload();
      },
    } satisfies SignIn,
  };
  if (cfg.emulator) {
    // Tests sign in without a popup: the auth emulator accepts an unsigned Google token.
    (window as unknown as { __testSignIn: (email: string, name?: string) => Promise<void> }).__testSignIn = async (email, name = email.split('@')[0]) => {
      await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name })));
      location.reload();
    };
  }
  (window as unknown as { claude: { use(n: string): Promise<unknown> } }).claude = { use: async (n: string) => services[n] ?? null };
}
