import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

/** The update number shown on the home screen: one per commit, so it moves on with every change. */
function updateCount(): number {
  try {
    return Number(execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()) || 0;
  } catch {
    return 0;
  }
}

export default defineConfig({
  define: { __UPDATE_COUNT__: JSON.stringify(updateCount()) },
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
