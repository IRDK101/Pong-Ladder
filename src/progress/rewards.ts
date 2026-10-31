// Cosmetic rewards unlocked by character level. Data only: add a row to add a reward.
// Colors live in the theme (nameColors, celebrations); sprite items in sprite.ts.

export type RewardKind = 'nameColor' | 'badge' | 'spriteItem' | 'celebration';

export interface Reward {
  level: number;
  kind: RewardKind;
  id: string;
  label: string;
}

export const REWARDS: Reward[] = [
  { level: 2, kind: 'nameColor', id: 'dartmouthGreen', label: 'Dartmouth Green name' },
  { level: 3, kind: 'badge', id: 'rookie', label: 'Rookie badge' },
  { level: 4, kind: 'celebration', id: 'confetti', label: 'Confetti sink celebration' },
  { level: 5, kind: 'spriteItem', id: 'greenCap', label: 'Big Green cap' },
  { level: 6, kind: 'nameColor', id: 'basementOrange', label: 'Basement Orange name' },
  { level: 7, kind: 'badge', id: 'sharpshooter', label: 'Sharpshooter badge' },
  { level: 8, kind: 'celebration', id: 'greenFlare', label: 'Green flare sink celebration' },
  { level: 9, kind: 'spriteItem', id: 'goldChain', label: 'Gold chain' },
  { level: 10, kind: 'nameColor', id: 'iceBlue', label: 'Ice Blue name' },
  { level: 12, kind: 'badge', id: 'veteran', label: 'Veteran badge' },
  { level: 14, kind: 'celebration', id: 'fireworks', label: 'Fireworks sink celebration' },
  { level: 15, kind: 'spriteItem', id: 'crown', label: 'Crown' },
  { level: 17, kind: 'nameColor', id: 'hotPink', label: 'Hot Pink name' },
  { level: 20, kind: 'nameColor', id: 'gold', label: 'Gold name' },
  { level: 20, kind: 'badge', id: 'legend', label: 'Legend badge' },
];

export const BADGE_LABELS: Record<string, string> = { rookie: 'Rookie', sharpshooter: 'Sharpshooter', veteran: 'Veteran', legend: 'Legend' };

export function unlockedAt(level: number): Reward[] {
  return REWARDS.filter((r) => r.level <= level);
}

/** Rewards gained going from one level to another. */
export function newRewards(fromLevel: number, toLevel: number): Reward[] {
  return REWARDS.filter((r) => r.level > fromLevel && r.level <= toLevel);
}

export function isUnlocked(level: number, kind: RewardKind, id: string): boolean {
  return unlockedAt(level).some((r) => r.kind === kind && r.id === id);
}
