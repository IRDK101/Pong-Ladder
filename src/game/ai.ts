// CPU opponent. It plays through TeamInput exactly like a human (tosses,
// times swings around the apex, slides its crosshair with "keys"), so all
// rules, stats and timing windows apply to it unchanged. Difficulty only
// changes how well it times and aims.

import type { TeamId } from '../core/types';
import { idleInput, type Game, type TeamInput } from './game';
import { apexOffset } from './shot';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface CpuLevel {
  /** Spread (seconds) of its swing timing around the ideal moment. */
  timingSigma: number;
  /** Extra spread on saves. */
  saveSigma: number;
  /** Chance to miss a swing outright (swings too late). */
  whiff: number;
  /** How far (in aim units) its chosen aim wanders from the plan. */
  aimJitter: number;
  /** How deep it aims, toward the cups (0 = mid-table, 1 = as deep as aim allows). */
  depth: number;
  /** Chance of using a non-default style on a hit. */
  styleMix: number;
  /** Game seconds it waits before tossing a serve. */
  serveDelay: number;
}

export const CPU_LEVELS: Record<Difficulty, CpuLevel> = {
  easy: { timingSigma: 0.1, saveSigma: 0.12, whiff: 0.07, aimJitter: 0.55, depth: 0.35, styleMix: 0.15, serveDelay: 0.9 },
  medium: { timingSigma: 0.055, saveSigma: 0.07, whiff: 0.025, aimJitter: 0.3, depth: 0.65, styleMix: 0.3, serveDelay: 0.6 },
  hard: { timingSigma: 0.028, saveSigma: 0.04, whiff: 0.006, aimJitter: 0.14, depth: 0.85, styleMix: 0.4, serveDelay: 0.4 },
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export class CpuController {
  private level: CpuLevel;
  /** Plan for the ball currently coming: when to swing, where to aim, which style. */
  private plan: { key: string; swingAt: number; aim: { x: number; y: number }; style: 0 | 1 | 2 } | null = null;
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
    // Aim at a live opponent cup, deep, with some wander.
    const opp: TeamId = this.team === 'A' ? 'B' : 'A';
    const cups = st.cups[opp].filter((c) => c.state !== 'removed');
    const cup = cups[Math.floor(this.rng() * cups.length)];
    const W = game.cfg.table.width;
    const lat = game.cfg.hitting.aimRangeLateral * 2;
    const forward = this.team === 'A' ? 1 : -1;
    const aim = serving
      ? { x: (this.rng() - 0.5) * 0.6, y: (this.rng() - 0.5) * 0.6 }
      : {
          x: forward * L.depth + this.gauss() * L.aimJitter * 0.5,
          y: (cup ? (cup.y - W / 2) / lat : 0) + this.gauss() * L.aimJitter,
        };
    aim.x = Math.max(-1, Math.min(1, aim.x));
    aim.y = Math.max(-1, Math.min(1, aim.y));
    const style: 0 | 1 | 2 = serving || this.rng() > L.styleMix ? 0 : this.rng() < 0.5 ? 1 : 2;
    return { key, swingAt, aim, style };
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

    // Slide the crosshair toward the plan with the "keys" for this team's view.
    const a = game.aim[this.team];
    const f = game.controlFrames[this.team];
    const d = { x: plan.aim.x - a.x, y: plan.aim.y - a.y };
    const along = (v: [number, number]) => d.x * v[0] + d.y * v[1];
    const dead = 0.04;
    const u = along(f.up);
    const r = along(f.right);
    if (u > dead) inp.up = true;
    else if (u < -dead) inp.down = true;
    if (r > dead) inp.right = true;
    else if (r < -dead) inp.left = true;

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
}
