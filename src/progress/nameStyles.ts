// Profile name styles: how a player's name looks on the leaderboard, their
// home screen and the online lobby. Three parts: a color, an effect and a
// flair icon. Each option unlocks at a player level (the moderator has all).
// Data only: append a row to add an option (never reorder or remove: saved
// profiles refer to options by id).

export interface NameStyle {
  color: string;
  effect: string;
  flair: string;
}

export interface ColorOption {
  id: string;
  label: string;
  level: number;
  /** One color, or two or more for a gradient. */
  colors: string[];
}
export interface EffectOption {
  id: string;
  label: string;
  level: number;
}
export interface FlairOption {
  id: string;
  label: string;
  level: number;
  icon: string;
}

export const NAME_COLORS: ColorOption[] = [
  { id: 'chalk', label: 'Chalk', level: 1, colors: ['#f2ead8'] },
  { id: 'green', label: 'Big Green', level: 1, colors: ['#2fb36b'] },
  { id: 'orange', label: 'Basement Orange', level: 2, colors: ['#ff9a3c'] },
  { id: 'ice', label: 'Ice Blue', level: 3, colors: ['#8fd8ff'] },
  { id: 'pink', label: 'Hot Pink', level: 4, colors: ['#ff6fb5'] },
  { id: 'violet', label: 'Violet', level: 5, colors: ['#b48cff'] },
  { id: 'red', label: 'Cup Red', level: 6, colors: ['#ff5a4c'] },
  { id: 'lime', label: 'Lime', level: 7, colors: ['#c6f25a'] },
  { id: 'gold', label: 'Gold', level: 8, colors: ['#ffd76a'] },
  { id: 'sunset', label: 'Sunset', level: 10, colors: ['#ff9a3c', '#ff6fb5'] },
  { id: 'aurora', label: 'Aurora', level: 12, colors: ['#8fd8ff', '#2fb36b'] },
  { id: 'ember', label: 'Ember', level: 14, colors: ['#ffd76a', '#ff5a4c'] },
  { id: 'galaxy', label: 'Galaxy', level: 16, colors: ['#6aa0ff', '#b48cff', '#ff6fb5'] },
  { id: 'rainbow', label: 'Rainbow', level: 20, colors: ['#ff5a4c', '#ffd76a', '#2fb36b', '#6aa0ff', '#b48cff'] },
];

export const NAME_EFFECTS: EffectOption[] = [
  { id: 'none', label: 'Plain', level: 1 },
  { id: 'shadow', label: 'Drop shadow', level: 1 },
  { id: 'caps', label: 'Spaced caps', level: 2 },
  { id: 'outline', label: 'Outline', level: 4 },
  { id: 'glow', label: 'Glow', level: 6 },
  { id: 'italic', label: 'Slanted', level: 8 },
  { id: 'shine', label: 'Shine (animated)', level: 11 },
  { id: 'pulse', label: 'Pulse (animated)', level: 15 },
];

export const NAME_FLAIRS: FlairOption[] = [
  { id: 'none', label: 'None', level: 1, icon: '' },
  { id: 'paddle', label: 'Paddle', level: 1, icon: '🏓' },
  { id: 'star', label: 'Star', level: 2, icon: '⭐' },
  { id: 'tree', label: 'Pine', level: 3, icon: '🌲' },
  { id: 'fire', label: 'Fire', level: 5, icon: '🔥' },
  { id: 'target', label: 'Bullseye', level: 7, icon: '🎯' },
  { id: 'bolt', label: 'Lightning', level: 9, icon: '⚡' },
  { id: 'moon', label: 'Moon', level: 10, icon: '🌙' },
  { id: 'gem', label: 'Gem', level: 13, icon: '💎' },
  { id: 'trophy', label: 'Trophy', level: 16, icon: '🏆' },
  { id: 'crown', label: 'Crown', level: 19, icon: '👑' },
];

export const DEFAULT_NAME_STYLE: NameStyle = { color: 'chalk', effect: 'none', flair: 'none' };

export type StylePart = keyof NameStyle;

export function optionsFor(part: StylePart): { id: string; label: string; level: number }[] {
  return part === 'color' ? NAME_COLORS : part === 'effect' ? NAME_EFFECTS : NAME_FLAIRS;
}

/** A style read from anywhere (a saved profile, another player's card): unknown ids fall back to the defaults. */
export function cleanNameStyle(raw: unknown): NameStyle {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<StylePart, unknown>>;
  const pick = (part: StylePart) => {
    const id = v[part];
    return typeof id === 'string' && optionsFor(part).some((o) => o.id === id) ? id : DEFAULT_NAME_STYLE[part];
  };
  return { color: pick('color'), effect: pick('effect'), flair: pick('flair') };
}

export function styleUnlocked(part: StylePart, id: string, level: number, all = false): boolean {
  const o = optionsFor(part).find((x) => x.id === id);
  return !!o && (all || o.level <= level);
}

/** Drop any part the player can't use (yet) back to the default. */
export function allowedStyle(style: NameStyle, level: number, all = false): NameStyle {
  const out = { ...style };
  for (const part of ['color', 'effect', 'flair'] as StylePart[]) if (!styleUnlocked(part, out[part], level, all)) out[part] = DEFAULT_NAME_STYLE[part];
  return out;
}

export function styleColors(style: NameStyle): string[] {
  return (NAME_COLORS.find((c) => c.id === style.color) ?? NAME_COLORS[0]).colors;
}

export function flairIcon(style: NameStyle): string {
  return NAME_FLAIRS.find((f) => f.id === style.flair)?.icon ?? '';
}

/** How many style options unlock at exactly this level (for "new" notes). */
export function stylesAtLevel(level: number): number {
  return [...NAME_COLORS, ...NAME_EFFECTS, ...NAME_FLAIRS].filter((o) => o.level === level).length;
}

export function sameStyle(a: NameStyle, b: NameStyle): boolean {
  return a.color === b.color && a.effect === b.effect && a.flair === b.flair;
}
