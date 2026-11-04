// The update number in the corner of the home screen. Version 2 started with
// the online setup screen and match stats (2.01); every update after that adds
// 0.01. To publish an update, add 1 to UPDATE (one bump per update, however
// many commits it took).
export const MAJOR = 2;
export const UPDATE = 2;

export function updateLabel(major: number = MAJOR, update: number = UPDATE): string {
  return `v${major}.${String(update).padStart(2, '0')}`;
}
