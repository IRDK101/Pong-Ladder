// Pixel-art sprites built from part sets. Pure: no canvas needed.
// 16 x 24 front-facing figure; parts index into the option lists below.

import type { Sprite, SpriteParts } from './character';

export const SPRITE_W = 16;
export const SPRITE_H = 24;

export const PART_OPTIONS = {
  skin: ['#f6d7c3', '#e8b892', '#c98e63', '#a0673f', '#7a4a2a', '#4f2f1c'],
  hairStyle: ['Bald', 'Short', 'Long', 'Mohawk', 'Curly', 'Cap', 'Buzz'],
  hairColor: ['#2b1d14', '#5a3a22', '#a5662e', '#e2c171', '#d9d9d9', '#b5332e', '#1c1c1c'],
  shirtStyle: ['Tee', 'Tank', 'Jersey', 'Hoodie'],
  shirtColor: ['#00693e', '#f2f2f2', '#1f2a44', '#b5332e', '#e8a33d', '#6b3fa0', '#3a8ec9', '#222222'],
  pantsColor: ['#2c3e66', '#3b3b3b', '#c2a878', '#5d4a36', '#7f1d1d'],
  build: ['Slim', 'Average', 'Broad'],
  accessory: ['None', 'Glasses', 'Shades', 'Headband', 'Beard', 'Chain'],
} as const;

export type PartKey = keyof typeof PART_OPTIONS;

export const PART_LABELS: Record<PartKey, string> = {
  skin: 'Skin tone',
  hairStyle: 'Hair',
  hairColor: 'Hair color',
  shirtStyle: 'Shirt',
  shirtColor: 'Shirt color',
  pantsColor: 'Pants',
  build: 'Build',
  accessory: 'Accessory',
};

/** Part keys whose options are colors (shown as swatches). */
export const COLOR_PARTS: PartKey[] = ['skin', 'hairColor', 'shirtColor', 'pantsColor'];

const OUTLINE = '#1a1410';
const SHOE = '#1b1b1b';

class Canvas {
  pixels: string[] = new Array(SPRITE_W * SPRITE_H).fill('');
  set(x: number, y: number, c: string) {
    if (x >= 0 && x < SPRITE_W && y >= 0 && y < SPRITE_H) this.pixels[y * SPRITE_W + x] = c;
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: string) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c);
  }
  get(x: number, y: number) {
    return this.pixels[y * SPRITE_W + x];
  }
}

