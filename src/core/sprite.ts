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
  build: ['Slim', 'Average', 'Broad', 'Stocky', 'Heavy', 'Lanky'],
  skin: ['#f6d7c3', '#e8b892', '#c98e63', '#a0673f', '#7a4a2a', '#4f2f1c', '#fbe3d3', '#ddb08c', '#b9835a', '#8d5a3b', '#5e3a24', '#3b2416'],
  // Face
  faceShape: ['Oval', 'Round', 'Square', 'Long', 'Pointed chin', 'Wide jaw'],
  eyes: ['Dots', 'Big', 'Sleepy', 'Wide-set', 'Lashes', 'Squint'],
  mouth: ['Neutral', 'Smile', 'Grin', 'Smirk', 'Surprised', 'Flat'],
  facialHair: ['None', 'Stubble', 'Mustache', 'Goatee', 'Full beard', 'Chin strap', 'Soul patch'],
  // Hair
  hairStyle: ['Bald', 'Short', 'Long', 'Mohawk', 'Curly', 'Cap', 'Buzz', 'Side part', 'Spiky', 'Ponytail', 'Bun', 'Afro', 'Mullet', 'Bob', 'Swoop', 'Receding'],
  hairColor: ['#2b1d14', '#5a3a22', '#a5662e', '#e2c171', '#d9d9d9', '#b5332e', '#1c1c1c', '#7a2e1a', '#f3e6b8', '#8a8a8a', '#3b6fd6', '#d65fa8', '#3fae5a'],
  headwear: ['None', 'Cap', 'Backwards cap', 'Beanie', 'Bucket hat', 'Visor', 'Bandana'],
  hatColor: ['#00693e', '#b5332e', '#1f2a44', '#f2f2f2', '#222222', '#e8a33d', '#3a8ec9', '#6b3fa0', '#c2a878'],
  // Clothes
  shirtStyle: ['Tee', 'Tank', 'Jersey', 'Hoodie', 'Polo', 'Flannel', 'Button-up', 'Big D sweater', 'Striped', 'Open jacket', 'Vest'],
  shirtColor: ['#00693e', '#f2f2f2', '#1f2a44', '#b5332e', '#e8a33d', '#6b3fa0', '#3a8ec9', '#222222', '#7d8c3a', '#d96c8a', '#6b4a2b', '#9aa3ad', '#f0d34a', '#2fb3a5'],
  pantsStyle: ['Long', 'Shorts', 'Sweats', 'Rolled cuffs'],
  pantsColor: ['#2c3e66', '#3b3b3b', '#c2a878', '#5d4a36', '#7f1d1d', '#5b6b3a', '#9aa3ad', '#1c1c1c', '#5b84c4'],
  shoes: ['Black', 'White sneakers', 'Red high-tops', 'Tan boots', 'Green', 'Slides'],
  // Extras
  accessory: ['None', 'Glasses', 'Shades', 'Headband', 'Beard', 'Chain', 'Round glasses', 'Earring', 'Freckles', 'Face paint', 'Wristband', 'Watch', 'Neck tattoo'],
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
      return [[6, 9], [5, 10], [5, 10], [5, 10], [4, 11], [4, 11], [5, 10]];
    default: // Oval
      return [[6, 9], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [6, 9]];
  }
}

