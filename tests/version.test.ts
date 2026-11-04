import { MAJOR, UPDATE, updateLabel } from '../src/version';

describe('update tracker', () => {
  it('reads 2.01 for this update, and each later update adds 0.01', () => {
    expect([MAJOR, UPDATE]).toEqual([2, 1]);
    expect(updateLabel()).toBe('v2.01');
    expect(updateLabel(2, 2)).toBe('v2.02');
    expect(updateLabel(2, 10)).toBe('v2.10');
  });
});
