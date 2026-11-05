// Pixel-art sprites built from part sets. Pure: no canvas needed.
// 16 x 24 figure (front or back view); parts index into the option lists below.

import type { Sprite, SpriteParts } from './character';

export const SPRITE_W = 16;
export const SPRITE_H = 24;

/**
 * Every part's options. New options are only ever appended, so a saved
 * character's indexes keep their meaning. Colors are swatches; the rest are
 * named choices.
 */
export const PART_OPTIONS = {
  // Body
  build: ['Slim', 'Average', 'Broad', 'Stocky', 'Heavy', 'Lanky', 'Athletic', 'Petite', 'Tall', 'Toned', 'Muscular', 'Curvy', 'Dad bod', 'Big and tall'],
  skin: ['#f6d7c3', '#e8b892', '#c98e63', '#a0673f', '#7a4a2a', '#4f2f1c', '#fbe3d3', '#ddb08c', '#b9835a', '#8d5a3b', '#5e3a24', '#3b2416', '#ffeee2', '#f1c7a4', '#d6a079', '#b07047', '#6b4026', '#2e1b10'],
  // Face
  faceShape: ['Oval', 'Round', 'Square', 'Long', 'Pointed chin', 'Wide jaw', 'Heart', 'Diamond', 'Narrow', 'Natural', 'Defined jaw', 'High cheekbones', 'Soft round', 'Long oval'],
  eyes: ['Dots', 'Big', 'Sleepy', 'Wide-set', 'Lashes', 'Squint', 'Angry', 'Wink', 'Closed', 'Tired', 'Blue', 'Green'],
  mouth: ['Neutral', 'Smile', 'Grin', 'Smirk', 'Surprised', 'Flat', 'Laugh', 'Tongue out', 'Frown', 'Gap tooth', 'Whistle'],
  facialHair: ['None', 'Stubble', 'Mustache', 'Goatee', 'Full beard', 'Chin strap', 'Soul patch', 'Handlebar', 'Mutton chops', 'Long beard', 'Pencil mustache'],
  // Hair
  hairStyle: ['Bald', 'Short', 'Long', 'Mohawk', 'Curly', 'Cap', 'Buzz', 'Side part', 'Spiky', 'Ponytail', 'Bun', 'Afro', 'Mullet', 'Bob', 'Swoop', 'Receding', 'Shaggy', 'Pigtails', 'Undercut', 'Dreads', 'Top knot', 'Flat top', 'Bowl cut', 'Braids', 'Crew cut', 'Fade', 'Textured crop', 'Quiff', 'Slicked back', 'Short curls', 'Ivy league', 'Pixie cut', 'Shoulder length', 'Wavy'],
  hairColor: ['#2b1d14', '#5a3a22', '#a5662e', '#e2c171', '#d9d9d9', '#b5332e', '#1c1c1c', '#7a2e1a', '#f3e6b8', '#8a8a8a', '#3b6fd6', '#d65fa8', '#3fae5a', '#c98a4b', '#f5f0e6', '#6a4fb0', '#ff8a3d', '#2fbcc4', '#e85a5a', '#4a3a2a'],
  headwear: ['None', 'Cap', 'Backwards cap', 'Beanie', 'Bucket hat', 'Visor', 'Bandana', 'Cowboy hat', 'Top hat', 'Headphones', 'Beret', 'Hard hat', 'Party hat'],
  hatColor: ['#00693e', '#b5332e', '#1f2a44', '#f2f2f2', '#222222', '#e8a33d', '#3a8ec9', '#6b3fa0', '#c2a878', '#e23b3b', '#f0d34a', '#2fb3a5', '#d96c8a', '#6b4a2b', '#7d8c3a'],
  // Clothes
  shirtStyle: ['Tee', 'Tank', 'Jersey', 'Hoodie', 'Polo', 'Flannel', 'Button-up', 'Big D sweater', 'Striped', 'Open jacket', 'Vest', 'Hawaiian', 'Suit and tie', 'Pinstripes', 'Turtleneck', 'Varsity jacket', 'Raglan', 'Overalls', 'Letters tee'],
  shirtColor: ['#00693e', '#f2f2f2', '#1f2a44', '#b5332e', '#e8a33d', '#6b3fa0', '#3a8ec9', '#222222', '#7d8c3a', '#d96c8a', '#6b4a2b', '#9aa3ad', '#f0d34a', '#2fb3a5', '#ff8a3d', '#8b1e3f', '#4d7f2a', '#a7d3f2', '#f5e6c8', '#3d2a6b', '#e85a5a', '#5a5a5a'],
  pantsStyle: ['Long', 'Shorts', 'Sweats', 'Rolled cuffs', 'Cargo', 'Ripped', 'Skirt', 'Track pants'],
  pantsColor: ['#2c3e66', '#3b3b3b', '#c2a878', '#5d4a36', '#7f1d1d', '#5b6b3a', '#9aa3ad', '#1c1c1c', '#5b84c4', '#e8e2d0', '#00693e', '#b5332e', '#3a8ec9', '#6b3fa0', '#d8b26a'],
  shoes: ['Black', 'White sneakers', 'Red high-tops', 'Tan boots', 'Green', 'Slides', 'Blue sneakers', 'Pink sneakers', 'Gold high-tops', 'Socks and sandals', 'Barefoot'],
  // Extras
  accessory: ['None', 'Glasses', 'Shades', 'Headband', 'Beard', 'Chain', 'Round glasses', 'Earring', 'Freckles', 'Face paint', 'Wristband', 'Watch', 'Neck tattoo', 'Eye patch', 'Bandage', 'Blush', 'Nose ring', 'Bow tie', 'Scarf', 'Lei', 'Backpack'],
} as const;

export type PartKey = keyof typeof PART_OPTIONS;

export const PART_LABELS: Record<PartKey, string> = {
  build: 'Body type',
  skin: 'Skin tone',
  faceShape: 'Face shape',
  eyes: 'Eyes',
  mouth: 'Mouth',
  facialHair: 'Facial hair',
  hairStyle: 'Hair',
  hairColor: 'Hair color',
  headwear: 'Headwear',
  hatColor: 'Hat color',
  shirtStyle: 'Top',
  shirtColor: 'Top color',
  pantsStyle: 'Bottoms',
  pantsColor: 'Bottoms color',
  shoes: 'Shoes',
  accessory: 'Extra',
};

/** The editor's sections, in order. */
export const PART_GROUPS: { title: string; keys: PartKey[] }[] = [
  { title: 'Body', keys: ['build', 'skin'] },
  { title: 'Face', keys: ['faceShape', 'eyes', 'mouth', 'facialHair'] },
  { title: 'Hair', keys: ['hairStyle', 'hairColor', 'headwear', 'hatColor'] },
  { title: 'Clothes', keys: ['shirtStyle', 'shirtColor', 'pantsStyle', 'pantsColor', 'shoes'] },
  { title: 'Extras', keys: ['accessory'] },
];

/** Part keys whose options are colors (shown as swatches). */
export const COLOR_PARTS: PartKey[] = ['skin', 'hairColor', 'hatColor', 'shirtColor', 'pantsColor'];

/** Every part filled in (missing new parts → 0) and wrapped into range. */
export function normalizeParts(p: Partial<SpriteParts>): Required<SpriteParts> {
  const out = {} as Required<SpriteParts>;
  for (const k of Object.keys(PART_OPTIONS) as PartKey[]) {
    const n = PART_OPTIONS[k].length;
    const v = Math.floor(Number(p[k] ?? 0)) || 0;
    out[k] = ((v % n) + n) % n;
  }
  return out;
}

/** A random look (for the editor's Randomize button). */
export function randomParts(rng: () => number = Math.random): Required<SpriteParts> {
  const out = {} as Required<SpriteParts>;
  for (const k of Object.keys(PART_OPTIONS) as PartKey[]) out[k] = Math.floor(rng() * PART_OPTIONS[k].length);
  // Keep the odd combinations rarer: most people get no extra, and the legacy hair-cap and beard extra are skipped.
  if (rng() < 0.55) out.accessory = 0;
  if (out.accessory === 4) out.accessory = 0;
  if (out.hairStyle === 5) out.hairStyle = 1;
  if (rng() < 0.6) out.headwear = 0;
  if (rng() < 0.5) out.facialHair = 0;
  return out;
}

const OUTLINE = '#1a1410';
const SOLE = '#d8d2c4';
const WHITE = '#f2f2f2';
const GOLD = '#e8c547';
/** Homemade wooden paddles, as in the basement: a lighter face, a darker back, a handle. */
const PADDLE_RED = '#d2ad74';
const PADDLE_BLACK = '#a9834f';
const PADDLE_WOOD = '#7a5430';
const SHOES: { top: string; sole: string }[] = [
  { top: '#1b1b1b', sole: SOLE },
  { top: '#ececec', sole: '#b9b9b9' },
  { top: '#c0392b', sole: WHITE },
  { top: '#9a6a3a', sole: '#4a3220' },
  { top: '#00693e', sole: WHITE },
  { top: '#2a2a2a', sole: '#2a2a2a' },
  { top: '#3a6fd0', sole: WHITE },
  { top: '#e06a9a', sole: WHITE },
  { top: '#d9b13a', sole: WHITE },
  { top: '#7a5430', sole: '#4a3220' },
  { top: '', sole: '' }, // barefoot: skin
];

class Canvas {
  pixels: string[] = new Array(SPRITE_W * SPRITE_H).fill('');
  set(x: number, y: number, c: string) {
    if (x >= 0 && x < SPRITE_W && y >= 0 && y < SPRITE_H) this.pixels[y * SPRITE_W + x] = c;
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: string) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c);
  }
  get(x: number, y: number) {
    return x >= 0 && x < SPRITE_W && y >= 0 && y < SPRITE_H ? this.pixels[y * SPRITE_W + x] : '';
  }
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

