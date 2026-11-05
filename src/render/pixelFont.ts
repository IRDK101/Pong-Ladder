// A small hand-drawn 5×7 pixel font for menu headings and big buttons, in the
// same look as the in-game callouts: two-tone letters (lighter top rows),
// a 1-pixel dark outline and a hard drop shadow. Drawn at 1 pixel per dot and
// scaled up with smoothing off, so it stays crisp at any whole-number scale.

const G: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['...', '...', '...', '...', '...', '...', '...'],
  '.': ['.', '.', '.', '.', '.', '.', '#'],
  ',': ['..', '..', '..', '..', '..', '.#', '#.'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '-': ['...', '...', '...', '###', '...', '...', '...'],
  ':': ['.', '.', '#', '.', '.', '#', '.'],
  ';': ['..', '..', '.#', '..', '..', '.#', '#.'],
  "'": ['#', '#', '.', '.', '.', '.', '.'],
  '’': ['#', '#', '.', '.', '.', '.', '.'],
  '"': ['#.#', '#.#', '...', '...', '...', '...', '...'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '·': ['.', '.', '.', '#', '.', '.', '.'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '(': ['.#', '#.', '#.', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '.#', '.#', '#.'],
  '&': ['.##..', '#..#.', '.##..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '.#.##', '#..##'],
  '#': ['.#.#.', '#####', '.#.#.', '.#.#.', '.#.#.', '#####', '.#.#.'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '★': ['..#..', '.###.', '#####', '.###.', '.#.#.', '#...#', '.....'],
  '▶': ['#...', '##..', '###.', '####', '###.', '##..', '#...'],
  '◀': ['...#', '..##', '.###', '####', '.###', '..##', '...#'],
  '×': ['.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....'],
  '–': ['....', '....', '....', '####', '....', '....', '....'],
  '—': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
};
// A few letters people type with accents read fine without them.
const FOLD: Record<string, string> = { É: 'E', È: 'E', Ê: 'E', Á: 'A', À: 'A', Ä: 'A', Ö: 'O', Ó: 'O', Ü: 'U', Ú: 'U', Í: 'I', Ñ: 'N', Ç: 'C', Ζ: 'Z' };

const glyphOf = (ch: string): string[] | undefined => {
  const up = ch.toUpperCase();
  return G[up] ?? G[FOLD[up] ?? ''];
};

/** True when every character of `text` has a glyph (otherwise use regular text instead). */
export function canPixelType(text: string): boolean {
  return [...text].every((ch) => !!glyphOf(ch));
}

export interface PixelInk {
  /** Upper rows of each letter. */
  top: string;
  /** Lower rows. */
  bottom: string;
  /** 1-pixel outline around the letters (null for none). */
  outline: string | null;
  /** Hard shadow one pixel below (null for none). */
  shadow?: string | null;
}

export const INK = {
  gold: { top: '#fff1b8', bottom: '#f0b93a', outline: '#1a1006', shadow: 'rgba(0,0,0,0.6)' },
  cream: { top: '#fffaf0', bottom: '#e9d6aa', outline: '#1a1006', shadow: 'rgba(0,0,0,0.6)' },
  dark: { top: '#2a1c08', bottom: '#4a3210', outline: null, shadow: 'rgba(255,255,255,0.25)' },
} satisfies Record<string, PixelInk>;

const cache = new Map<string, HTMLCanvasElement>();

/** The text as pixel lettering at 1 pixel per dot (draw it scaled up, smoothing off). Unknown characters become blanks. */
export function pixelType(text: string, ink: PixelInk = INK.gold): HTMLCanvasElement {
  const key = `${text}|${ink.top}|${ink.bottom}|${ink.outline}|${ink.shadow}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const glyphs = [...text].map((ch) => glyphOf(ch) ?? G[' ']);
  const pad = 1;
  const w = glyphs.reduce((s, g) => s + g[0].length + 1, 0) - 1 + pad * 2;
  const hgt = 7 + pad * 2 + 1;
  const dots = new Uint8Array(w * hgt);
  let x0 = pad;
  for (const g of glyphs) {
    for (let y = 0; y < 7; y++) for (let x = 0; x < g[y].length; x++) if (g[y][x] === '#') dots[(y + pad) * w + x0 + x] = 1;
    x0 += g[0].length + 1;
  }
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < hgt && dots[y * w + x] === 1;
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = hgt;
  const o = c.getContext('2d')!;
  for (let y = 0; y < hgt; y++)
    for (let x = 0; x < w; x++) {
      if (on(x, y)) continue;
      if (ink.outline && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) {
        o.fillStyle = ink.outline;
        o.fillRect(x, y, 1, 1);
      } else if (ink.shadow && (on(x, y - 1) || (ink.outline && on(x, y - 2)))) {
        o.fillStyle = ink.shadow;
        o.fillRect(x, y, 1, 1);
      }
    }
  for (let y = 0; y < hgt; y++)
    for (let x = 0; x < w; x++)
      if (on(x, y)) {
        o.fillStyle = y - pad < 4 ? ink.top : ink.bottom;
        o.fillRect(x, y, 1, 1);
      }
  cache.set(key, c);
  return c;
}

/** Draw pixel lettering on a canvas. `y` is the middle of the letters; returns the drawn width. */
export function drawPixelType(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number, ink: PixelInk = INK.gold, align: 'left' | 'right' | 'center' = 'left'): number {
  const img = pixelType(text, ink);
  const w = img.width * scale;
  const left = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, Math.round(left - scale), Math.round(y - 4.5 * scale), w, img.height * scale);
  ctx.imageSmoothingEnabled = smooth;
  return w;
}
