// Game controller: ties physics, the rules engine and per-team input together.
// No DOM. Input arrives as abstract TeamInput so humans, scripted tests and
// (later) AI opponents all drive the game the same way.

import type { GameConfig } from '../config';
import { Match } from '../core/match';
import { BallPhysics, type PhysicsEvent, type Vec3 } from '../core/physics';
import type { Call, RulesEvent } from '../core/rules';
import { getStyle, type ShotStyle } from '../core/styles';
import { diagonalOf, laneOf, quarterOf, quarterRect } from '../core/table';
import { otherTeam, type Cup, type PlayerId, type TeamId } from '../core/types';
import { apexOffset, computeHit, computeServe, timingLabel, timingQuality, type Aim } from './shot';

export interface TeamInput {
  /** Held aim directions, in screen/table axes. */
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Hit key went down this frame. */
  hit: boolean;
  /** Direction pressed this frame, for menus / cup selection: -1 prev, +1 next. */
  nav: -1 | 0 | 1;
}

export const idleInput = (): TeamInput => ({ up: false, down: false, left: false, right: false, hit: false, nav: 0 });

export interface Message {
  text: string;
  time: number;
}

export interface Feedback {
  team: TeamId;
  label: string;
  quality: number | null;
  time: number;
}

const DELAY_AFTER_RALLY = 1.6;
const DELAY_AFTER_RESERVE = 0.9;
const DELAY_AFTER_PENALTY = 0.6;

export class Game {
  readonly cfg: GameConfig;
  readonly match: Match;
  readonly ball: BallPhysics;
  /** Simulation time (scaled), seconds. */
  time = 0;
  messages: Message[] = [];
  feedback: Feedback | null = null;
  /** Index into the penalized team's live cups, for keyboard selection. */
  penaltyCursor = 0;
  /** Set while the server's toss is in the air. */
  tossing = false;
  /** Each team's crosshair, in [-1, 1] per axis. Sticky: it stays where the player leaves it. */
  aim: Record<TeamId, Aim> = { A: { x: 0, y: 0 }, B: { x: 0, y: 0 } };

  private rng: () => number;
  private resumeAt: number | null = null;
  private swung: Record<TeamId, boolean> = { A: false, B: false };
  private bounced: Record<TeamId, boolean> = { A: false, B: false };
  private tossSwung = false;
  /** Listeners for engine calls (HUD, sound later, stats). */
  onCall: ((c: Call) => void) | null = null;

  constructor(cfg: GameConfig, rng: () => number = Math.random) {
    this.cfg = cfg;
    this.rng = rng;
    this.match = new Match(cfg, rng);
    this.ball = new BallPhysics(cfg);
    this.placeBallWithServer();
  }

  get engine() {
    return this.match.current;
  }

  get cups(): Cup[] {
    const c = this.engine.peek().cups;
    return [...c.A, ...c.B];
  }

  /** Where a player stands: behind their end of the table, in their lane. */
  playerSpot(p: PlayerId): Vec3 {
    const { length: L, width: W } = this.cfg.table;
    const off = this.cfg.hitting.standOff;
    return {
      x: p.team === 'A' ? -off : L + off,
      y: laneOf(p) === 'low' ? W * 0.25 : W * 0.75,
      z: this.cfg.hitting.tossHeight,
    };
  }

  /** Which player on `team` the keyboard controls right now. */
  activePlayer(team: TeamId): PlayerId | null {
    const st = this.engine.peek();
    if (st.phase === 'awaitServe') return st.server.team === team ? st.server : null;
    if ((st.phase === 'rally' || st.phase === 'serveInFlight') && st.rally && st.rally.target === team) {
      if (st.rally.cupAtRisk) {
        // During a save either teammate may hit: whoever is on the ball's side.
        const lane = this.ball.pos.y < this.cfg.table.width / 2 ? 'low' : 'high';
        const sides = ['left', 'right'] as const;
        const side = sides.find((s) => laneOf({ team, side: s }) === lane)!;
        return { team, side };
      }
      return { team, side: st.rally.nextSide[team] };
    }
    return null;
  }

  /** True when `team`'s active player could swing at the ball now. */
  canSwing(team: TeamId): boolean {
    const st = this.engine.peek();
    if (st.phase !== 'rally' || !st.rally || st.rally.target !== team) return false;
    if (this.swung[team] || this.ball.status !== 'flying') return false;
    return this.bounced[team] || st.rally.cupAtRisk !== null;
  }