/** Head outline per face shape: for each row from the top, the [left, right] columns. */
function headRows(shape: string): [number, number][] {
  switch (shape) {
    case 'Round':
      return [[6, 9], [5, 10], [4, 11], [4, 11], [4, 11], [5, 10], [6, 9]];
    case 'Square':
      return [[5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10]];
    case 'Long':
      return [[6, 9], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [6, 9]];
    case 'Pointed chin':
      return [[6, 9], [5, 10], [5, 10], [5, 10], [5, 10], [6, 9], [7, 8]];
    case 'Wide jaw':
      // The oval, with the jaw widened at full size (FACE_PROFILE).
      return [[6, 9], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [6, 9]];
    case 'Heart':
      return [[5, 10], [4, 11], [5, 10], [5, 10], [6, 9], [6, 9], [7, 8]];
    case 'Diamond':
      return [[7, 8], [6, 9], [5, 10], [4, 11], [5, 10], [6, 9], [7, 8]];
    case 'Narrow':
      // Narrow at the temples and jaw, with room for the eyes.
      return [[6, 9], [6, 9], [5, 10], [5, 10], [6, 9], [6, 9], [7, 8]];
    case 'Natural':
    case 'Defined jaw':
    case 'Soft round':
    case 'High cheekbones':
      // The oval at grid size; the full-size pass gives each its own outline (FACE_PROFILE).
      return [[6, 9], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [6, 9]];
    case 'Long oval':
      return [[6, 9], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [6, 9], [6, 9]];
    default: // Oval
      return [[6, 9], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [6, 9]];
  }
}

/** Where the open eyes are on the 16×24 grid (for the catch-lights added at full size). */
interface FaceMeta {
  eyes: { x: number; y: number }[];
  /** The flat colors of the main regions, so the full-size pass can texture each one. */
  colors: { skin: string; hair: string; shirt: string; pants: string };
  front: boolean;
  /** Grid rows: the eyes, the chin, the top of the torso, the belt, the bottom of the legs. */
  rows: { eye: number; chin: number; torso: number; belt: number; legBot: number };
  /** The face shape (some get extra modelling at full size), the head's rows, and wide-set eyes. */
  face: string;
  head: [number, number][];
  headTop: number;
  wideEyes: boolean;
  /** Glasses, drawn at full size around the eyes. */
  glasses: 'square' | 'round' | null;
}

/**
 * The flat 16×24 drawing of a character from its parts (no shading or
 * outline yet), plus where its eyes are.
 */
