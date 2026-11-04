// Character stats (1–10, background only) and the effective-stats pipeline.
//
// Skill beats stats: stats only scale outcomes within the limits in
// config.statEffects; timing quality stays the main factor. Stats never
// change during a game, but everything reads *effective* stats through
// effectiveStats() so mid-game modifiers (momentum, pressure) can be added
// later without touching the shot code.

import type { GameConfig } from '../config';

export const STAT_KEYS = ['accuracy', 'power', 'spin', 'serve', 'saves'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;

export const STAT_MIN = 1;
export const STAT_MAX = 10;

/** Stats that change nothing (every effect multiplier is exactly 1). Used for generic players. */
export const NEUTRAL_STATS: Stats = { accuracy: 5.5, power: 5.5, spin: 5.5, serve: 5.5, saves: 5.5 };

export const STAT_INFO: Record<StatKey, { label: string; effect: string }> = {
  accuracy: { label: 'Accuracy', effect: 'Scatter between the aimed point and where the ball lands' },
  power: { label: 'Power', effect: 'Ball speed off the paddle: harder to return, slightly harder to control' },
  spin: { label: 'Spin', effect: 'How much the ball curves in flight and kicks after the bounce' },
  serve: { label: 'Serve', effect: 'Serve accuracy and fewer table misses' },
  saves: { label: 'Saves', effect: 'Extra reaction time and reach when saving a cup' },
};

/** Context a modifier may look at (score, streaks, ...). Empty until modifiers exist. */
export type ModifierContext = Record<string, unknown>;
export type StatModifier = (stats: Stats, ctx: ModifierContext) => Stats;

const clampStat = (v: number) => Math.max(STAT_MIN, Math.min(STAT_MAX, v));

/** base stats → [modifiers...] → effective stats (clamped to 1–10). */
export function effectiveStats(base: Stats, modifiers: StatModifier[] = [], ctx: ModifierContext = {}): Stats {
  let s = { ...base };
  for (const m of modifiers) s = m(s, ctx);
  const out = {} as Stats;
  for (const k of STAT_KEYS) out[k] = clampStat(s[k]);
  return out;
}

/** A [at stat 1, at stat 10] range of multipliers. */
export type EffectRange = [number, number];

export interface StatEffects {
  /** Landing scatter multiplier on rally hits. */
  accuracyScatter: EffectRange;
  /** Multiplier on a hit's peak height (more power = flatter and faster). */
  powerPeak: EffectRange;
  /** Extra scatter from hitting hard. */
  powerScatter: EffectRange;
  /** Timing-window multiplier for the player returning this hitter's ball. */
  powerIncomingWindow: EffectRange;
  /** Multiplier on a style's spin amount. */
  spinAmount: EffectRange;
  /** Landing scatter multiplier on serves. */
  serveScatter: EffectRange;
  /** Timing-window multiplier on serves. */
  serveWindow: EffectRange;
  /** Timing-window multiplier on saves. */
  saveWindow: EffectRange;
  /** Reach multiplier on saves. */
  saveReach: EffectRange;
  /** Serve stat: spin on serves, and how low and fast a serve flies (peak height). */
  serveSpin: EffectRange;
  servePeak: EffectRange;
}

/** Interpolate an effect range for a stat value (1–10). */
export function effect(range: EffectRange, stat: number): number {
  const t = (clampStat(stat) - STAT_MIN) / (STAT_MAX - STAT_MIN);
  return range[0] + (range[1] - range[0]) * t;
}

export function statEffect(cfg: GameConfig, key: keyof StatEffects, stat: number): number {
  return effect(cfg.statEffects[key], stat);
}
