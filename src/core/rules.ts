// Pure rules engine / state machine. No rendering, no DOM, no physics.
//
// Physics (or a test script) reports what the ball did as events; the engine
// decides what it means and emits referee calls. Decisions on ambiguous rules
// are tagged [Qn] and documented in docs/phase1-test-plan.md.

import type { GameConfig } from '../config';
import { buildFormation } from './formation';
import { diagonalOf, quarterOf, type Quarter } from './table';
import { otherTeam, playerKey, type Cup, type PlayerId, type Side, type TeamId } from './types';

// ---------------------------------------------------------------- events in

export type RulesEvent =
  | { type: 'hit'; player: PlayerId; peak: number; style?: string; timing?: number }
  | { type: 'bounce'; x: number; y: number }
  | { type: 'cupContact'; team: TeamId; cupId: string }
  | { type: 'sink'; team: TeamId; cupId: string }
  /** Ball hit the ground / left play without touching the table again. */
  | { type: 'ballOut' }
  /** Penalized team picks the cup that loses half. */
  | { type: 'chooseCup'; team: TeamId; cupId: string };

// --------------------------------------------------------------- calls out

export type CallKind =
  | 'goodServe'
  | 'reServe'
  | 'tableMiss'
  | 'missPenalty'
  | 'serveCupPenalty'
  | 'penaltyApplied'
  /** A penalty that would take a team's last (half) cup is not applied: that cup must be hit off by the opponents. */
  | 'penaltyWaived'
  | 'doubleBounce'
  | 'missedReturn'
  | 'hitOut'
  | 'volley'
  | 'ownSideBounce'
  | 'wrongTeammate'
  | 'lowHit'
  | 'cupHit'
  | 'saveMade'
  | 'saveFailed'
  | 'sink'
  | 'gameOver';

export interface Call {
  kind: CallKind;
  /** Player the call is about (fault-committer, sinker, saver...). */
  player?: PlayerId;
  team?: TeamId;
  cup?: { team: TeamId; cupId: string };
  /** Set when the call decides who serves next. */
  nextServer?: PlayerId;
  /** Human-readable referee message. */
  text: string;
  /** Hits in the rally, on rally-ending calls. */
  rallyHits?: number;
}

// ------------------------------------------------------------------- state

export type Phase = 'awaitServe' | 'serveInFlight' | 'rally' | 'penalty' | 'gameOver';

export type PenaltyReason = 'tableMisses' | 'serveHitCup';

export interface RallyState {
  /** Team whose side the ball is travelling to / is on. */
  target: TeamId;
  /** Table bounces on the target side since the ball was last hit. */
  targetBounces: number;
  lastHitter: PlayerId;
  /** Which teammate is due to hit next on each team. */
  nextSide: Record<TeamId, Side>;
  /** Legal serve has landed but the receiver has not hit yet. [Q2] */
  serveReturnPending: boolean;
  /** Ball touched a defender cup; a save is possible. */
  cupAtRisk: { team: TeamId; cupId: string } | null;
  /** Save hit made; confirmed once the return reaches the other side. [Q11] */
  pendingSave: { team: TeamId; cupId: string; saver: PlayerId } | null;
  /** Next hit is exempt from the height rule (hit right after a save). */
  exemptNext: boolean;
  hits: number;
}

export interface GameState {
  phase: Phase;
  cups: Record<TeamId, Cup[]>;
  server: PlayerId;
  /** Table misses in the current serve sequence. */
  missCount: number;
  /** Bounces on the server's own side during the current serve flight. */
  serveOwnBounces: number;
  rally: RallyState | null;
  /** A half-cup penalty: `team` loses half a cup; `chooser` picks which (the opponents after a serve hits their cup). */
  penalty: { team: TeamId; reason: PenaltyReason; chooser: TeamId } | null;
  sinkChain: { player: PlayerId; length: number } | null;
  winner: TeamId | null;
}

export interface LogEntry {
  seq: number;
  /** 'start' records the first server; 'input' an event; 'call' an engine call. */
  kind: 'start' | 'input' | 'call';
  data: unknown;
}

export interface DispatchResult {
  accepted: boolean;
  reason?: string;
  calls: Call[];
}

export const playerName = (p: PlayerId): string => `${p.team}-${p.side === 'left' ? 'L' : 'R'}`;

