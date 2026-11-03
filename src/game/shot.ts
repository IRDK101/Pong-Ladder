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
import { passiveEffect } from '../core/passives';

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
  /** The swinger's passive abilities (their window effects apply). */
  passives?: readonly string[];
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
  let w = h.timingWindow * (h.windowScale ?? 1) * style.timing.windowScale;
  if (style.kind === 'serve') w *= statEffect(cfg, 'serveWindow', ctx.stats.serve) * passiveEffect(ctx.passives, 'serveWindow');
  else {
    w *= passiveEffect(ctx.passives, 'hitWindow');
    if (ctx.save) w *= h.saveWindowScale * statEffect(cfg, 'saveWindow', ctx.stats.saves) * passiveEffect(ctx.passives, 'saveWindow');
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
  /** How the incoming spin moved this shot (returns only). */
  clash?: ReturnType<typeof spinClash>;
}

/**
 * Scatter radius (m, max) for a timing quality, before multipliers. Near-perfect
 * timing stays tight; the further from perfect, the faster the spread grows.
 */
export function baseScatter(cfg: GameConfig, q: number): number {
  const { scatterPerfect, scatterWorst } = cfg.hitting;
  const off = 1 - Math.max(0, Math.min(1, q));
  return scatterPerfect + (scatterWorst - scatterPerfect) * Math.min(1.6, Math.pow(off, 1.5) * (1 + 1.5 * off));
}

function scatter(radius: number, rng: () => number): { dx: number; dy: number } {
  const r = radius * Math.sqrt(rng());
  const a = rng() * Math.PI * 2;
  return { dx: r * Math.cos(a), dy: r * Math.sin(a) };
}

function shotPeak(cfg: GameConfig, style: ShotStyle, q: number, rng: () => number): number {
  return style.peak * (1 - cfg.hitting.peakLossWorst * (1 - q) * (0.5 + 0.5 * rng()));
}

