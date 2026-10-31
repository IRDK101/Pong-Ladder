// Game controller: ties physics, the rules engine and per-team input together.
// No DOM. Input arrives as abstract TeamInput so humans, scripted tests and
// (later) AI opponents all drive the game the same way.

import type { GameConfig } from '../config';
import { Match } from '../core/match';
import { BallPhysics, type PhysicsEvent, type Vec3 } from '../core/physics';
import type { Call, RulesEvent } from '../core/rules';
import type { Sprite } from '../core/character';
import { composeSprite } from '../core/sprite';
import { effectiveStats, NEUTRAL_STATS, type Stats } from '../core/stats';
import { DEFAULT_HIT_STYLES, DEFAULT_SERVE_STYLES, getStyle, type ShotStyle } from '../core/styles';
import { diagonalOf, laneOf, quarterOf, quarterRect } from '../core/table';
import { otherTeam, playerKey, type Cup, type PlayerId, type Side, type TeamId } from '../core/types';
import { apexOffset, computeHit, computeServe, timingLabel, timingQuality, timingWindow, type Aim, type SwingContext } from './shot';

/** Who is playing a position this game: a character (or a generic player) and the human behind it. */
export interface Participant {
  name: string;
  stats: Stats;
  /** First entry is the default; the style keys pick the 2nd and 3rd. */
  hitStyles: string[];
  serveStyles: string[];
  master: boolean;
  sprite: Sprite | null;
  /** The same character seen from behind (for the behind-the-shoulders camera). */
  spriteBack?: Sprite | null;
  /** Equipped cosmetics: a CSS name color and a celebration id (theme.celebrations). */
  nameColor: string | null;
  celebration: string | null;
  characterId: string | null;
  profileId: string | null;
}

export type PositionKey = 'A-left' | 'A-right' | 'B-left' | 'B-right';
export type Roster = Record<PositionKey, Participant>;

export const POSITIONS: PositionKey[] = ['A-left', 'A-right', 'B-left', 'B-right'];

/** Generic players for a quick match: neutral stats, the placeholder styles, named by position, in team shirts. */
export function genericRoster(): Roster {
  const make = (team: TeamId, side: Side): Participant => {
    const i = (team === 'A' ? 0 : 2) + (side === 'left' ? 0 : 1);
    const parts = { skin: [1, 3, 0, 4][i], hairStyle: [1, 4, 6, 2][i], hairColor: [0, 1, 3, 2][i], shirtStyle: 2, shirtColor: team === 'A' ? 3 : 6, pantsColor: 1, build: [1, 2, 0, 1][i], accessory: 0 };
    return { ...generic(team, side), sprite: composeSprite(parts), spriteBack: composeSprite(parts, 'back') };
  };
  return { 'A-left': make('A', 'left'), 'A-right': make('A', 'right'), 'B-left': make('B', 'left'), 'B-right': make('B', 'right') };
}

function generic(team: TeamId, side: Side): Participant {
  return {
    name: `${team}-${side === 'left' ? 'L' : 'R'}`,
    stats: { ...NEUTRAL_STATS },
    hitStyles: [...DEFAULT_HIT_STYLES],
    serveStyles: [...DEFAULT_SERVE_STYLES],
    master: false,
    sprite: null,
    nameColor: null,
    celebration: null,
    characterId: null,
    profileId: null,
  };
}

export interface TeamInput {
  /** Held aim directions, in screen/table axes. */
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Hit key went down this frame. */
  hit: boolean;
  /** Which of the player's styles the hit uses: 0 = default, 1/2 = style keys held. */
  style: 0 | 1 | 2;
  /**
   * Same-team play: which teammate's human produced this input. A hit from
   * the teammate whose turn it is not is ignored (either may hit a save).
   * Undefined = one human controls the whole team.
   */
  side?: Side;
  /** Direction pressed this frame, for menus / cup selection: -1 prev, +1 next. */
  nav: -1 | 0 | 1;
}

export const idleInput = (): TeamInput => ({ up: false, down: false, left: false, right: false, hit: false, style: 0, nav: 0 });