const samePlayer = (a: PlayerId, b: PlayerId) => a.team === b.team && a.side === b.side;
const partner = (p: PlayerId): PlayerId => ({ team: p.team, side: p.side === 'left' ? 'right' : 'left' });
const ALL_PLAYERS: PlayerId[] = [
  { team: 'A', side: 'left' },
  { team: 'A', side: 'right' },
  { team: 'B', side: 'left' },
  { team: 'B', side: 'right' },
];

export function randomPlayer(rng: () => number): PlayerId {
  return ALL_PLAYERS[Math.min(3, Math.floor(rng() * 4))];
}

/** Inclusive point-in-quarter test: lines count as in for both adjoining quarters. [Q9] */
function inQuarter(cfg: GameConfig, q: Quarter, x: number, y: number): boolean {
  const { length: L, width: W } = cfg.table;
  const xOk = q.team === 'A' ? x >= 0 && x <= L / 2 : x >= L / 2 && x <= L;
  const yOk = q.lane === 'low' ? y >= 0 && y <= W / 2 : y >= W / 2 && y <= W;
  return xOk && yOk;
}

const halfAt = (cfg: GameConfig, x: number): TeamId => (x < cfg.table.length / 2 ? 'A' : 'B');

export class RulesEngine {
  readonly cfg: GameConfig;
  private s: GameState;
  private _log: LogEntry[] = [];
  /** 1v1: the side the last serve was made from, until the next server is placed. */
  private servedFrom: Side | null = null;
  /** Display names by player key ("A-left"), for referee messages. Defaults to "A-L" etc. */
  private names: Record<string, string>;

  constructor(cfg: GameConfig, opts: { firstServer?: PlayerId; rng?: () => number; names?: Record<string, string> } = {}) {
    this.cfg = cfg;
    this.names = { ...(opts.names ?? {}) };
    const server = opts.firstServer ?? randomPlayer(opts.rng ?? Math.random);
    this.s = {
      phase: 'awaitServe',
      cups: { A: buildFormation(cfg, 'A'), B: buildFormation(cfg, 'B') },
      server,
      missCount: 0,
      serveOwnBounces: 0,
      rally: null,
      penalty: null,
      sinkChain: null,
      winner: null,
    };
    this.record('start', { firstServer: server, formation: cfg.formation, names: this.names });
  }

  name(p: PlayerId): string {
    return this.names[playerKey(p)] ?? playerName(p);
  }

  /** Rebuild an engine by replaying a recorded log. */
  static replay(cfg: GameConfig, log: LogEntry[]): RulesEngine {
    const start = log.find((e) => e.kind === 'start')!.data as { firstServer: PlayerId; names?: Record<string, string> };
    const eng = new RulesEngine(cfg, { firstServer: start.firstServer, names: start.names });
    for (const e of log) if (e.kind === 'input') eng.dispatch(e.data as RulesEvent);
    return eng;
  }

  get state(): GameState {
    return structuredClone(this.s);
  }

  /** Online play (guest): take the host's state as-is (the host's engine is the one that rules). */
  restore(state: GameState): void {
    this.s = structuredClone(state);
  }

  /** A point to roll back to (online play rewinds a moment to apply a late hit). */
  checkpoint(): { s: GameState; log: number } {
    return { s: structuredClone(this.s), log: this._log.length };
  }

  rollback(cp: { s: GameState; log: number }): void {
    this.s = structuredClone(cp.s);
    this._log.length = Math.min(this._log.length, cp.log);
  }

    /** Live, read-only view of the state (no copy). Do not mutate. */
  peek(): Readonly<GameState> {
    return this.s;
  }

  get log(): LogEntry[] {
    return this._log.slice();
  }

  /** Who should hit next during a rally, or the server when awaiting the serve. */
  expectedHitter(): PlayerId | null {
    const { phase, rally } = this.s;
    if (phase === 'awaitServe') return this.s.server;
    if ((phase === 'rally' || phase === 'serveInFlight') && rally) return { team: rally.target, side: rally.nextSide[rally.target] };
    return null;
  }

  cupsRemaining(team: TeamId): number {
    return this.s.cups[team].filter((c) => c.state !== 'removed').length;
  }

