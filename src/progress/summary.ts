// What a finished match changed: XP and levels per character, rewards
// unlocked, Elo per human, and achievements newly earned. Pure.

import type { GameConfig } from '../config';
import type { MatchRecord } from '../data/storage';
import { newlyEarned, type Achievement } from './achievements';
import { deriveCareers, emptyCareer } from './careers';
import { computeRatings } from './elo';
import { levelFor, xpFor } from './levels';
import { newRewards, type Reward } from './rewards';

export interface CharacterChange {
  characterId: string;
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  rewards: Reward[];
  achievements: Achievement[];
}

export interface ProfileChange {
  profileId: string;
  ratingBefore: number;
  ratingAfter: number;
  achievements: Achievement[];
}

export interface MatchSummary {
  characters: CharacterChange[];
  profiles: ProfileChange[];
}

/** Compare progress with and without `match` (which must be in `all`). */
export function summarizeMatch(cfg: GameConfig, all: MatchRecord[], match: MatchRecord): MatchSummary {
  const before = all.filter((m) => m.id !== match.id);
  const after = [...before, match];
  const cb = deriveCareers(before);
  const ca = deriveCareers(after);
  const rb = computeRatings(cfg, before);
  const ra = computeRatings(cfg, after);
  const start = cfg.progression.elo.start;
  const ids = (key: 'characterId' | 'profileId') => [...new Set(Object.values(match.roster).map((s) => s[key]).filter((x): x is string => !!x))];

  const characters = ids('characterId').map((id): CharacterChange => {
    const xb = xpFor(cfg, cb.characters.get(id) ?? emptyCareer());
    const xa = xpFor(cfg, ca.characters.get(id) ?? emptyCareer());
    const lb = levelFor(cfg, xb).level;
    const la = levelFor(cfg, xa).level;
    const input = (k: typeof cb) => ({ career: k.characters.get(id) ?? emptyCareer(), events: k.characterEvents.get(id) ?? [] });
    return { characterId: id, xpGained: xa - xb, levelBefore: lb, levelAfter: la, rewards: newRewards(lb, la), achievements: newlyEarned(input(cb), input(ca), 'character') };
  });
  const profiles = ids('profileId').map((id): ProfileChange => {
    const input = (k: typeof cb) => ({ career: k.profiles.get(id) ?? emptyCareer(), events: k.profileEvents.get(id) ?? [] });
    return {
      profileId: id,
      ratingBefore: rb.get(id)?.rating ?? start,
      ratingAfter: ra.get(id)?.rating ?? start,
      achievements: newlyEarned(input(cb), input(ca), 'profile'),
    };
  });
  return { characters, profiles };
}