function composeFlat(raw: SpriteParts, facing: 'front' | 'back'): { flat: Sprite; meta: FaceMeta } {
  const parts = normalizeParts(raw);
  const meta: FaceMeta = { eyes: [], colors: { skin: '', hair: '', shirt: '', pants: '' }, front: facing === 'front', rows: { eye: 0, chin: 0, torso: 0, belt: 0, legBot: 0 }, face: '', head: [], headTop: 0, wideEyes: false, glasses: null };
  const c = new Canvas();
  const P = PART_OPTIONS;
  const skin = P.skin[parts.skin];
  const hair = P.hairColor[parts.hairColor];
  const hat = P.hatColor[parts.hatColor];
  const shirt = P.shirtColor[parts.shirtColor];
  const pants = P.pantsColor[parts.pantsColor];
  const build = P.build[parts.build];
  const hairStyle = P.hairStyle[parts.hairStyle];
  const headwear = P.headwear[parts.headwear];
  const shirtStyle = P.shirtStyle[parts.shirtStyle];
  const pantsStyle = P.pantsStyle[parts.pantsStyle];
  const acc = P.accessory[parts.accessory];
  const shoe = SHOES[parts.shoes];
  const front = facing === 'front';
  meta.colors = { skin, hair, shirt, pants };

  // ---- Body type: torso half-width, how far everything drops (stocky is shorter), torso and leg rows.
  const half = { Slim: 2, Average: 3, Broad: 4, Stocky: 4, Heavy: 4, Lanky: 2, Athletic: 3, Petite: 2, Tall: 3, Toned: 3, Muscular: 4, Curvy: 3, 'Dad bod': 4, 'Big and tall': 4 }[build];
  const drop = build === 'Stocky' || build === 'Petite' ? 1 : 0;
  const tx0 = 8 - half - 1;
  const tx1 = 7 + half + 1;
  const torsoTop = 10 + drop;
  const tallBuild = build === 'Lanky' || build === 'Tall' || build === 'Big and tall';
  const belt = tallBuild ? 15 : 16;
  const legTop = belt + 1;
  const legBot = 21;

  // ---- Head (from row 2, dropped for stocky) and neck.
  const rows = headRows(P.faceShape[parts.faceShape]);
  const hy = 2 + drop;
  rows.forEach(([l, r], k) => c.rect(l, hy + k, r, hy + k, skin));
  const chin = hy + rows.length - 1;
  meta.rows = { eye: hy + 3, chin, torso: torsoTop, belt, legBot };
  meta.face = P.faceShape[parts.faceShape];
  meta.head = rows;
  meta.headTop = hy;
  const hl = Math.min(...rows.map((r) => r[0]));
  const hr = Math.max(...rows.map((r) => r[1]));
  const neckW = build === 'Heavy' || build === 'Broad' || build === 'Muscular' || build === 'Big and tall' ? [6, 9] : [7, 8];
  for (let y = chin + 1; y < torsoTop; y++) c.rect(neckW[0], y, neckW[1], y, shade(skin, 0.85));
  if (build === 'Heavy') c.rect(6, chin, 9, chin, shade(skin, 0.9)); // a softer jaw

  // ---- Torso and arms.
  c.rect(tx0, torsoTop, tx1, belt, shirt);
  if (build === 'Heavy') {
    // A rounder middle: a highlight across the belly, the belt pulled lower.
    c.rect(tx0 + 1, 14, tx1 - 1, 14, shade(shirt, 1.1));
    c.set(tx0, belt, '');
    c.set(tx1, belt, '');
  }
  const sleeveless = shirtStyle === 'Tank' || shirtStyle === 'Vest';
  const sleeve = sleeveless ? skin : shirt;
  const armTop = torsoTop;
  const armBot = tallBuild ? 15 : 15 + drop;
  c.rect(tx0 - 1, armTop, tx0 - 1, armTop + 2, sleeve);
  c.rect(tx1 + 1, armTop, tx1 + 1, armTop + 2, sleeve);
  const longSleeve = ['Hoodie', 'Flannel', 'Button-up', 'Big D sweater', 'Open jacket', 'Suit and tie', 'Turtleneck', 'Varsity jacket', 'Raglan'].includes(shirtStyle);
  c.rect(tx0 - 1, armTop + 3, tx0 - 1, armBot, longSleeve ? shade(shirt, 0.92) : skin);
  c.rect(tx1 + 1, armTop + 3, tx1 + 1, armBot, longSleeve ? shade(shirt, 0.92) : skin);
  if (longSleeve) {
    c.set(tx0 - 1, armBot, skin);
    c.set(tx1 + 1, armBot, skin);
  }
  const cx0 = 7;
  const cx1 = 8;
  // White trim reads as navy on a white top.
  const trim = shirt === WHITE ? '#1f2a44' : WHITE;
  switch (shirtStyle) {
    case 'Tank':
      c.rect(tx0, torsoTop, tx0, torsoTop + 1, skin);
      c.rect(tx1, torsoTop, tx1, torsoTop + 1, skin);
      break;
    case 'Jersey':
      c.rect(tx0 + 1, torsoTop + 2, tx1 - 1, torsoTop + 2, trim);
      if (front) c.rect(cx0, torsoTop + 3, cx1, belt - 1, trim);
      else c.rect(cx0 - 1, torsoTop + 3, cx1 + 1, torsoTop + 4, trim); // the number on the back
      break;
    case 'Hoodie':
      c.rect(tx0, torsoTop, tx1, torsoTop, shade(shirt, 0.75));
      if (front) {
        c.set(cx0, torsoTop + 2, shade(shirt, 0.6));
        c.set(cx1, torsoTop + 2, shade(shirt, 0.6));
        c.rect(cx0 - 1, belt - 2, cx1 + 1, belt - 1, shade(shirt, 0.82)); // pocket
      } else c.rect(cx0 - 1, torsoTop, cx1 + 1, torsoTop + 1, shade(shirt, 0.7)); // the hood
      break;
    case 'Polo':
      c.rect(cx0 - 1, torsoTop, cx1 + 1, torsoTop, shade(shirt, 1.2));
      if (front) c.rect(cx0, torsoTop + 1, cx0, torsoTop + 2, shade(shirt, 0.7));
      break;
    case 'Flannel': {
      const dark = shade(shirt, 0.62);
      for (let y = torsoTop; y <= belt; y++) for (let x = tx0 - 1; x <= tx1 + 1; x++) if (c.get(x, y) === shirt || c.get(x, y) === shade(shirt, 0.92)) if (x % 3 === 0 || y % 3 === 0) c.set(x, y, dark);
      break;
    }
    case 'Button-up':
      c.rect(cx0 - 1, torsoTop, cx1 + 1, torsoTop, trim);
      if (front) for (let y = torsoTop + 1; y < belt; y += 2) c.set(cx0, y, shade(shirt, 0.65));
      break;
    case 'Big D sweater':
      c.rect(tx0, belt, tx1, belt, shade(shirt, 0.8));
      if (front) {
        // A block-letter D.
        const d = shirt === WHITE ? '#00693e' : WHITE;
        c.rect(cx0 - 1, torsoTop + 1, cx0 - 1, torsoTop + 4, d);
        c.rect(cx0, torsoTop + 1, cx1, torsoTop + 1, d);
        c.rect(cx0, torsoTop + 4, cx1, torsoTop + 4, d);
        c.rect(cx1 + 1, torsoTop + 2, cx1 + 1, torsoTop + 3, d);
      }
      break;
    case 'Striped':
      for (let y = torsoTop + 1; y <= belt; y += 2) c.rect(tx0, y, tx1, y, trim);
      break;
    case 'Open jacket':
      if (front) {
        c.rect(cx0, torsoTop, cx1, belt, trim);
        c.set(cx0 - 1, torsoTop, shade(shirt, 1.25));
        c.set(cx1 + 1, torsoTop, shade(shirt, 1.25));
      }
      break;
    case 'Vest':
      if (front) {
        c.rect(cx0, torsoTop, cx1, belt, trim);
        c.set(cx0 - 1, torsoTop + 3, shade(shirt, 0.6));
      }
      break;
    case 'Hawaiian': {
      const flower = shirt === '#f0d34a' ? WHITE : '#f0d34a';
      for (let y = torsoTop; y <= belt; y++)
        for (let x = tx0 - 1; x <= tx1 + 1; x++) {
          const col = c.get(x, y);
          if ((col === shirt || col === shade(shirt, 0.92)) && (x * 2 + y) % 5 === 0) c.set(x, y, (x + y) % 2 ? flower : WHITE);
        }
      c.rect(cx0 - 1, torsoTop, cx1 + 1, torsoTop, shade(shirt, 1.2));
      break;
    }
    case 'Suit and tie':
      if (front) {
        c.rect(cx0 - 1, torsoTop, cx1 + 1, torsoTop + 3, WHITE);
        c.set(cx0 - 1, torsoTop + 3, shirt);
        c.set(cx1 + 1, torsoTop + 3, shirt);
        const tie = shirt === '#b5332e' ? '#1f2a44' : '#b5332e';
        c.rect(cx0, torsoTop, cx1, torsoTop, shade(tie, 0.8));
        c.rect(cx0, torsoTop + 1, cx1, torsoTop + 4, tie);
        c.set(cx0 - 2, torsoTop + 4, shade(shirt, 0.7));
      } else c.rect(cx0 - 1, torsoTop, cx1 + 1, torsoTop, WHITE);
      break;
    case 'Pinstripes':
      for (let y = torsoTop; y <= belt; y++) for (let x = tx0; x <= tx1; x += 2) c.set(x, y, shade(shirt, 0.72));
      if (!front) c.rect(cx0 - 1, torsoTop + 2, cx1 + 1, torsoTop + 4, trim);
      else c.rect(tx0 + 1, torsoTop + 2, cx0, torsoTop + 2, trim);
      break;
    case 'Turtleneck':
      c.rect(neckW[0] - 1, torsoTop - 1, neckW[1] + 1, torsoTop, shade(shirt, 0.85));
      break;
    case 'Varsity jacket':
      if (front) {
        c.rect(cx0, torsoTop, cx1, belt, shade(shirt, 0.75));
        c.rect(tx0 + 1, torsoTop + 2, tx0 + 2, torsoTop + 3, trim); // the chest letter
      } else c.rect(cx0 - 1, torsoTop + 2, cx1 + 1, torsoTop + 4, trim);
      c.rect(tx0, belt, tx1, belt, trim);
      break;
    case 'Overalls':
      c.rect(cx0 - 1, torsoTop + 2, cx1 + 1, belt, pants);
      c.rect(cx0 - 1, torsoTop, cx0 - 1, torsoTop + 1, pants);
      c.rect(cx1 + 1, torsoTop, cx1 + 1, torsoTop + 1, pants);
      if (front) {
        c.set(cx0 - 1, torsoTop + 2, GOLD);
        c.set(cx1 + 1, torsoTop + 2, GOLD);
        c.rect(cx0, torsoTop + 4, cx1, torsoTop + 4, shade(pants, 0.75));
      }
      break;
    case 'Letters tee':
      if (front) {
        // ΖΨ across the chest.
        const t = torsoTop + 2;
        const L = trim;
        for (const [x, y] of [[5, t], [6, t], [7, t], [6, t + 1], [5, t + 2], [6, t + 2], [7, t + 2], [8, t], [10, t], [8, t + 1], [9, t + 1], [10, t + 1], [9, t + 2]] as const) c.set(x, y, L);
      }
      break;
  }
  // Raglan and varsity sleeves come in the trim color.
  if (shirtStyle === 'Raglan' || shirtStyle === 'Varsity jacket') {
    const sl = shirt === WHITE ? '#1f2a44' : shirtStyle === 'Raglan' ? shade(trim, 0.92) : trim;
    for (const x of [tx0 - 1, tx1 + 1]) c.rect(x, armTop, x, armBot - 1, sl);
    if (shirtStyle === 'Raglan') c.rect(tx0, torsoTop, tx1, torsoTop, sl);
  }

  // ---- Bottoms and shoes.
  const lx0 = build === 'Heavy' ? tx0 : tx0 + 1;
  const lx1 = build === 'Heavy' ? tx1 : tx1 - 1;
  c.rect(lx0, legTop, 7, legBot, pants);
  c.rect(8, legTop, lx1, legBot, pants);
  c.rect(tx0, belt, tx1, belt, shade(shirt, 0.72)); // belt line
  if (build === 'Athletic') {
    // Broad shoulders over a narrow waist (the shoulder ends only: a tank's straps stay as they are).
    c.set(tx0 - 1, torsoTop, sleeve);
    c.set(tx1 + 1, torsoTop, sleeve);
    for (const y of [belt - 1, belt]) {
      c.set(tx0, y, '');
      c.set(tx1, y, '');
    }
  }
  // The realistic builds change the outline (what reads at a glance), not just the inside.
  if (build === 'Toned') {
    // A V shape: rounded shoulders out past the arms, a narrower waist.
    c.set(tx0 - 2, torsoTop + 1, sleeve);
    c.set(tx1 + 2, torsoTop + 1, sleeve);
    c.set(tx0, belt, '');
    c.set(tx1, belt, '');
  } else if (build === 'Muscular') {
    // Thick arms all the way down (two pixels wide), broad shoulders, and a V taper to the waist.
    const fore = longSleeve ? shade(shirt, 0.92) : skin;
    c.rect(tx0 - 2, torsoTop + 1, tx0 - 2, torsoTop + 2, sleeve);
    c.rect(tx1 + 2, torsoTop + 1, tx1 + 2, torsoTop + 2, sleeve);
    c.rect(tx0 - 2, torsoTop + 3, tx0 - 2, armBot - 1, fore);
    c.rect(tx1 + 2, torsoTop + 3, tx1 + 2, armBot - 1, fore);
    for (const y of [belt - 2, belt - 1, belt]) c.set(tx0, y, '');
    for (const y of [belt - 2, belt - 1, belt]) c.set(tx1, y, '');
    c.set(tx0 + 1, belt, '');
    c.set(tx1 - 1, belt, '');
  } else if (build === 'Curvy') {
    // An hourglass: a fuller chest, the waist pulled in, the hips rounding out again below the belt.
    for (const y of [belt - 2, belt - 1]) {
      c.set(tx0, y, '');
      c.set(tx1, y, '');
    }
    c.rect(tx0, legTop, tx1, legTop + 1, pants);
  } else if (build === 'Dad bod') {
    // Sloping shoulders, and a round belly that hangs over the belt.
    c.set(tx0, torsoTop, '');
    c.set(tx1, torsoTop, '');
    c.set(tx0 - 1, torsoTop, '');
    c.set(tx1 + 1, torsoTop, '');
    c.rect(tx0, belt, tx1, belt, shirt);
    c.rect(tx0 + 1, legTop, tx1 - 1, legTop, shirt);
    c.rect(tx0 + 2, legTop, tx1 - 2, legTop, shade(shirt, 0.8)); // its underside
  } else if (build === 'Big and tall') {
    // Broad all the way down, long legs.
    c.rect(tx0, belt, tx1, belt, shirt);
  }
  c.set(7, legTop + 2, shade(pants, 0.7));
  c.set(8, legTop + 2, shade(pants, 0.7));
  if (pantsStyle === 'Shorts') {
    c.rect(lx0, legTop + 2, 7, legBot, skin);
    c.rect(8, legTop + 2, lx1, legBot, skin);
    c.set(7, legTop + 2, '');
    c.set(8, legTop + 2, '');
  } else if (pantsStyle === 'Sweats') {
    c.rect(lx0, legBot, 7, legBot, shade(pants, 0.7));
    c.rect(8, legBot, lx1, legBot, shade(pants, 0.7));
    c.set(lx0, legTop + 1, shade(pants, 1.25)); // a side stripe
    c.set(lx1, legTop + 1, shade(pants, 1.25));
  } else if (pantsStyle === 'Rolled cuffs') {
    c.rect(lx0, legBot, 7, legBot, shade(pants, 1.3));
    c.rect(8, legBot, lx1, legBot, shade(pants, 1.3));
  } else if (pantsStyle === 'Cargo') {
    c.set(lx0, legTop + 3, shade(pants, 0.72));
    c.set(lx1, legTop + 3, shade(pants, 0.72));
    c.set(lx0, legTop + 2, shade(pants, 0.72));
    c.set(lx1, legTop + 2, shade(pants, 0.72));
  } else if (pantsStyle === 'Ripped') {
    c.set(lx0 + 1, legTop + 2, skin);
    c.set(lx1 - 1, legTop + 3, skin);
    c.set(lx0, legBot - 1, shade(pants, 1.25));
  } else if (pantsStyle === 'Skirt') {
    c.rect(lx0 - 1, legTop, lx1 + 1, legTop + 2, pants);
    c.rect(lx0 - 1, legTop + 2, lx1 + 1, legTop + 2, shade(pants, 0.78));
    c.rect(lx0, legTop + 3, 7, legBot, skin);
    c.rect(8, legTop + 3, lx1, legBot, skin);
    c.set(7, legTop + 3, '');
    c.set(8, legTop + 3, '');
  } else if (pantsStyle === 'Track pants') {
    c.rect(lx0, legTop, lx0, legBot, WHITE);
    c.rect(lx1, legTop, lx1, legBot, WHITE);
  }
  const slides = parts.shoes === 5;
  const barefoot = parts.shoes === 10;
  const shoeTop = barefoot ? shade(skin, 0.92) : shoe.top;
  c.rect(lx0, 22, 7, 22, shoeTop);
  c.rect(8, 22, lx1, 22, shoeTop);
  if (barefoot) {
    c.set(lx0, 22, shade(skin, 0.75));
    c.set(lx1, 22, shade(skin, 0.75));
  } else if (parts.shoes === 9) {
    // Socks and sandals: white socks above brown straps.
    c.rect(lx0, 21, 7, 21, WHITE);
    c.rect(8, 21, lx1, 21, WHITE);
    c.set(lx0, 22, shoe.sole);
    c.set(lx1, 22, shoe.sole);
  } else if (slides) {
    c.set(lx0, 22, skin);
    c.set(lx1, 22, skin);
  } else {
    c.set(lx0, 22, shoe.sole);
    c.set(lx1, 22, shoe.sole);
  }
  if (parts.shoes === 2 || parts.shoes === 8) {
    // High-tops come up over the ankle.
    c.rect(lx0, 21, 7, 21, shoe.top);
    c.rect(8, 21, lx1, 21, shoe.top);
    c.set(lx0 + 1, 21, WHITE);
    c.set(lx1 - 1, 21, WHITE);
  }

  // ---- Face (front only).
  const eyeY = hy + 3;
  // Facial features stay inside the face: `inside` clips a row to its skin, one pixel in from the edge.
  const rowAt = (y: number): [number, number] | null => (y >= hy && y <= chin ? rows[y - hy] : null);
  const inner = (x: number, y: number) => {
    const r = rowAt(y);
    return !!r && x > r[0] && x < r[1];
  };
  const onFace = (x: number, y: number) => {
    const r = rowAt(y);
    return !!r && x >= r[0] && x <= r[1];
  };
  const fset = (x: number, y: number, col: string) => inner(x, y) && c.set(x, y, col);
  const frect = (x0: number, y0: number, x1: number, y1: number, col: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fset(x, y, col);
  };
  if (front) {
    const eyes = P.eyes[parts.eyes];
    // Eyes sit one pixel in from the edge of the face; wide-set ones move out half a pixel at full size.
    const ex = [6, 9];
    meta.wideEyes = eyes === 'Wide-set';
    const brow = shade(hair, 0.9);
    for (const x of ex) {
      switch (eyes) {
        case 'Big':
          // Taller eyes (no brow line).
          c.set(x, eyeY - 1, OUTLINE);
          c.set(x, eyeY, OUTLINE);
          break;
        case 'Sleepy':
          c.set(x, eyeY, OUTLINE);
          c.set(x, eyeY - 1, shade(skin, 0.75)); // heavy lids
          break;
        case 'Lashes':
          c.set(x, eyeY, OUTLINE);
          c.set(x + (x < 8 ? -1 : 1), eyeY - 1, OUTLINE);
          break;
        case 'Squint':
          c.set(x, eyeY, shade(skin, 0.55));
          break;
        case 'Angry':
          // Brows slanting down toward the nose.
          c.set(x, eyeY, OUTLINE);
          c.set(x + (x < 8 ? 1 : -1), eyeY - 1, brow);
          c.set(x - (x < 8 ? 1 : -1), eyeY - 2, brow);
          break;
        case 'Wink':
          c.set(x, eyeY, x < 8 ? OUTLINE : shade(skin, 0.5));
          break;
        case 'Closed':
          c.set(x, eyeY, shade(skin, 0.45));
          c.set(x + (x < 8 ? -1 : 1), eyeY - 1, shade(skin, 0.6));
          break;
        case 'Tired':
          c.set(x, eyeY, OUTLINE);
          c.set(x, eyeY + 1, shade(skin, 0.74));
          break;
        case 'Blue':
          c.set(x, eyeY, '#2f6fc8');
          break;
        case 'Green':
          c.set(x, eyeY, '#2f8a4a');
          break;
        default:
          c.set(x, eyeY, OUTLINE);
      }
      if (eyes !== 'Lashes' && eyes !== 'Big' && eyes !== 'Sleepy' && eyes !== 'Angry' && eyes !== 'Closed') c.set(x, eyeY - 1, brow);
      if (eyes !== 'Squint' && eyes !== 'Closed' && !(eyes === 'Wink' && x > 8)) meta.eyes.push({ x, y: eyeY });
    }
    const cheek = rowAt(eyeY + 1);
    if (cheek && c.get(cheek[1], eyeY + 1) === skin) c.set(cheek[1], eyeY + 1, shade(skin, 0.92)); // cheek shadow, on the side away from the light
    const mouth = P.mouth[parts.mouth];
    const my = eyeY + 2;
    const lip = shade(skin, 0.68);
    // The mouth is drawn through fset/frect, so it never spills past the edge of a narrow chin.
    const mc = { set: fset, rect: frect };
    switch (mouth) {
      case 'Smile':
        // Corners up, middle down.
        mc.set(6, my - 1, lip);
        mc.rect(7, my, 8, my, shade(skin, 0.6));
        mc.set(9, my - 1, lip);
        break;
      case 'Grin':
        mc.rect(6, my, 9, my, WHITE);
        mc.set(6, my, lip);
        mc.set(9, my, lip);
        break;
      case 'Smirk':
        mc.rect(7, my, 8, my, lip);
        mc.set(9, my - 1, lip);
        break;
      case 'Surprised':
        mc.set(7, my, OUTLINE);
        mc.set(8, my, OUTLINE);
        break;
      case 'Flat':
        mc.rect(6, my, 9, my, lip);
        break;
      case 'Laugh':
        mc.rect(6, my, 9, my, '#5a1e1e');
        mc.rect(7, my, 8, my, WHITE);
        if (my + 1 <= chin) mc.rect(7, my + 1, 8, my + 1, '#c84a4a');
        break;
      case 'Tongue out':
        mc.rect(7, my, 8, my, lip);
        if (my + 1 <= chin) mc.set(8, my + 1, '#e86a8a');
        break;
      case 'Frown':
        mc.rect(7, my, 8, my, shade(skin, 0.6));
        if (my + 1 <= chin) {
          mc.set(6, my + 1, lip);
          mc.set(9, my + 1, lip);
        }
        break;
      case 'Gap tooth':
        mc.rect(6, my, 9, my, WHITE);
        mc.set(6, my, lip);
        mc.set(9, my, lip);
        mc.set(8, my, shade(skin, 0.4));
        break;
      case 'Whistle':
        mc.set(8, my, OUTLINE);
        mc.set(9, my - 1, shade(skin, 0.8));
        break;
      default:
        mc.rect(7, my, 8, my, lip);
    }
    // Facial hair.
    const fh = P.facialHair[parts.facialHair];
    const beard = shade(hair, 0.95);
    switch (fh) {
      case 'Stubble':
        for (let y = my; y <= chin; y++) for (let x = hl; x <= hr; x++) if (c.get(x, y) === skin && (x + y) % 2 === 0) c.set(x, y, shade(skin, 0.78));
        break;
      case 'Mustache':
        c.rect(7, my - 1, 8, my - 1, beard);
        c.set(6, my - 1, shade(beard, 1.15)); // tapered ends
        c.set(9, my - 1, shade(beard, 1.15));
        break;
      case 'Goatee':
        c.rect(7, my - 1, 8, my - 1, beard);
        for (let y = my + 1; y <= chin; y++) for (const x of [7, 8]) if (onFace(x, y)) c.set(x, y, beard);
        break;
      case 'Full beard':
        for (let y = my - 1; y <= chin; y++) for (let x = hl; x <= hr; x++) if (c.get(x, y) === skin || c.get(x, y) === shade(skin, 0.92)) c.set(x, y, beard);
        c.rect(7, my, 8, my, lip);
        for (let y = eyeY + 1; y < my; y++) {
          c.set(rows[y - hy][0], y, beard);
          c.set(rows[y - hy][1], y, beard);
        }
        break;
      case 'Chin strap':
        for (let y = eyeY + 1; y <= chin; y++) {
          const [l, r] = rows[y - hy];
          c.set(l, y, beard);
          c.set(r, y, beard);
        }
        c.rect(rows[rows.length - 1][0], chin, rows[rows.length - 1][1], chin, beard);
        break;
      case 'Soul patch':
        c.set(7, my + 1 <= chin ? my + 1 : chin, beard);
        break;
      case 'Handlebar':
        c.rect(6, my - 1, 9, my - 1, beard);
        if (onFace(5, my)) c.set(5, my, beard);
        if (onFace(10, my)) c.set(10, my, beard);
        break;
      case 'Mutton chops':
        for (let y = eyeY; y < chin; y++) {
          const [l, r] = rows[y - hy];
          c.rect(l, y, l + 1, y, beard);
          c.rect(r - 1, y, r, y, beard);
        }
        c.rect(6, my - 1, 9, my - 1, beard);
        break;
      case 'Long beard':
        for (let y = my - 1; y <= chin; y++) for (let x = hl; x <= hr; x++) if (c.get(x, y) === skin || c.get(x, y) === shade(skin, 0.92)) c.set(x, y, beard);
        c.rect(7, my, 8, my, lip);
        c.rect(6, chin + 1, 9, chin + 2, beard);
        c.rect(7, chin + 3, 8, chin + 3, shade(beard, 0.85));
        break;
      case 'Pencil mustache':
        c.rect(7, my - 1, 8, my - 1, shade(beard, 0.8));
        break;
    }
  }

  // ---- Hair (front: framing the face; back: covering the head).
  const top = hy - 1;
  const hairPx = (x: number, y: number) => c.set(x, y, hair);
  const crown = (y0: number, y1: number, l = hl, r = hr) => c.rect(l, y0, r, y1, hair);
  switch (hairStyle) {
    case 'Short':
      crown(top, hy);
      hairPx(hl, hy + 1);
      hairPx(hr, hy + 1);
      break;
    case 'Long':
      crown(top, hy);
      c.rect(hl - 1, hy, hl - 1, hy + 7, hair);
      c.rect(hr + 1, hy, hr + 1, hy + 7, hair);
      break;
    case 'Mohawk':
      c.rect(7, top - 1, 8, hy, hair);
      break;
    case 'Curly':
      c.rect(hl - 1, top - 1, hr + 1, hy, hair);
      hairPx(hl - 1, hy + 1);
      hairPx(hr + 1, hy + 1);
      c.set(hl, top - 1, '');
      c.set(hr, top - 1, '');
      c.set(7, top - 1, shade(hair, 1.25));
      break;
    case 'Cap':
      // The original "Cap" hairstyle (kept for saved characters): a cap in the top color.
      c.rect(hl, top, hr, hy, shirt);
      if (front) c.rect(hr - 1, hy + 1, hr + 2, hy + 1, shade(shirt, 0.75));
      break;
    case 'Buzz':
      crown(hy, hy, hl, hr);
      for (let x = hl; x <= hr; x++) c.set(x, hy, shade(hair, 1.1));
      break;
    case 'Side part':
      crown(top, hy);
      c.rect(hl, hy + 1, hl + 2, hy + 1, hair);
      hairPx(hr, hy + 1);
      c.set(hl + 3, top, shade(skin, 0.95)); // the part
      break;
    case 'Spiky':
      crown(hy, hy);
      for (let x = hl; x <= hr; x += 2) c.rect(x, top - 1, x, top, hair);
      break;
    case 'Ponytail':
      crown(top, hy);
      hairPx(hl, hy + 1);
      hairPx(hr, hy + 1);
      c.rect(hr + 1, hy, hr + 1, hy + 5, hair);
      c.set(hr + 1, hy + 1, shade(hair, 0.7)); // the tie
      break;
    case 'Bun':
      crown(top, hy);
      c.rect(7, top - 2, 8, top - 1, hair);
      c.set(6, top - 1, hair);
      c.set(9, top - 1, hair);
      break;
    case 'Afro':
      c.rect(hl - 2, top - 2, hr + 2, hy + 1, hair);
      c.rect(hl - 2, hy + 2, hl - 1, hy + 4, hair);
      c.rect(hr + 1, hy + 2, hr + 2, hy + 4, hair);
      c.set(hl - 2, top - 2, '');
      c.set(hr + 2, top - 2, '');
      // Leave the forehead open (the face below it was never covered).
      if (front) c.rect(rows[1][0], hy + 1, rows[1][1], hy + 1, skin);
      break;
    case 'Mullet':
      crown(top, hy);
      hairPx(hl, hy + 1);
      hairPx(hr, hy + 1);
      c.rect(hl, chin, hl, chin + 2, hair);
      c.rect(hr, chin, hr, chin + 2, hair);
      break;
    case 'Bob':
      crown(top, hy + 1);
      c.rect(hl - 1, hy, hl - 1, chin - 1, hair);
      c.rect(hr + 1, hy, hr + 1, chin - 1, hair);
      if (front) c.rect(hl + 1, hy + 1, hr - 1, hy + 1, skin);
      break;
    case 'Swoop':
      crown(top, hy);
      c.rect(hl, hy + 1, hl + 3, hy + 1, hair);
      c.rect(hr - 1, top - 1, hr + 1, top, hair);
      break;
    case 'Receding':
      c.rect(hl, top + 1, hl, hy + 1, hair);
      c.rect(hr, top + 1, hr, hy + 1, hair);
      c.rect(hl + 2, top, hr - 2, top, hair);
      break;
    case 'Shaggy':
      crown(top, hy + 1);
      c.rect(hl - 1, hy, hl - 1, hy + 3, hair);
      c.rect(hr + 1, hy, hr + 1, hy + 3, hair);
      if (front) for (let x = hl + 1; x < hr; x += 2) c.set(x, hy + 1, skin);
      break;
    case 'Pigtails':
      crown(top, hy);
      hairPx(hl, hy + 1);
      hairPx(hr, hy + 1);
      c.rect(hl - 2, hy + 1, hl - 1, hy + 4, hair);
      c.rect(hr + 1, hy + 1, hr + 2, hy + 4, hair);
      c.set(hl - 1, hy + 1, '#e23b3b');
      c.set(hr + 1, hy + 1, '#e23b3b');
      break;
    case 'Undercut':
      c.rect(hl, top - 1, hr - 1, top, hair);
      c.rect(hl, hy, hr, hy, shade(skin, 0.78));
      hairPx(hl, hy);
      break;
    case 'Dreads':
      crown(top, hy);
      for (let y = hy; y <= hy + 6; y++) {
        c.set(hl - 1, y, y % 2 ? hair : shade(hair, 0.75));
        c.set(hr + 1, y, y % 2 ? shade(hair, 0.75) : hair);
      }
      hairPx(hl, hy + 1);
      hairPx(hr, hy + 1);
      break;
    case 'Top knot':
      crown(top, hy);
      hairPx(hl, hy + 1);
      hairPx(hr, hy + 1);
      c.rect(7, Math.max(0, top - 2), 8, top - 1, hair);
      c.rect(7, top, 8, top, shade(hair, 0.7));
      break;
    case 'Flat top':
      c.rect(hl, Math.max(0, top - 2), hr, hy, hair);
      c.rect(hl, Math.max(0, top - 2), hr, Math.max(0, top - 2), shade(hair, 1.2));
      break;
    case 'Bowl cut':
      crown(top, hy + 1);
      c.rect(hl - 1, hy, hl - 1, hy + 2, hair);
      c.rect(hr + 1, hy, hr + 1, hy + 2, hair);
      break;
    case 'Braids':
      crown(top, hy);
      for (let y = hy; y <= hy + 8; y++) {
        c.set(hl - 1, y, y % 2 ? hair : shade(hair, 0.72));
        c.set(hr + 1, y, y % 2 ? shade(hair, 0.72) : hair);
      }
      break;
  }

  // The newer, everyday styles (mostly short).
  const blend = (a: string, b: string) => {
    const x = parseInt(a.slice(1), 16);
    const y = parseInt(b.slice(1), 16);
    const m = (s: number) => Math.round((((x >> s) & 255) + ((y >> s) & 255)) / 2);
    return `#${[16, 8, 0].map((k) => m(k).toString(16).padStart(2, '0')).join('')}`;
  };
  const faded = blend(hair, skin);
  switch (hairStyle) {
    case 'Crew cut':
      // Short and tidy: a rounded top, tight sides.
      c.rect(hl + 1, top, hr - 1, top, hair);
      c.rect(hl, hy, hr, hy, hair);
      break;
    case 'Fade':
      // Short on top, the sides fading into the skin.
      c.rect(hl + 1, top, hr - 1, top, hair);
      c.rect(hl, hy, hr, hy, hair);
      c.set(hl, hy, faded);
      c.set(hr, hy, faded);
      if (onFace(hl, hy + 1)) c.set(hl, hy + 1, faded);
      if (onFace(hr, hy + 1)) c.set(hr, hy + 1, faded);
      break;
    case 'Textured crop':
      // A choppy top and a short, uneven fringe.
      crown(top, hy);
      for (let x = hl + 1; x <= hr - 1; x += 2) c.set(x, top - 1, hair);
      for (let x = hl + 1; x <= hr - 1; x++) if (x % 2 === 0) c.set(x, hy + 1, hair);
      break;
    case 'Quiff':
      // Swept up and back at the front, short at the sides.
      crown(top, hy);
      c.rect(hl + 1, top - 1, hr - 1, top - 1, hair);
      c.rect(hl + 1, top - 2, hl + 3, top - 2, shade(hair, 1.15));
      c.set(hl, hy, faded);
      c.set(hr, hy, faded);
      break;
    case 'Slicked back':
      // Combed straight back: smooth, with a sheen, no fringe.
      crown(top, hy);
      for (let x = hl + 1; x <= hr - 1; x += 2) c.set(x, top, shade(hair, 1.3));
      if (onFace(hl, hy + 1)) c.set(hl, hy + 1, hair);
      if (onFace(hr, hy + 1)) c.set(hr, hy + 1, hair);
      break;
    case 'Short curls':
      // Tight curls close to the head.
      c.rect(hl, top, hr, hy, hair);
      for (let x = hl; x <= hr; x++) if (x % 2 === 1) c.set(x, top - 1, hair);
      for (let x = hl; x <= hr; x++) for (const y of [top, hy]) if ((x + y) % 2 === 0) c.set(x, y, shade(hair, 0.75));
      if (onFace(hl, hy + 1)) c.set(hl, hy + 1, hair);
      if (onFace(hr, hy + 1)) c.set(hr, hy + 1, hair);
      break;
    case 'Ivy league':
      // A short side part, the front pushed up and over.
      c.rect(hl + 1, top, hr - 1, top, hair);
      c.rect(hl, hy, hr, hy, hair);
      c.rect(hl + 1, top - 1, hl + 3, top - 1, hair);
      c.set(hl + 2, top, shade(hair, 0.7)); // the part
      break;
    case 'Pixie cut':
      // Cropped close with a side-swept fringe and short sideburns.
      crown(top, hy);
      c.rect(hl, hy + 1, hl + 2, hy + 1, hair);
      if (onFace(hr, hy + 1)) c.set(hr, hy + 1, hair);
      break;
    case 'Shoulder length':
      // Down to the shoulders, parted in the middle.
      crown(top, hy);
      c.set(7, top, shade(hair, 0.75));
      c.rect(hl - 1, hy, hl - 1, chin + 1, hair);
      c.rect(hr + 1, hy, hr + 1, chin + 1, hair);
      c.set(hl, hy + 1, hair);
      c.set(hr, hy + 1, hair);
      break;
    case 'Wavy':
      // Loose waves past the jaw.
      crown(top, hy);
      for (let y = hy; y <= chin; y++) {
        const out = (y - hy) % 3 === 1 ? 2 : 1;
        c.rect(hl - out, y, hl - 1, y, hair);
        c.rect(hr + 1, y, hr + out, y, hair);
      }
      c.set(hl, hy + 1, hair);
      c.set(hr, hy + 1, shade(hair, 0.85));
      break;
  }

  // ---- Back of the head: covered by most hair, skin for bald, buzz shows its texture.
  if (!front) {
    const back = hairStyle === 'Bald' || hairStyle === 'Receding' ? skin : hairStyle === 'Buzz' ? shade(hair, 1.1) : hair;
    rows.forEach(([l, r], k) => c.rect(l, hy + k, r, hy + k, back));
    if (hairStyle === 'Mohawk') {
      rows.forEach(([l, r], k) => c.rect(l, hy + k, r, hy + k, skin));
      c.rect(7, top - 1, 8, chin, hair);
    }
    if (['Short', 'Side part', 'Spiky', 'Swoop', 'Crew cut', 'Textured crop', 'Quiff', 'Short curls', 'Ivy league', 'Pixie cut'].includes(hairStyle)) c.rect(hl + 1, chin, hr - 1, chin, skin); // the nape
    if (hairStyle === 'Fade' || hairStyle === 'Crew cut') rows.forEach(([l, r], k) => k >= 3 && c.rect(l, hy + k, r, hy + k, k >= 5 ? shade(skin, 0.9) : faded));
    if (hairStyle === 'Shoulder length' || hairStyle === 'Wavy') c.rect(hl - 1, chin - 1, hr + 1, chin + 1, hair);
    // Short curls: the curl texture all over the back of the head.
    if (hairStyle === 'Short curls') rows.forEach(([l, r], k) => k < rows.length - 1 && [...Array(r - l + 1).keys()].forEach((d) => (l + d + k) % 2 === 0 && c.set(l + d, hy + k, shade(hair, 0.75))));
    // Slicked back: combed down over the nape, with the comb lines showing.
    if (hairStyle === 'Slicked back') {
      c.rect(hl + 1, chin + 1, hr - 1, chin + 1, shade(hair, 0.9));
      for (let y = hy; y <= chin; y += 2) c.set(7, y, shade(hair, 1.25));
    }
    if (hairStyle === 'Ponytail') c.rect(7, chin - 2, 8, chin + 3, shade(hair, 0.9));
    if (hairStyle === 'Undercut') rows.forEach(([l, r], k) => k >= 2 && c.rect(l, hy + k, r, hy + k, shade(skin, 0.78)));
    if (hairStyle === 'Dreads' || hairStyle === 'Braids') for (let x = hl; x <= hr; x += 2) c.rect(x, chin, x, chin + 3, shade(hair, x % 4 ? 0.85 : 1));
    if (hairStyle === 'Cap') c.rect(hl, top, hr, hy + 1, shirt);
    for (let y = chin + 1; y < torsoTop; y++) c.rect(neckW[0], y, neckW[1], y, shade(skin, 0.85));
  }

  // ---- Headwear, over the hair. A hat that covers the crown flattens what's under it: no hair pokes out above it.
  const crownTop: Partial<Record<string, number>> = { Cap: top, 'Backwards cap': top, Beanie: top - 1, 'Bucket hat': top - 1, Bandana: top, 'Cowboy hat': top - 1, Beret: top, 'Hard hat': top - 1, 'Top hat': 0 };
  const capY = crownTop[headwear];
  if (capY !== undefined)
    for (let y = 0; y <= capY; y++)
      for (let x = hl - 2; x <= hr + 2; x++) {
        if (y === capY && x >= hl && x <= hr) continue; // the hat itself goes here
        const col = c.get(x, y);
        if (col && (col === hair || col === shade(hair, 1.25) || col === shade(hair, 1.15) || col === shade(hair, 0.7) || col === shade(hair, 0.75) || col === shade(hair, 1.2) || col === shade(hair, 1.3))) c.set(x, y, '');
      }
  switch (headwear) {
    case 'Cap':
      c.rect(hl, top, hr, hy, hat);
      c.set(7, top, shade(hat, 1.3));
      if (front) c.rect(hr - 1, hy + 1, hr + 2, hy + 1, shade(hat, 0.72));
      else c.rect(7, hy + 1, 8, hy + 1, shade(hat, 0.72)); // the strap
      break;
    case 'Backwards cap':
      c.rect(hl, top, hr, hy, hat);
      if (front) c.rect(7, hy, 8, hy, shade(hat, 0.72)); // the strap at the front
      else c.rect(hl - 2, hy + 1, hl + 1, hy + 1, shade(hat, 0.72));
      break;
    case 'Beanie':
      c.rect(hl, top - 1, hr, hy, hat);
      c.rect(hl, hy, hr, hy, shade(hat, 0.75));
      c.set(7, top - 2, shade(hat, 1.3));
      c.set(8, top - 2, shade(hat, 1.3));
      break;
    case 'Bucket hat':
      c.rect(hl, top - 1, hr, hy, hat);
      c.rect(hl - 1, hy + 1, hr + 1, hy + 1, shade(hat, 0.8));
      break;
    case 'Visor':
      c.rect(hl, hy, hr, hy, hat);
      if (front) c.rect(hl, hy + 1, hr + 1, hy + 1, shade(hat, 0.72));
      break;
    case 'Bandana':
      c.rect(hl, top, hr, hy, hat);
      for (let x = hl; x <= hr; x += 2) c.set(x, top, WHITE);
      if (!front) c.rect(7, hy + 1, 8, hy + 2, hat); // the knot
      break;
    case 'Cowboy hat':
      c.rect(hl, Math.max(0, top - 1), hr, top, hat);
      c.set(7, Math.max(0, top - 1), shade(hat, 0.75)); // the dent
      c.rect(hl, top, hr, top, shade(hat, 0.6)); // the band
      c.rect(hl - 2, hy, hr + 2, hy, shade(hat, 0.85)); // the brim
      c.set(hl - 2, hy - 1, shade(hat, 0.85));
      c.set(hr + 2, hy - 1, shade(hat, 0.85));
      break;
    case 'Top hat':
      c.rect(hl + 1, 0, hr - 1, top, hat);
      c.rect(hl + 1, top, hr - 1, top, hat === '#b5332e' ? '#1c1c1c' : '#b5332e');
      c.rect(hl - 1, hy, hr + 1, hy, shade(hat, 0.85));
      break;
    case 'Headphones':
      c.rect(hl, top, hr, top, '#2a2a2a');
      c.rect(hl - 1, top + 1, hl - 1, hy + 3, '#2a2a2a');
      c.rect(hr + 1, top + 1, hr + 1, hy + 3, '#2a2a2a');
      c.rect(hl - 1, hy + 2, hl - 1, hy + 3, hat);
      c.rect(hr + 1, hy + 2, hr + 1, hy + 3, hat);
      break;
    case 'Beret':
      c.rect(hl, top, hr + 1, hy, hat);
      c.set(hr + 2, hy, hat);
      c.set(7, Math.max(0, top - 1), shade(hat, 0.8));
      break;
    case 'Hard hat':
      c.rect(hl, Math.max(0, top - 1), hr, hy, hat);
      c.rect(7, Math.max(0, top - 1), 8, hy, shade(hat, 1.2));
      c.rect(hl - 1, hy + 1, hr + 1, hy + 1, shade(hat, 0.8));
      break;
    case 'Party hat':
      c.rect(7, 0, 8, 0, WHITE);
      c.rect(6, Math.max(1, top), 9, Math.max(1, top), hat);
      c.rect(5, hy, 10, hy, hat);
      c.set(7, Math.max(1, top), WHITE);
      c.set(9, hy, WHITE);
      c.set(6, hy, GOLD);
      break;
  }

  // Hair highlight (light from the upper left).
  if (hairStyle !== 'Bald' && hairStyle !== 'Cap' && headwear === 'None') {
    for (let y = 0; y < hy + 2; y++)
      for (let x = 3; x < 9; x++)
        if (c.get(x, y) === hair && c.get(x, y - 1) !== hair) {
          c.set(x, y, shade(hair, 1.45));
          break;
        }
  }

  // ---- Paddle, in the right hand: the light wooden face toward you, the darker back from behind.
  const hand = front ? tx1 + 1 : tx0 - 1;
  const step = front ? 1 : -1;
  const face = front ? PADDLE_RED : PADDLE_BLACK;
  const py = armTop + 1;
  for (let dx = 1; dx <= 3; dx++) c.rect(hand + dx * step, py, hand + dx * step, py + 2, face);
  c.set(hand + 2 * step, py - 1, face);
  c.set(hand + step, py + 3, PADDLE_WOOD);
  c.set(hand + step * 3, py, shade(face, 1.35));

  // ---- Extras.
  switch (front ? acc : ['Headband', 'Chain', 'Wristband', 'Earring', 'Eye patch', 'Scarf', 'Lei', 'Backpack'].includes(acc) ? acc : 'None') {
    case 'Glasses':
    case 'Round glasses':
      // Drawn at full size (thin rims around the eyes): see finishHigh.
      meta.glasses = acc === 'Glasses' ? 'square' : 'round';
      break;
    case 'Shades':
      c.rect(hl, eyeY - 1, hr, eyeY, '#111111');
      c.set(hl + 1, eyeY - 1, '#4a4a4a');
      break;
    case 'Headband':
      c.rect(hl, hy + 1, hr, hy + 1, '#e23b3b');
      break;
    case 'Beard':
      // The original beard extra (kept for saved characters).
      c.rect(hl, eyeY + 2, hr, chin, hair);
      c.rect(7, eyeY + 2, 8, eyeY + 2, shade(skin, 0.7));
      break;
    case 'Chain':
      c.rect(tx0 + 1, torsoTop + (front ? 1 : 0), tx1 - 1, torsoTop + (front ? 1 : 0), GOLD);
      break;
    case 'Earring':
      c.set(front ? hl - 1 : hr + 1, eyeY + 2, GOLD);
      break;
    case 'Freckles':
      for (const [x, y] of [[6, eyeY + 1], [5, eyeY + 2], [10, eyeY + 1], [9, eyeY + 2]] as const) c.set(x, y, shade(skin, 0.72));
      break;
    case 'Face paint':
      c.set(hl + 1, eyeY + 1, '#00693e');
      c.set(hl + 1, eyeY + 2, '#00693e');
      c.set(hr - 1, eyeY + 1, '#00693e');
      c.set(hr - 1, eyeY + 2, '#00693e');
      break;
    case 'Wristband':
      c.set(front ? tx0 - 1 : tx1 + 1, armBot - 1, WHITE);
      break;
    case 'Watch':
      c.set(tx0 - 1, armBot - 1, '#2a2a2a');
      break;
    case 'Neck tattoo':
      c.set(neckW[1], chin + 1, '#2f4f6a');
      break;
    case 'Eye patch':
      c.rect(hl, hy + 1, hr, hy + 1, OUTLINE);
      if (front) {
        c.set(9, eyeY, OUTLINE);
        c.set(9, eyeY - 1, OUTLINE);
        c.set(10, eyeY, OUTLINE);
      }
      break;
    case 'Bandage':
      c.rect(7, eyeY + 1, 8, eyeY + 1, '#f2d6b0');
      c.set(8, eyeY + 1, '#e0bf94');
      break;
    case 'Blush': {
      const [l, r] = rows[Math.min(rows.length - 1, eyeY + 1 - hy)];
      c.set(l + 1, eyeY + 1, '#e88a8a');
      c.set(r - 1, eyeY + 1, '#e88a8a');
      break;
    }
    case 'Nose ring':
      c.set(8, eyeY + 1, GOLD);
      break;
    case 'Bow tie':
      c.rect(6, torsoTop, 9, torsoTop, '#b5332e');
      c.rect(7, torsoTop, 8, torsoTop, '#7a1d1a');
      break;
    case 'Scarf': {
      const sc = shirt === '#e8a33d' ? '#b5332e' : '#e8a33d';
      c.rect(tx0 + 1, torsoTop, tx1 - 1, torsoTop, sc);
      for (let x = tx0 + 1; x <= tx1 - 1; x += 2) c.set(x, torsoTop, shade(sc, 0.75));
      if (front) c.rect(tx0 + 1, torsoTop + 1, tx0 + 1, torsoTop + 4, sc);
      break;
    }
    case 'Lei':
      for (let x = tx0 + 1; x <= tx1 - 1; x++) c.set(x, torsoTop + (front && x > tx0 + 2 && x < tx1 - 2 ? 1 : 0), x % 2 ? '#e86a9a' : '#f0d34a');
      break;
    case 'Backpack':
      if (front) {
        c.rect(tx0 + 1, torsoTop, tx0 + 1, torsoTop + 3, '#4a3220');
        c.rect(tx1 - 1, torsoTop, tx1 - 1, torsoTop + 3, '#4a3220');
      } else {
        c.rect(tx0 + 1, torsoTop + 1, tx1 - 1, belt - 1, '#6b4a2b');
        c.rect(tx0 + 2, belt - 3, tx1 - 2, belt - 2, '#8a6440');
        c.rect(tx0 + 1, torsoTop + 1, tx1 - 1, torsoTop + 1, '#4a3220');
      }
      break;
  }

  return { flat: { w: SPRITE_W, h: SPRITE_H, pixels: c.pixels }, meta };
}