  dispatch(ev: RulesEvent): DispatchResult {
    const calls: Call[] = [];
    const reject = (reason: string): DispatchResult => ({ accepted: false, reason, calls });
    const { phase } = this.s;

    if (phase === 'gameOver') return reject('game over');
    if (phase === 'penalty' && ev.type !== 'chooseCup') return reject('waiting for penalty cup choice');
    if (phase !== 'penalty' && ev.type === 'chooseCup') return reject('no penalty pending');
    if (phase === 'penalty' && ev.type === 'chooseCup') {
      // The event names the cup's team (always the penalized team); `penalty.chooser` says who picks it.
      if (ev.team !== this.s.penalty!.team) return reject(`the penalty cup must be one of Team ${this.s.penalty!.team}'s`);
      const st = this.cupState(ev.team, ev.cupId);
      if (st === undefined || st === 'removed') return reject('cup is not on the table');
    }
    if (phase === 'awaitServe' && ev.type === 'hit' && !samePlayer(ev.player, this.s.server)) {
      return reject(`only ${this.name(this.s.server)} may serve`);
    }

    this.record('input', ev);

    switch (phase) {
      case 'penalty': {
        const choice = ev as Extract<RulesEvent, { type: 'chooseCup' }>;
        this.applyPenalty(choice.team, choice.cupId, calls);
        break;
      }
      case 'awaitServe':
        // The ball is dead until the server hits. Stray ball events are ignored.
        if (ev.type === 'hit') this.startServe();
        break;
      case 'serveInFlight':
        this.onServeFlight(ev, calls);
        break;
      case 'rally':
        this.onRally(ev, calls);
        break;
    }

    // 1v1: the lone player serves from alternating halves, swapping after every serve (re-serves included).
    if (this.cfg.teamSize === 1 && this.servedFrom && (this.s.phase === 'awaitServe' || this.s.phase === 'penalty' || this.s.phase === 'gameOver')) {
      this.s.server = { team: this.s.server.team, side: this.servedFrom === 'left' ? 'right' : 'left' };
      this.servedFrom = null;
    }
    for (const c of calls) this.record('call', c);
    return { accepted: true, calls };
  }

  // ------------------------------------------------------------- serving

  private startServe(): void {
    const server = this.s.server;
    this.servedFrom = server.side;
    const receiver = diagonalOf(server);
    this.s.phase = 'serveInFlight';
    this.s.serveOwnBounces = 0;
    this.s.rally = {
      target: receiver.team,
      targetBounces: 0,
      lastHitter: server,
      nextSide: { [server.team]: partner(server).side, [receiver.team]: receiver.side } as Record<TeamId, Side>,
      serveReturnPending: false,
      cupAtRisk: null,
      pendingSave: null,
      exemptNext: false,
      hits: 1,
    };
  }

  private onServeFlight(ev: RulesEvent, calls: Call[]): void {
    const server = this.s.server;
    const receiver = diagonalOf(server);
    switch (ev.type) {
      case 'bounce': {
        if (halfAt(this.cfg, ev.x) === server.team) {
          this.s.serveOwnBounces++;
          return;
        }
        // First touch on the opponent's half decides the serve.
        if (this.s.serveOwnBounces === 1 && inQuarter(this.cfg, quarterOf(receiver), ev.x, ev.y)) {
          this.s.phase = 'rally';
          const r = this.s.rally!;
          r.targetBounces = 1;
          r.serveReturnPending = true;
          calls.push({ kind: 'goodServe', player: server, text: `Good serve by ${this.name(server)}` });
          return;
        }
        const why =
          this.s.serveOwnBounces === 0
            ? 'no bounce on own side'
            : this.s.serveOwnBounces > 1
              ? 'bounced twice on own side'
              : 'wrong quarter';
        this.reServe(why, calls);
        return;
      }
      case 'ballOut':
        this.tableMiss(calls);
        return;
      case 'cupContact':
      case 'sink':
        if (ev.team !== server.team) this.serveCupPenalty(ev.team, ev.cupId, calls);
        return; // own cups: no effect [4.6]
      case 'hit':
        // Hit before the serve legally landed is always a volley-type fault.
        this.rallyHit(ev, calls);
        return;
    }
  }

