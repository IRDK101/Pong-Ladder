import { describe, expect, it } from 'vitest';
import { DEFAULT_PARTS } from '../src/core/character';
import { composeSprite, PART_OPTIONS, type PartKey } from '../src/core/sprite';

describe('character options', () => {
  it('every option of every part draws, and looks different from its neighbors', () => {
    for (const k of Object.keys(PART_OPTIONS) as PartKey[]) {
      const n = PART_OPTIONS[k].length;
      const seen = new Set<string>();
      for (let i = 0; i < n; i++) {
        // Draw hair and hat options on a figure that shows them (no hat for hair, a hat for hat colors).
        const base = { ...DEFAULT_PARTS, headwear: k === 'hatColor' ? 1 : 0, facialHair: k === 'hairColor' ? 4 : 0 };
        const front = composeSprite({ ...base, [k]: i }).pixels.join();
        const back = composeSprite({ ...base, [k]: i }, 'back').pixels.join();
        seen.add(front + '|' + back);
      }
      expect(seen.size, `${k} options that look the same`).toBe(n);
    }
  });

  it('every category has plenty to choose from', () => {
    for (const k of Object.keys(PART_OPTIONS) as PartKey[]) expect(PART_OPTIONS[k].length, k).toBeGreaterThanOrEqual(8);
  });
});