/**
 * How a human's screen maps onto the table, so aim keys move the crosshair
 * the way they look: world-space (x, y) directions for screen-up and screen-right.
 */
export interface ControlFrame {
  up: [number, number];
  right: [number, number];
}

/** Classic top-down view: screen-up is -y, screen-right is +x. */
export const TOP_DOWN_FRAME: ControlFrame = { up: [0, -1], right: [1, 0] };

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
  /** Tosses so far (lets controllers tell one serve attempt from the next). */
  tossCount = 0;
  /** Each team's crosshair, in [-1, 1] per axis. Sticky: it stays where the player leaves it. */
  aim: Record<TeamId, Aim> = { A: { x: 0, y: 0 }, B: { x: 0, y: 0 } };
  /** Style index each team currently has selected (held style key). */
  selectedStyle: Record<TeamId, 0 | 1 | 2> = { A: 0, B: 0 };
  readonly roster: Roster;
  /** Per team: how its human's view maps aim keys to the table. */
  controlFrames: Record<TeamId, ControlFrame> = { A: TOP_DOWN_FRAME, B: TOP_DOWN_FRAME };
  /** Active sink celebrations (cosmetic), drawn by the renderer. */
  celebrations: { x: number; y: number; time: number; palette: string; seed: number }[] = [];

  private rng: () => number;
  private resumeAt: number | null = null;
  private swung: Record<TeamId, boolean> = { A: false, B: false };
  private bounced: Record<TeamId, boolean> = { A: false, B: false };
  private tossSwung = false;
  /** Power stat of whoever hit the ball in play (faster balls are harder to return). */
  private incomingPower: number | undefined;
  /** Listeners for engine calls (HUD, sound later, stats). */
  onCall: ((c: Call) => void) | null = null;

  constructor(cfg: GameConfig, rng: () => number = Math.random, roster: Roster = genericRoster()) {
    this.cfg = cfg;
    this.rng = rng;
    this.roster = roster;
    const names = Object.fromEntries(POSITIONS.map((k) => [k, roster[k].name]));
    this.match = new Match(cfg, rng, names);
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

  participant(p: PlayerId): Participant {
    return this.roster[playerKey(p) as PositionKey];
  }

  nameOf(p: PlayerId): string {
    return this.participant(p).name;
  }

  /** "Ari & Jo" (left & right) for a team. */
  teamLine(team: TeamId): string {
    return `${this.nameOf({ team, side: 'left' })} & ${this.nameOf({ team, side: 'right' })}`;
  }

  /** Effective stats for a player right now (base stats through the modifier pipeline). */
  statsOf(p: PlayerId): Stats {
    return effectiveStats(this.participant(p).stats);
  }

  /** The style `p` would use with style index `i` (falls back to the default style). */
  styleFor(p: PlayerId, kind: 'hit' | 'serve', i: number): ShotStyle {
    const list = kind === 'hit' ? this.participant(p).hitStyles : this.participant(p).serveStyles;
    return getStyle(list[Math.min(i, list.length - 1)] ?? (kind === 'hit' ? 'standardHit' : 'standardServe'));
  }

  /** Style `team`'s controlled player would hit with right now (for the HUD and crosshair). */
  currentStyle(team: TeamId): ShotStyle | null {
    const p = this.activePlayer(team);
    if (!p) return null;
    const serving = this.engine.peek().phase === 'awaitServe';
    return this.styleFor(p, serving ? 'serve' : 'hit', this.selectedStyle[team]);
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
    const p = this.activePlayer(team)!;
    const style = this.styleFor(p, tossing ? 'serve' : 'hit', this.selectedStyle[team]);
    return {
      offset: apexOffset(this.ball.vel, this.cfg.physics.gravity),
      window: timingWindow(this.cfg, style, this.swingContext(p, !tossing && st.rally!.cupAtRisk !== null)),
    };
  }

  private swingContext(p: PlayerId, save: boolean): SwingContext {
    return { stats: this.statsOf(p), save, incomingPower: this.incomingPower };
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
      const k = Game.aimOf(inputs[team]); // k.y = screen-down, k.x = screen-right
      const f = this.controlFrames[team];
      const d = { x: -k.y * f.up[0] + k.x * f.right[0], y: -k.y * f.up[1] + k.x * f.right[1] };
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
    for (const t of ['A', 'B'] as TeamId[]) this.selectedStyle[t] = inputs[t].style;

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
    for (const team of ['A', 'B'] as TeamId[]) if (inputs[team].hit) this.trySwing(team, inputs[team].style, inputs[team].side);
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

  serverName(): string {
    return this.nameOf(this.engine.peek().server);
  }

  private placeBallWithServer(): void {
    this.tossing = false;
    this.tossSwung = false;
    this.ball.hold(this.playerSpot(this.engine.peek().server));
  }

  private serveInput(inp: TeamInput, dt: number): void {
    const server = this.engine.peek().server;
    const style = this.styleFor(server, 'serve', inp.style);
    // Same-team play: only the server's human can toss and serve.
    const hit = inp.hit && (inp.side === undefined || inp.side === server.side);
    if (!this.tossing) {
      if (hit) {
        this.tossing = true;
        this.tossCount++;
        this.tossSwung = false;
        this.ball.launch(this.playerSpot(server), { x: 0, y: 0, z: this.cfg.hitting.tossSpeed });
      }
      return;
    }
    if (hit && !this.tossSwung) {
      this.tossSwung = true;
      const off = apexOffset(this.ball.vel, this.cfg.physics.gravity);
      const q = timingQuality(this.cfg, style, off, this.swingContext(server, false));
      this.feedback = { team: server.team, label: timingLabel(q, off), quality: q, time: this.time };
      if (q !== null) return this.serve(server, style, q, this.aim[server.team]);
    }
    this.ball.step(dt, []);
    // Catch the toss on the way down; no penalty for a dropped toss.
    if (this.ball.vel.z < 0 && this.ball.pos.z <= this.cfg.hitting.tossHeight) this.placeBallWithServer();
  }

  private serve(server: PlayerId, style: ShotStyle, q: number, aim: Aim): void {
    const from = { ...this.ball.pos };
    const stats = this.statsOf(server);
    const shot = computeServe(this.cfg, style, from, this.aimTarget(server.team, aim, style), q, this.rng, stats);
    this.tossing = false;
    this.resetBallTracking();
    this.incomingPower = stats.power;
    this.dispatch({ type: 'hit', player: server, peak: shot.peak, style: style.id, timing: q });
    this.ball.launch(from, shot.vel, shot.fx);
  }

  private trySwing(team: TeamId, styleIndex: number, side?: Side): void {
    if (!this.canSwing(team)) return;
    const rally = this.engine.peek().rally!;
    const saving = rally.cupAtRisk !== null;
    // Same-team play: an out-of-turn press is ignored; on a save, whoever pressed hits.
    if (side !== undefined && !saving && side !== rally.nextSide[team]) return;
    const player = side !== undefined && saving ? { team, side } : this.activePlayer(team)!;
    const style = this.styleFor(player, 'hit', styleIndex);
    this.swung[team] = true;
    const off = apexOffset(this.ball.vel, this.cfg.physics.gravity);
    const q = timingQuality(this.cfg, style, off, this.swingContext(player, saving));
    this.feedback = { team, label: timingLabel(q, off), quality: q, time: this.time };
    if (q === null) return; // whiff
    const from = { ...this.ball.pos };
    const stats = this.statsOf(player);
    const shot = computeHit(this.cfg, style, from, this.aimTarget(team, this.aim[team], style), q, this.rng, stats);
    this.resetBallTracking();
    this.incomingPower = stats.power;
    this.dispatch({ type: 'hit', player, peak: shot.peak, style: style.id, timing: q });
    this.ball.launch(from, shot.vel, shot.fx);
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
    if (c.kind === 'sink' && c.player && c.cup) {
      const who = this.participant(c.player);
      const cup = this.engine.peek().cups[c.cup.team].find((x) => x.id === c.cup!.cupId);
      if (who.celebration && cup) this.celebrations.push({ x: cup.x, y: cup.y, time: this.time, palette: who.celebration, seed: Math.floor(this.rng() * 1e6) });
    }
    this.celebrations = this.celebrations.filter((k) => this.time - k.time < 2);
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