/** The classic 16×24 finish: one-pixel form shading and a dark outline. Used by the pixel editor. */
function finishLow(flat: Sprite): Sprite {
  const c = new Canvas();
  c.pixels = flat.pixels.slice();
  // Form shading: lit left edges, shadowed right edges of each shape.
  const shaded = new Canvas();
  shaded.pixels = c.pixels.slice();
  for (let y = 0; y < SPRITE_H; y++)
    for (let x = 0; x < SPRITE_W; x++) {
      const col = c.get(x, y);
      if (!col || col === OUTLINE) continue;
      const right = c.get(x + 1, y);
      const left = c.get(x - 1, y);
      if (right !== col && right !== OUTLINE) shaded.set(x, y, shade(col, 0.8));
      else if (left !== col && left !== OUTLINE) shaded.set(x, y, shade(col, 1.12));
    }

  // ---- Outline the silhouette in a dark shade of whatever it borders, so it reads on the table.
  const out = new Canvas();
  out.pixels = shaded.pixels.slice();
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let y = 0; y < SPRITE_H; y++)
    for (let x = 0; x < SPRITE_W; x++) {
      if (c.get(x, y)) continue;
      for (const [dx, dy] of dirs) {
        const n = c.get(x + dx, y + dy);
        if (n) {
          out.set(x, y, n === OUTLINE ? OUTLINE : shade(n, 0.32));
          break;
        }
      }
    }
  return { w: SPRITE_W, h: SPRITE_H, pixels: out.pixels };
}

