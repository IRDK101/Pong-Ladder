// Career stats, derived entirely from saved match logs (never stored).
//
// Each game's log is replayed through a fresh rules engine; every call is
// attributed to the character and the human profile in that position (via
// the match roster). New stats can be added here and apply to all past games.

import { makeConfig } from '../config';
import { RulesEngine, type Call, type CallKind, type LogEntry, type RulesEvent } from '../core/rules';
import { playerKey, type PlayerId, type TeamId } from '../core/types';
import type { MatchRecord } from '../data/storage';

export const FAULT_KINDS = ['doubleBounce', 'missedReturn', 'hitOut', 'volley', 'ownSideBounce', 'wrongTeammate', 'lowHit'] as const;
export type FaultKind = (typeof FAULT_KINDS)[number];

export const FAULT_LABELS: Record<FaultKind, string> = {
  doubleBounce: 'Double bounces',
  missedReturn: 'Missed returns',
  hitOut: 'Hits out',
  volley: 'Volleys (hit before the bounce)',
  ownSideBounce: 'Own-side bounces',
  wrongTeammate: 'Wrong-teammate hits',
  lowHit: 'Low hits',
};

export interface CareerStats {
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  /** Cups removed by your sinks. */
  cupsSunk: number;
  /** Cup damage from your hits that the defenders failed to save (full→half or half→gone). */
  cupsDowned: number;
  /** Times your hit touched an opponent cup. */
  cupHits: number;
  savesMade: number;
  savesFailed: number;
  /** Saves made while your team was down to its last cup. */
  clutchSaves: number;
  serves: number;
  goodServes: number;
  /** Serves the receiver failed to return. */
  aces: number;
  serveTableMisses: number;
  serveCupPenalties: number;
  lowHits: number;
  faults: Record<FaultKind, number>;
  /** Rally hits and serves. */
  hits: number;
  perfectHits: number;
  /** Sum of timing quality over hits (for the average). */
  timingSum: number;
  longestRally: number;
  longestSinkChain: number;
  /** Largest cup deficit overcome in a game you won. */
  biggestComeback: number;
  /** Hits and serves by style id. */
  styleUse: Record<string, number>;
}

export function emptyCareer(): CareerStats {
  return {
    matchesPlayed: 0,
    matchesWon: 0,
    matchesLost: 0,
    gamesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    cupsSunk: 0,
    cupsDowned: 0,
    cupHits: 0,
    savesMade: 0,
    savesFailed: 0,
    clutchSaves: 0,
    serves: 0,
    goodServes: 0,
    aces: 0,
    serveTableMisses: 0,
    serveCupPenalties: 0,
    lowHits: 0,
    faults: Object.fromEntries(FAULT_KINDS.map((k) => [k, 0])) as Record<FaultKind, number>,
    hits: 0,
    perfectHits: 0,
    timingSum: 0,
    longestRally: 0,
    longestSinkChain: 0,
    biggestComeback: 0,
    styleUse: {},
  };
}

/** One attributed moment, for achievements and future event-based stats. */
export interface CareerEvent {
  matchId: string;
  game: number;
  kind: CallKind | 'serve' | 'hit';
  /** Extra context: cups left for the player's team at the time, chain length, etc. */
  detail: Record<string, number | string>;
}

export interface Careers {
  characters: Map<string, CareerStats>;
  profiles: Map<string, CareerStats>;
  characterEvents: Map<string, CareerEvent[]>;
  profileEvents: Map<string, CareerEvent[]>;
}

const PERFECT = 0.85;

/** Derive career stats for every character and profile from match records (oldest first). */
export function deriveCareers(matches: MatchRecord[]): Careers {
  const out: Careers = { characters: new Map(), profiles: new Map(), characterEvents: new Map(), profileEvents: new Map() };
  const sorted = [...matches].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (const m of sorted) addMatch(out, m);
  return out;
}

function entityStats(map: Map<string, CareerStats>, id: string): CareerStats {
  let s = map.get(id);
  if (!s) map.set(id, (s = emptyCareer()));
  return s;
}

function addMatch(out: Careers, m: MatchRecord): void {
  const cfg = makeConfig({ ...m.rules });
  // Everyone a stat applies to for a position: its character and its human (either may be absent).
  const targets = (p: PlayerId | string): CareerStats[] => {
    const slot = m.roster[(typeof p === 'string' ? p : playerKey(p)) as keyof MatchRecord['roster']];
    const t: CareerStats[] = [];
    if (slot?.characterId) t.push(entityStats(out.characters, slot.characterId));
    if (slot?.profileId) t.push(entityStats(out.profiles, slot.profileId));
    return t;
  };
  const note = (p: PlayerId, ev: Omit<CareerEvent, 'matchId'>) => {
    const slot = m.roster[playerKey(p) as keyof MatchRecord['roster']];
    const push = (map: Map<string, CareerEvent[]>, id: string | null) => {
      if (!id) return;
      let list = map.get(id);
      if (!list) map.set(id, (list = []));
      list.push({ matchId: m.id, ...ev });
    };
    push(out.characterEvents, slot?.characterId ?? null);
    push(out.profileEvents, slot?.profileId ?? null);
  };
  const positions = Object.keys(m.roster);
  // A human playing both positions of a team counts once per match / game.
  const teamTargets = (team: TeamId) => [...new Set(positions.filter((k) => k.startsWith(team)).flatMap((k) => targets(k)))];
  const all = () => [...new Set(positions.flatMap((k) => targets(k)))];

  m.games.forEach((g, gi) => replayGame(cfg, g.log, gi, targets, teamTargets, all, note));

  if (m.winner) {
    for (const team of ['A', 'B'] as TeamId[])
      for (const s of teamTargets(team)) {
        s.matchesPlayed++;
        if (m.winner === team) s.matchesWon++;
        else s.matchesLost++;
      }
  }
}

