// Match stats for the end screen, worked out from a game's rules log (so they
// stay right after an online rewind, and the host can send them to the guest).

import type { GameConfig } from '../config';
import { RulesEngine, type Call, type LogEntry, type RulesEvent } from '../core/rules';
import type { PlayerId, TeamId } from '../core/types';

export interface TeamStats {
  /** Every hit, serves included. */
  hits: number;
  /** Hits timed "Perfect". */
  perfect: number;
  /** Average timing quality of the hits (0..1). */
  timing: number;
  sinks: number;
  /** Cups hit (not sunk). */
  cupHits: number;
  saves: number;
  /** Shots that missed the table or went out. */
  misses: number;
  /** Other faults: double bounces, missed returns, low hits, volleys… */
  faults: number;
  /** Share of shots that landed on the table (0..1). */
  accuracy: number;
}

export interface GameStats {
  A: TeamStats;
  B: TeamStats;
  /** Hits in the longest rally. */
  longestRally: number;
}

const empty = (): TeamStats => ({ hits: 0, perfect: 0, timing: 0, sinks: 0, cupHits: 0, saves: 0, misses: 0, faults: 0, accuracy: 0 });

const MISS: Call['kind'][] = ['tableMiss', 'missPenalty', 'hitOut'];
const FAULT: Call['kind'][] = ['doubleBounce', 'missedReturn', 'lowHit', 'volley', 'ownSideBounce', 'wrongTeammate'];

/** Replay a game's log and count what each team did. */
export function gameStats(cfg: GameConfig, log: readonly LogEntry[]): GameStats {
  const out: GameStats = { A: empty(), B: empty(), longestRally: 0 };
  const start = log.find((e) => e.kind === 'start');
  if (!start) return out;
  const s = start.data as { firstServer: PlayerId; names?: Record<string, string> };
  const eng = new RulesEngine(cfg, { firstServer: s.firstServer, names: s.names });
  const timing: Record<TeamId, number> = { A: 0, B: 0 };
  for (const e of log) {
    if (e.kind !== 'input') continue;
    const ev = e.data as RulesEvent;
    const res = eng.dispatch(ev);
    if (ev.type === 'hit' && res.accepted !== false) {
      const t = out[ev.player.team];
      t.hits++;
      if (typeof ev.timing === 'number') {
        timing[ev.player.team] += ev.timing;
        if (ev.timing > 0.85) t.perfect++;
      }
    }
    for (const c of res.calls) {
      const team = c.player?.team ?? c.team;
      if (c.rallyHits) out.longestRally = Math.max(out.longestRally, c.rallyHits);
      if (!team) continue;
      if (c.kind === 'sink') out[team].sinks++;
      else if (c.kind === 'cupHit') out[team].cupHits++;
      else if (c.kind === 'saveMade') out[team].saves++;
      else if (MISS.includes(c.kind)) out[team].misses++;
      else if (FAULT.includes(c.kind)) out[team].faults++;
    }
  }
  for (const t of ['A', 'B'] as TeamId[]) {
    const x = out[t];
    x.timing = x.hits ? timing[t] / x.hits : 0;
    x.accuracy = x.hits ? Math.max(0, x.hits - x.misses) / x.hits : 0;
  }
  return out;
}

/** Stats over several games (a best-of-3), added up. */
export function sumStats(list: readonly GameStats[]): GameStats {
  const out: GameStats = { A: empty(), B: empty(), longestRally: 0 };
  for (const g of list) {
    out.longestRally = Math.max(out.longestRally, g.longestRally);
    for (const t of ['A', 'B'] as TeamId[]) {
      const o = out[t];
      const x = g[t];
      o.timing = (o.timing * o.hits + x.timing * x.hits) / Math.max(1, o.hits + x.hits);
      for (const k of ['hits', 'perfect', 'sinks', 'cupHits', 'saves', 'misses', 'faults'] as const) o[k] += x[k];
    }
  }
  for (const t of ['A', 'B'] as TeamId[]) out[t].accuracy = out[t].hits ? Math.max(0, out[t].hits - out[t].misses) / out[t].hits : 0;
  return out;
}

/** Check stats that came over the network (the guest gets them from the host). */
export function cleanStats(v: unknown): GameStats | null {
  const s = v as GameStats | null;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  if (!s || typeof s !== 'object' || !s.A || !s.B) return null;
  const team = (x: TeamStats): TeamStats => ({ hits: num(x.hits), perfect: num(x.perfect), timing: num(x.timing), sinks: num(x.sinks), cupHits: num(x.cupHits), saves: num(x.saves), misses: num(x.misses), faults: num(x.faults), accuracy: num(x.accuracy) });
  return { A: team(s.A), B: team(s.B), longestRally: num(s.longestRally) };
}
