// CPU opponent. It plays through TeamInput exactly like a human (tosses,
// times swings around the apex, slides its crosshair with "keys"), so all
// rules, stats and timing windows apply to it unchanged. Difficulty only
// changes how well it times and aims.

import type { TeamId } from '../core/types';
import { idleInput, type ControlFrame, type Game, type TeamInput } from './game';

/** Spin the CPU plans: top/back, or sidespin toward world -y ('left') / +y ('right'). */
type SpinKey = 'top' | 'back' | 'left' | 'right';
import { apexOffset } from './shot';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface CpuLevel {
  /** Spread (seconds) of its swing timing around the ideal moment. */
  timingSigma: number;
  /** Extra spread on saves. */
  saveSigma: number;
  /** Chance to miss a swing outright (swings too late). */
  whiff: number;
  /** How far (m) its chosen aim point wanders from the cup it picked. */
  aimJitter: number;
  /** Chance it goes for a cup at all (otherwise a safe ball to mid-table). */
  cupRate: number;
  /** Chance it adds spin to a hit or serve. */
  spinRate: number;
  /** Chance of using a non-default style on a hit. */
  styleMix: number;
  /** Game seconds it waits before tossing a serve. */
  serveDelay: number;
}

export const CPU_LEVELS: Record<Difficulty, CpuLevel> = {
  easy: { timingSigma: 0.09, saveSigma: 0.11, whiff: 0.07, aimJitter: 0.2, cupRate: 0.4, spinRate: 0.05, styleMix: 0.15, serveDelay: 0.9 },
  medium: { timingSigma: 0.05, saveSigma: 0.065, whiff: 0.025, aimJitter: 0.1, cupRate: 0.7, spinRate: 0.2, styleMix: 0.3, serveDelay: 0.6 },
  hard: { timingSigma: 0.025, saveSigma: 0.035, whiff: 0.006, aimJitter: 0.04, cupRate: 0.9, spinRate: 0.35, styleMix: 0.4, serveDelay: 0.4 },
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export class CpuController {
  private level: CpuLevel;
  /** Plan for the ball currently coming: when to swing, where to aim, which style. */
  private plan: { key: string; swingAt: number; aim: { x: number; y: number }; style: 0 | 1 | 2; spin: SpinKey | null } | null = null;
  private waitUntil: number | null = null;

  constructor(
    readonly team: TeamId,
    difficulty: Difficulty,
    private rng: () => number,
  ) {
    this.level = CPU_LEVELS[difficulty];
  }

  private gauss(): number {
    const u = Math.max(1e-9, this.rng());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.rng());
  }

  /** Which ball (or serve) we are planning for. */
  private ballKey(game: Game): string | null {
    const st = game.engine.peek();
    if (st.phase === 'awaitServe' && st.server.team === this.team) return `serve-${game.engine.log.length}-${game.tossCount + (game.tossing ? 0 : 1)}`;
    if (game.aiming(this.team) && st.rally) return `ball-${st.rally.hits}-${st.rally.cupAtRisk ? 1 : 0}`;
    return null;
  }

  private makePlan(game: Game, key: string): NonNullable<CpuController['plan']> {
    const st = game.engine.peek();
    const L = this.level;
    const serving = key.startsWith('serve');
    const save = !!st.rally?.cupAtRisk;
    const w = game.cfg.hitting.timingWindow;
    let swingAt = this.gauss() * (save ? L.saveSigma : L.timingSigma);
    if (this.rng() < L.whiff) swingAt = w * 2; // too late: whiff
    swingAt = Math.max(-w * 1.5, swingAt);
    // Aim (in meters) at a live opponent cup, or a safe mid-table ball, with some wander.
    const opp: TeamId = this.team === 'A' ? 'B' : 'A';
    const cups = st.cups[opp].filter((c) => c.state !== 'removed');
    const cup = cups[Math.floor(this.rng() * cups.length)];
    const styleNow = game.styleFor(st.server.team === this.team && serving ? st.server : (game.activePlayer(this.team) ?? { team: this.team, side: 'left' }), serving ? 'serve' : 'hit', 0);
    const def = game.defaultSpot(this.team, styleNow);
    const goal = serving || !cup || this.rng() > L.cupRate ? def : { x: cup.x, y: cup.y };
    const point = { x: goal.x + this.gauss() * L.aimJitter, y: goal.y + this.gauss() * L.aimJitter };
    const aim = game.aimToward(this.team, point, styleNow);
    const spins: SpinKey[] = ['top', 'back', 'left', 'right'];
    const spin = this.rng() < L.spinRate ? spins[Math.floor(this.rng() * spins.length)] : null;
    const style: 0 | 1 | 2 = serving || this.rng() > L.styleMix ? 0 : this.rng() < 0.5 ? 1 : 2;
    return { key, swingAt, aim, style, spin };
  }

  input(game: Game): TeamInput {
    const inp = idleInput();
    const st = game.engine.peek();
    if (st.phase === 'penalty') {
      if (st.penalty!.team === this.team) inp.hit = true;
      return inp;
    }
    const key = this.ballKey(game);
    if (!key) {
      this.plan = null;
      this.waitUntil = null;
      return inp;
    }
    if (this.plan?.key !== key) this.plan = this.makePlan(game, key);
    const plan = this.plan;
    inp.style = plan.style;

    const f = game.controlFrames[this.team];
    if (game.timingCue(this.team)) {
      // Crosshair is frozen now: hold the direction for the planned spin (or nothing).
      if (plan.spin) this.holdSpin(inp, f, plan.spin);
    } else this.steer(game, inp, plan.aim);
    if (st.phase === 'awaitServe') {
      if (!game.tossing && game.ball.status !== 'flying') {
        this.waitUntil ??= game.time + this.level.serveDelay;
        if (game.time >= this.waitUntil) {
          inp.hit = true;
          this.waitUntil = null;
        }
      } else if (game.tossing && apexOffset(game.ball.vel, game.cfg.physics.gravity) >= plan.swingAt) inp.hit = true;
      return inp;
    }
    if (game.canSwing(this.team) && apexOffset(game.ball.vel, game.cfg.physics.gravity) >= plan.swingAt) inp.hit = true;
    return inp;
  }

  /** Hold aim keys to slide the crosshair toward `target` (aim units), in this team's view. */
  private steer(game: Game, inp: TeamInput, target: { x: number; y: number }): void {
    const a = game.aim[this.team];
    const f = game.controlFrames[this.team];
    const d = { x: target.x - a.x, y: target.y - a.y };
    const along = (v: [number, number]) => d.x * v[0] + d.y * v[1];
    const dead = 0.04;
    const u = along(f.up);
    const r = along(f.right);
    if (u > dead) inp.up = true;
    else if (u < -dead) inp.down = true;
    if (r > dead) inp.right = true;
    else if (r < -dead) inp.left = true;
  }

  /** Hold the screen direction that means this spin for this team (see Game.spinChoice). */
  private holdSpin(inp: TeamInput, f: ControlFrame, spin: SpinKey): void {
    const fwd = this.team === 'A' ? 1 : -1;
    // World direction wanted: forward (+-x toward the opponents) or sideways (+-y).
    const want = spin === 'top' ? [fwd, 0] : spin === 'back' ? [-fwd, 0] : spin === 'right' ? [0, 1] : [0, -1];
    const u = want[0] * f.up[0] + want[1] * f.up[1];
    const r = want[0] * f.right[0] + want[1] * f.right[1];
    if (Math.abs(u) >= Math.abs(r)) {
      if (u > 0) inp.up = true;
      else inp.down = true;
    } else if (r > 0) inp.right = true;
    else inp.left = true;
  }
}
