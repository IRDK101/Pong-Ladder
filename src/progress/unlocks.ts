// A player's account progress: character XP (personal to this player),
// their overall player level, loot boxes and what they have unlocked.
// Pure; data/account.ts saves it (online for a signed-in player, otherwise
// in this browser).
//
// - Player XP is the sum of the XP they have earned with every character.
// - Each player level past 1 gives one loot box. A box unlocks a random
//   table or character the player doesn't have yet, so there are no
//   duplicates. When there's nothing left to unlock, boxes wait until
//   something new is added.
// - A new player starts with the Saints table and 4 random characters.

import type { GameConfig, Venue } from '../config';
import type { Cosmetics } from '../core/character';
import type { TeamId } from '../core/types';
import type { MatchRecord } from '../data/storage';
import { deriveCareers } from './careers';
import { levelFor, xpFor, type LevelInfo } from './levels';

export const STARTER_TABLE: Venue = 'saints';
export const STARTER_CHARACTERS = 4;

export interface LootItem {
  kind: 'table' | 'character';
  id: string;
}

export interface PlayerProgress {
  v: 1;
  /** XP this player has earned with each character. */
  charXp: Record<string, number>;
  /** Unlocked tables and characters. */
  tables: string[];
  characters: string[];
  /** Every box opened so far, in order, and what it gave. */
  opened: (LootItem & { at: string })[];
  /** Cosmetics this player has equipped on each character. */
  equipped: Record<string, Cosmetics>;
  /** Set once the old in-browser match history has been counted. */
  seeded?: boolean;
}

export function emptyProgress(): PlayerProgress {
  return { v: 1, charXp: {}, tables: [STARTER_TABLE], characters: [], opened: [], equipped: {} };
}

/** A saved progress record, repaired into shape (anything missing gets its default). */
export function normalizeProgress(raw: unknown): PlayerProgress {
  const p = emptyProgress();
  if (!raw || typeof raw !== 'object') return p;
  const r = raw as Partial<PlayerProgress>;
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
  if (r.charXp && typeof r.charXp === 'object') for (const [k, v] of Object.entries(r.charXp)) if (typeof v === 'number' && v > 0) p.charXp[k] = v;
  p.tables = [...new Set([STARTER_TABLE, ...strings(r.tables)])];
  p.characters = [...new Set(strings(r.characters))];
  p.opened = Array.isArray(r.opened) ? r.opened.filter((o) => o && (o.kind === 'table' || o.kind === 'character') && typeof o.id === 'string') : [];
  if (r.equipped && typeof r.equipped === 'object') p.equipped = { ...r.equipped };
  if (r.seeded) p.seeded = true;
  return p;
}

export function playerXp(p: PlayerProgress): number {
  return Object.values(p.charXp).reduce((a, b) => a + b, 0);
}

/** Player levels need more XP than character levels: every character's XP counts towards them. */
export function playerLevel(cfg: GameConfig, p: PlayerProgress): LevelInfo {
  const step = cfg.progression.playerLevelStep;
  return levelFor({ ...cfg, progression: { ...cfg.progression, levelStep: step } }, playerXp(p));
}

export function characterLevel(cfg: GameConfig, p: PlayerProgress, id: string): LevelInfo {
  return levelFor(cfg, p.charXp[id] ?? 0);
}

/** One box per level past 1. */
export function boxesEarned(cfg: GameConfig, p: PlayerProgress): number {
  return playerLevel(cfg, p).level - 1;
}

export function boxesWaiting(cfg: GameConfig, p: PlayerProgress): number {
  return Math.max(0, boxesEarned(cfg, p) - p.opened.length);
}

/** Everything that exists but this player hasn't unlocked. */
export function lootPool(p: PlayerProgress, tables: string[], characters: string[]): LootItem[] {
  return [
    ...tables.filter((t) => !p.tables.includes(t)).map((id) => ({ kind: 'table' as const, id })),
    ...characters.filter((c) => !p.characters.includes(c)).map((id) => ({ kind: 'character' as const, id })),
  ];
}

/** Open one box: unlocks and returns a random item, or null if there's no box or nothing left to unlock. */
export function openBox(cfg: GameConfig, p: PlayerProgress, tables: string[], characters: string[], rng: () => number, now = new Date()): LootItem | null {
  if (boxesWaiting(cfg, p) < 1) return null;
  const pool = lootPool(p, tables, characters);
  if (!pool.length) return null;
  const item = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  if (item.kind === 'table') p.tables.push(item.id);
  else p.characters.push(item.id);
  p.opened.push({ ...item, at: now.toISOString() });
  return item;
}

/**
 * Top up the starting characters: a player always has at least 4 of the
 * collection's characters (fewer only while the collection is smaller).
 * Returns true if anything changed.
 */
export function ensureStarters(p: PlayerProgress, characters: string[], rng: () => number): boolean {
  const have = p.characters.filter((c) => characters.includes(c)).length;
  const need = Math.min(STARTER_CHARACTERS, characters.length) - have;
  if (need <= 0) return false;
  const pool = characters.filter((c) => !p.characters.includes(c));
  for (let i = 0; i < need && pool.length; i++) p.characters.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return true;
}

/** The XP each character earned in a match, counting only the positions on `side` (all positions when null). */
export function matchXp(cfg: GameConfig, record: MatchRecord, side: TeamId | null): Record<string, number> {
  const roster = structuredClone(record.roster);
  if (side) for (const k of Object.keys(roster) as (keyof typeof roster)[]) if (!k.startsWith(side)) roster[k] = { characterId: null, profileId: null };
  const careers = deriveCareers([{ ...record, roster }]);
  const out: Record<string, number> = {};
  for (const [id, s] of careers.characters) {
    const xp = xpFor(cfg, s);
    if (xp > 0) out[id] = xp;
  }
  return out;
}

/** Add XP to a player's characters. */
export function addXp(p: PlayerProgress, xp: Record<string, number>): void {
  for (const [id, n] of Object.entries(xp)) p.charXp[id] = (p.charXp[id] ?? 0) + n;
}

/** The XP a growing match has earned since it was last counted (`counted` is updated). */
export function newXp(now: Record<string, number>, counted: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(now)) {
    const d = n - (counted[id] ?? 0);
    if (d > 0) out[id] = d;
    counted[id] = n;
  }
  return out;
}

/** Count the matches already saved in this browser once (all positions: they were played here before sides existed). */
export function seedFromMatches(cfg: GameConfig, p: PlayerProgress, matches: MatchRecord[]): boolean {
  if (p.seeded) return false;
  p.seeded = true;
  for (const m of matches) addXp(p, matchXp(cfg, m, null));
  return true;
}
