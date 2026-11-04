import { MAJOR, UPDATE, updateLabel } from '../src/version';

describe('update tracker', () => {
  it('version 2 counts up by 0.01 per update (2.03 now)', () => {
    expect([MAJOR, UPDATE]).toEqual([2, 3]);
    expect(updateLabel()).toBe('v2.03');
    expect(updateLabel(2, 1)).toBe('v2.01');
    expect(updateLabel(2, 2)).toBe('v2.02');
    expect(updateLabel(2, 10)).toBe('v2.10');
  });
});
