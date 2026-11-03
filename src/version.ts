// The update number on the home screen: 1.00 plus 0.01 for every update
// (commit) to the game, filled in at build time.
declare const __UPDATE_COUNT__: number;

const count = typeof __UPDATE_COUNT__ === 'number' ? __UPDATE_COUNT__ : 0;

export function updateLabel(n: number = count): string {
  return `v${(1 + n / 100).toFixed(2)}`;
}
