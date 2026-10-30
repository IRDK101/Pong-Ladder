// Shot model: timing quality → actual trajectory. Pure.
//
// Skill beats stats: timing quality is the main input. Phase 2 stats will
// modify scatter / peak / speed within limits through an effective-stats
// pipeline; for now there are no modifiers.

import type { GameConfig } from '../config';
import type { Vec3 } from '../core/physics';
import type { ShotStyle } from '../core/styles';
import { predictPeak, solveArc, solveServe } from '../core/trajectory';

/** Aim input, each axis in [-1, 1], in table axes (x = length, y = width). */
export interface Aim {
  x: number;
  y: number;
}

/**
 * Timing quality in [0, 1] for a swing `offset` seconds from the ideal
 * moment, or null if outside the window (a whiff).
 */
export function timingQuality(cfg: GameConfig, style: ShotStyle, offset: number, save = false): number | null {
  const w = cfg.hitting.timingWindow * style.timing.windowScale * (save ? cfg.hitting.saveWindowScale : 1);
  const a = Math.abs(offset);
  if (a > w) return null;
  return Math.pow(1 - a / w, style.timing.falloff);
}

/** Seconds from the ball's apex: negative = early (still rising), positive = late. */
export function apexOffset(vel: Vec3, gravity: number): number {
  return -vel.z / gravity;
}

export function timingLabel(q: number | null, offset: number): string {
  if (q === null) return 'Whiff!';
  if (q > 0.85) return 'Perfect';
  if (q > 0.55) return 'Good';
  return offset < 0 ? 'Early' : 'Late';
}

export interface Shot {
  vel: Vec3;
  /** Predicted peak, used for the low-hit call. */
  peak: number;
  /** Where the shot is actually going after scatter. */
  target: { x: number; y: number };
}

function scatter(cfg: GameConfig, q: number, rng: () => number): { dx: number; dy: number } {
  const { scatterPerfect, scatterWorst } = cfg.hitting;
  const radius = scatterPerfect + (scatterWorst - scatterPerfect) * Math.pow(1 - q, 1.5);
  const r = radius * Math.sqrt(rng());
  const a = rng() * Math.PI * 2;
  return { dx: r * Math.cos(a), dy: r * Math.sin(a) };
}

function shotPeak(cfg: GameConfig, style: ShotStyle, q: number, rng: () => number): number {
  return style.peak * (1 - cfg.hitting.peakLossWorst * (1 - q) * (0.5 + 0.5 * rng()));
}

export function computeHit(
  cfg: GameConfig,
  style: ShotStyle,
  from: Vec3,
  aimTarget: { x: number; y: number },
  q: number,
  rng: () => number,
): Shot {
  const { dx, dy } = scatter(cfg, q, rng);
  const target = { x: aimTarget.x + dx, y: aimTarget.y + dy };
  const vel = solveArc(from, target, shotPeak(cfg, style, q, rng), cfg.physics.gravity);
  return { vel, peak: predictPeak(from, vel, cfg.physics.gravity), target };
}

export function computeServe(
  cfg: GameConfig,
  style: ShotStyle,
  from: Vec3,
  aimTarget: { x: number; y: number },
  q: number,
  rng: () => number,
): Shot {
  const { dx, dy } = scatter(cfg, q, rng);
  const target = { x: aimTarget.x + dx, y: aimTarget.y + dy };
  const { vel } = solveServe(cfg, from, target, shotPeak(cfg, style, q, rng));
  return { vel, peak: predictPeak(from, vel, cfg.physics.gravity), target };
}
