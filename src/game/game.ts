// Game controller: ties physics, the rules engine and per-team input together.
// No DOM. Input arrives as abstract TeamInput so humans, scripted tests and
// (later) AI opponents all drive the game the same way.

import type { GameConfig } from '../config';
import { Match } from '../core/match';
import { BallPhysics, type PhysicsEvent, type Vec3 } from '../core/physics';
import type { Call, GameState, RulesEvent } from '../core/rules';
import type { Sprite } from '../core/character';
import { composeSprite } from '../core/sprite';
import { withPassiveStats } from '../core/passives';
import { effectiveStats, NEUTRAL_STATS, type Stats } from '../core/stats';
import { DEFAULT_HIT_STYLES, DEFAULT_SERVE_STYLES, getStyle, type ShotStyle } from '../core/styles';
import { diagonalOf, laneOf, quarterOf, quarterRect } from '../core/table';
import { otherTeam, playerKey, type Cup, type PlayerId, type Side, type TeamId } from '../core/types';
import { apexOffset, computeHit, computeServe, SPIN_LABELS, spinOf, timingLabel, timingQuality, timingWindow, type Aim, type AimSpec, type IncomingSpin, type SpinChoice, type SwingContext } from './shot';

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
  /** Passive ability ids the character brings (core/passives.ts). */
  passives?: string[];
}

export type PositionKey = 'A-left' | 'A-right' | 'B-left' | 'B-right';
export type Roster = Record<PositionKey, Participant>;

export const POSITIONS: PositionKey[] = ['A-left', 'A-right', 'B-left', 'B-right'];

/**
 * Generic players for a quick match: neutral stats, the placeholder styles, named by position, in team shirts.
 * 1v1: one player per team, standing in both of its positions.
 */
export function genericRoster(teamSize: 1 | 2 = 2): Roster {
  const make = (team: TeamId, side: Side): Participant => {
    const i = (team === 'A' ? 0 : 2) + (side === 'left' ? 0 : 1);
    const parts = { skin: [1, 3, 0, 4][i], hairStyle: [1, 4, 6, 2][i], hairColor: [0, 1, 3, 2][i], shirtStyle: 2, shirtColor: team === 'A' ? 3 : 6, pantsColor: 1, build: [1, 2, 0, 1][i], accessory: 0 };
    return { ...generic(team, side), sprite: composeSprite(parts), spriteBack: composeSprite(parts, 'back') };
  };
  if (teamSize === 1) {
    const a = { ...make('A', 'left'), name: 'Player A' };
    const b = { ...make('B', 'left'), name: 'Player B' };
    return { 'A-left': a, 'A-right': a, 'B-left': b, 'B-right': b };
  }
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
  /**
   * Online play: the timing quality (and seconds off the ideal moment) the
   * player saw on their own device when they pressed hit. The host uses these
   * instead of measuring again, so network delay doesn't make hits late.
   */
  /** Fine aim: the crosshair moves slowly while this is held. */
  fine?: boolean;
  q?: number | null;
  off?: number;
  /** Online play: the game time on the guest's screen when it pressed hit (the host rewinds to it). */
  at?: number;
}

/** The compact game state the host sends to the other device in online play. */
export interface NetState {
  t: number;
  st: GameState;
  ball: { p: Vec3; v: Vec3; s: BallPhysics['status']; sb: number; fx: BallPhysics['fx'] };
  aim: Record<TeamId, Aim>;
  hs: Record<TeamId, SpinChoice | null>;
  sel: Record<TeamId, 0 | 1 | 2>;
  toss: [boolean, boolean];
  sw: Record<TeamId, boolean>;
  bo: Record<TeamId, boolean>;
  fb: Feedback | null;
  msg: Message[];
  fxs: Game['cupFx'];
  cel: Game['celebrations'];
  pc: number;
  /** When each player last hit the ball (for the hit jolt). */
  hz?: Record<string, number>;
  /** The guest's last input stamp, plus how long the host held it (the guest works out the round trip). */
  echo?: number;
}

/** Everything update() changes, for rewinding a moment in online play. */
interface Snap {
  time: number;
  engine: unknown;
  cp: ReturnType<import('../core/rules').RulesEngine['checkpoint']>;
  ball: ReturnType<BallPhysics['snapshot']>;
  swung: Record<TeamId, boolean>;
  bounced: Record<TeamId, boolean>;
  tossing: boolean;
  tossSwung: boolean;
  tossCount: number;
  feedback: Feedback | null;
  messages: Message[];
  cupFx: Game['cupFx'];
  celebrations: Game['celebrations'];
  hitTimes: Record<string, number>;
  incomingSpin: IncomingSpin | null;
  incomingPower: number | undefined;
  resumeAt: number | null;
  penaltyCursor: number;
  heldSpin: Record<TeamId, SpinChoice | null>;
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
  /** Who swung (the feedback shows by them). */
  player?: PlayerId;
  label: string;
  quality: number | null;
  time: number;
}

