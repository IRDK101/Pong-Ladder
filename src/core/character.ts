// Characters (friends, created by the user) and profiles (the humans playing).
// Kept separate: a profile picks characters in the draft; logs record both.

import { STAT_KEYS, STAT_MAX, STAT_MIN, type Stats } from './stats';
import { DEFAULT_HIT_STYLES, DEFAULT_SERVE_STYLES, STYLES } from './styles';

export interface Sprite {
  w: number;
  h: number;
  /** Row-major colors: '#rrggbb', or '' for transparent. */
  pixels: string[];
}

/**
 * Indexes into the part option lists (core/sprite.ts PART_OPTIONS). The
 * first eight are the original parts; the rest arrived with the bigger
 * character system and are optional, so older saved characters still load
 * (missing parts mean option 0).
 */
export interface SpriteParts {
  skin: number;
  hairStyle: number;
  hairColor: number;
  shirtStyle: number;
  shirtColor: number;
  pantsColor: number;
  build: number;
  accessory: number;
  faceShape?: number;
  eyes?: number;
  mouth?: number;
  facialHair?: number;
  headwear?: number;
  hatColor?: number;
  pantsStyle?: number;
  shoes?: number;
}

export interface Character {
  id: string;
  name: string;
  /** Title only: badge and styled name, no gameplay effect. */
  master: boolean;
  stats: Stats;
  serveStyles: string[];
  /** 2–3 hit styles; the first is the default (plain hit key). */
  hitStyles: string[];
  sprite: {
    parts: SpriteParts;
    /** Hand-drawn or uploaded pixels; when set, they replace the parts drawing. */
    pixels: Sprite | null;
  };
  /** Leveling arrives in Phase 3 (derived from match logs); cosmetics only. */
  level: number;
  /** Equipped cosmetic rewards (reward ids), unlocked by level. */
  cosmetics: Cosmetics;
  createdAt: string;
  updatedAt: string;
}

export interface Cosmetics {
  nameColor: string | null;
  badges: string[];
  spriteItem?: string | null;
  celebration?: string | null;
}

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
}

export const MIN_HIT_STYLES = 2;
export const MAX_HIT_STYLES = 3;
export const NAME_MAX = 18;

export const DEFAULT_PARTS: Required<SpriteParts> = { skin: 1, hairStyle: 1, hairColor: 0, shirtStyle: 0, shirtColor: 0, pantsColor: 0, build: 1, accessory: 0, faceShape: 0, eyes: 0, mouth: 0, facialHair: 0, headwear: 0, hatColor: 0, pantsStyle: 0, shoes: 0 };

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function newCharacter(name = 'New character', now = new Date()): Character {
  const t = now.toISOString();
  return {
    id: newId('c'),
    name,
    master: false,
    stats: { accuracy: 5, power: 5, spin: 5, serve: 5, saves: 5 },
    serveStyles: [...DEFAULT_SERVE_STYLES],
    hitStyles: DEFAULT_HIT_STYLES.slice(0, MAX_HIT_STYLES),
    sprite: { parts: { ...DEFAULT_PARTS }, pixels: null },
    level: 1,
    cosmetics: { nameColor: null, badges: [], spriteItem: null, celebration: null },
    createdAt: t,
    updatedAt: t,
  };
}

export function newProfile(name: string, now = new Date()): Profile {
  return { id: newId('p'), name: name.trim().slice(0, NAME_MAX), createdAt: now.toISOString() };
}

/** Problems that make a character unusable, in plain words. Empty = valid. */
export function validateCharacter(c: Character): string[] {
  const errs: string[] = [];
  if (!c.name.trim()) errs.push('Give the character a name.');
  if (c.name.length > NAME_MAX) errs.push(`Names can be at most ${NAME_MAX} characters.`);
  for (const k of STAT_KEYS) {
    const v = c.stats[k];
    if (!Number.isInteger(v) || v < STAT_MIN || v > STAT_MAX) errs.push(`${k} must be a whole number from ${STAT_MIN} to ${STAT_MAX}.`);
  }
  if (c.hitStyles.length < MIN_HIT_STYLES || c.hitStyles.length > MAX_HIT_STYLES) errs.push(`Pick ${MIN_HIT_STYLES}–${MAX_HIT_STYLES} hit styles.`);
  if (new Set(c.hitStyles).size !== c.hitStyles.length) errs.push('Each hit style can be picked once.');
  if (c.serveStyles.length < 1) errs.push('Pick at least one serve style.');
  for (const id of c.hitStyles) if (STYLES[id]?.kind !== 'hit') errs.push(`Unknown hit style "${id}".`);
  for (const id of c.serveStyles) if (STYLES[id]?.kind !== 'serve') errs.push(`Unknown serve style "${id}".`);
  if (c.sprite.pixels && c.sprite.pixels.pixels.length !== c.sprite.pixels.w * c.sprite.pixels.h) errs.push('Sprite pixel data is the wrong size.');
  return errs;
}
