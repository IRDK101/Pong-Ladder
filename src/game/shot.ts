// Shot model: timing quality + character stats + style → actual trajectory. Pure.
//
// Skill beats stats: timing quality is the main input. Stats (read as
// effective stats) and the chosen style scale scatter, peak, spin and timing
// windows within the limits in config.statEffects.

import type { GameConfig } from '../config';
import { NO_EFFECTS, type BallEffects, type Vec3 } from '../core/physics';
import { NEUTRAL_STATS, statEffect, type Stats } from '../core/stats';
import type { ShotStyle } from '../core/styles';
import { predictPeak, solveArc, solveServe } from '../core/trajectory';

/** Aim input, each axis in [-1, 1], in table axes (x = length, y = width). */
export interface Aim {
  x: number;
  y: number;
}

export interface SwingContext {
  /** Effective stats of the player swinging. */
  stats: Stats;
  /** This swing is a save (a cup was just hit). */
  save?: boolean;
  /** Power stat of whoever hit the incoming ball (faster balls are harder to return). */
  incomingPower?: number;
}

const neutral: SwingContext = { stats: NEUTRAL_STATS };

/** Half-width (seconds) of the timing window for this swing. */
export function timingWindow(cfg: GameConfig, style: ShotStyle, ctx: SwingContext = neutral): number {
  const h = cfg.hitting;
  let w = h.timingWindow * style.timing.windowScale;
  if (style.kind === 'serve') w *= statEffect(cfg, 'serveWindow', ctx.stats.serve);
  else {
    if (ctx.save) w *= h.saveWindowScale * statEffect(cfg, 'saveWindow', ctx.stats.saves);
    if (ctx.incomingPower !== undefined) w *= statEffect(cfg, 'powerIncomingWindow', ctx.incomingPower);
  }
  return w;
}

/**
 * Timing quality in [0, 1] for a swing `offset` seconds from the ideal
 * moment, or null if outside the window (a whiff).
 */
export function timingQuality(cfg: GameConfig, style: ShotStyle, offset: number, ctx: SwingContext = neutral): number | null {
  const w = timingWindow(cfg, style, ctx);
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
  /** Where the shot is aimed to land after scatter. */
  target: { x: number; y: number };
  /** Spin / bounce behaviour to launch the ball with. */
  fx: BallEffects;
}

/** Scatter radius (m, max) for a timing quality, before multipliers. */
export function baseScatter(cfg: GameConfig, q: number): number {
  const { scatterPerfect, scatterWorst } = cfg.hitting;
  return scatterPerfect + (scatterWorst - scatterPerfect) * Math.pow(1 - q, 1.5);
}

function scatter(radius: number, rng: () => number): { dx: number; dy: number } {
  const r = radius * Math.sqrt(rng());
  const a = rng() * Math.PI * 2;
  return { dx: r * Math.cos(a), dy: r * Math.sin(a) };
}

function shotPeak(cfg: GameConfig, style: ShotStyle, q: number, rng: () => number): number {
  return style.peak * (1 - cfg.hitting.peakLossWorst * (1 - q) * (0.5 + 0.5 * rng()));
}

/** Spin effects of a style for a player's Spin stat. `dir` picks the side for sidespin. */
export function spinEffects(cfg: GameConfig, style: ShotStyle, stats: Stats, dir: 1 | -1 = 1): BallEffects {
  const ph = cfg.physics;
  const amt = style.spin.amount * statEffect(cfg, 'spinAmount', stats.spin);
  const fx = { ...NO_EFFECTS, restitutionScale: style.bounce.restitutionScale, frictionScale: style.bounce.frictionScale };
  if (style.spin.type === 'top') fx.topspin = Math.min(1, amt);
  else if (style.spin.type === 'back') fx.topspin = -Math.min(1, amt);
  else if (style.spin.type === 'side') {
    fx.curve = amt * ph.sideCurve * dir;
    fx.sideKick = amt * ph.sideKick * dir;
  }
  return fx;
}

export function computeHit(
  cfg: GameConfig,
  style: ShotStyle,
  from: Vec3,
  aimTarget: { x: number; y: number },
  q: number,
  rng: () => number,
  stats: Stats = NEUTRAL_STATS,
): Shot {
  const radius =
    baseScatter(cfg, q) * style.scatterScale * statEffect(cfg, 'accuracyScatter', stats.accuracy) * statEffect(cfg, 'powerScatter', stats.power);
  const { dx, dy } = scatter(radius, rng);
  const target = { x: aimTarget.x + dx, y: aimTarget.y + dy };
  const fx = spinEffects(cfg, style, stats, target.y >= from.y ? 1 : -1);
  const peak = shotPeak(cfg, style, q, rng) * statEffect(cfg, 'powerPeak', stats.power);
  const vel = solveArc(from, target, peak, cfg.physics.gravity, fx.curve);
  return { vel, peak: predictPeak(from, vel, cfg.physics.gravity), target, fx };
}

export function computeServe(
  cfg: GameConfig,
  style: ShotStyle,
  from: Vec3,
  aimTarget: { x: number; y: number },
  q: number,
  rng: () => number,
  stats: Stats = NEUTRAL_STATS,
): Shot {
  const radius = baseScatter(cfg, q) * style.scatterScale * statEffect(cfg, 'serveScatter', stats.serve);
  const { dx, dy } = scatter(radius, rng);
  const target = { x: aimTarget.x + dx, y: aimTarget.y + dy };
  const fx = spinEffects(cfg, style, stats, target.y >= from.y ? 1 : -1);
  const { vel } = solveServe(cfg, from, target, shotPeak(cfg, style, q, rng), fx);
  return { vel, peak: predictPeak(from, vel, cfg.physics.gravity), target, fx };
}