function pick<T>(list: readonly T[], i: number): T {
  return list[((i % list.length) + list.length) % list.length];
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

export function composeSprite(parts: SpriteParts, facing: 'front' | 'back' = 'front'): Sprite {
  const c = new Canvas();
  const skin = pick(PART_OPTIONS.skin, parts.skin);
  const hair = pick(PART_OPTIONS.hairColor, parts.hairColor);
  const shirt = pick(PART_OPTIONS.shirtColor, parts.shirtColor);
  const pants = pick(PART_OPTIONS.pantsColor, parts.pantsColor);
  const build = ((parts.build % 3) + 3) % 3; // 0 slim, 1 average, 2 broad
  const hairStyle = pick(PART_OPTIONS.hairStyle, parts.hairStyle);
  const shirtStyle = pick(PART_OPTIONS.shirtStyle, parts.shirtStyle);
  const acc = pick(PART_OPTIONS.accessory, parts.accessory);

  // Torso width by build.
  const half = [2, 3, 4][build];
  const tx0 = 8 - half - 1;
  const tx1 = 7 + half + 1;

  // Head (rows 2-8), neck (9).
  c.rect(5, 2, 10, 8, skin);
  c.rect(7, 9, 8, 9, shade(skin, 0.85));
  // Eyes and mouth.
  c.set(6, 5, OUTLINE);
  c.set(9, 5, OUTLINE);
  c.rect(7, 7, 8, 7, shade(skin, 0.7));

  // Torso (10-16) and arms.
  c.rect(tx0, 10, tx1, 16, shirt);
  if (shirtStyle === 'Tank') {
    c.rect(tx0, 10, tx0, 11, skin);
    c.rect(tx1, 10, tx1, 11, skin);
  }
  if (shirtStyle === 'Jersey') {
    c.rect(tx0 + 1, 12, tx1 - 1, 12, '#f2f2f2');
    c.rect(7, 13, 8, 15, '#f2f2f2');
  }
  if (shirtStyle === 'Hoodie') {
    c.rect(tx0, 10, tx1, 10, shade(shirt, 0.75));
    c.set(7, 12, shade(shirt, 0.6));
    c.set(8, 12, shade(shirt, 0.6));
  }
  const sleeve = shirtStyle === 'Tank' ? skin : shirt;
  c.rect(tx0 - 1, 10, tx0 - 1, 12, sleeve);
  c.rect(tx1 + 1, 10, tx1 + 1, 12, sleeve);
  c.rect(tx0 - 1, 13, tx0 - 1, 15, skin); // forearms
  c.rect(tx1 + 1, 13, tx1 + 1, 15, skin);

  // Legs (17-21) and shoes (22).
  c.rect(tx0 + 1, 17, 7, 21, pants);
  c.rect(8, 17, tx1 - 1, 21, pants);
  c.rect(tx0 + 1, 22, 7, 22, SHOE);
  c.rect(8, 22, tx1 - 1, 22, SHOE);
  c.set(7, 19, shade(pants, 0.7));
  c.set(8, 19, shade(pants, 0.7));

  // Hair.
  switch (hairStyle) {
    case 'Short':
      c.rect(5, 1, 10, 2, hair);
      c.set(5, 3, hair);
      c.set(10, 3, hair);
      break;
    case 'Long':
      c.rect(5, 1, 10, 2, hair);
      c.rect(4, 2, 4, 9, hair);
      c.rect(11, 2, 11, 9, hair);
      break;
    case 'Mohawk':
      c.rect(7, 0, 8, 2, hair);
      break;
    case 'Curly':
      c.rect(4, 0, 11, 2, hair);
      c.set(4, 3, hair);
      c.set(11, 3, hair);
      c.set(5, 0, '');
      c.set(10, 0, '');
      c.set(7, 0, shade(hair, 1.25));
      break;
    case 'Cap':
      c.rect(5, 1, 10, 2, shirt);
      c.rect(9, 3, 12, 3, shade(shirt, 0.75));
      break;
    case 'Buzz':
      c.rect(5, 2, 10, 2, shade(hair, 1.1));
      break;
  }

  // Seen from behind: the back of the head instead of a face; only the headband and chain show.
  if (facing === 'back') {
    const back = hairStyle === 'Bald' ? skin : hairStyle === 'Buzz' ? shade(hair, 1.1) : hair;
    c.rect(5, 2, 10, 8, back);
    if (hairStyle === 'Mohawk') {
      c.rect(5, 2, 10, 8, skin);
      c.rect(7, 0, 8, 8, hair);
    }
    if (hairStyle === 'Cap') {
      c.rect(5, 4, 10, 8, hair);
      c.rect(5, 1, 10, 3, shirt);
    }
    c.rect(7, 9, 8, 9, shade(skin, 0.85));
    if (acc === 'Headband') c.rect(5, 3, 10, 3, '#e23b3b');
    if (acc === 'Chain') c.rect(tx0 + 1, 10, tx1 - 1, 10, '#e8c547');
  }

  // Accessories.
  switch (facing === 'back' ? 'None' : acc) {
    case 'Glasses':
      c.rect(5, 5, 10, 5, OUTLINE);
      c.set(6, 5, '#9fd3ff');
      c.set(9, 5, '#9fd3ff');
      break;
    case 'Shades':
      c.rect(5, 4, 10, 5, '#111111');
      break;
    case 'Headband':
      c.rect(5, 3, 10, 3, '#e23b3b');
      break;
    case 'Beard':
      c.rect(5, 7, 10, 8, hair);
      c.rect(7, 7, 8, 7, shade(skin, 0.7));
      break;
    case 'Chain':
      c.rect(tx0 + 1, 11, tx1 - 1, 11, '#e8c547');
      break;
  }

  // Outline the silhouette so it reads on the table.
  const out = new Canvas();
  out.pixels = c.pixels.slice();
  for (let y = 0; y < SPRITE_H; y++)
    for (let x = 0; x < SPRITE_W; x++) {
      if (c.get(x, y)) continue;
      const n = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx >= 0 && nx < SPRITE_W && ny >= 0 && ny < SPRITE_H && c.get(nx, ny) !== '';
      });
      if (n) out.set(x, y, OUTLINE);
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