/** Full-size sprites are this many times the 16×24 drawing grid. */
export const SPRITE_SCALE = 2;

/**
 * Pixel-art 2× upscale (EPX / Scale2x): every pixel becomes four, and where
 * two neighbors agree the corner takes their color, so diagonals come out as
 * smooth steps instead of blocky staircases.
 */
export function epx(src: Sprite): Sprite {
  const { w, h } = src;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? src.pixels[y * w + x] : '');
  const W = w * 2;
  const out: string[] = new Array(W * h * 2).fill('');
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = at(x, y);
      const A = at(x, y - 1);
      const B = at(x + 1, y);
      const C = at(x - 1, y);
      const D = at(x, y + 1);
      let p1 = p,
        p2 = p,
        p3 = p,
        p4 = p;
      // Only round off where the corner neighbor is not transparent on one side and filled on the other,
      // so the silhouette and features soften without eating single-pixel details.
      if (C === A && C !== D && A !== B && C) p1 = A;
      if (A === B && A !== C && B !== D && A) p2 = B;
      if (D === C && D !== B && C !== A && D) p3 = C;
      if (B === D && B !== A && D !== C && B) p4 = D;
      out[2 * y * W + 2 * x] = p1;
      out[2 * y * W + 2 * x + 1] = p2;
      out[(2 * y + 1) * W + 2 * x] = p3;
      out[(2 * y + 1) * W + 2 * x + 1] = p4;
    }
  return { w: W, h: h * 2, pixels: out };
}