  /** Where a shot from `team` is aimed: the style's default spot, moved by the aim keys. */
  aimTarget(team: TeamId, aim: Aim, style: ShotStyle): { x: number; y: number } {
    const { hitting, table } = this.cfg;
    const serving = style.kind === 'serve';
    const rect = serving
      ? quarterRect(this.cfg, quarterOf(diagonalOf(this.engine.peek().server)))
      : quarterRect(this.cfg, { team: otherTeam(team), lane: 'low' });
    // Depth is measured from the edge nearest the hitter (the widthwise center line).
    const near = team === 'A' ? rect.x0 : rect.x1;
    const far = team === 'A' ? rect.x1 : rect.x0;
    const x = near + (far - near) * style.depth;
    const y = serving ? (rect.y0 + rect.y1) / 2 : table.width / 2;
    const lat = serving ? hitting.aimRangeLateral * 0.6 : hitting.aimRangeLateral * 2;
    return { x: x + aim.x * hitting.aimRangeDepth, y: y + aim.y * lat };
  }

  /** Direction the held aim keys point, per axis in {-1, 0, 1}. */
  static aimOf(inp: TeamInput): Aim {
    return { x: (inp.right ? 1 : 0) - (inp.left ? 1 : 0), y: (inp.down ? 1 : 0) - (inp.up ? 1 : 0) };
  }

  /**
   * Timing cue for `team`, when its player can swing (or is mid-toss): seconds
   * from the ideal moment (negative = still early) and the window half-width.
   */
  timingCue(team: TeamId): { offset: number; window: number } | null {
    const st = this.engine.peek();
    const tossing = st.phase === 'awaitServe' && st.server.team === team && this.tossing && !this.tossSwung;
    if (!tossing && !this.canSwing(team)) return null;
    const style = getStyle(tossing ? 'standardServe' : 'standardHit');
    const saving = !tossing && st.rally!.cupAtRisk !== null;
    const h = this.cfg.hitting;
    return {
      offset: apexOffset(this.ball.vel, this.cfg.physics.gravity),
      window: h.timingWindow * style.timing.windowScale * (saving ? h.saveWindowScale : 1),
    };
  }

  /** Whether `team` should see its crosshair: it is serving, or the ball is coming to it. */
  aiming(team: TeamId): boolean {
    const st = this.engine.peek();
    if (st.phase === 'awaitServe') return st.server.team === team;
    return (st.phase === 'rally' || st.phase === 'serveInFlight') && st.rally?.target === team;
  }

  private moveAim(realDt: number, inputs: Record<TeamId, TeamInput>): void {
    const step = this.cfg.hitting.aimSpeed * realDt;
    for (const team of ['A', 'B'] as TeamId[]) {
      const d = Game.aimOf(inputs[team]);
      const a = this.aim[team];
      a.x = Math.max(-1, Math.min(1, a.x + d.x * step));
      a.y = Math.max(-1, Math.min(1, a.y + d.y * step));
    }
  }

  update(realDt: number, inputs: Record<TeamId, TeamInput>): void {
    const dt = realDt * this.cfg.physics.timeScale;
    this.time += dt;
    const st = this.engine.peek();
    if (st.phase !== 'penalty') this.moveAim(realDt, inputs);

    if (st.phase === 'gameOver') {
      this.ball.step(dt, []);
      return;
    }
    if (st.phase === 'penalty') {
      this.penaltyInput(inputs[st.penalty!.team]);
      return;
    }
    if (this.resumeAt !== null) {
      // Dead ball: keep it moving for the eye, but the rules ignore it.
      this.ball.step(dt, this.cups);
      if (this.time >= this.resumeAt) {
        this.resumeAt = null;
        this.placeBallWithServer();
      }
      return;
    }

    if (st.phase === 'awaitServe') {
      this.serveInput(inputs[st.server.team], dt);
      return;
    }

    // Live ball.
    for (const team of ['A', 'B'] as TeamId[]) if (inputs[team].hit) this.trySwing(team);
    if (this.resumeAt !== null) return; // that swing ended the rally (e.g. low hit)
    const events = this.ball.step(dt, this.cups);
    for (const e of events) {
      this.onPhysics(e);
      if (this.resumeAt !== null || this.engine.peek().phase === 'gameOver') break;
    }
  }

  /** Mouse selection of the penalty cup. */
  chooseCup(team: TeamId, cupId: string): boolean {
    return this.dispatch({ type: 'chooseCup', team, cupId });
  }

  /** After a game ends: advance the match. Returns the match winner, if decided. */
  continueMatch(): TeamId | null {
    const w = this.match.finishGame();
    if (!w) {
      this.resumeAt = null;
      this.messages.push({ text: `Game ${this.match.games.length} — ${this.serverName()} serves`, time: this.time });
      this.placeBallWithServer();
    }
    return w;
  }

  cupsLeftLine(): string {
    return `Cups left — A: ${this.engine.cupsRemaining('A')}, B: ${this.engine.cupsRemaining('B')}`;
  }