/** Pause (sim seconds) after a sink or a failed save, so the moment reads before the next serve. */
const DELAY_AFTER_SCORE = 0.8;
/** After a fault the ball goes straight back to the server. */
const DELAY_AFTER_FAULT = 0;

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
  /** Spin each team's held direction would put on the ball right now (while its timing ring is up). */
  heldSpin: Record<TeamId, SpinChoice | null> = { A: null, B: null };
  /** Style index each team currently has selected (held style key). */
  selectedStyle: Record<TeamId, 0 | 1 | 2> = { A: 0, B: 0 };
  readonly roster: Roster;
  /** Per team: how its human's view maps aim keys to the table. */
  controlFrames: Record<TeamId, ControlFrame> = { A: TOP_DOWN_FRAME, B: TOP_DOWN_FRAME };
  /** Recent cup hits and sinks, for the renderers' effects (cosmetic). */
  cupFx: { kind: 'hit' | 'sink'; team: TeamId; cupId: string; x: number; y: number; time: number }[] = [];
  /** Active sink celebrations (cosmetic), drawn by the renderer. */
  celebrations: { x: number; y: number; time: number; palette: string; seed: number }[] = [];

  private rng: () => number;
  private resumeAt: number | null = null;
  private swung: Record<TeamId, boolean> = { A: false, B: false };
  private bounced: Record<TeamId, boolean> = { A: false, B: false };
  private tossSwung = false;
  /** Power stat of whoever hit the ball in play (faster balls are harder to return). */
  private incomingPower: number | undefined;
  /** Spin the last shot put on the ball (the receiver's return clashes with it). */
  incomingSpin: IncomingSpin | null = null;
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

  /** "Ari & Jo" (left & right) for a team; just the one name in 1v1. */
  teamLine(team: TeamId): string {
    if (this.solo) return this.nameOf({ team, side: 'left' });
    return `${this.nameOf({ team, side: 'left' })} & ${this.nameOf({ team, side: 'right' })}`;
  }

  /** Effective stats for a player right now (base stats through the modifier pipeline). */
  statsOf(p: PlayerId): Stats {
    return withPassiveStats(effectiveStats(this.participant(p).stats), this.participant(p).passives);
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

  /** 1v1: one player per team. */
  get solo(): boolean {
    return this.cfg.teamSize === 1;
  }

  /**
   * Where a player stands: behind their end of the table, in their lane.
   * 1v1: the lone player stands at the middle of their end, except when
   * serving, which they do from the half the serve comes from.
   */
  playerSpot(p: PlayerId): Vec3 {
    const { length: L, width: W } = this.cfg.table;
    const off = this.cfg.hitting.standOff;
    const st = this.engine.peek();
    const serving = st.phase === 'awaitServe' && st.server.team === p.team;
    const lane = this.solo && serving ? st.server : p;
    return {
      x: p.team === 'A' ? -off : L + off,
      y: this.solo && !serving ? W / 2 : laneOf(lane) === 'low' ? W * 0.25 : W * 0.75,
      z: this.cfg.hitting.tossHeight,
    };
  }

  /** The player to draw for each team: both in 2v2; in 1v1 one, in the position they are playing right now. */
  shownPlayers(): PlayerId[] {
    const all: PlayerId[] = [
      { team: 'A', side: 'left' },
      { team: 'A', side: 'right' },
      { team: 'B', side: 'left' },
      { team: 'B', side: 'right' },
    ];
    if (!this.solo) return all;
    const st = this.engine.peek();
    return (['A', 'B'] as TeamId[]).map((team) => (st.server.team === team ? st.server : this.activePlayer(team) ?? { team, side: st.rally?.nextSide[team] ?? 'left' }));
  }

  /** Which player on `team` the keyboard controls right now. */
  activePlayer(team: TeamId): PlayerId | null {
    const st = this.engine.peek();
    if (st.phase === 'awaitServe') return st.server.team === team ? st.server : null;
    if ((st.phase === 'rally' || st.phase === 'serveInFlight') && st.rally && st.rally.target === team) {
      if (st.rally.cupAtRisk) {
        // During a save either teammate may hit: whoever is closer to the ball.
        const l: PlayerId = { team, side: 'left' };
        const r: PlayerId = { team, side: 'right' };
        return this.distanceToBall(l) <= this.distanceToBall(r) ? l : r;
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

  /** How far (m) the crosshair can move from its default spot, along x (depth) and y. */
  aimRanges(serving: boolean): { depth: number; lateral: number } {
    const h = this.cfg.hitting;
    return serving ? { depth: h.serveAimDepth, lateral: h.serveAimLateral } : { depth: h.aimRangeDepth, lateral: h.aimRangeLateral };
  }

  /**
   * Where a shot from `team` is aimed: the style's default spot, moved by the
   * aim keys. It can go past the table edges. There is no snapping: only when
   * the crosshair sits over a live opponent cup's mouth (`cup`) does the shot
   * aim to drop in at rim height instead of landing on the table.
   */
  aimTarget(team: TeamId, aim: Aim, style: ShotStyle): { x: number; y: number; cup: Cup | null } {
    const serving = style.kind === 'serve';
    // Depth is measured from the edge nearest the hitter (the widthwise center line).
    const { x: x0, y: y0 } = this.defaultSpot(team, style);
    const range = this.aimRanges(serving);
    const x = x0 + aim.x * range.depth;
    const y = y0 + aim.y * range.lateral;
    let cup: Cup | null = null;
    if (!serving) {
      const mouth = this.cfg.cups.diameter / 2;
      for (const c of this.engine.peek().cups[otherTeam(team)])
        if (c.state !== 'removed' && Math.hypot(c.x - x, c.y - y) <= mouth) cup = c;
    }
    return { x, y, cup };
  }

  /** The crosshair setting (aim units) that points `team`'s shot at a table point (clamped to the crosshair's range). */
  aimToward(team: TeamId, point: { x: number; y: number }, style: ShotStyle): Aim {
    const def = this.defaultSpot(team, style);
    const range = this.aimRanges(style.kind === 'serve');
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    return { x: clamp((point.x - def.x) / range.depth), y: clamp((point.y - def.y) / range.lateral) };
  }

  /** The default (crosshair-centered) aim point before any cup lock. */
  defaultSpot(team: TeamId, style: ShotStyle): { x: number; y: number } {
    const serving = style.kind === 'serve';
    const rect = serving
      ? quarterRect(this.cfg, quarterOf(diagonalOf(this.engine.peek().server)))
      : quarterRect(this.cfg, { team: otherTeam(team), lane: 'low' });
    const near = team === 'A' ? rect.x0 : rect.x1;
    const far = team === 'A' ? rect.x1 : rect.x0;
    return { x: near + (far - near) * style.depth, y: serving ? (rect.y0 + rect.y1) / 2 : this.cfg.table.width / 2 };
  }

  /** Horizontal distance (m) from where a player stands to the ball. */
  distanceToBall(p: PlayerId): number {
    const spot = this.playerSpot(p);
    return Math.hypot(this.ball.pos.x - spot.x, this.ball.pos.y - spot.y);
  }

  /**
   * The spin a held direction picks at the moment of a hit, read in the
   * hitter's own view: toward the opponents = topspin, back toward yourself =
   * backspin, sideways = sidespin curving that way. Nothing held = no added spin.
   */
  spinChoice(team: TeamId, inp: TeamInput): SpinChoice | null {
    const k = Game.aimOf(inp);
    if (!k.x && !k.y) return null;
    const f = this.controlFrames[team];
    const wx = -k.y * f.up[0] + k.x * f.right[0];
    const wy = -k.y * f.up[1] + k.x * f.right[1];
    const forward = team === 'A' ? wx : -wx;
    if (Math.abs(forward) >= Math.abs(wy)) return { type: forward > 0 ? 'top' : 'back', dir: 1 };
    return { type: 'side', dir: wy > 0 ? 1 : -1 };
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
      window: timingWindow(this.cfg, style, this.swingContext(p, !tossing && st.rally!.cupAtRisk !== null, tossing)),
    };
  }

  private swingContext(p: PlayerId, save: boolean, serving = false): SwingContext {
    const ctx: SwingContext = { stats: this.statsOf(p), save, incomingPower: this.incomingPower, passives: this.participant(p).passives };
    if (!serving) {
      ctx.ballSpeed = Math.hypot(this.ball.vel.x, this.ball.vel.y);
      ctx.rallyHits = this.engine.peek().rally?.hits ?? 0;
      ctx.reach = this.distanceToBall(p);
    }
    return ctx;
  }

  /** Whether `team` should see its crosshair: it is serving, or the ball is coming to it. */
  aiming(team: TeamId): boolean {
    const st = this.engine.peek();
    if (st.phase === 'awaitServe') return st.server.team === team;
    return (st.phase === 'rally' || st.phase === 'serveInFlight') && st.rally?.target === team;
  }

  private moveAim(realDt: number, inputs: Record<TeamId, TeamInput>, only?: TeamId): void {
    const step = this.cfg.hitting.aimSpeed * realDt;
    for (const team of ['A', 'B'] as TeamId[]) {
      if (only && team !== only) continue;
      if (this.remoteAim[team] && !only) continue;
      // The crosshair moves only while this team is aiming: serving (before the toss) or with the
      // ball coming to it (before the timing rings). Any other time it stays exactly where it was,
      // so it is still there for the next serve or return. Once the rings are up it locks (direction
      // keys pick spin) for the rest of that ball, even after a whiff.
      if (!this.aiming(team)) {
        this.aimLock[team] = false;
        continue;
      }
      // Before the toss the server always aims freely (a lock from the last point never carries over).
      const st = this.engine.peek();
      if (st.phase === 'awaitServe' && !this.tossing) this.aimLock[team] = false;
      if (this.timingCue(team)) this.aimLock[team] = true;
      if (this.aimLock[team]) continue;
      const k = Game.aimOf(inputs[team]); // k.y = screen-down, k.x = screen-right
      const speed = inputs[team].fine ? step * this.cfg.hitting.fineAim : step;
      const f = this.controlFrames[team];
      const d = { x: -k.y * f.up[0] + k.x * f.right[0], y: -k.y * f.up[1] + k.x * f.right[1] };
      const a = this.aim[team];
      a.x = Math.max(-1, Math.min(1, a.x + d.x * speed));
      a.y = Math.max(-1, Math.min(1, a.y + d.y * speed));
    }
  }

  /** The crosshair is locked for the current ball (see moveAim). */
  private aimLock: Record<TeamId, boolean> = { A: false, B: false };
  aimLocked(team: TeamId): boolean {
    if (this.timingCue(team)) return true;
    const st = this.engine.peek();
    if (st.phase === 'awaitServe' && !this.tossing) return false;
    return this.aimLock[team] && this.aiming(team);
  }

  /** Game time each player last struck the ball, keyed "A-left" etc. (drives the hit jolt). */
  hitTimes: Record<string, number> = {};
  private markHit(p: PlayerId): void {
    this.hitTimes[`${p.team}-${p.side}`] = this.time;
  }

  /** Online play: set on both devices (each shows only its own crosshair). */
  online = false;
  /** Online play: teams whose crosshair is steered on another device (the host just takes the aim it's sent). */
  remoteAim: Partial<Record<TeamId, boolean>> = {};

  /** Online play (host): everything the other device needs to draw the game. */
  netState(): NetState {
    const r = (v: Vec3): Vec3 => ({ x: +v.x.toFixed(4), y: +v.y.toFixed(4), z: +v.z.toFixed(4) });
    return {
      t: +this.time.toFixed(3),
      st: this.engine.state,
      ball: { p: r(this.ball.pos), v: r(this.ball.vel), s: this.ball.status, sb: Number.isFinite(this.ball.sinceBounce) ? +this.ball.sinceBounce.toFixed(3) : -1, fx: this.ball.fx },
      aim: { A: { ...this.aim.A }, B: { ...this.aim.B } },
      hs: { ...this.heldSpin },
      sel: { ...this.selectedStyle },
      toss: [this.tossing, this.tossSwung],
      sw: { ...this.swung },
      bo: { ...this.bounced },
      fb: this.feedback,
      msg: this.messages.slice(-3),
      fxs: this.cupFx.filter((f) => this.time - f.time < 1.5).slice(-4),
      cel: this.celebrations.filter((k) => this.time - k.time < 2).slice(-2),
      pc: this.penaltyCursor,
      hz: Object.fromEntries(Object.entries(this.hitTimes).map(([k, v]) => [k, +v.toFixed(3)])),
    };
  }

  /** Online play (guest): take the host's state. `own` is this device's team: its crosshair stays local. */
  applyNet(n: NetState, own: TeamId): void {
    this.time = n.t;
    this.engine.restore(n.st);
    this.ball.pos = { ...n.ball.p };
    this.ball.vel = { ...n.ball.v };
    this.ball.status = n.ball.s;
    this.ball.sinceBounce = n.ball.sb < 0 ? Infinity : n.ball.sb;
    this.ball.fx = n.ball.fx;
    for (const t of ['A', 'B'] as TeamId[]) if (t !== own) this.aim[t] = { ...n.aim[t] };
    this.heldSpin = { ...n.hs };
    this.selectedStyle = { ...n.sel, [own]: this.selectedStyle[own] };
    [this.tossing, this.tossSwung] = n.toss;
    this.swung = { ...n.sw };
    this.bounced = { ...n.bo };
    this.feedback = n.fb;
    for (const m of n.msg) if (!this.messages.some((x) => x.time === m.time && x.text === m.text)) this.messages.push(m);
    if (this.messages.length > 50) this.messages.splice(0, this.messages.length - 50);
    for (const f of n.fxs) if (!this.cupFx.some((x) => x.time === f.time && x.cupId === f.cupId)) this.cupFx.push(f);
    for (const k of n.cel) if (!this.celebrations.some((x) => x.time === k.time)) this.celebrations.push(k);
    this.penaltyCursor = n.pc;
    if (n.hz) this.hitTimes = { ...n.hz };
  }

  /** Online play (guest): between host updates, move the ball on and steer this device's own crosshair. */
  netTick(realDt: number, own: TeamId, inp: TeamInput): void {
    const dt = realDt * this.cfg.physics.timeScale;
    this.time += dt;
    this.nudgedBack = false;
    if (this.ball.status === 'flying') this.localStep(dt);
    const k = Math.exp(-realDt * 14);
    this.drawOffset = { x: this.drawOffset.x * k, y: this.drawOffset.y * k, z: this.drawOffset.z * k };
    // Ease the lag in while the other player is about to hit, and out again otherwise (e.g. they miss).
    const ts = this.cfg.physics.timeScale;
    if (this.remoteToHit(own)) this.remoteLag = Math.min(this.lagCap, this.remoteLag + realDt * ts * 0.45);
    else this.remoteLag = Math.max(0, this.remoteLag - realDt * ts * 0.8);
    const st = this.engine.peek();
    if (st.phase !== 'penalty') this.moveAim(realDt, { A: own === 'A' ? inp : idleInput(), B: own === 'B' ? inp : idleInput() }, own);
    this.selectedStyle[own] = inp.style;
  }

  /** The timing the player sees right now, for sending with a hit in online play. */
  timingNow(team: TeamId): { q: number | null; off: number; at: number } | null {
    const cue = this.timingCue(team);
    if (!cue) return null;
    const st = this.engine.peek();
    const tossing = st.phase === 'awaitServe';
    const p = this.activePlayer(team);
    if (!p) return null;
    const style = this.styleFor(p, tossing ? 'serve' : 'hit', this.selectedStyle[team]);
    const ctx = this.swingContext(p, !tossing && st.rally?.cupAtRisk != null, tossing);
    return { q: timingQuality(this.cfg, style, cue.offset, ctx), off: cue.offset, at: +this.time.toFixed(4) };
  }

  // ------------------------------------------------------------ online: rewinding late hits

  /**
   * Host of an online match: keep the last half second of states, so a guest's
   * hit that arrives late (network delay) is applied at the moment the guest
   * pressed it, and the game replays forward from there.
   */
  rewindable = false;
  private history: Snap[] = [];
  private replaying = false;

  private snap(): Snap {
    return {
      time: this.time,
      engine: this.engine,
      cp: this.engine.checkpoint(),
      ball: this.ball.snapshot(),
      swung: { ...this.swung },
      bounced: { ...this.bounced },
      tossing: this.tossing,
      tossSwung: this.tossSwung,
      tossCount: this.tossCount,
      feedback: this.feedback,
      messages: this.messages.slice(),
      cupFx: this.cupFx.slice(),
      celebrations: this.celebrations.slice(),
      hitTimes: { ...this.hitTimes },
      incomingSpin: this.incomingSpin,
      incomingPower: this.incomingPower,
      resumeAt: this.resumeAt,
      penaltyCursor: this.penaltyCursor,
      heldSpin: { ...this.heldSpin },
    };
  }

  private restoreSnap(s: Snap): void {
    this.time = s.time;
    this.engine.rollback(s.cp);
    this.ball.restoreSnapshot(s.ball);
    this.swung = { ...s.swung };
    this.bounced = { ...s.bounced };
    this.tossing = s.tossing;
    this.tossSwung = s.tossSwung;
    this.tossCount = s.tossCount;
    this.feedback = s.feedback;
    this.messages = s.messages.slice();
    this.cupFx = s.cupFx.slice();
    this.celebrations = s.celebrations.slice();
    this.hitTimes = { ...s.hitTimes };
    this.incomingSpin = s.incomingSpin;
    this.incomingPower = s.incomingPower;
    this.resumeAt = s.resumeAt;
    this.penaltyCursor = s.penaltyCursor;
    this.heldSpin = { ...s.heldSpin };
  }

  /** Whether a timed hit by `team` would count right now (a rally return, or the swing at a toss). */
  private hitWouldCount(team: TeamId): boolean {
    const st = this.engine.peek();
    if (st.phase === 'awaitServe') return this.resumeAt === null && this.tossing && !this.tossSwung && st.server.team === team;
    return this.canSwing(team);
  }

  /** Apply a late hit at the time it was pressed, then replay up to now. False if it can't be placed. */
  private rewindHit(team: TeamId, inp: TeamInput): boolean {
    const at = inp.at!;
    const eng = this.engine;
    if (eng.peek().phase === 'gameOver') return false;
    const hist = this.history.filter((h) => h.engine === eng);
    let i = -1;
    for (let k = 0; k < hist.length; k++) if (hist[k].time <= at + 1e-6) i = k;
    if (i < 0) return false;
    const target = this.time;
    const present = this.snap();
    this.replaying = true;
    try {
      for (let k = i; k < hist.length; k++) {
        this.restoreSnap(hist[k]);
        if (!this.hitWouldCount(team)) continue;
        const press: TeamInput = { ...inp, at: undefined };
        // Replay that frame exactly as it ran (same length), with the press in it.
        const frame = (k + 1 < hist.length ? hist[k + 1].time : target) - hist[k].time;
        this.update(frame / this.cfg.physics.timeScale, { A: team === 'A' ? press : idleInput(), B: team === 'B' ? press : idleInput() });
        for (let guard = 0; this.time < target - 1e-6 && guard < 400; guard++) {
          const step = Math.min(1 / 240, target - this.time);
          this.update(step / this.cfg.physics.timeScale, { A: idleInput(), B: idleInput() });
        }
        this.time = target;
        this.history = hist.slice(0, k);
        return true;
      }
      this.restoreSnap(present);
      return false;
    } finally {
      this.replaying = false;
    }
  }

  // ------------------------------------------------------------ online: the guest's view

  /** Guest: how far the drawn ball is from the simulated one; it eases to zero so corrections never jump. */
  drawOffset: Vec3 = { x: 0, y: 0, z: 0 };

  /**
   * Guest: how far behind (game seconds) the drawn ball runs while the other
   * player is about to hit it. Their hit reaches this device a little late, so
   * the ball eases back near their paddle instead of flying past it, and then
   * leaves from the paddle when the hit arrives.
   */
  remoteLag = 0;

  /** Where to draw the ball (smoothed on the guest's screen). */
  ballShown(): Vec3 {
    const o = this.drawOffset;
    const l = this.remoteLag;
    const v = this.ball.vel;
    if (l > 0 && this.ball.status === 'flying') {
      const g = this.cfg.physics.gravity;
      return { x: this.ball.pos.x + o.x - v.x * l, y: this.ball.pos.y + o.y - v.y * l, z: this.ball.pos.z + o.z - v.z * l - 0.5 * g * l * l };
    }
    return { x: this.ball.pos.x + o.x, y: this.ball.pos.y + o.y, z: this.ball.pos.z + o.z };
  }

  /** Guest: the network delay to hide (game seconds), set from the link's estimate with each update. */
  private lagCap = 0;

  /** Guest: true while the other team is due to hit the ball (it has bounced their side, or they're tossing to serve). */
  private remoteToHit(own: TeamId): boolean {
    if (this.ball.status !== 'flying') return false;
    const opp: TeamId = own === 'A' ? 'B' : 'A';
    const st = this.engine.peek();
    if (st.phase === 'awaitServe') return st.server.team === opp && this.tossing && !this.tossSwung;
    if (st.phase !== 'rally' && st.phase !== 'serveInFlight') return false;
    return !!st.rally && st.rally.target === opp && (this.bounced[opp] || st.rally.cupAtRisk !== null);
  }

  /**
   * Guest: take the host's state, then move it on by `ahead` seconds of real
   * time (the network delay), so the ball is where the host has it now and not
   * where it was. The drawn ball glides from where it was to the new spot.
   */
  applyNetAhead(n: NetState, own: TeamId, ahead: number): void {
    // After a hit shown here at once (predictSwing), host updates sent before the host had the
    // hit would put the ball back: skip them until the host's state includes the hit.
    const hz = JSON.stringify(n.hz ?? {});
    const predicting = this.predicted !== null;
    // Only for about a round trip, though: if the host turned the hit down, show what it has.
    if (this.predicted && hz === this.predicted.base && this.time < this.predicted.until) return;
    this.predicted = null;
    const before = this.ballShown();
    const wasFlying = this.ball.status === 'flying';
    const wasHeld = this.ball.status === 'held';
    const hitsBefore = JSON.stringify(this.hitTimes);
    const localTime = this.time;
    const localBounced = { ...this.bounced };
    const localSwung = { ...this.swung };
    const synced = this.clockSynced;
    this.applyNet(n, own);
    this.lastNetHz = hz;
    const ts = this.cfg.physics.timeScale;
    // The guest's clock runs on its own and is only nudged toward the host's (its update time plus
    // the network delay), so it never jumps back and the timing rings don't stutter.
    const target = n.t + Math.max(0, Math.min(0.35, ahead)) * ts;
    const diff = target - localTime;
    // Slowing the clock is limited to one small step per frame (several updates can land in one frame).
    const back = this.nudgedBack ? 0 : -0.004;
    const now = !synced || Math.abs(diff) > 0.4 ? target : localTime + Math.max(back, Math.min(0.02, diff * 0.2));
    if (now < localTime) this.nudgedBack = true;
    this.clockSynced = true;
    // Move the host's ball on to that moment (an update from further ahead is used as it is).
    const lead = Math.max(0, now - n.t);
    this.time = n.t;
    if (this.ball.status === 'flying') for (let t = 0; t < lead - 1e-6; t += 1 / 240) this.localStep(Math.min(1 / 240, lead - t));
    this.time = Math.max(now, n.t);
    const sameFlight = wasFlying && this.ball.status === 'flying' && (predicting || hitsBefore === JSON.stringify(this.hitTimes));
    if (sameFlight) {
      // Within one flight, an update sent before the bounce (or before this device's own swing)
      // must not take them back: that's what made hit windows shut and reopen.
      for (const t of ['A', 'B'] as TeamId[]) {
        this.bounced[t] = this.bounced[t] || localBounced[t];
        if (t === own) this.swung[t] = this.swung[t] || localSwung[t];
      }
    }
    const p = this.ball.pos;
    const d = { x: before.x - p.x, y: before.y - p.y, z: before.z - p.z };
    // The drawn ball glides over the difference: within a flight, and also onto a new flight the
    // other player's hit started (the news arrives a little late) instead of jumping there.
    // Within a flight the drawn ball keeps its lag; onto a new flight (or the start of a toss) it
    // glides from wherever it was drawn, lag included.
    const lagNow = sameFlight ? this.remoteLag : 0;
    if (!sameFlight) this.remoteLag = 0;
    const lv = this.ball.vel;
    const g = this.cfg.physics.gravity;
    if (lagNow > 0) {
      d.x += lv.x * lagNow;
      d.y += lv.y * lagNow;
      d.z += lv.z * lagNow + 0.5 * g * lagNow * lagNow;
    }
    const gap = Math.hypot(d.x, d.y, d.z);
    const glide = this.ball.status === 'flying' && (wasFlying || wasHeld) && gap < 2.6;
    this.drawOffset = glide ? d : { x: 0, y: 0, z: 0 };
    this.lagCap = Math.max(0, Math.min(0.2, ahead)) * ts;
  }

  /** Guest: the clock has been set from the host once (after that it's only nudged). */
  private clockSynced = false;
  /** Guest: the clock was slowed this frame already. */
  private nudgedBack = false;

  /** Guest: move the ball on here, noting bounces (so this device's hit window opens on time). */
  private localStep(dt: number): void {
    for (const e of this.ball.step(dt, this.cups)) if (e.type === 'bounce') this.bounced[e.x < this.cfg.table.length / 2 ? 'A' : 'B'] = true;
  }

  /** Guest: the host's hit times in the last state taken, and a hit shown here ahead of the host. */
  private lastNetHz = '{}';
  private predicted: { base: string; until: number } | null = null;

  /**
   * Guest: show this device's own hit straight away (the ball leaves the paddle
   * on the press) instead of after a round trip. The host's result replaces it
   * when it arrives; the drawn ball glides over to it.
   */
  predictSwing(team: TeamId, inp: TeamInput): void {
    if (!this.hitWouldCount(team) || inp.q === null || inp.q === undefined) return;
    const n = this.messages.length;
    const st = this.engine.peek();
    if (st.phase === 'awaitServe') this.serveInput({ ...inp, hit: true }, 0);
    else this.trySwing(team, inp.style, undefined, { ...inp, hit: true });
    // The host sends the real calls; drop the ones made here.
    this.messages.length = Math.min(this.messages.length, n);
    // Wait about a round trip (twice the one-way delay) plus a margin for the host's answer.
    this.predicted = { base: this.lastNetHz, until: this.time + 2 * this.lagCap + 0.25 * this.cfg.physics.timeScale };
  }

  update(realDt: number, inputs: Record<TeamId, TeamInput>): void {
    if (this.rewindable && !this.replaying) {
      for (const t of ['A', 'B'] as TeamId[]) {
        const inp = inputs[t];
        if (inp.hit && inp.at !== undefined && inp.q !== undefined && this.time - inp.at > 0.004 && this.rewindHit(t, inp)) inputs = { ...inputs, [t]: { ...inp, hit: false } };
      }
      this.history.push(this.snap());
      while (this.history.length && this.history[0].time < this.time - 0.6) this.history.shift();
    }
    const dt = realDt * this.cfg.physics.timeScale;
    this.time += dt;
    const st = this.engine.peek();
    if (st.phase !== 'penalty') this.moveAim(realDt, inputs);
    for (const t of ['A', 'B'] as TeamId[]) {
      this.selectedStyle[t] = inputs[t].style;
      this.heldSpin[t] = this.timingCue(t) ? this.spinChoice(t, inputs[t]) : null;
    }

    if (st.phase === 'gameOver') {
      this.ball.step(dt, []);
      return;
    }
    if (st.phase === 'penalty') {
      this.penaltyInput(inputs[st.penalty!.chooser]);
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
    for (const team of ['A', 'B'] as TeamId[]) if (inputs[team].hit) this.trySwing(team, inputs[team].style, inputs[team].side, inputs[team]);
    if (this.rallyOver()) return; // that swing ended the rally (e.g. low hit)
    const events = this.ball.step(dt, this.liveCups());
    for (const e of events) {
      this.onPhysics(e);
      if (this.rallyOver()) break;
    }
  }

  /** How far (m) a recently hit cup is knocked off its spot right now, for the wobble. */
  cupWobble(team: TeamId, cupId: string): { dx: number; dy: number } {
    const f = this.cupFx.find((e) => e.kind === 'hit' && e.team === team && e.cupId === cupId && this.time - e.time < 0.45);
    if (!f) return { dx: 0, dy: 0 };
    const t = this.time - f.time;
    const a = 0.012 * (1 - t / 0.45) * Math.sin(t * 60);
    return { dx: a, dy: a * 0.5 };
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

  /** The ball is no longer live: the rally (or serve) has been decided. */
  private rallyOver(): boolean {
    const ph = this.engine.peek().phase;
    return ph !== 'rally' && ph !== 'serveInFlight';
  }

  /**
   * Cups the ball can touch right now. A serve passes over the server's own
   * cups: they play no part in a serve, so the ball never clips them.
   */
  private liveCups(): Cup[] {
    const st = this.engine.peek();
    if (st.phase !== 'serveInFlight') return this.cups;
    return st.cups[otherTeam(st.server.team)];
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
      const off = inp.off ?? apexOffset(this.ball.vel, this.cfg.physics.gravity);
      const ctx = this.swingContext(server, false, true);
      const q = inp.q !== undefined ? inp.q : timingQuality(this.cfg, style, off, ctx);
      const spin = this.spinChoice(server.team, inp);
      this.feedback = { team: server.team, player: server, label: withSpin(timingLabel(q, off), q, spin), quality: q, time: this.time };
      if (q !== null) return this.serve(server, style, q, this.aim[server.team], spin, off / timingWindow(this.cfg, style, ctx));
    }
    this.ball.step(dt, []);
    // Catch the toss on the way down; no penalty for a dropped toss.
    if (this.ball.vel.z < 0 && this.ball.pos.z <= this.cfg.hitting.tossHeight) this.placeBallWithServer();
  }

  private serve(server: PlayerId, style: ShotStyle, q: number, aim: Aim, spin: SpinChoice | null, lateness: number): void {
    const from = { ...this.ball.pos };
    const stats = this.statsOf(server);
    const t = this.aimTarget(server.team, aim, style);
    const spec: AimSpec = { x: t.x, y: t.y, forward: server.team === 'A' ? 1 : -1, lateness, spin };
    const shot = computeServe(this.cfg, style, from, spec, q, this.rng, stats, this.participant(server).passives);
    this.incomingSpin = spinOf(this.cfg, shot.fx);
    this.tossing = false;
    this.resetBallTracking();
    this.incomingPower = stats.power;
    // Launch first: if the engine ends the rally on the hit, the ball goes straight back to the server.
    this.ball.launch(from, shot.vel, shot.fx);
    this.markHit(server);
    this.dispatch({ type: 'hit', player: server, peak: shot.peak, style: style.id, timing: q });
  }

  private trySwing(team: TeamId, styleIndex: number, side?: Side, inp: TeamInput = idleInput()): void {
    if (!this.canSwing(team)) return;
    const rally = this.engine.peek().rally!;
    const saving = rally.cupAtRisk !== null;
    // Same-team play: an out-of-turn press is ignored; on a save, whoever pressed hits.
    if (side !== undefined && !saving && side !== rally.nextSide[team]) return;
    const player = side !== undefined && saving ? { team, side } : this.activePlayer(team)!;
    const style = this.styleFor(player, 'hit', styleIndex);
    this.swung[team] = true;
    const off = inp.off ?? apexOffset(this.ball.vel, this.cfg.physics.gravity);
    const ctx = this.swingContext(player, saving);
    const q = inp.q !== undefined ? inp.q : timingQuality(this.cfg, style, off, ctx);
    const w = timingWindow(this.cfg, style, ctx);
    const spin = this.spinChoice(team, inp);
    this.feedback = { team, player, label: withSpin(timingLabel(q, off, w <= 0), q, spin), quality: q, time: this.time };
    if (q === null) return; // whiff (or out of reach)
    const from = { ...this.ball.pos };
    const stats = this.statsOf(player);
    const t = this.aimTarget(team, this.aim[team], style);
    const spec: AimSpec = { x: t.x, y: t.y, z: t.cup ? this.cfg.physics.cupHeight : 0, forward: team === 'A' ? 1 : -1, lateness: off / w, spin, incoming: this.incomingSpin };
    const shot = computeHit(this.cfg, pacedStyle(this.cfg, style, rally.hits), from, spec, q, this.rng, stats, this.participant(player).passives);
    // The spin pair: the ball's spin, then the spin of the return ("Backspin + Topspin").
    const pair = spinPair(this.incomingSpin, spin);
    if (pair && this.feedback) this.feedback.label = `${timingLabel(q, off, w <= 0)} · ${pair}`;
    this.incomingSpin = spinOf(this.cfg, shot.fx);
    this.resetBallTracking();
    this.incomingPower = stats.power;
    // Launch first: if the engine ends the rally on the hit (a low hit), the ball goes straight back to the server.
    this.ball.launch(from, shot.vel, shot.fx);
    this.markHit(player);
    this.dispatch({ type: 'hit', player, peak: shot.peak, style: style.id, timing: q });
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
    // Cup effects: a hit (a save is on, or a serve clipped a cup) wobbles the cup; a sink splashes.
    if (c.cup && (c.kind === 'cupHit' || c.kind === 'serveCupPenalty' || c.kind === 'sink')) {
      const cup = this.engine.peek().cups[c.cup.team].find((x) => x.id === c.cup!.cupId);
      if (cup) this.cupFx.push({ kind: c.kind === 'sink' ? 'sink' : 'hit', team: cup.team, cupId: cup.id, x: cup.x, y: cup.y, time: this.time });
    }
    this.cupFx = this.cupFx.filter((f) => this.time - f.time < 1.5);
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
    const delay = c.kind === 'sink' || c.kind === 'saveFailed' ? DELAY_AFTER_SCORE : DELAY_AFTER_FAULT;
    this.resumeAt = Math.max(this.resumeAt ?? 0, this.time + delay);
    // A fault returns the ball to the server's hand at once.
    if (delay === 0 && this.resumeAt <= this.time) {
      this.resumeAt = null;
      this.placeBallWithServer();
    }
  }
}

/** "Perfect · Topspin" when a hit connects with spin. */
/** The spin on the ball coming in, by name (null when it has little). */
export function incomingName(inc: IncomingSpin | null): string | null {
  if (!inc || Math.max(Math.abs(inc.top), Math.abs(inc.side)) < 0.2) return null;
  return Math.abs(inc.top) >= Math.abs(inc.side) ? (inc.top > 0 ? 'Topspin' : 'Backspin') : 'Sidespin';
}

/** "Ball spin + return spin" for the hit callout, when the ball had spin (else null). */
export function spinPair(inc: IncomingSpin | null, ret: SpinChoice | null): string | null {
  const a = incomingName(inc);
  return a ? `${a} + ${ret ? SPIN_LABELS[ret.type] : 'No spin'}` : null;
}

function withSpin(label: string, q: number | null, spin: SpinChoice | null): string {
  return q !== null && spin ? `${label} · ${SPIN_LABELS[spin.type]}` : label;
}

/**
 * Rallies build pace: after a few hits, returns fly a little lower (and so
 * faster). A well-timed return never gets pushed under shoulder height by it.
 */
export function pacedStyle(cfg: GameConfig, style: ShotStyle, rallyHits: number): ShotStyle {
  const p = cfg.hitting.rallyPace;
  const k = Math.max(p.min, 1 - p.perHit * Math.max(0, rallyHits - p.startAfter));
  if (k >= 1) return style;
  const floor = Math.min(style.peak, cfg.shoulderHeight * 1.15);
  return { ...style, peak: Math.max(floor, style.peak * k) };
}