  private reServe(why: string, calls: Call[]): void {
    const server = this.s.server;
    this.s.phase = 'awaitServe';
    this.s.rally = null;
    calls.push({ kind: 'reServe', player: server, nextServer: server, text: `Bad serve (${why}) — ${this.name(server)} re-serves` });
  }

  private tableMiss(calls: Call[]): void {
    const server = this.s.server;
    this.s.phase = 'awaitServe';
    this.s.rally = null;
    this.s.missCount++;
    const limit = this.cfg.serveTableMissLimit;
    if (this.s.missCount >= limit) {
      calls.push({
        kind: 'missPenalty',
        player: server,
        team: server.team,
        nextServer: server,
        text: `Table miss ${this.s.missCount}/${limit} by ${this.name(server)} — Team ${server.team} loses half a cup, ${this.name(server)} serves`,
      });
      this.s.missCount = 0;
      this.enterPenalty(server.team, 'tableMisses', calls);
    } else {
      calls.push({
        kind: 'tableMiss',
        player: server,
        nextServer: server,
        text: `Table miss ${this.s.missCount}/${limit} by ${this.name(server)} — ${this.name(server)} serves again`,
      });
    }
  }

  private serveCupPenalty(team: TeamId, cupId: string, calls: Call[]): void {
    const server = this.s.server;
    this.s.phase = 'awaitServe';
    this.s.rally = null;
    // Cup is untouched; miss counter is neither incremented nor reset. [Q3]
    calls.push({
      kind: 'serveCupPenalty',
      player: server,
      team: server.team,
      cup: { team, cupId },
      nextServer: server,
      text: `Serve hit a cup — no damage, Team ${server.team} loses half a cup (Team ${team} picks which), ${this.name(server)} re-serves`,
    });
    // The team whose cup was hit picks which of the server's cups loses half.
    this.enterPenalty(server.team, 'serveHitCup', calls, team);
  }

  // ----------------------------------------------------------------- rally

  private onRally(ev: RulesEvent, calls: Call[]): void {
    const r = this.s.rally!;
    switch (ev.type) {
      case 'hit':
        this.rallyHit(ev, calls);
        return;

      case 'bounce': {
        const side = halfAt(this.cfg, ev.x);
        if (side === r.target) {
          if (r.pendingSave) this.confirmSave(calls);
          r.targetBounces++;
          if (r.targetBounces >= 2) {
            const due = this.due();
            if (r.cupAtRisk) return this.saveFailed(due, 'double bounce', calls);
            return this.endRally('doubleBounce', due, due, `Double bounce on ${this.name(due)}'s side — ${this.name(due)} serves`, calls);
          }
          return;
        }
        // Bounce on the hitter's side. A ball that touched a defender cup did reach them.
        if (r.targetBounces === 0 && !r.cupAtRisk) return this.returnFault('ownSideBounce', 'bounced on own side', calls); // [Q6a]
        // Ball came back unreturned after landing on the target side.
        return this.ballEscaped(calls);
      }

      case 'ballOut':
        if (r.targetBounces === 0 && !r.cupAtRisk) return this.returnFault('hitOut', 'missed the table', calls);
        return this.ballEscaped(calls);

      case 'cupContact': {
        if (ev.team !== r.target) return; // own cups: ignored [Q6b]
        if (r.serveReturnPending) return this.serveCupPenalty(ev.team, ev.cupId, calls); // [Q2]
        if (r.pendingSave) this.confirmSave(calls);
        if (r.cupAtRisk) return; // only the first cup touched is at risk [Q12]
        if (this.cupState(ev.team, ev.cupId) === 'removed') return;
        r.cupAtRisk = { team: ev.team, cupId: ev.cupId };
        calls.push({ kind: 'cupHit', player: r.lastHitter, cup: r.cupAtRisk, text: `Cup hit by ${this.name(r.lastHitter)} — Team ${ev.team} can save` });
        return;
      }

      case 'sink': {
        if (ev.team !== r.target) {
          // Sank in own cup: the ball never reached the other side.
          return this.returnFault('hitOut', 'ball stopped in own cup', calls);
        }
        if (r.serveReturnPending) return this.serveCupPenalty(ev.team, ev.cupId, calls); // [Q2]
        if (r.pendingSave) this.confirmSave(calls);
        return this.sink(ev.team, ev.cupId, calls);
      }

      case 'chooseCup':
        return;
    }
  }

