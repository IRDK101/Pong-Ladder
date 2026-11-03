// Online state for the published game. Works offline too: without a
// database (a local file, signed out, or a view that cannot run it) it keeps
// everything in this browser.
//
// The database (page capability `db`):
//   characters/<id>        { character, creator?, approvedAt? }
//                          The shared collection. Only the owner writes it; everyone reads it.
//   submissions/<uid>      { items: { <characterId>: Submission } }
//                          A player's characters sent for approval. Each player writes
//                          their own; only the owner reads them all (and sets the status).
//   data/users/<uid>/progress   PlayerProgress: private per player.

import type { GameConfig } from '../config';
import { validateCharacter, type Character, type Cosmetics } from '../core/character';
import type { TeamId } from '../core/types';
import { DESIGN_ORDER } from '../render/designs';
import { addXp, boxesWaiting, playerLevel, playerXp, markSeen, newRewards, newRewardsFor, seedSeen, emptyProgress, ensureStarters, matchXp, newXp, normalizeProgress, openBox, seedFromMatches, type LootItem, type PlayerProgress } from '../progress/unlocks';
import type { AppStore, KeyValueStore, MatchRecord } from './storage';
import { packChar, unpackChar, type PackedChar } from '../net/online';
import { allowedStyle, cleanNameStyle, DEFAULT_NAME_STYLE, sameStyle, type NameStyle } from '../progress/nameStyles';

interface DocSnap {
  id: string;
  exists?: boolean;
  data(): Record<string, unknown> | undefined;
  metadata: { fromCache: boolean };
}
interface QuerySnap {
  docs: DocSnap[];
  metadata: { fromCache: boolean };
}
interface DocRef {
  set(data: Record<string, unknown>): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(next: (s: DocSnap) => void, error?: (e: { code: string }) => void): () => void;
}
interface Db {
  doc(path: string): DocRef;
  collection(path: string): { onSnapshot(next: (s: QuerySnap) => void, error?: (e: { code: string }) => void): () => void };
}
interface UserApi {
  isOwner(): Promise<boolean>;
  id(): Promise<string | null>;
  me(): Promise<{ name: string; email: string | null }>;
  can(capability: string): Promise<boolean | null>;
  profiles(ids: string[]): Promise<Record<string, { name: string }>>;
}

/**
 * What the player is, for the profile screen and what they may do:
 * - moderator: the game's owner.
 * - player: an approved profile (earns XP, levels, unlocks, the leaderboard).
 * - pending: a profile waiting for the moderator.
 * - unregistered: signed in with access, no profile yet.
 * - viewonly: signed in by a view-only link (can't save online).
 * - guest: not signed in / outside claude.ai.
 */
export type Role = 'moderator' | 'player' | 'pending' | 'unregistered' | 'viewonly' | 'guest' | 'signedout';

/** Sign-in for the self-hosted site (null on claude.ai, where the viewer is already signed in). */
export interface SignInApi {
  signedIn: boolean;
  email: string | null;
  google(): Promise<void>;
  emailLink(email: string): Promise<void>;
  signOut(): Promise<void>;
}

/** A player's public profile card (profiles/<uid>): a display name they chose and their progress. */
export interface PublicProfile {
  name: string;
  xp: number;
  level: number;
  requestedAt: string;
  updatedAt: string;
  moderator?: boolean;
  /** How the name looks (color, effect, flair). */
  style?: NameStyle;
  /** The character they play as, packed small, so everyone can draw it. */
  char?: PackedChar | null;
  /** The name before the player last changed it (shown to the moderator). */
  renamedFrom?: string;
}

/** The moderator's decision on a profile (approvals/<uid>). */
export interface Approval {
  status: 'approved' | 'rejected' | 'revoked';
  note?: string;
  at: string;
}

/**
 * Temporary: every table and character is unlocked for every player (the
 * moderator asked for this while profile problems are sorted out). Set
 * `allForEveryone` back to false to return to unlocking through levels and loot boxes. Nothing is
 * lost meanwhile: XP and levels still count for approved profiles, and the loot
 * boxes they earn are waiting when this is turned off.
 */
export const UNLOCK = { allForEveryone: true };

export const PROFILE_NAME_MAX = 20;
export function cleanProfileName(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f]/g, '').replace(/\s+/g, ' ').trim().slice(0, PROFILE_NAME_MAX);
}
type ClaudeApi = { use(name: string): Promise<unknown> };

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';
export interface Submission {
  character: Character;
  status: SubmissionStatus;
  submittedAt: string;
  note?: string;
}
export interface PlayerSubmissions {
  uid: string;
  name: string;
  items: Record<string, Submission>;
}

