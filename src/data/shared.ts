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
import { VENUE_ORDER } from '../render/basement';
import { addXp, boxesWaiting, emptyProgress, ensureStarters, matchXp, newXp, normalizeProgress, openBox, seedFromMatches, type LootItem, type PlayerProgress } from '../progress/unlocks';
import type { AppStore, KeyValueStore, MatchRecord } from './storage';

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
  profiles(ids: string[]): Promise<Record<string, { name: string }>>;
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
  constructor(private failed: (code: string | undefined) => void) {}
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
    } catch (e) {
      this.failed((e as { code?: string })?.code);
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

  private db: Db | null = null;
  private user: UserApi | null = null;
  private listeners = new Set<() => void>();
  private writer = new Writer((code) => {
    this.problem = code === 'quota_exceeded' ? 'The online collection is full.' : code === 'invalid_argument' ? 'You do not have permission to change that.' : 'Could not save online; trying again later.';
    this.changed();
  });
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
    this.seedEquipped();
    this.topUp();
    this.saveLocal();
    store.characters.decorate = (c) => this.decorate(c);
    store.characters.listen({
      save: (c) => this.owner && this.uploadCharacter(c),
      remove: (id) => this.owner && this.removeShared(id),
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
      [this.db, this.user] = (await Promise.all([claude.use('db'), claude.use('user')])) as [Db | null, UserApi | null];
    } catch {
      return;
    }
    if (!this.db) return;
    const db = this.db;
    try {
      this.owner = this.user ? await this.user.isOwner() : false;
      this.uid = this.user ? await this.user.id() : null;
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
        this.store.characters.setShared(list);
        if (!snap.metadata.fromCache && !this.sharedLoaded) {
          this.sharedLoaded = true;
          // The owner's characters saved only in this browser join the collection.
          if (this.owner) for (const c of needsUpload(this.store.characters.localList(), list)) this.uploadCharacter(c);
        }
        if (this.topUp()) this.saveProgress();
        this.changed();
      },
      () => this.changed(),
    );

    if (!this.uid) return this.changed();
    const uid = this.uid;
    this.mode = 'online';

    let progressLoaded = false;
    db.doc(`data/users/${uid}/progress`).onSnapshot(
      (snap) => {
        if (snap.metadata.fromCache && !snap.exists) return;
        if (snap.exists) {
          this.progress = normalizeProgress(snap.data());
          this.saveLocal();
          if (this.topUp()) this.saveProgress();
        } else if (!progressLoaded) {
          // First visit with this account: start from what this browser already has.
          this.saveProgress();
        }
        progressLoaded = true;
        this.changed();
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
    if (!this.user || !this.allSubmissions.length) return;
    try {
      const ps = await this.user.profiles(this.allSubmissions.map((s) => s.uid));
      let any = false;
      for (const s of this.allSubmissions) {
        const n = ps[s.uid]?.name || '';
        if (n && n !== s.name) {
          s.name = n;
          any = true;
        }
      }
      if (any) this.changed();
    } catch {
      /* names are only a nicety */
    }
  }

  // -------------------------------------------------------- characters

  /** True when the shared collection is in use (characters are locked until unlocked). */
  get sharedCollection(): boolean {
    return this.store.characters.sharedList().length > 0;
  }

  /** Can this player draft and pick a character? */
  canUse(id: string): boolean {
    if (!this.store.characters.isShared(id)) return true; // made in this browser
    if (this.progress.characters.includes(id)) return true;
    return !!this.uid && this.creators.get(id) === this.uid;
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
    return this.mode === 'online' && !this.owner && !!this.uid;
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
  approve(uid: string, id: string): void {
    const sub = this.allSubmissions.find((s) => s.uid === uid)?.items[id];
    if (!this.owner || !this.db || !sub) return;
    const db = this.db;
    let c = structuredClone(sub.character);
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

  tables(): string[] {
    return VENUE_ORDER;
  }

  tableUnlocked(v: string): boolean {
    return this.progress.tables.includes(v);
  }

  /** Approved characters a box can unlock. */
  private lootCharacters(): string[] {
    return this.store.characters.sharedList().map((c) => c.id);
  }

  boxes(): number {
    return boxesWaiting(this.cfg, this.progress);
  }

  /** Nothing left to unlock right now. */
  allUnlocked(): boolean {
    return this.tables().every((t) => this.progress.tables.includes(t)) && this.lootCharacters().every((c) => this.progress.characters.includes(c));
  }

  openBox(): LootItem | null {
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
  recordMatch(record: MatchRecord, side: TeamId, counted: Record<string, number>): { levelsBefore: number; boxesBefore: number } {
    const boxesBefore = this.boxes();
    const levelsBefore = this.progress.opened.length + boxesBefore;
    addXp(this.progress, newXp(matchXp(this.cfg, record, side), counted));
    this.saveProgress();
    this.changed();
    return { levelsBefore, boxesBefore };
  }

  /** A player always has a few characters to start with. */
  private topUp(): boolean {
    const ids = this.lootCharacters();
    return ids.length ? ensureStarters(this.progress, ids, this.rng) : false;
  }

  private saveLocal(): void {
    this.kv.setItem(PROGRESS_KEY, JSON.stringify(this.progress));
  }

  saveProgress(): void {
    this.saveLocal();
    if (this.mode !== 'online' || !this.db || !this.uid) return;
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
