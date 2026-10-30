// Data-driven library of hit and serve styles. Adding a style is a data change.
// Phase 1 ships only the generic standard hit and standard serve; the real
// styles (and lob / flat placeholders) arrive in Phase 2.

export type SpinType = 'none' | 'top' | 'back' | 'side';

export interface ShotStyle {
  id: string;
  name: string;
  kind: 'hit' | 'serve';
  /** Apex height of the shot above the table (m). */
  peak: number;
  /** Default depth into the target area: 0 = nearest edge, 1 = far edge. */
  depth: number;
  /** Timing window shape: multiplier on the base window, and how fast quality falls off (1 = linear). */
  timing: { windowScale: number; falloff: number };
  /** Spin (not simulated until Phase 2). */
  spin: { type: SpinType; amount: number };
  /** Bounce behaviour multipliers (not simulated until Phase 2). */
  bounce: { restitutionScale: number; frictionScale: number };
}

export const STYLES: Record<string, ShotStyle> = {
  standardHit: {
    id: 'standardHit',
    name: 'Standard hit',
    kind: 'hit',
    peak: 0.95,
    depth: 0.5,
    timing: { windowScale: 1, falloff: 1 },
    spin: { type: 'none', amount: 0 },
    bounce: { restitutionScale: 1, frictionScale: 1 },
  },
  standardServe: {
    id: 'standardServe',
    name: 'Standard serve',
    kind: 'serve',
    peak: 0.35,
    depth: 0.5,
    timing: { windowScale: 1.2, falloff: 1 },
    spin: { type: 'none', amount: 0 },
    bounce: { restitutionScale: 1, frictionScale: 1 },
  },
};

export function getStyle(id: string): ShotStyle {
  const s = STYLES[id];
  if (!s) throw new Error(`unknown style ${id}`);
  return s;
}