/**
 * The full-size finish for a part-built character: the flat drawing upscaled
 * 2× (EPX), then shaded at the finer size (a two-pixel shadow on the right and
 * bottom of each shape, a lit pixel on its left and top), catch-lights in the
 * eyes, and a one-pixel dark outline round the silhouette.
 */
/**
 * Full-size outline changes for the realistic face shapes, per row of the head
 * (from its top, at full size): +1 widens the face by a pixel on each side, -1
 * narrows it. Only the face's own edge moves (never into hair beside it).
 */
const FACE_PROFILE: Partial<Record<string, number[]>> = {
  // Widths at full size (oval): 8, 12 ×10, 8. Natural tapers smoothly below the cheeks.
  Natural: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, 0, 0],
  // A jaw that widens gently below the cheeks, a broad chin.
  'Wide jaw': [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 1],
  // Square: the jaw as wide as the cheeks, a flat chin.
  'Defined jaw': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2],
  // Wide at the cheekbones, then a smooth V to the chin.
  'High cheekbones': [0, 0, 0, 0, 0, 0, 1, 1, 0, 0, -1, -1, -1, -1],
  // Fuller and rounder: a wider crown, full cheeks, a soft wide chin.
  'Soft round': [1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
  // Longer and narrower.
  'Long oval': [0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
};

function reshapeHead(src: string[], w: number, meta: FaceMeta): void {
  const prof = FACE_PROFILE[meta.face];
  if (!prof || !meta.colors.skin) return;
  const top = meta.headTop * 2;
  const mid = w / 2;
  prof.forEach((d, k) => {
    if (!d) return;
    const y = top + k;
    const row = (x: number) => src[y * w + x];
    // The face's left and right edges on this row (outermost skin-or-feature pixels touching empty space).
    for (const side of [-1, 1] as const) {
      let x = side < 0 ? 0 : w - 1;
      while (x !== mid && !row(x)) x -= side;
      if (x === mid) continue;
      const edge = row(x);
      // Only a face edge moves (skin, or a beard on the face), and only into empty space.
      const isFace = edge === meta.colors.skin || shadeOf(edge, meta.colors.skin) || edge === shade(meta.colors.hair, 0.95);
      if (!isFace) continue;
      if (d > 0) for (let n = 1; n <= d; n++) {
        const o = x + side * n;
        if (o < 0 || o >= w || row(o)) break;
        src[y * w + o] = edge;
      }
      if (d < 0) for (let n = 0; n < -d; n++) if (Math.abs(x - side * n - mid) > 3) src[y * w + x - side * n] = '';
    }
  });
}

/** Is `col` a darker or lighter shade of `base` (the face's cheek shadow, for example)? */
function shadeOf(col: string, base: string): boolean {
  for (const f of [0.92, 0.85, 0.9, 0.78]) if (col === shade(base, f)) return true;
  return false;
}

function finishHigh(flat: Sprite, meta: FaceMeta): Sprite {
  const big = epx(flat);
  const { w, h } = big;
  const src = big.pixels;
  if (meta.front || meta.face) reshapeHead(src, w, meta);
  // Wide-set eyes: each pupil moves half a grid pixel outward (one pixel at this size).
  if (meta.front && meta.wideEyes && meta.colors.skin)
    for (const e of meta.eyes) {
      const out = e.x < 8 ? -1 : 1;
      const x0 = e.x * 2;
      const lead = out < 0 ? x0 - 1 : x0 + 2;
      const trail = out < 0 ? x0 + 1 : x0;
      for (const yy of [e.y * 2, e.y * 2 + 1]) {
        if (src[yy * w + lead] !== meta.colors.skin) continue;
        src[yy * w + lead] = src[yy * w + trail];
        src[yy * w + trail] = meta.colors.skin;
      }
    }
  const get = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? src[y * w + x] : '');
  const px = src.slice();
  const set = (x: number, y: number, col: string) => {
    if (x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = col;
  };
  // ---- Detail at the finer size, region by region (identified by their flat colors).
  const C = meta.colors;
  const R = meta.rows;
  const is = (x: number, y: number, col: string) => !!col && get(x, y) === col;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const col = get(x, y);
      if (!col) continue;
      if (col === C.hair && C.hair !== C.skin) {
        // Hair: strands (every third column a shade darker, offset by row) and a lit band near the top.
        const top = !is(x, y - 1, C.hair) || !is(x, y - 2, C.hair);
        if (top && x < w / 2 + 2) set(x, y, shade(col, 1.22));
        else if ((x + (y >> 1)) % 3 === 0) set(x, y, shade(col, 0.8));
      } else if (col === C.pants && y > R.belt * 2 + 1) {
        // Trousers: a center seam between the legs and a lit knee.
        if (x === w / 2 - 1 || x === w / 2) set(x, y, shade(col, 0.78));
        else if (y === Math.round((R.belt + R.legBot) * 1.0) && (x === w / 2 - 4 || x === w / 2 + 3)) set(x, y, shade(col, 1.18));
      } else if (col === C.shirt && meta.front && y === R.torso * 2) {
        // A collar line at the neckline.
        if (Math.abs(x - (w / 2 - 0.5)) <= 3) set(x, y, shade(col, 0.72));
      }
    }
  if (meta.front && C.skin) {
    const ey = R.eye * 2;
    // Face modelling for the realistic shapes: shadows along a jaw, under cheekbones, soft cheeks.
    const edges = (gy: number): [number, number] | null => {
      const r = meta.head[gy - meta.headTop];
      return r ? [r[0] * 2, r[1] * 2 + 1] : null;
    };
    const darken = (x: number, y: number, f: number) => is(x, y, C.skin) && set(x, y, shade(C.skin, f));
    if (meta.face === 'Defined jaw') {
      for (const gy of [R.chin - 1, R.chin]) {
        const e = edges(gy);
        if (!e) continue;
        for (const y of [gy * 2, gy * 2 + 1]) {
          darken(e[0] + 1, y, 0.84);
          darken(e[1] - 1, y, 0.84);
        }
      }
      darken(w / 2 - 1, R.chin * 2 + 1, 0.86); // a hint of a cleft
      for (let x = 0; x < w; x++) if (is(x, R.chin * 2 + 1, C.skin) && !is(x, R.chin * 2 + 2, C.skin)) set(x, R.chin * 2 + 1, shade(C.skin, 0.88));
    } else if (meta.face === 'High cheekbones') {
      const e = edges(R.eye + 1);
      if (e) {
        darken(e[0] + 2, (R.eye + 1) * 2 + 1, 0.86);
        darken(e[1] - 2, (R.eye + 1) * 2 + 1, 0.86);
        darken(e[0] + 2, (R.eye + 1) * 2, 1.07);
        darken(e[1] - 2, (R.eye + 1) * 2, 1.07);
      }
    } else if (meta.face === 'Soft round' || meta.face === 'Natural') {
      const e = edges(R.eye + 1);
      if (e) {
        darken(e[0] + 2, (R.eye + 1) * 2 + 1, meta.face === 'Soft round' ? 1.08 : 1.04);
        darken(e[1] - 2, (R.eye + 1) * 2 + 1, meta.face === 'Soft round' ? 1.08 : 1.04);
      }
    }
    // A nose: a shadow under the brow line between the eyes, and a lit tip.
    const nx = w / 2 - 1;
    if (is(nx, ey + 2, C.skin)) set(nx, ey + 2, shade(C.skin, 0.82));
    if (is(nx, ey + 3, C.skin)) set(nx, ey + 3, shade(C.skin, 0.78));
    if (is(nx + 1, ey + 3, C.skin)) set(nx + 1, ey + 3, shade(C.skin, 1.08));
    // A soft shadow under the chin.
    const cy = R.chin * 2 + 2;
    for (let x = 0; x < w; x++) if (is(x, cy, shade(C.skin, 0.85))) set(x, cy, shade(C.skin, 0.7));
  }
  // Shading, light from the top left.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const col = get(x, y);
      if (!col || col === OUTLINE) continue;
      const edge = (dx: number, dy: number) => {
        const n = get(x + dx, y + dy);
        return n !== col;
      };
      if (edge(1, 0)) set(x, y, shade(col, 0.76));
      else if (edge(2, 0)) set(x, y, shade(col, 0.88));
      else if (edge(0, 1) && get(x, y + 1) !== '') set(x, y, shade(col, 0.86));
      else if (edge(-1, 0) && get(x - 1, y) !== OUTLINE) set(x, y, shade(col, 1.14));
      else if (edge(0, -1) && get(x, y - 1) !== OUTLINE) set(x, y, shade(col, 1.08));
    }
  // Glasses: a thin rim around each eye with a faint lens tint, a bridge and the arms to the temples.
  if (meta.front && meta.glasses) {
    const frame = meta.glasses === 'square' ? '#2b2b30' : '#b8912f';
    const ey = meta.rows.eye * 2;
    const boxes = [6, 9].map((gx) => {
      // Five wide: the pupil plus a pixel of lens on its outer side.
      const x0 = (gx < 8 ? gx * 2 - 2 : gx * 2 - 1) + (meta.wideEyes ? (gx < 8 ? -1 : 1) : 0);
      return { x0, x1: x0 + 4, y0: ey - 1, y1: ey + 2 };
    });
    const lens = (col: string) => {
      const n = parseInt(col.slice(1), 16);
      const mix = (k: number, t: number) => Math.round(((n >> k) & 255) * 0.75 + t * 0.25);
      return `#${[mix(16, 200), mix(8, 230), mix(0, 255)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    };
    for (const b of boxes)
      for (let y = b.y0; y <= b.y1; y++)
        for (let x = b.x0; x <= b.x1; x++) {
          const edge = x === b.x0 || x === b.x1 || y === b.y0 || y === b.y1;
          const corner = (x === b.x0 || x === b.x1) && (y === b.y0 || y === b.y1);
          const cur = px[y * w + x];
          if (!cur) continue;
          if (edge && !(corner && meta.glasses === 'round')) px[y * w + x] = frame;
          else if (!edge && /^#/.test(cur) && cur !== OUTLINE && !is(x, y, OUTLINE)) px[y * w + x] = lens(cur);
        }
    // Bridge between the lenses, and the arms out to the sides of the face.
    for (let x = boxes[0].x1 + 1; x < boxes[1].x0; x++) px[ey * w + x] = frame;
    const e = meta.head[meta.rows.eye - meta.headTop];
    if (e) {
      for (let x = e[0] * 2; x < boxes[0].x0; x++) if (px[(ey - 1) * w + x]) px[(ey - 1) * w + x] = frame;
      for (let x = boxes[1].x1 + 1; x <= e[1] * 2 + 1; x++) if (px[(ey - 1) * w + x]) px[(ey - 1) * w + x] = frame;
    }
  }
  // Outline: every empty pixel beside the figure takes a dark shade of what it touches.
  const out = px.slice();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (get(x, y)) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const n = get(x + dx, y + dy);
        if (n) {
          out[y * w + x] = n === OUTLINE ? OUTLINE : shade(n, 0.3);
          break;
        }
      }
    }
  return { w, h, pixels: out };
}

/** A character from its parts at full size (32×48): what the game shows. */
export function composeSprite(raw: SpriteParts, facing: 'front' | 'back' = 'front', itemId: string | null = null): Sprite {
  const { flat, meta } = composeFlat(raw, facing);
  return finishHigh(withItem(flat, itemId), meta);
}

/** A character from its parts on the 16×24 drawing grid, shaded and outlined: the pixel editor's starting point. */
export function composeBase(raw: SpriteParts, facing: 'front' | 'back' = 'front'): Sprite {
  return finishLow(composeFlat(raw, facing).flat);
}

/** Cosmetic sprite items (level rewards), drawn over any sprite: [x, y, color] pixels. */
export const SPRITE_ITEMS: Record<string, [number, number, string][]> = {
  greenCap: [
    ...[5, 6, 7, 8, 9, 10].flatMap((x): [number, number, string][] => [
      [x, 1, '#00693e'],
      [x, 2, '#00693e'],
    ]),
    [7, 1, '#f2f2f2'],
    [8, 1, '#f2f2f2'],
    [7, 2, '#f2f2f2'],
    [10, 3, '#004d2d'],
    [11, 3, '#004d2d'],
    [12, 3, '#004d2d'],
  ],
  goldChain: [5, 6, 7, 8, 9, 10].map((x): [number, number, string] => [x, 11, x % 2 ? '#e8c547' : '#c9a227']),
  crown: [
    [5, 0, '#ffd76a'],
    [7, 0, '#ffd76a'],
    [8, 0, '#ffd76a'],
    [10, 0, '#ffd76a'],
    ...[5, 6, 7, 8, 9, 10].map((x): [number, number, string] => [x, 1, '#e8b923']),
    [7, 1, '#d93b3b'],
  ],
};

export function withItem(base: Sprite, itemId: string | null | undefined): Sprite {
  const item = itemId ? SPRITE_ITEMS[itemId] : undefined;
  if (!item || base.w !== SPRITE_W || base.h !== SPRITE_H) return base;
  const pixels = base.pixels.slice();
  for (const [x, y, c] of item) pixels[y * base.w + x] = c;
  return { ...base, pixels };
}

/** The sprite to show for a character: hand-drawn/uploaded pixels if present, else the parts; plus any equipped item. */
export function characterSprite(sprite: { parts: SpriteParts; pixels: Sprite | null }, itemId: string | null = null): Sprite {
  // Hand-drawn or uploaded pixels are on the 16×24 grid: scaled up the same way as part-built ones.
  if (sprite.pixels) return epx(withItem(sprite.pixels, itemId));
  return composeSprite(sprite.parts, 'front', itemId);
}

/**
 * The character seen from behind. Part-built sprites get a real back view;
 * a hand-drawn or uploaded sprite is mirrored with its face covered in its own darkest color.
 */
export function characterBackSprite(sprite: { parts: SpriteParts; pixels: Sprite | null }, itemId: string | null = null): Sprite {
  if (!sprite.pixels) return composeSprite(sprite.parts, 'back', itemId === 'goldChain' ? null : itemId);
  const p = sprite.pixels;
  const out = p.pixels.slice();
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) out[y * p.w + x] = p.pixels[y * p.w + (p.w - 1 - x)];
  return epx(withItem({ ...p, pixels: out }, itemId === 'goldChain' ? null : itemId));
}

/** Nearest-color quantize RGBA image data (already scaled to the sprite size) into sprite pixels. */
export function spriteFromRgba(data: ArrayLike<number>, w: number, h: number, alphaCutoff = 128): Sprite {
  const pixels: string[] = [];
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3];
    if (a < alphaCutoff) {
      pixels.push('');
      continue;
    }
    // Reduce to 4 bits per channel for a pixel-art palette.
    const q = (v: number) => (Math.round(v / 17) * 17).toString(16).padStart(2, '0');
    pixels.push(`#${q(data[i * 4])}${q(data[i * 4 + 1])}${q(data[i * 4 + 2])}`);
  }
  return { w, h, pixels };
}