export const PROGRESS_KEY = 'dartmouth-pong/progress/v1';
const NO_COSMETICS: Cosmetics = { nameColor: null, badges: [], spriteItem: null, celebration: null };

/** Document ids allow letters, digits and _ - . ~ : @ + only. */
export function sharedDocId(id: string): string | null {
  return /^[A-Za-z0-9_\-~:@+.]{1,200}$/.test(id) && id !== '.' && id !== '..' ? id : null;
}

function validChar(c: unknown): c is Character {
  if (!c || typeof (c as Character).id !== 'string') return false;
  try {
    return validateCharacter(c as Character).length === 0;
  } catch {
    return false;
  }
}

/** A shared document's character, or null if it is not a usable one. */
export function characterFromDoc(data: Record<string, unknown> | undefined): Character | null {
  const c = data?.character;
  return validChar(c) ? c : null;
}

/** Local characters the shared collection is missing or has an older copy of. */
export function needsUpload(local: Character[], shared: Character[]): Character[] {
  const have = new Map(shared.map((c) => [c.id, c]));
  return local.filter((c) => {
    if (!sharedDocId(c.id) || !validChar(c)) return false;
    const s = have.get(c.id);
    return !s || (c.updatedAt ?? '') > (s.updatedAt ?? '');
  });
}

const plain = <T>(x: T): Record<string, unknown> => JSON.parse(JSON.stringify(x)) as Record<string, unknown>;

/** One write at a time per document; a newer write replaces a queued one. */
class Writer {
  private pending = new Map<string, () => Promise<void>>();
  private busy = new Set<string>();
  constructor(
    private failed: (code: string | undefined, key: string) => void,
    private saved: (key: string) => void = () => {},
  ) {}
  queue(key: string, write: () => Promise<void>): void {
    this.pending.set(key, write);
    void this.flush(key);
  }
  private async flush(key: string): Promise<void> {
    if (this.busy.has(key)) return;
    const w = this.pending.get(key);
    if (!w) return;
    this.pending.delete(key);
    this.busy.add(key);
    try {
      await w();
      this.saved(key);
    } catch (e) {
      this.failed((e as { code?: string })?.code, key);
    } finally {
      this.busy.delete(key);
      void this.flush(key);
    }
  }
}

export class Account {
  /** 'online' once the database answers for a signed-in player. */
  mode: 'local' | 'online' = 'local';
  owner = false;
  uid: string | null = null;
  progress: PlayerProgress;
  /** Character id → the player who submitted it (for approved submissions). */
  creators = new Map<string, string>();
  mySubmissions: Record<string, Submission> = {};
  /** The owner's review queue: every player's submissions. */
  allSubmissions: PlayerSubmissions[] = [];
  /** A short message for the screens (e.g. a write that failed). */
  problem = '';
  /** False for view-only access: nothing can be saved online. */
  canWrite = true;
  /** Every public profile card, and the moderator's decisions, by account id. */
  profiles = new Map<string, PublicProfile>();
  approvals = new Map<string, Approval>();
  /** Who is signed in (read from the account each visit; never stored). */
  me: { name: string; email: string | null } | null = null;
  /** The self-hosted site's sign-in, or null on claude.ai. */
  signin: SignInApi | null = null;
  /** Account names for other players' ids (submitters, creators), as the account service gives them. */
  names = new Map<string, string>();
  /** Characters this player deleted (so other devices drop them too). */
  private deletedOwn: { id: string; at: string }[] = [];
  private ownLoaded = false;

  private db: Db | null = null;
  private user: UserApi | null = null;
  private listeners = new Set<() => void>();
  /** The account's saved progress has been read (until then nothing is written to it). */
  private progressLoaded = false;
  /** Where this player's profile request stands: written to the server ('sent') or refused. */
  profileState: 'none' | 'sending' | 'sent' | 'refused' = 'none';
  private writer = new Writer(
    (code, key) => {
      if (code === 'invalid_argument' && key === `profiles/${this.uid}` && !this.owner) {
        // The platform refused: this visitor can read but not save (view-only access).
        this.canWrite = false;
        this.mode = 'local';
        this.profileState = 'refused';
        if (this.uid) this.profiles.delete(this.uid);
        this.problem = '';
        return this.changed();
      }
      this.problem = code === 'quota_exceeded' ? 'The online collection is full.' : code === 'invalid_argument' ? 'You do not have permission to change that.' : 'Could not save online; trying again later.';
      this.changed();
    },
    (key) => {
      if (key === `profiles/${this.uid}` && this.profileState !== 'sent') {
        this.profileState = 'sent';
        this.changed();
      }
    },
  );
  private sharedLoaded = false;