  penaltyCups(): Cup[] {
    const st = this.engine.peek();
    if (st.phase !== 'penalty') return [];
    return st.cups[st.penalty!.team].filter((c) => c.state !== 'removed');
  }

  // ----------------------------------------------------------- internals

  private serverName(): string {
    const s = this.engine.peek().server;
    return `${s.team}-${s.side === 'left' ? 'L' : 'R'}`;
  }

  private placeBallWithServer(): void {
    this.tossing = false;
    this.tossSwung = false;
    this.ball.hold(this.playerSpot(this.engine.peek().server));
  }

  private serveInput(inp: TeamInput, dt: number): void {
    const server = this.engine.peek().server;
    const style = getStyle('standardServe');
    if (!this.tossing) {
      if (inp.hit) {
        this.tossing = true;
        this.tossSwung = false;
        this.ball.launch(this.playerSpot(server), { x: 0, y: 0, z: this.cfg.hitting.tossSpeed });
      }
      return;
    }
    if (inp.hit && !this.tossSwung) {
      this.tossSwung = true;
      const off = apexOffset(this.ball.vel, this.cfg.physics.gravity);
      const q = timingQuality(this.cfg, style, off);
      this.feedback = { team: server.team, label: timingLabel(q, off), quality: q, time: this.time };
      if (q !== null) return this.serve(server, style, q, this.aim[server.team]);
    }
    this.ball.step(dt, []);
    // Catch the toss on the way down; no penalty for a dropped toss.
    if (this.ball.vel.z < 0 && this.ball.pos.z <= this.cfg.hitting.tossHeight) this.placeBallWithServer();
  }

  private serve(server: PlayerId, style: ShotStyle, q: number, aim: Aim): void {
    const from = { ...this.ball.pos };
    const shot = computeServe(this.cfg, style, from, this.aimTarget(server.team, aim, style), q, this.rng);
    this.tossing = false;
    this.resetBallTracking();
    this.dispatch({ type: 'hit', player: server, peak: shot.peak, style: style.id, timing: q });
    this.ball.launch(from, shot.vel);
  }

  private trySwing(team: TeamId): void {
    if (!this.canSwing(team)) return;
    const player = this.activePlayer(team)!;
    const style = getStyle('standardHit');
    const saving = this.engine.peek().rally!.cupAtRisk !== null;
    this.swung[team] = true;
    const off = apexOffset(this.ball.vel, this.cfg.physics.gravity);
    const q = timingQuality(this.cfg, style, off, saving);
    this.feedback = { team, label: timingLabel(q, off), quality: q, time: this.time };
    if (q === null) return; // whiff
    const from = { ...this.ball.pos };
    const shot = computeHit(this.cfg, style, from, this.aimTarget(team, this.aim[team], style), q, this.rng);
    this.resetBallTracking();
    this.dispatch({ type: 'hit', player, peak: shot.peak, style: style.id, timing: q });
    this.ball.launch(from, shot.vel);
  }

  private resetBallTracking(): void {
    this.swung = { A: false, B: false };
    this.bounced = { A: false, B: false };
  }

  private onPhysics(e: PhysicsEvent): void {
    if (e.type === 'bounce') this.bounced[e.x < this.cfg.table.length / 2 ? 'A' : 'B'] = true;
    this.dispatch(e);
  }

  private penaltyInput(inp: TeamInput): void {
    const cups = this.penaltyCups();
    if (cups.length === 0) return;
    if (inp.nav !== 0) this.penaltyCursor = (this.penaltyCursor + inp.nav + cups.length) % cups.length;
    this.penaltyCursor = Math.min(this.penaltyCursor, cups.length - 1);
    if (inp.hit) this.chooseCup(cups[this.penaltyCursor].team, cups[this.penaltyCursor].id);
  }

  private dispatch(ev: RulesEvent): boolean {
    const res = this.engine.dispatch(ev);
    for (const c of res.calls) this.handleCall(c);
    return res.accepted;
  }

  private handleCall(c: Call): void {
    this.messages.push({ text: c.text, time: this.time });
    if (this.messages.length > 50) this.messages.shift();
    this.onCall?.(c);
    const phase = this.engine.peek().phase;
    if (phase === 'penalty') this.penaltyCursor = 0;
    if (phase !== 'awaitServe') return;
    const delay =
      c.kind === 'penaltyApplied' ? DELAY_AFTER_PENALTY : c.kind === 'reServe' || c.kind === 'tableMiss' ? DELAY_AFTER_RESERVE : DELAY_AFTER_RALLY;
    this.resumeAt = Math.max(this.resumeAt ?? 0, this.time + delay);
  }
}