  /** The player whose turn it is to hit. */
  private due(): PlayerId {
    const r = this.s.rally!;
    return { team: r.target, side: r.nextSide[r.target] };
  }

  private rallyHit(ev: Extract<RulesEvent, { type: 'hit' }>, calls: Call[]): void {
    const r = this.s.rally!;
    const p = ev.player;
    const saving = r.cupAtRisk !== null;
    const inFlightServe = this.s.phase === 'serveInFlight';

    const volley = () => this.fault('volley', p, p, `${this.name(p)} hit before the bounce — ${this.name(p)} serves`, calls);
    // The ball is not on this player's side at all (e.g. their own team's shot).
    if (p.team !== r.target) return volley();
    // Fault precedence: wrong teammate → volley → low. [Q8]
    if (!saving && p.side !== r.nextSide[p.team]) {
      const due = this.due();
      return this.fault('wrongTeammate', p, due, `Wrong teammate: ${this.name(p)} hit, ${this.name(due)}'s turn — ${this.name(due)} serves`, calls);
    }
    if (inFlightServe || (!saving && r.targetBounces === 0)) {
      return volley();
    }
    const exempt = saving || r.exemptNext;
    if (!exempt && ev.peak < this.cfg.shoulderHeight) {
      return this.fault('lowHit', p, p, `Low hit by ${this.name(p)} — ${this.name(p)} serves`, calls);
    }

    // Legal hit.
    if (r.serveReturnPending) {
      r.serveReturnPending = false;
      this.s.missCount = 0;
    }
    r.exemptNext = false;
    if (saving) {
      r.pendingSave = { ...r.cupAtRisk!, saver: p };
      r.cupAtRisk = null;
      r.exemptNext = true;
    }
    r.nextSide[p.team] = partner(p).side;
    r.lastHitter = p;
    r.target = otherTeam(p.team);
    r.targetBounces = 0;
    r.hits++;
  }

  /** Save return reached the opponents' side: the cup is safe. */
  private confirmSave(calls: Call[]): void {
    const r = this.s.rally!;
    const ps = r.pendingSave!;
    r.pendingSave = null;
    calls.push({ kind: 'saveMade', player: ps.saver, cup: { team: ps.team, cupId: ps.cupId }, text: `Save by ${this.name(ps.saver)}!` });
  }

  /** The last hit failed to land on the other side. */
  private returnFault(kind: 'hitOut' | 'ownSideBounce', why: string, calls: Call[]): void {
    const r = this.s.rally!;
    const hitter = r.lastHitter;
    if (r.pendingSave) {
      // Save return went out: cup damaged, the would-be saver serves. [Q11]
      const ps = r.pendingSave;
      r.pendingSave = null;
      r.cupAtRisk = { team: ps.team, cupId: ps.cupId };
      return this.saveFailed(hitter, `save return ${why}`, calls);
    }
    this.fault(kind, hitter, hitter, `${this.name(hitter)}'s hit ${why} — ${this.name(hitter)} serves`, calls);
  }

  /** Ball left the target side after landing there, without being returned. */
  private ballEscaped(calls: Call[]): void {
    const r = this.s.rally!;
    const due = this.due();
    if (r.cupAtRisk) return this.saveFailed(due, 'ball not returned', calls);
    this.endRally('missedReturn', due, due, `${this.name(due)} missed the return — ${this.name(due)} serves`, calls); // [Q5]
  }

  private fault(kind: CallKind, player: PlayerId, nextServer: PlayerId, text: string, calls: Call[]): void {
    this.endRally(kind, player, nextServer, text, calls);
  }

  private saveFailed(nextServer: PlayerId, why: string, calls: Call[]): void {
    const r = this.s.rally!;
    const cup = r.cupAtRisk!;
    const before = this.cupState(cup.team, cup.cupId);
    this.damage(cup.team, cup.cupId);
    const effect = before === 'full' ? 'cup down to half' : 'cup removed';
    this.endRally('saveFailed', nextServer, nextServer, `Save failed (${why}) — ${effect}, ${this.name(nextServer)} serves`, calls, cup);
  }

