// Chunky two-tone pixel lettering, shared by the in-game callouts and the end screen.

/**
 * Pixel text, the way the HUD's chunky art looks: drawn small, snapped to hard
 * pixels (no anti-aliasing), two-tone (lighter top rows, darker bottom rows),
 * with a 1-pixel dark outline and a drop shadow. Cached; draw it scaled up
 * with smoothing off.
 */
const pixelTextCache = new Map<string, HTMLCanvasElement>();
export function pixelText(text: string, top: string, bottom: string, outline: string, px = 10): HTMLCanvasElement {
  const key = `${text}|${top}|${bottom}|${outline}|${px}`;
  const hit = pixelTextCache.get(key);
  if (hit) return hit;
  const m = document.createElement('canvas').getContext('2d')!;
  m.font = `bold ${px}px monospace`;
  const w = Math.ceil(m.measureText(text).width) + 4;
  const h = px + 6;
  // The glyphs, hard-thresholded.
  const g = document.createElement('canvas');
  g.width = w;
  g.height = h;
  const gx = g.getContext('2d')!;
  gx.font = `bold ${px}px monospace`;
  gx.textBaseline = 'top';
  gx.fillStyle = '#fff';
  gx.fillText(text, 2, 2);
  const src = gx.getImageData(0, 0, w, h).data;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 110;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h + 1;
  const o = out.getContext('2d')!;
  const glyphTop = 2;
  const split = glyphTop + Math.round(px * 0.55);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (on(x, y)) continue;
      // Outline: any empty pixel touching a glyph pixel; the shadow sits one row lower.
      if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) {
        o.fillStyle = outline;
        o.fillRect(x, y, 1, 1);
      } else if (on(x, y - 1 - 1) || on(x - 1, y - 2) || on(x + 1, y - 2)) {
        o.fillStyle = 'rgba(0,0,0,0.55)';
        o.fillRect(x, y, 1, 1);
      }
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (on(x, y)) {
        o.fillStyle = y < split ? top : bottom;
        o.fillRect(x, y, 1, 1);
      }
  pixelTextCache.set(key, out);
  return out;
}
