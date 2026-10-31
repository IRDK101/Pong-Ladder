// Elo for human players (profiles), recomputed from finished matches in order.
// One human per team. Matches with a Guest side, or the same human on both sides, are not rated.

import type { GameConfig } from '../config';
import type { TeamId } from '../core/types';
import type { MatchRecord } from '../data/storage';

export interface RatingPoint {
  matchId: string;
  at: string;
  rating: number;
  delta: number;
  opponentId: string;
  won: boolean;
}

export interface Rating {
  rating: number;
  history: RatingPoint[];
}

export function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

/** The human on a team, if exactly one profile played it. */
export function teamProfile(m: MatchRecord, team: TeamId): string | null {
  const ids = new Set([m.roster[`${team}-left`].profileId, m.roster[`${team}-right`].profileId]);
  if (ids.size !== 1) return null;
  return [...ids][0] ?? null;
}

export function computeRatings(cfg: GameConfig, matches: MatchRecord[]): Map<string, Rating> {
  const { start, k } = cfg.progression.elo;
  const ratings = new Map<string, Rating>();
  const get = (id: string) => {
    let r = ratings.get(id);
    if (!r) ratings.set(id, (r = { rating: start, history: [] }));
    return r;
  };
  const done = matches.filter((m) => m.winner && m.finishedAt).sort((a, b) => a.finishedAt!.localeCompare(b.finishedAt!));
  for (const m of done) {
    const a = teamProfile(m, 'A');
    const b = teamProfile(m, 'B');
    if (!a || !b || a === b) continue;
    const ra = get(a);
    const rb = get(b);
    const ea = expectedScore(ra.rating, rb.rating);
    const sa = m.winner === 'A' ? 1 : 0;
    const da = Math.round(k * (sa - ea));
    ra.rating += da;
    rb.rating -= da;
    ra.history.push({ matchId: m.id, at: m.finishedAt!, rating: ra.rating, delta: da, opponentId: b, won: sa === 1 });
    rb.history.push({ matchId: m.id, at: m.finishedAt!, rating: rb.rating, delta: -da, opponentId: a, won: sa === 0 });
  }
  return ratings;
}
