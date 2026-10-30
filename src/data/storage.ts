// Local persistence for match records, with JSON import/export.
//
// Every game's full engine event log is kept, so stats, levels, Elo and
// achievements can be derived (and re-derived) from it later (Phase 3).
// Characters and human profiles arrive in Phase 2: each record carries a
// roster slot per player position, so every logged event (which names a
// player position) resolves to the character and the human involved.

import type { GameConfig } from '../config';
import type { LogEntry } from '../core/rules';
import type { TeamId } from '../core/types';

export const SCHEMA_VERSION = 1;

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
  rules: Pick<GameConfig, 'formation' | 'serveTableMissLimit' | 'shoulderHeight' | 'matchFormat' | 'penaltyCupSelection' | 'skiCollision'>;
  roster: Record<'A-left' | 'A-right' | 'B-left' | 'B-right', RosterSlot>;
  games: GameRecord[];
  winner: TeamId | null;
}

export interface ExportFile {
  app: 'dartmouth-pong';
  schemaVersion: number;
  exportedAt: string;
  matches: MatchRecord[];
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

const KEY = 'dartmouth-pong/matches/v1';

export function emptyRoster(): MatchRecord['roster'] {
  const slot = (): RosterSlot => ({ characterId: null, profileId: null });
  return { 'A-left': slot(), 'A-right': slot(), 'B-left': slot(), 'B-right': slot() };
}

export function newMatchRecord(cfg: GameConfig, now = new Date(), id = `m-${now.getTime()}-${Math.floor(Math.random() * 1e6)}`): MatchRecord {
  const { formation, serveTableMissLimit, shoulderHeight, matchFormat, penaltyCupSelection, skiCollision } = cfg;
  return {
    id,
    startedAt: now.toISOString(),
    finishedAt: null,
    rules: { formation, serveTableMissLimit, shoulderHeight, matchFormat, penaltyCupSelection, skiCollision },
    roster: emptyRoster(),
    games: [],
    winner: null,
  };
}

export class MatchStore {
  constructor(private kv: KeyValueStore) {}

  list(): MatchRecord[] {
    try {
      const raw = this.kv.getItem(KEY);
      return raw ? (JSON.parse(raw) as MatchRecord[]) : [];
    } catch {
      return [];
    }
  }

  /** Insert or replace by id. */
  save(rec: MatchRecord): void {
    const all = this.list().filter((m) => m.id !== rec.id);
    all.push(rec);
    this.kv.setItem(KEY, JSON.stringify(all));
  }

  exportJson(now = new Date()): string {
    const file: ExportFile = { app: 'dartmouth-pong', schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), matches: this.list() };
    return JSON.stringify(file, null, 2);
  }

  /** Merge matches from an export file. Returns how many were new. Throws on a bad file. */
  importJson(json: string): number {
    const file = JSON.parse(json) as Partial<ExportFile>;
    if (file.app !== 'dartmouth-pong' || !Array.isArray(file.matches)) throw new Error('not a Dartmouth Pong export file');
    if ((file.schemaVersion ?? 0) > SCHEMA_VERSION) throw new Error('export file is from a newer version');
    const existing = new Set(this.list().map((m) => m.id));
    let added = 0;
    for (const m of file.matches) {
      if (!m || typeof m.id !== 'string' || !Array.isArray(m.games)) throw new Error('malformed match record');
      if (!existing.has(m.id)) added++;
      this.save(m);
    }
    return added;
  }
}
