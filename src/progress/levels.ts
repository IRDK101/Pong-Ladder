// Character XP and levels, derived from career stats. Levels unlock cosmetics only.

import type { GameConfig } from '../config';
import type { CareerStats } from './careers';

export function xpFor(cfg: GameConfig, s: CareerStats): number {
  const w = cfg.progression.xp;
  return (
    s.gamesPlayed * w.gamePlayed +
    s.gamesWon * w.gameWon +
    s.matchesWon * w.matchWon +
    s.cupsSunk * w.cupSunk +
    s.cupsDowned * w.cupDowned +
    s.savesMade * w.saveMade +
    s.clutchSaves * w.clutchSave +
    s.aces * w.ace +
    s.perfectHits * w.perfectHit
  );
}

/** Total XP needed to reach a level (level 1 = 0). */
export function xpToReach(cfg: GameConfig, level: number): number {
  const n = Math.max(1, Math.floor(level)) - 1;
  return (cfg.progression.levelStep * n * (n + 1)) / 2;
}

export interface LevelInfo {
  level: number;
  xp: number;
  /** XP into the current level, and the size of the current level. */
  into: number;
  span: number;
}

export function levelFor(cfg: GameConfig, xp: number): LevelInfo {
  let level = 1;
  while (xpToReach(cfg, level + 1) <= xp) level++;
  const base = xpToReach(cfg, level);
  return { level, xp, into: xp - base, span: xpToReach(cfg, level + 1) - base };
}