/** Ease the very highest aimed peaks down (a soft knee), so they stay on screen; everything below the knee is untouched. */
export function softPeak(cfg: GameConfig, peak: number): number {
  const k = cfg.physics.peakSoftCap ?? Infinity;
  return peak <= k ? peak : k + (peak - k) * 0.25;
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
export function spinEffects(cfg: GameConfig, style: ShotStyle, stats: Stats, dir: 1 | -1 = 1, choice: SpinChoice | null = null, boost = 0): BallEffects {
  const ph = cfg.physics;
  const type = choice ? choice.type : style.spin.type;
  const base = choice ? cfg.hitting.spin[choice.type] : style.spin.amount;
  if (choice) dir = choice.dir;
  const amt = base * statEffect(cfg, 'spinAmount', stats.spin) + boost;
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
  /** Spin on the ball coming in (see spinClash). */
  incoming?: IncomingSpin | null;
}

/**
 * Spin on an incoming ball, as it was struck: `top` from -1 (heavy backspin)
 * to +1 (heavy topspin), and `side` signed by the world-y way it curved.
 */
export interface IncomingSpin {
  top: number;
  side: number;
}

/** The spin a shot put on the ball, for the player who returns it. */
export function spinOf(cfg: GameConfig, fx: BallEffects): IncomingSpin {
  return { top: fx.topspin, side: cfg.physics.sideCurve ? fx.curve / cfg.physics.sideCurve : 0 };
}

/**
 * Paddle spin against ball spin. Spin left unanswered pushes the return off
 * target: topspin sends it long, backspin drops it short, sidespin pulls it
 * the way the ball was curving. Hitting the opposite spin cancels the push (in
 * proportion to how much spin you put on); hitting the same spin keeps the push
 * but carries some of the incoming spin into your shot. Good timing and a high
 * Spin stat soften the push.
 */
export function spinClash(cfg: GameConfig, inc: IncomingSpin | null | undefined, choice: SpinChoice | null | undefined, q: number, stats: Stats, forward: 1 | -1): { dx: number; dy: number; boost: number; countered: boolean } {
  const c = cfg.hitting.clash;
  if (!inc || (Math.abs(inc.top) < 0.05 && Math.abs(inc.side) < 0.05)) return { dx: 0, dy: 0, boost: 0, countered: false };
  const mine = choice ? cfg.hitting.spin[choice.type] * statEffect(cfg, 'spinAmount', stats.spin) : 0;
  const myTop = choice?.type === 'top' ? mine : choice?.type === 'back' ? -mine : 0;
  const mySide = choice?.type === 'side' ? mine * choice.dir : 0;
  const resist = (1 - c.timingRelief * Math.max(0, Math.min(1, q))) / Math.sqrt(statEffect(cfg, 'spinAmount', stats.spin));
  const part = (incoming: number, own: number) => {
    if (Math.abs(incoming) < 0.05) return { left: 0, boost: 0, cancel: 0 };
    if (own * incoming < 0) {
      const cancel = Math.min(1, Math.abs(own) / Math.abs(incoming));
      return { left: incoming * (1 - cancel), boost: 0, cancel };
    }
    return { left: incoming, boost: own ? c.carry * Math.abs(incoming) : 0, cancel: 0 };
  };
  const t = part(inc.top, myTop);
  const s = part(inc.side, mySide);
  return {
    dx: t.left * c.depthPush * resist * forward,
    dy: s.left * c.sidePush * resist,
    boost: myTop ? t.boost : mySide ? s.boost : 0,
    countered: Math.max(t.cancel * Math.abs(inc.top), s.cancel * Math.abs(inc.side)) > 0.3,
  };
}

/**
 * Early swings land short, late swings long, by up to `timingDepthError`.
 * Squared, so a near-perfect swing barely drifts and a badly late one sails long.
 */
export function timingDrift(cfg: GameConfig, aim: AimSpec): number {
  const l = Math.max(-1, Math.min(1, aim.lateness ?? 0));
  return Math.sign(l) * l * l * cfg.hitting.timingDepthError * aim.forward;
}

export function computeHit(cfg: GameConfig, style: ShotStyle, from: Vec3, aim: AimSpec, q: number, rng: () => number, stats: Stats = NEUTRAL_STATS, passives?: readonly string[]): Shot {
  const radius =
    baseScatter(cfg, q) * style.scatterScale * statEffect(cfg, 'accuracyScatter', stats.accuracy) * statEffect(cfg, 'powerScatter', stats.power) * passiveEffect(passives, 'scatter');
  const { dx, dy } = scatter(radius, rng);
  const raw = spinClash(cfg, aim.incoming, aim.spin, q, stats, aim.forward);
  const push = passiveEffect(passives, 'spinPush');
  const clash = push === 1 ? raw : { ...raw, dx: raw.dx * push, dy: raw.dy * push };
  const target = { x: aim.x + dx + timingDrift(cfg, aim) + clash.dx, y: aim.y + dy + clash.dy };
  const fx = spinEffects(cfg, style, stats, target.y >= from.y ? 1 : -1, aim.spin ?? null, clash.boost);
  const peak = softPeak(cfg, shotPeak(cfg, style, q, rng) * statEffect(cfg, 'powerPeak', stats.power) * passiveEffect(passives, 'peak'));
  const vel = solveArc(from, target, peak, cfg.physics.gravity, fx.curve, aim.z ?? 0);
  return { vel, peak: predictPeak(from, vel, cfg.physics.gravity), target, fx, clash };
}

export function computeServe(cfg: GameConfig, style: ShotStyle, from: Vec3, aim: AimSpec, q: number, rng: () => number, stats: Stats = NEUTRAL_STATS, passives?: readonly string[]): Shot {
  const radius = baseScatter(cfg, q) * style.scatterScale * statEffect(cfg, 'serveScatter', stats.serve) * passiveEffect(passives, 'scatter');
  const { dx, dy } = scatter(radius, rng);
  const target = { x: aim.x + dx + timingDrift(cfg, aim) * 0.5, y: aim.y + dy };
  // Serve spin lasts two bounces, so it still kicks on the receiver's side.
  const fx = { ...spinEffects(cfg, style, stats, target.y >= from.y ? 1 : -1, aim.spin ?? null), bounces: 2 };
  const { vel } = solveServe(cfg, from, target, softPeak(cfg, shotPeak(cfg, style, q, rng) * passiveEffect(passives, 'peak')), fx);
  return { vel, peak: predictPeak(from, vel, cfg.physics.gravity), target, fx };
}
