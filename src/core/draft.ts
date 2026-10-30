// Snake draft from the shared character pool. Pure.
// Two teams, two picks each: A B B A (or B A A B). A character can be picked once per game.

import type { TeamId } from './types';

export type FirstPick = 'coinFlip' | TeamId;

export interface Draft {
  pool: string[];
  order: TeamId[];
  picks: { team: TeamId; characterId: string }[];
}

export function snakeOrder(first: TeamId, picksPerTeam = 2): TeamId[] {
  const second: TeamId = first === 'A' ? 'B' : 'A';
  const order: TeamId[] = [];
  for (let round = 0; round < picksPerTeam; round++) order.push(...(round % 2 === 0 ? [first, second] : [second, first]));
  return order;
}

export function firstPicker(mode: FirstPick, rng: () => number): TeamId {
  if (mode !== 'coinFlip') return mode;
  return rng() < 0.5 ? 'A' : 'B';
}

export function newDraft(pool: string[], first: TeamId, picksPerTeam = 2): Draft {
  if (new Set(pool).size < picksPerTeam * 2) throw new Error(`The draft needs at least ${picksPerTeam * 2} characters.`);
  return { pool: [...new Set(pool)], order: snakeOrder(first, picksPerTeam), picks: [] };
}

export const isDone = (d: Draft) => d.picks.length >= d.order.length;

export const onTheClock = (d: Draft): TeamId | null => (isDone(d) ? null : d.order[d.picks.length]);

export const available = (d: Draft): string[] => d.pool.filter((id) => !d.picks.some((p) => p.characterId === id));

export const teamPicks = (d: Draft, team: TeamId): string[] => d.picks.filter((p) => p.team === team).map((p) => p.characterId);

/** Returns the new draft, or an error message. */
export function pick(d: Draft, team: TeamId, characterId: string): Draft | string {
  if (isDone(d)) return 'The draft is finished.';
  if (onTheClock(d) !== team) return `It is Team ${onTheClock(d)}'s pick.`;
  if (!d.pool.includes(characterId)) return 'That character is not in the pool.';
  if (!available(d).includes(characterId)) return 'That character has already been picked.';
  return { ...d, picks: [...d.picks, { team, characterId }] };
}