  private sink(team: TeamId, cupId: string, calls: Call[]): void {
    const r = this.s.rally!;
    const sinker = r.lastHitter;
    this.setCup(team, cupId, 'removed');
    const next = diagonalOf(sinker);
    const chain = this.s.sinkChain;
    const length = chain && samePlayer(chain.player, sinker) ? chain.length + 1 : 1;
    const text = `SINK by ${this.name(sinker)}${length > 1 ? ` (x${length})` : ''} — ${this.name(next)} serves to ${this.name(sinker)}`;
    this.endRally('sink', sinker, next, text, calls, { team, cupId });
    // Kept even when the sink ends the game, so a game-winning chain is counted in full.
    this.s.sinkChain = { player: sinker, length };
  }

  private endRally(kind: CallKind, player: PlayerId, nextServer: PlayerId, text: string, calls: Call[], cup?: { team: TeamId; cupId: string }): void {
    const hits = this.s.rally?.hits ?? 0;
    calls.push({ kind, player, nextServer, text, rallyHits: hits, ...(cup ? { cup } : {}) });
    this.s.rally = null;
    this.s.sinkChain = null;
    this.s.server = nextServer;
    this.s.missCount = 0;
    this.s.phase = 'awaitServe';
    this.checkGameOver(calls);
  }

  // ------------------------------------------------------------- penalty

  private enterPenalty(team: TeamId, reason: PenaltyReason, calls: Call[], chooser: TeamId = team): void {
    // A team's last half cup can't be lost to a penalty: the opponents have to hit it (or sink it).
    const live = this.s.cups[team].filter((c) => c.state !== 'removed');
    if (live.length === 1 && live[0].state === 'half') {
      calls.push({
        kind: 'penaltyWaived',
        team,
        cup: { team, cupId: live[0].id },
        nextServer: this.s.server,
        text: `Team ${team}'s last half cup is safe from penalties — ${this.name(this.s.server)} serves`,
      });
      return;
    }
    if (this.cfg.penaltyCupSelection === 'auto') {
      this.applyPenalty(team, this.autoPenaltyCup(team), calls);
      return;
    }
    this.s.phase = 'penalty';
    this.s.penalty = { team, reason, chooser };
  }

  /** Auto mode: the front-most remaining cup (point of the pyramid first). */
  autoPenaltyCup(team: TeamId): string {
    const live = this.s.cups[team].filter((c) => c.state !== 'removed');
    return live[live.length - 1].id;
  }

  private applyPenalty(team: TeamId, cupId: string, calls: Call[]): void {
    const before = this.cupState(team, cupId);
    this.damage(team, cupId);
    this.s.penalty = null;
    this.s.phase = 'awaitServe';
    calls.push({
      kind: 'penaltyApplied',
      team,
      cup: { team, cupId },
      nextServer: this.s.server,
      text: `Team ${team} penalty: cup ${before === 'full' ? 'down to half' : 'removed'} — ${this.name(this.s.server)} serves`,
    });
    this.checkGameOver(calls);
  }

  // ---------------------------------------------------------------- cups

  private cupState(team: TeamId, cupId: string) {
    return this.s.cups[team].find((c) => c.id === cupId)?.state;
  }

  private setCup(team: TeamId, cupId: string, state: Cup['state']): void {
    const cup = this.s.cups[team].find((c) => c.id === cupId);
    if (cup) cup.state = state;
  }

  private damage(team: TeamId, cupId: string): void {
    const st = this.cupState(team, cupId);
    if (st === 'full') this.setCup(team, cupId, 'half');
    else if (st === 'half') this.setCup(team, cupId, 'removed');
  }

  private checkGameOver(calls: Call[]): void {
    for (const team of ['A', 'B'] as TeamId[]) {
      if (this.cupsRemaining(team) === 0) {
        const winner = otherTeam(team);
        this.s.phase = 'gameOver';
        this.s.winner = winner;
        this.s.rally = null;
        this.s.penalty = null;
        calls.push({ kind: 'gameOver', team: winner, text: `Team ${winner} wins!` });
        return;
      }
    }
  }

  // ----------------------------------------------------------------- log

  private record(kind: LogEntry['kind'], data: unknown): void {
    this._log.push({ seq: this._log.length, kind, data: structuredClone(data) });
  }
}
