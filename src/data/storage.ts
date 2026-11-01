// Local persistence for match records, with JSON import/export.
//
// Every game's full engine event log is kept, so stats, levels, Elo and
// achievements can be derived (and re-derived) from it later (Phase 3).
// Characters and human profiles arrive in Phase 2: each record carries a
// roster slot per player position, so every logged event (which names a
// player position) resolves to the character and the human involved.

import type { GameConfig } from '../config';
import { validateCharacter, type Character, type Profile } from '../core/character';
import type { LogEntry } from '../core/rules';
import type { TeamId } from '../core/types';

/** v1 files hold matches only; v2 adds characters and profiles. */
export const SCHEMA_VERSION = 2;

export interface RosterSlot {
  characterId: string | null;
  profileId: string | null;
}

export interface GameRecord {
  winner: TeamId | null;
  log: LogEntry[];
}

export interface MatchRecord {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  /** House-rule values in force (tuning omitted). */
  rules: Pick<GameConfig, 'formation' | 'serveTableMissLimit' | 'shoulderHeight' | 'matchFormat' | 'penaltyCupSelection' | 'skiCollision'> & Partial<Pick<GameConfig, 'teamSize'>>;
  roster: Record<'A-left' | 'A-right' | 'B-left' | 'B-right', RosterSlot>;
  games: GameRecord[];
  winner: TeamId | null;
}

export interface ExportFile {
  app: 'dartmouth-pong';
  schemaVersion: number;
  exportedAt: string;
  matches: MatchRecord[];
  characters?: Character[];
  profiles?: Profile[];
}

export interface ImportResult {
  matches: number;
  characters: number;
  profiles: number;
  /** Plain-language reasons for anything skipped. */
  skipped: string[];
}

/** Minimal key/value interface so tests can use memory and the app can use localStorage. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}


export function emptyRoster(): MatchRecord['roster'] {
  const slot = (): RosterSlot => ({ characterId: null, profileId: null });
  return { 'A-left': slot(), 'A-right': slot(), 'B-left': slot(), 'B-right': slot() };
}

export function newMatchRecord(cfg: GameConfig, now = new Date(), id = `m-${now.getTime()}-${Math.floor(Math.random() * 1e6)}`): MatchRecord {
  const { formation, serveTableMissLimit, shoulderHeight, matchFormat, penaltyCupSelection, skiCollision, teamSize } = cfg;
  return {
    id,
    startedAt: now.toISOString(),
    finishedAt: null,
    rules: { formation, serveTableMissLimit, shoulderHeight, matchFormat, penaltyCupSelection, skiCollision, teamSize },
    roster: emptyRoster(),
    games: [],
    winner: null,
  };
}

/** A list of records with ids, stored as one JSON value. */
export class Collection<T extends { id: string }> {
  constructor(
    private kv: KeyValueStore,
    private key: string,
  ) {}

  list(): T[] {
    try {
      const raw = this.kv.getItem(this.key);
      const v = raw ? JSON.parse(raw) : [];
      return Array.isArray(v) ? (v as T[]) : [];
    } catch {
      return [];
    }
  }

  get(id: string): T | undefined {
    return this.list().find((x) => x.id === id);
  }

  /** Insert or replace by id (keeps list order for replacements). */
  save(item: T): void {
    const all = this.list();
    const i = all.findIndex((x) => x.id === item.id);
    if (i >= 0) all[i] = item;
    else all.push(item);
    this.kv.setItem(this.key, JSON.stringify(all));
  }

  remove(id: string): void {
    this.kv.setItem(this.key, JSON.stringify(this.list().filter((x) => x.id !== id)));
  }
}

export const STORAGE_KEYS = {
  matches: 'dartmouth-pong/matches/v1',
  characters: 'dartmouth-pong/characters/v1',
  profiles: 'dartmouth-pong/profiles/v1',
};

/** Everything the game keeps locally, with one backup file for all of it. */
export class AppStore {
  readonly matches: Collection<MatchRecord>;
  readonly characters: Collection<Character>;
  readonly profiles: Collection<Profile>;

  constructor(kv: KeyValueStore) {
    this.matches = new Collection(kv, STORAGE_KEYS.matches);
    this.characters = new Collection(kv, STORAGE_KEYS.characters);
    this.profiles = new Collection(kv, STORAGE_KEYS.profiles);
  }

  exportJson(now = new Date()): string {
    const file: ExportFile = {
      app: 'dartmouth-pong',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      matches: this.matches.list(),
      characters: this.characters.list(),
      profiles: this.profiles.list(),
    };
    return JSON.stringify(file, null, 2);
  }

  /** Merge a backup file (v1 or v2). Throws on a file that is not a backup at all. */
  importJson(json: string): ImportResult {
    let file: Partial<ExportFile>;
    try {
      file = JSON.parse(json) as Partial<ExportFile>;
    } catch {
      throw new Error('That is not valid JSON. Paste the whole backup file.');
    }
    if (!file || file.app !== 'dartmouth-pong') throw new Error('That is not a Dartmouth Pong backup file.');
    if ((file.schemaVersion ?? 0) > SCHEMA_VERSION) throw new Error('This backup is from a newer version of the game.');
    const res: ImportResult = { matches: 0, characters: 0, profiles: 0, skipped: [] };
    const merge = <T extends { id: string }>(col: Collection<T>, items: unknown, kind: keyof Omit<ImportResult, 'skipped'>, check: (x: T) => string[]) => {
      if (items === undefined) return;
      if (!Array.isArray(items)) throw new Error(`The backup's ${kind} list is malformed.`);
      const have = new Set(col.list().map((x) => x.id));
      for (const raw of items as T[]) {
        if (!raw || typeof raw.id !== 'string') throw new Error(`A record in ${kind} is malformed.`);
        const errs = check(raw);
        if (errs.length) {
          res.skipped.push(`${kind.slice(0, -1)} ${raw.id}: ${errs[0]}`);
          continue;
        }
        if (!have.has(raw.id)) res[kind]++;
        col.save(raw);
      }
    };
    merge(this.matches, file.matches ?? [], 'matches', (m) => (Array.isArray(m.games) ? [] : ['missing games']));
    merge(this.characters, file.characters, 'characters', (c) => {
      try {
        return validateCharacter(c);
      } catch {
        return ['malformed character'];
      }
    });
    merge(this.profiles, file.profiles, 'profiles', (p) => (typeof p.name === 'string' && p.name.trim() ? [] : ['missing name']));
    return res;
  }
}
