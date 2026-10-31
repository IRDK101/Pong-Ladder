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
  /** Horizontal speed of the incoming ball (m/s): faster = smaller window. */
  ballSpeed?: number;
  /** Hits so far in this rally: longer rallies = smaller window. */
  rallyHits?: number;
  /** Distance (m) from where the hitter stands to the ball: farther = smaller window, none out of reach. */
  reach?: number;
}

/** 0–1 multiplier for how far the hitter must reach (1 = comfortable, 0 = out of reach). */
export function reachFactor(cfg: GameConfig, distance: number, ctx: SwingContext = neutral): number {
  const { comfortable, max } = cfg.hitting.reach;
  const k = ctx.save ? statEffect(cfg, 'saveReach', ctx.stats.saves) : 1;
  const c = comfortable * k;
  const m = max * k;
  if (distance <= c) return 1;
  if (distance >= m) return 0;
  return Math.pow(1 - (distance - c) / (m - c), 0.8);
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
    if (ctx.ballSpeed !== undefined && ctx.ballSpeed > 0) {
      const sp = h.windowSpeed;
      w *= Math.max(sp.min, Math.min(sp.max, Math.pow(sp.ref / ctx.ballSpeed, sp.exponent)));
    }
    if (ctx.rallyHits !== undefined) {
      const ra = h.windowRally;
      w *= Math.max(ra.min, 1 - ra.perHit * Math.max(0, ctx.rallyHits - ra.startAfter));
    }
    if (ctx.reach !== undefined) w *= reachFactor(cfg, ctx.reach, ctx);
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
  if (w <= 0 || a > w) return null;
  return Math.pow(1 - a / w, style.timing.falloff);
}

/** Seconds from the ball's apex: negative = early (still rising), positive = late. */
export function apexOffset(vel: Vec3, gravity: number): number {
  return -vel.z / gravity;
}

export function timingLabel(q: number | null, offset: number, outOfReach = false): string {
  if (outOfReach) return 'Out of reach!';
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

/** Spin the hitter adds by holding a direction as they hit. `dir` is the world-y side a sidespin curves to. */
export interface SpinChoice {
  type: 'top' | 'back' | 'side';
  dir: 1 | -1;
}

export const SPIN_LABELS: Record<SpinChoice['type'], string> = { top: 'Topspin', back: 'Backspin', side: 'Sidespin' };

/**
 * Spin effects of a shot for a player's Spin stat: the player's chosen spin
 * if any, otherwise the style's own. `dir` picks the side for a style's sidespin.
 */
export function spinEffects(cfg: GameConfig, style: ShotStyle, stats: Stats, dir: 1 | -1 = 1, choice: SpinChoice | null = null): BallEffects {
  const ph = cfg.physics;
  const type = choice ? choice.type : style.spin.type;
  const base = choice ? cfg.hitting.spin[choice.type] : style.spin.amount;
  if (choice) dir = choice.dir;
  const amt = base * statEffect(cfg, 'spinAmount', stats.spin);
  const fx = { ...NO_EFFECTS, restitutionScale: style.bounce.restitutionScale, frictionScale: style.bounce.frictionScale };
  if (type === 'top') fx.topspin = Math.min(1, amt);
  else if (type === 'back') fx.topspin = -Math.min(1, amt);
  else if (type === 'side') {
    fx.curve = amt * ph.sideCurve * dir;
    fx.sideKick = amt * ph.sideKick * dir;
  }
  return fx;
}

/** Where and how a shot is aimed, beyond the style and timing. */
export interface AimSpec {
  x: number;
  y: number;
  /** Arrival height at the aim point: 0 = the table, the cup height = into a cup's mouth. */
  z?: number;
  /** +1 if the shot travels toward +x (Team A hitting), -1 toward -x. */
  forward: 1 | -1;
  /** Swing offset from the ideal moment, as a fraction of the window (-1 early … +1 late). */
  lateness?: number;
  spin?: SpinChoice | null;
}

/**
 * Early swings land short, late swings long, by up to `timingDepthError`.
 * Squared, so a near-perfect swing barely drifts and a badly late one sails long.
 */
export function timingDrift(cfg: GameConfig, aim: AimSpec): number {
  const l = Math.max(-1, Math.min(1, aim.lateness ?? 0));
  return Math.sign(l) * l * l * cfg.hitting.timingDepthError * aim.forward;
}

export function computeHit(cfg: GameConfig, style: ShotStyle, from: Vec3, aim: AimSpec, q: number, rng: () => number, stats: Stats = NEUTRAL_STATS): Shot {
  const radius =
    baseScatter(cfg, q) * style.scatterScale * statEffect(cfg, 'accuracyScatter', stats.accuracy) * statEffect(cfg, 'powerScatter', stats.power);
  const { dx, dy } = scatter(radius, rng);
  const target = { x: aim.x + dx + timingDrift(cfg, aim), y: aim.y + dy };
  const fx = spinEffects(cfg, style, stats, target.y >= from.y ? 1 : -1, aim.spin ?? null);
  const peak = shotPeak(cfg, style, q, rng) * statEffect(cfg, 'powerPeak', stats.power);
  const vel = solveArc(from, target, peak, cfg.physics.gravity, fx.curve, aim.z ?? 0);
  return { vel, peak: predictPeak(from, vel, cfg.physics.gravity), target, fx };
}

export function computeServe(cfg: GameConfig, style: ShotStyle, from: Vec3, aim: AimSpec, q: number, rng: () => number, stats: Stats = NEUTRAL_STATS): Shot {
  const radius = baseScatter(cfg, q) * style.scatterScale * statEffect(cfg, 'serveScatter', stats.serve);
  const { dx, dy } = scatter(radius, rng);
  const target = { x: aim.x + dx + timingDrift(cfg, aim) * 0.5, y: aim.y + dy };
  // Serve spin lasts two bounces, so it still kicks on the receiver's side.
  const fx = { ...spinEffects(cfg, style, stats, target.y >= from.y ? 1 : -1, aim.spin ?? null), bounces: 2 };
  const { vel } = solveServe(cfg, from, target, shotPeak(cfg, style, q, rng), fx);
  return { vel, peak: predictPeak(from, vel, cfg.physics.gravity), target, fx };
}
