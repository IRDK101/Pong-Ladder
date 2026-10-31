// Who drives each team: a human keyboard scheme, two humans sharing a team,
// or the CPU. Everything produces a TeamInput, the same as a keyboard does.

import type { Side, TeamId } from '../core/types';
import type { Game, TeamInput } from './game';

/**
 * The teammate whose human leads right now: the server while serving, the
 * player due to hit (or the one on the ball's side during a save), otherwise
 * whoever hits next for the team.
 */
export function leadSide(game: Game, team: TeamId): Side {
  const st = game.engine.peek();
  if (st.phase === 'awaitServe' && st.server.team === team) return st.server.side;
  const active = game.activePlayer(team);
  if (active) return active.side;
  return st.rally?.nextSide[team] ?? 'left';
}

/** Merge two humans on one team: `left` controls the left teammate, `right` the right one. */
export function coopInput(game: Game, team: TeamId, left: TeamInput, right: TeamInput): TeamInput {
  const lead = leadSide(game, team);
  const leader = lead === 'left' ? left : right;
  const other = lead === 'left' ? right : left;
  const base: TeamInput = { ...leader, hit: false, side: lead, nav: leader.nav || other.nav };
  if (leader.hit) return { ...base, hit: true };
  if (other.hit) return { ...base, hit: true, side: lead === 'left' ? 'right' : 'left', style: other.style };
  return base;
}
