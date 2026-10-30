// Data-driven library of hit and serve styles. Adding a style is a data change:
// add an entry here (or import one as JSON via registerStyle) and assign its id
// to characters. The real styles come later; these are generic placeholders.

export type SpinType = 'none' | 'top' | 'back' | 'side';

export interface ShotStyle {
  id: string;
  name: string;
  kind: 'hit' | 'serve';
  /** Apex height of the shot above the table (m). Lower = flatter and faster. */
  peak: number;
  /** Default depth into the target area: 0 = nearest edge, 1 = far edge. */
  depth: number;
  /** Timing window shape: multiplier on the base window, and how fast quality falls off (1 = linear, >1 = punishing). */
  timing: { windowScale: number; falloff: number };
  /** Spin type and amount (0–1 before the Spin stat scales it). */
  spin: { type: SpinType; amount: number };
  /** Bounce behaviour multipliers on restitution and table friction. */
  bounce: { restitutionScale: number; frictionScale: number };
  /** Landing scatter multiplier (harder shots are less precise). */
  scatterScale: number;
}

const style = (s: ShotStyle) => s;

export const STYLES: Record<string, ShotStyle> = {
  standardHit: style({
    id: 'standardHit',
    name: 'Standard hit',
    kind: 'hit',
    peak: 0.95,
    depth: 0.5,
    timing: { windowScale: 1, falloff: 1 },
    spin: { type: 'none', amount: 0 },
    bounce: { restitutionScale: 1, frictionScale: 1 },
    scatterScale: 1,
  }),
  lob: style({
    id: 'lob',
    name: 'Lob',
    kind: 'hit',
    peak: 1.6,
    depth: 0.65,
    timing: { windowScale: 1.2, falloff: 0.8 },
    spin: { type: 'back', amount: 0.4 },
    bounce: { restitutionScale: 1.05, frictionScale: 0.95 },
    scatterScale: 1.15,
  }),
  flatFast: style({
    id: 'flatFast',
    name: 'Flat fast hit',
    kind: 'hit',
    peak: 0.7,
    depth: 0.6,
    timing: { windowScale: 0.8, falloff: 1.4 },
    spin: { type: 'top', amount: 0.6 },
    bounce: { restitutionScale: 0.95, frictionScale: 1 },
    scatterScale: 1.1,
  }),
  standardServe: style({
    id: 'standardServe',
    name: 'Standard serve',
    kind: 'serve',
    peak: 0.35,
    depth: 0.5,
    timing: { windowScale: 1.2, falloff: 1 },
    spin: { type: 'none', amount: 0 },
    bounce: { restitutionScale: 1, frictionScale: 1 },
    scatterScale: 1,
  }),
};

export const DEFAULT_HIT_STYLES = ['standardHit', 'lob', 'flatFast'];
export const DEFAULT_SERVE_STYLES = ['standardServe'];

export function getStyle(id: string): ShotStyle {
  const s = STYLES[id];
  if (!s) throw new Error(`unknown style ${id}`);
  return s;
}

export function stylesOfKind(kind: ShotStyle['kind']): ShotStyle[] {
  return Object.values(STYLES).filter((s) => s.kind === kind);
}

/** Add or replace a style at runtime (e.g. from an imported JSON library). */
export function registerStyle(s: ShotStyle): void {
  if (!s.id || (s.kind !== 'hit' && s.kind !== 'serve') || !(s.peak > 0)) throw new Error('invalid style');
  STYLES[s.id] = s;
}