export function composeSprite(raw: SpriteParts, facing: 'front' | 'back' = 'front'): Sprite {
  const parts = normalizeParts(raw);
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

  // ---- Body type: torso half-width, how far everything drops (stocky is shorter), torso and leg rows.
  const half = { Slim: 2, Average: 3, Broad: 4, Stocky: 4, Heavy: 4, Lanky: 2 }[build];
  const drop = build === 'Stocky' ? 1 : 0;
  const tx0 = 8 - half - 1;
  const tx1 = 7 + half + 1;
  const torsoTop = 10 + drop;
  const belt = build === 'Lanky' ? 15 : 16;
  const legTop = belt + 1;
  const legBot = 21;

  // ---- Head (from row 2, dropped for stocky) and neck.
  const rows = headRows(P.faceShape[parts.faceShape]);
  const hy = 2 + drop;
  rows.forEach(([l, r], k) => c.rect(l, hy + k, r, hy + k, skin));
  const chin = hy + rows.length - 1;
  const hl = Math.min(...rows.map((r) => r[0]));
  const hr = Math.max(...rows.map((r) => r[1]));
  const neckW = build === 'Heavy' || build === 'Broad' ? [6, 9] : [7, 8];
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
  const armBot = build === 'Lanky' ? 15 : 15 + drop;
  c.rect(tx0 - 1, armTop, tx0 - 1, armTop + 2, sleeve);
  c.rect(tx1 + 1, armTop, tx1 + 1, armTop + 2, sleeve);
  const longSleeve = ['Hoodie', 'Flannel', 'Button-up', 'Big D sweater', 'Open jacket'].includes(shirtStyle);
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
  }

  // ---- Bottoms and shoes.
  const lx0 = build === 'Heavy' ? tx0 : tx0 + 1;
  const lx1 = build === 'Heavy' ? tx1 : tx1 - 1;
  c.rect(lx0, legTop, 7, legBot, pants);
  c.rect(8, legTop, lx1, legBot, pants);
  c.rect(tx0, belt, tx1, belt, shade(shirt, 0.72)); // belt line
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
  }
  const slides = parts.shoes === 5;
  c.rect(lx0, 22, 7, 22, shoe.top);
  c.rect(8, 22, lx1, 22, shoe.top);
  if (slides) {
    c.set(lx0, 22, skin);
    c.set(lx1, 22, skin);
  } else {
    c.set(lx0, 22, shoe.sole);
    c.set(lx1, 22, shoe.sole);
  }
  if (parts.shoes === 2) {
    // High-tops come up over the ankle.
    c.rect(lx0, 21, 7, 21, shoe.top);
    c.rect(8, 21, lx1, 21, shoe.top);
    c.set(lx0 + 1, 21, WHITE);
    c.set(lx1 - 1, 21, WHITE);
  }

  // ---- Face (front only).
  const eyeY = hy + 3;
  if (front) {
    const eyes = P.eyes[parts.eyes];
    const ex = eyes === 'Wide-set' ? [5, 10] : [6, 9];
    const brow = shade(hair, 0.9);
    for (const x of ex) {
      switch (eyes) {
        case 'Big':
          c.set(x, eyeY - 1, WHITE);
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
        default:
          c.set(x, eyeY, OUTLINE);
      }
      if (eyes !== 'Lashes' && eyes !== 'Big' && eyes !== 'Sleepy') c.set(x, eyeY - 1, brow);
    }
    c.set(hl, eyeY + 1, shade(skin, 0.92)); // cheek shadow
    const mouth = P.mouth[parts.mouth];
    const my = eyeY + 2;
    const lip = shade(skin, 0.68);
    switch (mouth) {
      case 'Smile':
        // Corners up, middle down.
        c.set(6, my - 1, lip);
        c.rect(7, my, 8, my, shade(skin, 0.6));
        c.set(9, my - 1, lip);
        break;
      case 'Grin':
        c.rect(6, my, 9, my, WHITE);
        c.set(6, my, lip);
        c.set(9, my, lip);
        break;
      case 'Smirk':
        c.rect(7, my, 8, my, lip);
        c.set(9, my - 1, lip);
        break;
      case 'Surprised':
        c.set(7, my, OUTLINE);
        c.set(8, my, OUTLINE);
        break;
      case 'Flat':
        c.rect(6, my, 9, my, lip);
        break;
      default:
        c.rect(7, my, 8, my, lip);
    }
    // Facial hair.
    const fh = P.facialHair[parts.facialHair];
    const beard = shade(hair, 0.95);
    switch (fh) {
      case 'Stubble':
        for (let y = my; y <= chin; y++) for (let x = hl; x <= hr; x++) if (c.get(x, y) === skin && (x + y) % 2 === 0) c.set(x, y, shade(skin, 0.78));
        break;
      case 'Mustache':
        c.rect(6, my - 1, 9, my - 1, beard);
        break;
      case 'Goatee':
        c.rect(7, my - 1, 8, my - 1, beard);
        c.rect(7, my + 1, 8, chin, beard);
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
      // Leave the face open.
      if (front) rows.forEach(([l, r], k) => k >= 1 && c.rect(l, hy + k, r, hy + k, c.get(l, hy + k) === hair ? skin : c.get(l, hy + k)));
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
  }

  // ---- Back of the head: covered by most hair, skin for bald, buzz shows its texture.
  if (!front) {
    const back = hairStyle === 'Bald' || hairStyle === 'Receding' ? skin : hairStyle === 'Buzz' ? shade(hair, 1.1) : hair;
    rows.forEach(([l, r], k) => c.rect(l, hy + k, r, hy + k, back));
    if (hairStyle === 'Mohawk') {
      rows.forEach(([l, r], k) => c.rect(l, hy + k, r, hy + k, skin));
      c.rect(7, top - 1, 8, chin, hair);
    }
    if (hairStyle === 'Short' || hairStyle === 'Side part' || hairStyle === 'Spiky' || hairStyle === 'Swoop') c.rect(hl + 1, chin, hr - 1, chin, skin); // the nape
    if (hairStyle === 'Ponytail') c.rect(7, chin - 2, 8, chin + 3, shade(hair, 0.9));
    if (hairStyle === 'Cap') c.rect(hl, top, hr, hy + 1, shirt);
    for (let y = chin + 1; y < torsoTop; y++) c.rect(neckW[0], y, neckW[1], y, shade(skin, 0.85));
  }

  // ---- Headwear, over the hair.
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
  switch (front ? acc : acc === 'Headband' || acc === 'Chain' || acc === 'Wristband' || acc === 'Earring' ? acc : 'None') {
    case 'Glasses':
      c.rect(hl, eyeY, hr, eyeY, OUTLINE);
      c.set(6, eyeY, '#9fd3ff');
      c.set(9, eyeY, '#9fd3ff');
      break;
    case 'Round glasses':
      for (const x of [6, 9]) {
        c.set(x, eyeY, '#cfe9ff');
        c.set(x - 1, eyeY, GOLD);
        c.set(x + 1, eyeY, GOLD);
      }
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
  }

  // ---- Form shading: lit left edges, shadowed right edges of each shape.
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
  return withItem(sprite.pixels ?? composeSprite(sprite.parts), itemId);
}

/**
 * The character seen from behind. Part-built sprites get a real back view;
 * a hand-drawn or uploaded sprite is mirrored with its face covered in its own darkest color.
 */
export function characterBackSprite(sprite: { parts: SpriteParts; pixels: Sprite | null }, itemId: string | null = null): Sprite {
  if (!sprite.pixels) return withItem(composeSprite(sprite.parts, 'back'), itemId === 'goldChain' ? null : itemId);
  const p = sprite.pixels;
  const out = p.pixels.slice();
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) out[y * p.w + x] = p.pixels[y * p.w + (p.w - 1 - x)];
  return withItem({ ...p, pixels: out }, itemId === 'goldChain' ? null : itemId);
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
