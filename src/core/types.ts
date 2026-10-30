// Shared core types. No DOM, no rendering.

export type TeamId = 'A' | 'B';

/** Position label within a team. Fixed for the whole game. */
export type Side = 'left' | 'right';

export interface PlayerId {
  team: TeamId;
  side: Side;
}

export type Formation = 'tree' | 'shrub';

export type CupState = 'full' | 'half' | 'removed';

export interface Cup {
  /** Stable id, unique within a team (e.g. "trunk", "r1c0"). */
  id: string;
  team: TeamId;
  /** Center position in table coordinates (meters). */
  x: number;
  y: number;
  state: CupState;
}

export const otherTeam = (t: TeamId): TeamId => (t === 'A' ? 'B' : 'A');

export const playerKey = (p: PlayerId): string => `${p.team}-${p.side}`;
