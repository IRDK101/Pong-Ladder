// Passive abilities: always-on traits a character brings to the table (up to
// MAX_PASSIVES each). Add an ability by appending an entry to PASSIVES; it then
// shows up in the character editor and its effects apply in every match.
// Never reuse or rename an id: characters store abilities by id.

import { STAT_KEYS, STAT_MAX, STAT_MIN, type Stats } from './stats';

/** Numbers the game reads at set moments. Multipliers: 1 = no change. */
export interface PassiveEffects {
  /** Timing window for this character's hits (larger is easier). */
  hitWindow?: number;
  /** Timing window for their serves. */
  serveWindow?: number;
  /** Timing window for their saves. */
  saveWindow?: number;
  /** How widely their shots scatter (smaller is more accurate). */
  scatter?: number;
  /** How much incoming spin pushes their returns (smaller resists spin). */
  spinPush?: number;
  /** How high their shots arc. */
  peak?: number;
}

export interface PassiveAbility {
  id: string;
  name: string;
  /** One sentence for players: what it does. */
  description: string;
  /** A short icon (an emoji or a symbol) shown beside the name. */
  icon: string;
  /** Flat stat changes while the character plays (results stay within the stat range). */
  stats?: Partial<Record<keyof Stats, number>>;
  effects?: PassiveEffects;
}

/** How many passive abilities a character can have. */
export const MAX_PASSIVES = 2;

/**
 * The catalog. Empty for now: the moderator adds abilities here. For example:
 *   { id: 'ice-veins', name: 'Ice veins', icon: '❄', description: 'Saves get a little more time.', effects: { saveWindow: 1.15 } },
 */
export const PASSIVES: PassiveAbility[] = [];

export function getPassive(id: string): PassiveAbility | undefined {
  return PASSIVES.find((p) => p.id === id);
}

/** A character's abilities that exist in the catalog (unknown ids are kept on the character but do nothing). */
export function passivesOf(ids: readonly string[] | undefined): PassiveAbility[] {
  return (ids ?? []).map(getPassive).filter((p): p is PassiveAbility => !!p).slice(0, MAX_PASSIVES);
}

/** Stats with a character's ability bonuses added (kept within the stat range). */
export function withPassiveStats(stats: Stats, ids: readonly string[] | undefined): Stats {
  const list = passivesOf(ids);
  if (!list.length) return stats;
  const out = { ...stats };
  for (const p of list) for (const k of STAT_KEYS) if (p.stats?.[k]) out[k] = Math.max(STAT_MIN, Math.min(STAT_MAX, out[k] + p.stats[k]!));
  return out;
}

/** The combined multiplier of one effect across a character's abilities (1 when none apply). */
export function passiveEffect(ids: readonly string[] | undefined, key: keyof PassiveEffects): number {
  let m = 1;
  for (const p of passivesOf(ids)) m *= p.effects?.[key] ?? 1;
  return m;
}