function replayGame(
  cfg: ReturnType<typeof makeConfig>,
  log: LogEntry[],
  game: number,
  targets: (p: PlayerId) => CareerStats[],
  teamTargets: (t: TeamId) => CareerStats[],
  all: () => CareerStats[],
  note: (p: PlayerId, ev: Omit<CareerEvent, 'matchId'>) => void,
): void {
  const start = log.find((e) => e.kind === 'start')?.data as { firstServer: PlayerId; names?: Record<string, string> } | undefined;
  if (!start) return;
  const eng = new RulesEngine(cfg, { firstServer: start.firstServer, names: start.names });
  let attacker: PlayerId | null = null; // hitter whose ball is touching a cup
  const worstDeficit: Record<TeamId, number> = { A: 0, B: 0 };
  const bump = (p: PlayerId | undefined, f: (s: CareerStats) => void) => p && targets(p).forEach(f);

  for (const entry of log) {
    if (entry.kind !== 'input') continue;
    const ev = entry.data as RulesEvent;
    const before = eng.peek();
    const server = before.server;
    const serving = before.phase === 'awaitServe' && ev.type === 'hit';
    const res = eng.dispatch(ev);
    if (!res.accepted) continue;

    if (ev.type === 'hit') {
      bump(ev.player, (s) => {
        s.hits++;
        if (serving) s.serves++;
        if (ev.timing !== undefined) {
          s.timingSum += ev.timing;
          if (ev.timing >= PERFECT) s.perfectHits++;
        }
        if (ev.style) s.styleUse[ev.style] = (s.styleUse[ev.style] ?? 0) + 1;
      });
    }

    for (const c of res.calls) handleCall(c);

    const after = eng.peek();
    for (const t of ['A', 'B'] as TeamId[]) {
      const other: TeamId = t === 'A' ? 'B' : 'A';
      const left = (team: TeamId) => after.cups[team].filter((x) => x.state !== 'removed').length;
      worstDeficit[t] = Math.max(worstDeficit[t], left(other) - left(t));
    }

    function handleCall(c: Call): void {
      const p = c.player;
      const teamLeft = (team: TeamId) => eng.peek().cups[team].filter((x) => x.state !== 'removed').length;
      switch (c.kind) {
        case 'goodServe':
          bump(p, (s) => s.goodServes++);
          break;
        case 'tableMiss':
        case 'missPenalty':
          bump(p, (s) => s.serveTableMisses++);
          break;
        case 'serveCupPenalty':
          bump(p, (s) => s.serveCupPenalties++);
          break;
        case 'cupHit':
          attacker = p ?? null;
          bump(p, (s) => s.cupHits++);
          break;
        case 'saveMade':
          bump(p, (s) => s.savesMade++);
          if (p && teamLeft(p.team) === 1) bump(p, (s) => s.clutchSaves++);
          if (p) note(p, { game, kind: 'saveMade', detail: { cupsLeft: teamLeft(p.team) } });
          attacker = null;
          break;
        case 'saveFailed':
          bump(p, (s) => s.savesFailed++);
          if (attacker) bump(attacker, (s) => s.cupsDowned++);
          attacker = null;
          break;
        case 'sink': {
          const chain = eng.peek().sinkChain?.length ?? 1;
          bump(p, (s) => {
            s.cupsSunk++;
            s.longestSinkChain = Math.max(s.longestSinkChain, chain);
          });
          if (p) note(p, { game, kind: 'sink', detail: { chain } });
          attacker = null;
          break;
        }
        case 'gameOver': {
          const w = c.team!;
          for (const t of ['A', 'B'] as TeamId[])
            for (const s of teamTargets(t)) {
              s.gamesPlayed++;
              if (t === w) {
                s.gamesWon++;
                s.biggestComeback = Math.max(s.biggestComeback, worstDeficit[t]);
              } else s.gamesLost++;
            }
          break;
        }
      }
      if ((FAULT_KINDS as readonly string[]).includes(c.kind)) {
        bump(p, (s) => {
          s.faults[c.kind as FaultKind]++;
          if (c.kind === 'lowHit') s.lowHits++;
        });
        // A serve the receiver never got back.
        if (c.rallyHits === 1 && (c.kind === 'doubleBounce' || c.kind === 'missedReturn' || c.kind === 'wrongTeammate')) bump(server, (s) => s.aces++);
      }
      if (c.rallyHits !== undefined) for (const s of all()) s.longestRally = Math.max(s.longestRally, c.rallyHits);
      if (p && c.kind !== 'gameOver' && c.kind !== 'sink' && c.kind !== 'saveMade') note(p, { game, kind: c.kind, detail: {} });
    }
  }
}

/** Derived ratios for display. */
export function careerRates(s: CareerStats) {
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
  return {
    winPct: pct(s.matchesWon, s.matchesPlayed),
    savePct: pct(s.savesMade, s.savesMade + s.savesFailed),
    goodServePct: pct(s.goodServes, s.goodServes + s.serveTableMisses + s.serveCupPenalties),
    avgTiming: s.hits ? Math.round((s.timingSum / s.hits) * 100) : null,
    favoriteStyle: Object.entries(s.styleUse).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
  };
}