  constructor(
    private store: AppStore,
    private cfg: GameConfig,
    private kv: KeyValueStore,
    private rng: () => number = Math.random,
  ) {
    let raw: unknown = null;
    try {
      raw = JSON.parse(kv.getItem(PROGRESS_KEY) ?? 'null');
    } catch {
      raw = null;
    }
    this.progress = normalizeProgress(raw);
    seedFromMatches(cfg, this.progress, store.matches.list());
    seedSeen(cfg, this.progress);
    this.seedEquipped();
    this.topUp();
    this.saveLocal();
    store.characters.decorate = (c) => this.decorate(c);
    store.characters.listen({
      save: (c) => {
        if (this.owner) this.uploadCharacter(c);
        this.writeOwn();
      },
      remove: (id) => {
        if (this.owner) this.removeShared(id);
        this.deletedOwn = [...this.deletedOwn.filter((d) => d.id !== id), { id, at: new Date().toISOString() }].slice(-200);
        this.writeOwn();
      },
    });
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  // ----------------------------------------------------------- connect

  async connect(): Promise<void> {
    const claude = (window as unknown as { claude?: ClaudeApi }).claude;
    if (!claude?.use) return;
    try {
      [this.db, this.user, this.signin] = (await Promise.all([claude.use('db'), claude.use('user'), claude.use('signin').catch(() => null)])) as [Db | null, UserApi | null, SignInApi | null];
    } catch {
      return;
    }
    if (!this.db) return;
    const db = this.db;
    try {
      this.owner = this.user ? await this.user.isOwner() : false;
      this.store.characters.sharedWins = !this.owner;
      this.uid = this.user ? await this.user.id() : null;
      const me = this.user ? await this.user.me() : null;
      this.me = me ? { name: me.name || '', email: me.email ?? null } : null;
      // View-only access (e.g. a public link from outside the organization) can read but never save.
      const w = this.user ? await this.user.can('data.write') : null;
      // No account id: signed in, but here by a public link from outside the
      // organization. The platform lets such visitors read, never save.
      this.canWrite = this.owner || (w !== false && !!this.uid);
    } catch {
      /* treated as a guest */
    }

    db.collection('characters').onSnapshot(
      (snap) => {
        const list: Character[] = [];
        this.creators.clear();
        for (const d of snap.docs) {
          const body = d.data();
          const c = characterFromDoc(body);
          if (!c) continue;
          list.push(c);
          if (typeof body?.creator === 'string') this.creators.set(c.id, body.creator);
        }
        void this.nameIds([...this.creators.values()]);
        this.store.characters.setShared(list);
        if (!snap.metadata.fromCache && !this.sharedLoaded) {
          this.sharedLoaded = true;
          // An older version copied the whole shared collection into players' browsers on every save.
          // Those copies aren't theirs: drop them (the shared one is still there to play).
          if (!this.owner) {
            const sharedIds = new Set(list.map((c) => c.id));
            for (const c of this.store.characters.localList()) if (sharedIds.has(c.id) && this.creators.get(c.id) !== this.uid) this.store.characters.removeQuiet(c.id);
          }
          // The owner's characters saved only in this browser join the collection.
          if (this.owner) for (const c of needsUpload(this.store.characters.localList(), list)) this.uploadCharacter(c);
        }
        if (this.topUp()) this.saveProgress();
        this.changed();
      },
      () => this.changed(),
    );

    // Profiles and the moderator's decisions are public: the leaderboard reads them.
    db.collection('profiles').onSnapshot(
      (snap) => {
        this.profiles.clear();
        for (const d of snap.docs) {
          const b = d.data();
          if (!b || typeof b.name !== 'string') continue;
          this.profiles.set(d.id, {
            name: cleanProfileName(b.name) || 'Player',
            xp: typeof b.xp === 'number' ? Math.max(0, b.xp) : 0,
            level: typeof b.level === 'number' ? b.level : 1,
            requestedAt: typeof b.requestedAt === 'string' ? b.requestedAt : '',
            updatedAt: typeof b.updatedAt === 'string' ? b.updatedAt : '',
            moderator: b.moderator === true,
            style: cleanNameStyle(b.style),
            char: b.char && typeof b.char === 'object' && unpackChar(b.char as PackedChar) ? (b.char as PackedChar) : null,
            ...(typeof b.renamedFrom === 'string' && b.renamedFrom ? { renamedFrom: cleanProfileName(b.renamedFrom) } : {}),
          });
        }
        if (this.uid && this.profiles.has(this.uid) && this.profileState === 'none') this.profileState = 'sent';
        void this.nameIds([...this.profiles.keys()]);
        this.changed();
      },
      () => this.changed(),
    );
    db.collection('approvals').onSnapshot(
      (snap) => {
        this.approvals.clear();
        for (const d of snap.docs) {
          const b = d.data();
          if (b && (b.status === 'approved' || b.status === 'rejected' || b.status === 'revoked')) this.approvals.set(d.id, { status: b.status, note: typeof b.note === 'string' ? b.note.slice(0, 200) : '', at: typeof b.at === 'string' ? b.at : '' });
        }
        this.ensureModeratorProfile();
        this.changed();
      },
      () => this.changed(),
    );

    if (!this.uid) return this.changed();
    const uid = this.uid;
    if (!this.canWrite) return this.changed(); // view-only: play as a guest
    this.mode = 'online';

    db.doc(`data/users/${uid}/progress`).onSnapshot(
      (snap) => {
        if (snap.metadata.fromCache && !snap.exists) return;
        const first = !this.progressLoaded;
        this.progressLoaded = true;
        if (snap.exists) {
          this.progress = normalizeProgress(snap.data());
          if (seedSeen(this.cfg, this.progress)) this.saveProgress();
          this.saveLocal();
          if (this.topUp()) this.saveProgress();
        } else if (first) {
          // First visit with this account: start from what this browser already has.
          this.topUp();
          this.saveProgress();
        }
        this.changed();
      },
      () => this.changed(),
    );

    // The player's own characters, kept with their account so they follow them to any device.
    db.doc(`data/users/${uid}/characters`).onSnapshot(
      (snap) => {
        if (snap.metadata.fromCache && !snap.exists) return;
        const body = snap.exists ? snap.data() : undefined;
        const items = (body?.items ?? {}) as Record<string, unknown>;
        const deleted = Array.isArray(body?.deleted) ? (body!.deleted as { id: string; at: string }[]).filter((d) => d && typeof d.id === 'string') : [];
        const local = new Map(this.store.characters.localList().map((c) => [c.id, c]));
        let changed = false;
        for (const raw of Object.values(items)) {
          if (!validChar(raw)) continue;
          const mine = local.get(raw.id);
          if (!mine || (raw.updatedAt ?? '') > (mine.updatedAt ?? '')) {
            this.store.characters.saveQuiet(raw);
            changed = true;
          }
        }
        for (const d of deleted) {
          const mine = local.get(d.id);
          if (mine && (mine.updatedAt ?? '') <= d.at && !(d.id in items)) {
            this.store.characters.removeQuiet(d.id);
            changed = true;
          }
        }
        this.deletedOwn = deleted;
        // First answer: anything this browser has that the account doesn't goes up.
        if (!this.ownLoaded) {
          this.ownLoaded = true;
          const remote = new Set(Object.keys(items));
          if (this.store.characters.localList().some((c) => !remote.has(c.id) || (c.updatedAt ?? '') > ((items[c.id] as Character | undefined)?.updatedAt ?? ''))) this.writeOwn();
        }
        if (changed) this.changed();
      },
      () => this.changed(),
    );

    if (this.owner) {
      db.collection('submissions').onSnapshot(
        (snap) => {
          this.allSubmissions = snap.docs
            .map((d) => ({ uid: d.id, name: '', items: cleanItems(d.data()?.items) }))
            .filter((s) => Object.keys(s.items).length);
          void this.nameSubmitters();
          this.changed();
        },
        () => this.changed(),
      );
    } else {
      db.doc(`submissions/${uid}`).onSnapshot(
        (snap) => {
          this.mySubmissions = snap.exists ? cleanItems(snap.data()?.items) : {};
          this.changed();
        },
        () => this.changed(),
      );
    }
    this.changed();
  }

  private async nameSubmitters(): Promise<void> {
    await this.nameIds(this.allSubmissions.map((s) => s.uid));
    let any = false;
    for (const s of this.allSubmissions) {
      const n = this.names.get(s.uid) || '';
      if (n && n !== s.name) {
        s.name = n;
        any = true;
      }
    }
    if (any) this.changed();
  }

  /** Look up account names for ids not seen yet (only shown, never stored). */
  private async nameIds(ids: string[]): Promise<void> {
    const want = [...new Set(ids)].filter((id) => id && !this.names.has(id));
    if (!this.user || !want.length) return;
    try {
      const ps = await this.user.profiles(want.slice(0, 64));
      for (const id of want) this.names.set(id, ps[id]?.name || '');
      this.changed();
    } catch {
      /* names are only a nicety */
    }
  }

  /** A player's account name for screens, or a fallback. */
  nameOf(uid: string | undefined | null): string {
    if (!uid) return 'the moderator';
    if (uid === this.uid) return 'you';
    return this.names.get(uid) || 'a player';
  }

  /** Moderator (the game's owner), signed-in player, or guest (offline / signed out). */
  get role(): Role {
    if (this.owner) return 'moderator';
    // The self-hosted site: signed out until they sign in with Google or an emailed link.
    if (this.signin && !this.uid) return 'signedout';
    // With the database but no way to save: view-only access (a public link from outside the organization).
    if (this.mode !== 'online') return this.db && !this.canWrite ? 'viewonly' : 'guest';
    if (this.approvedProfile) return 'player';
    return this.myProfile ? 'pending' : 'unregistered';
  }

  /** This player's public profile card, if they made one. */
  get myProfile(): PublicProfile | null {
    return (this.uid && this.profiles.get(this.uid)) || null;
  }

  get myApproval(): Approval | null {
    return (this.uid && this.approvals.get(this.uid)) || null;
  }

  private get approvedProfile(): boolean {
    return !!this.myProfile && this.myApproval?.status === 'approved';
  }

  /** XP, levels, loot boxes and the leaderboard only count for the moderator and approved profiles. */
  get canProgress(): boolean {
    return this.owner || (this.mode === 'online' && this.approvedProfile);
  }

  /** Ask to join: a display name the moderator approves. */
  createProfile(rawName: string): string | null {
    const name = cleanProfileName(rawName);
    if (!name) return 'Pick a name to show on the leaderboard.';
    if (this.mode !== 'online' || !this.db || !this.uid) return 'Sign in to claude.ai (with access to save) to make a profile.';
    if (this.myApproval?.status === 'revoked') return 'Your profile is paused; the moderator can change your name.';
    const taken = [...this.profiles].some(([id, p]) => id !== this.uid && p.name.toLowerCase() === name.toLowerCase());
    if (taken) return 'Someone already has that name.';
    const now = new Date().toISOString();
    const lvl = playerLevel(this.cfg, this.progress);
    const old = this.myProfile;
    // An approved player renaming themselves: it applies straight away, and the moderator sees the old name.
    const renamedFrom = old && this.approvedProfile && !this.owner && old.name !== name ? old.renamedFrom || old.name : old?.renamedFrom;
    const card: PublicProfile = {
      name,
      xp: playerXp(this.progress),
      level: lvl.level,
      requestedAt: old?.requestedAt || now,
      updatedAt: now,
      style: old?.style ?? { ...DEFAULT_NAME_STYLE },
      char: old?.char ?? null,
      ...(renamedFrom ? { renamedFrom } : {}),
      ...(this.owner ? { moderator: true } : {}),
    };
    this.profiles.set(this.uid, card);
    if (this.profileState !== 'sent' || !old) this.profileState = 'sending';
    this.writeProfile(this.uid, card);
    this.changed();
    return null;
  }

  private writeProfile(uid: string, card: PublicProfile): void {
    const db = this.db!;
    this.writer.queue(`profiles/${uid}`, () => db.doc(`profiles/${uid}`).set(plain(card)));
  }

  /** Keep the leaderboard's numbers current (only when they changed). */
  private publishProgress(): void {
    if (!this.canProgress || !this.uid || !this.db) return;
    const card = this.myProfile;
    if (!card) return;
    const xp = playerXp(this.progress);
    const level = playerLevel(this.cfg, this.progress).level;
    if (card.xp === xp && card.level === level) return;
    const next = { ...card, xp, level, updatedAt: new Date().toISOString() };
    this.profiles.set(this.uid, next);
    this.writeProfile(this.uid, next);
  }

  /** The moderator's own card is made (and approved) automatically. */
  private ensureModeratorProfile(): void {
    if (!this.owner || !this.uid || !this.db || this.mode !== 'online') return;
    if (!this.myProfile) this.createProfile(this.me?.name || 'Moderator');
    if (this.myApproval?.status !== 'approved') this.decideProfile(this.uid, 'approved');
  }

  /** Moderator: approve, turn down or revoke a profile. */
  decideProfile(uid: string, status: Approval['status'], note = ''): void {
    if (!this.owner || !this.db) return;
    const db = this.db;
    const a: Approval = { status, note: note.slice(0, 200), at: new Date().toISOString() };
    this.approvals.set(uid, a);
    this.writer.queue(`approvals/${uid}`, () => db.doc(`approvals/${uid}`).set(plain(a)));
    this.changed();
  }

  /** The player's name style (defaults until they pick one). */
  get myStyle(): NameStyle {
    return this.myProfile?.style ?? { ...DEFAULT_NAME_STYLE };
  }

  /** The name to show for this player anywhere: profile name, then account name. */
  get displayName(): string {
    return this.myProfile?.name || this.me?.name || 'Player';
  }

  /** Change how the name looks. Options above the player's level are refused. */
  setNameStyle(style: NameStyle): string | null {
    const card = this.myProfile;
    if (!card || !this.uid || !this.db) return 'Make a profile first.';
    if (this.myApproval?.status === 'revoked') return 'Your profile is paused.';
    const level = playerLevel(this.cfg, this.progress).level;
    const ok = allowedStyle(cleanNameStyle(style), level, this.owner);
    if (!sameStyle(ok, cleanNameStyle(style))) return 'That style unlocks at a higher player level.';
    if (card.style && sameStyle(card.style, ok)) return null;
    const next = { ...card, style: ok, updatedAt: new Date().toISOString() };
    this.profiles.set(this.uid, next);
    this.writeProfile(this.uid, next);
    this.changed();
    return null;
  }

  /** Show this character (the one the player plays as) on their profile card. */
  setShowcase(c: Character | null): void {
    const card = this.myProfile;
    if (!card || !this.uid || !this.db || this.myApproval?.status === 'revoked') return;
    const packed = c ? packChar(c) : null;
    const was = card.char ? unpackChar(card.char) : null;
    if (!c && !was) return;
    if (c && was && was.id === c.id && was.updatedAt === c.updatedAt && (was.cosmetics.spriteItem ?? null) === (c.cosmetics.spriteItem ?? null)) return;
    const next = { ...card, char: packed, updatedAt: new Date().toISOString() };
    this.profiles.set(this.uid, next);
    this.writeProfile(this.uid, next);
    this.changed();
  }

  /** Moderator: rename a player's profile. */
  renameProfile(uid: string, rawName: string): void {
    const card = this.profiles.get(uid);
    const name = cleanProfileName(rawName);
    if (!this.owner || !card || !name) return;
    const next: PublicProfile = { ...card, name, updatedAt: new Date().toISOString() };
    delete next.renamedFrom;
    this.profiles.set(uid, next);
    this.writeProfile(uid, next);
    this.changed();
  }

  /** Profiles waiting for the moderator. */
  pendingProfiles(): [string, PublicProfile][] {
    return [...this.profiles].filter(([id]) => !this.approvals.has(id));
  }

  /** The leaderboard: approved profiles by XP. */
  leaderboard(): { uid: string; card: PublicProfile }[] {
    return [...this.profiles]
      .filter(([id]) => this.approvals.get(id)?.status === 'approved')
      .map(([uid, card]) => ({ uid, card }))
      .sort((a, b) => b.card.xp - a.card.xp || a.card.name.localeCompare(b.card.name));
  }

  /** Save the player's own characters to their account. */
  private writeOwn(): void {
    if (this.mode !== 'online' || !this.db || !this.uid || !this.ownLoaded) return;
    const db = this.db;
    const path = `data/users/${this.uid}/characters`;
    const items: Record<string, unknown> = {};
    for (const c of this.store.characters.localList()) if (sharedDocId(c.id) && validChar(c)) items[c.id] = plain(c);
    const body = { items, deleted: this.deletedOwn };
    this.writer.queue(path, () => db.doc(path).set(plain(body)));
  }

  /** Remember the home screen's picks with the account. */
  saveSelection(sel: { design: string; chars: (string | null)[]; mySide: 'A' | 'B'; cpu?: (string | null)[] }): void {
    const cur = this.progress.selection;
    if (cur && JSON.stringify(cur) === JSON.stringify(sel)) return;
    this.progress.selection = structuredClone(sel);
    this.saveProgress();
  }

  // -------------------------------------------------------- characters

  /** True when the shared collection is in use (characters are locked until unlocked). */
  get sharedCollection(): boolean {
    return this.store.characters.sharedList().length > 0;
  }

  /** Can this player draft and pick a character? */
  /** Everything is open to this player: the moderator always, everyone while UNLOCK.allForEveryone is on. */
  get everythingOpen(): boolean {
    return this.owner || UNLOCK.allForEveryone;
  }

  canUse(id: string): boolean {
    if (this.everythingOpen) return true; // the moderator has everything (and, for now, so does everyone)
    if (!this.store.characters.isShared(id)) return true; // made in this browser
    if (this.progress.characters.includes(id)) return true;
    // Whoever made a character always has it: the owner made every character without a creator.
    const creator = this.creators.get(id);
    if (!creator) return this.owner;
    return !!this.uid && creator === this.uid;
  }

  /** Characters this player can draft or play as. */
  usable(): Character[] {
    return this.store.characters.list().filter((c) => validChar(c) && this.canUse(c.id));
  }

  /** Every valid character (the CPU and the title-screen demo can use locked ones). */
  everyone(): Character[] {
    return this.store.characters.list().filter(validChar);
  }

  /** A character with this player's equipped cosmetics. */
  private decorate(c: Character): Character {
    const eq = this.progress.equipped[c.id];
    return { ...c, cosmetics: eq ? { ...NO_COSMETICS, ...eq } : { ...NO_COSMETICS } };
  }

  /** Save this player's cosmetics for a character. */
  equip(id: string, cosmetics: Cosmetics): void {
    this.progress.equipped[id] = structuredClone(cosmetics);
    this.saveProgress();
    this.changed();
  }

  /** The cosmetics characters wore before levels were personal stay on for this browser's player. */
  private seedEquipped(): void {
    for (const c of this.store.characters.localList()) {
      if (this.progress.equipped[c.id]) continue;
      const k = c.cosmetics;
      if (k && (k.nameColor || k.badges?.length || k.spriteItem || k.celebration)) this.progress.equipped[c.id] = structuredClone(k);
    }
  }

  private uploadCharacter(c: Character): void {
    const id = sharedDocId(c.id);
    if (!this.db || !id || !validChar(c)) return;
    const db = this.db;
    const creator = this.creators.get(c.id);
    const clean = { ...c, cosmetics: { ...NO_COSMETICS } };
    this.writer.queue(`characters/${id}`, () => db.doc(`characters/${id}`).set({ character: plain(clean), ...(creator ? { creator } : {}) }));
  }

  private removeShared(id: string): void {
    const doc = sharedDocId(id);
    if (!this.db || !doc) return;
    const db = this.db;
    this.writer.queue(`characters/${doc}`, () => db.doc(`characters/${doc}`).delete());
  }

  // ------------------------------------------------------- submissions

  /** Players (not the owner) can send their own characters to the owner for approval. */
  get canSubmit(): boolean {
    return this.mode === 'online' && !this.owner && !!this.uid && this.canProgress;
  }

  submissionOf(id: string): Submission | null {
    return this.mySubmissions[id] ?? null;
  }

  submit(c: Character): void {
    if (!this.canSubmit || !this.db || !sharedDocId(c.id)) return;
    const items = { ...this.mySubmissions, [c.id]: { character: { ...c, cosmetics: { ...NO_COSMETICS } }, status: 'pending' as const, submittedAt: new Date().toISOString() } };
    this.mySubmissions = items;
    this.writeMine();
  }

  withdraw(id: string): void {
    if (!this.canSubmit || !this.mySubmissions[id]) return;
    const items = { ...this.mySubmissions };
    delete items[id];
    this.mySubmissions = items;
    this.writeMine();
  }

  private writeMine(): void {
    const db = this.db!;
    const uid = this.uid!;
    const items = plain(this.mySubmissions);
    this.writer.queue(`submissions/${uid}`, () => db.doc(`submissions/${uid}`).set({ items }));
    this.changed();
  }

  pendingCount(): number {
    return this.allSubmissions.reduce((n, s) => n + Object.values(s.items).filter((i) => i.status === 'pending').length, 0);
  }

  /** Owner: add a submitted character to the collection (in everyone's loot pool; its creator always has it). */
  approve(uid: string, id: string, edited?: Character): void {
    const sub = this.allSubmissions.find((s) => s.uid === uid)?.items[id];
    if (!this.owner || !this.db || !sub) return;
    const db = this.db;
    let c = structuredClone(edited ?? sub.character);
    c.id = sub.character.id;
    // Never let a submission replace someone else's character.
    const clash = this.store.characters.isShared(c.id) && this.creators.get(c.id) !== uid;
    if (clash) c = { ...c, id: `${c.id}-${uid.slice(-6)}`.replace(/[^A-Za-z0-9_\-~:@+.]/g, '') };
    const docId = sharedDocId(c.id);
    if (!docId) return;
    this.writer.queue(`characters/${docId}`, () => db.doc(`characters/${docId}`).set({ character: plain(c), creator: uid, approvedAt: new Date().toISOString() }));
    this.setStatus(uid, id, 'approved');
  }

  /** Owner: turn a submission down, with an optional note for the player. */
  reject(uid: string, id: string, note = ''): void {
    if (!this.owner) return;
    this.setStatus(uid, id, 'rejected', note);
  }

  private setStatus(uid: string, id: string, status: SubmissionStatus, note = ''): void {
    const db = this.db!;
    const s = this.allSubmissions.find((x) => x.uid === uid);
    if (s?.items[id]) s.items[id] = { ...s.items[id], status, note };
    this.writer.queue(`submissions/${uid}#${id}`, () => db.doc(`submissions/${uid}`).update({ items: { [id]: { status, note } } }));
    this.changed();
  }

  // ---------------------------------------------------------- progress

  /** Every table design (the plain one is everyone's default). */
  tables(): string[] {
    return DESIGN_ORDER;
  }

  tableUnlocked(v: string): boolean {
    return this.everythingOpen || this.progress.tables.includes(v);
  }

  /** Approved characters a box can unlock. */
  private lootCharacters(): string[] {
    // The owner already has their own characters, so their boxes only hold tables and other players' characters.
    return this.store.characters
      .sharedList()
      .map((c) => c.id)
      .filter((id) => !(this.owner && !this.creators.get(id)) && !(this.uid && this.creators.get(id) === this.uid));
  }

  /** Character cosmetics unlocked since the player last looked (all characters, or one). */
  newRewards(id?: string): number {
    return id ? newRewardsFor(this.cfg, this.progress, id) : newRewards(this.cfg, this.progress);
  }

  /** The player opened a character's profile: its new rewards are no longer new. */
  sawRewards(id: string): void {
    if (markSeen(this.cfg, this.progress, id)) {
      this.saveProgress();
      this.changed();
    }
  }

  boxes(): number {
    // The moderator already has everything, so no boxes pile up for them; without an approved profile there are none.
    return this.everythingOpen || !this.canProgress ? 0 : boxesWaiting(this.cfg, this.progress);
  }

  /** Nothing left to unlock right now. */
  allUnlocked(): boolean {
    if (this.everythingOpen) return true;
    return this.tables().every((t) => this.progress.tables.includes(t)) && this.lootCharacters().every((c) => this.progress.characters.includes(c));
  }

  openBox(): LootItem | null {
    if (this.everythingOpen || !this.canProgress) return null;
    const item = openBox(this.cfg, this.progress, this.tables(), this.lootCharacters(), this.rng);
    if (item) {
      this.saveProgress();
      this.changed();
    }
    return item;
  }

  /**
   * Count XP from a match record (call after every game). Only the
   * signed-in player's side counts; `counted` tracks what this match has
   * already given.
   */
  recordMatch(record: MatchRecord, side: TeamId, counted: Record<string, number>): { levelsBefore: number; boxesBefore: number; counted: boolean } {
    return this.addMatchXp(matchXp(this.cfg, record, side), counted);
  }

  /** Add a match's XP (by character) for this player; nothing unless they may progress. */
  addMatchXp(xp: Record<string, number>, counted: Record<string, number>): { levelsBefore: number; boxesBefore: number; counted: boolean } {
    const boxesBefore = this.boxes();
    const levelsBefore = this.progress.opened.length + boxesBefore;
    if (!this.canProgress) return { levelsBefore, boxesBefore, counted: false };
    addXp(this.progress, newXp(xp, counted));
    this.saveProgress();
    this.publishProgress();
    this.changed();
    return { levelsBefore, boxesBefore, counted: true };
  }

  /** A player always has a few characters to start with. */
  private topUp(): boolean {
    if (this.owner) return false;
    const ids = this.lootCharacters();
    return ids.length ? ensureStarters(this.progress, ids, this.rng) : false;
  }

  private saveLocal(): void {
    this.kv.setItem(PROGRESS_KEY, JSON.stringify(this.progress));
  }

  saveProgress(): void {
    this.saveLocal();
    // Never write over the account's saved progress before it has been read.
    if (this.mode !== 'online' || !this.db || !this.uid || !this.progressLoaded) return;
    const db = this.db;
    const path = `data/users/${this.uid}/progress`;
    const body = plain(this.progress);
    this.writer.queue(path, () => db.doc(path).set(body));
  }

  /** For tests: forget everything. */
  reset(): void {
    this.progress = emptyProgress();
  }
}

function cleanItems(raw: unknown): Record<string, Submission> {
  const out: Record<string, Submission> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, v] of Object.entries(raw as Record<string, Partial<Submission>>)) {
    if (!v || !validChar(v.character)) continue;
    const status = v.status === 'approved' || v.status === 'rejected' ? v.status : 'pending';
    out[id] = { character: v.character, status, submittedAt: typeof v.submittedAt === 'string' ? v.submittedAt : '', note: typeof v.note === 'string' ? v.note.slice(0, 200) : '' };
  }
  return out;
}
