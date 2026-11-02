// Table designs: the painted tops you can play on, after the real tables in
// the basement. The three original tables (saints, spirits, chain) are
// drawn in basement3d.ts; the rest are here. Each top is painted once onto a
// 288 x 144 canvas (u runs along the table from Team A's end, v across it).
//
// The plain table is everyone's default; every other design is unlocked
// from loot boxes.

import type { TableDesign } from '../config';

type Ctx = CanvasRenderingContext2D;
type Rnd = () => number;

export interface DesignInfo {
  id: TableDesign;
  name: string;
  /** One line for the Collection. */
  blurb: string;
  /** The plywood edge, lit and in shadow. */
  side: string;
  sideDark: string;
}

export const DESIGNS: Record<TableDesign, DesignInfo> = {
  plain: { id: 'plain', name: 'Plain table', blurb: 'The old dark wood one with the gold trim. Everyone starts here.', side: '#3a2a1c', sideDark: '#22170e' },
  saints: { id: 'saints', name: 'Saints table', blurb: 'Blue, with the big painted figure and gold letters.', side: '#d6caa8', sideDark: '#9c916f' },
  spirits: { id: 'spirits', name: 'Night sky table', blurb: 'A night sky, a meadow of little spirits and a black cat.', side: '#2a2a2a', sideDark: '#101010' },
  chain: { id: 'chain', name: 'Chain table', blurb: 'Fire at one end, ice at the other, and a chain between.', side: '#c9a227', sideDark: '#8a6d14' },
  goofy: { id: 'goofy', name: 'Get Goofy table', blurb: 'Bright orange, gold ΖΨ, a red jug and the Get Goofy mug.', side: '#d97a2a', sideDark: '#9a5218' },
  gummy: { id: 'gummy', name: 'Gummy table', blurb: 'Red, yellow, green and orange tiles on black. 26X.', side: '#1a1a1a', sideDark: '#0a0a0a' },
  pitch: { id: 'pitch', name: 'Pitch table', blurb: 'A striped soccer pitch with the ball at center spot.', side: '#0f4a3a', sideDark: '#082c22' },
  larks: { id: 'larks', name: 'Larks table', blurb: '“The larks, still bravely singing, fly”, with poppies.', side: '#1c1c1a', sideDark: '#0c0c0b' },
  deco: { id: 'deco', name: 'Art deco table', blurb: 'Gold deco lines on black around a ΖΨ crest.', side: '#c9a33a', sideDark: '#86691d' },
  retro: { id: 'retro', name: 'Retro logo table', blurb: 'Bare wood, a cream border and a big slanted ZETA PSI.', side: '#e4d8b4', sideDark: '#a89c78' },
  scribble: { id: 'scribble', name: 'Scribble table', blurb: 'Cream, covered in wild brushstrokes.', side: '#d8ccaa', sideDark: '#9c9070' },
  cans: { id: 'cans', name: 'Pop-art cans table', blurb: 'Eight cans on bright color blocks, pop-art style.', side: '#e8dcb8', sideDark: '#a89c78' },
};

/** Collection and menu order: the default first. */
export const DESIGN_ORDER: TableDesign[] = ['plain', 'saints', 'spirits', 'chain', 'goofy', 'gummy', 'pitch', 'larks', 'deco', 'retro', 'scribble', 'cans'];

export const W = 288;
export const H = 144;

// ------------------------------------------------------------- helpers

function grain(x: Ctx, rnd: Rnd, base: string, light: string, dark: string, n = 90): void {
  x.fillStyle = base;
  x.fillRect(0, 0, W, H);
  for (let k = 0; k < n; k++) {
    x.strokeStyle = k % 3 ? dark : light;
    x.globalAlpha = 0.18 + rnd() * 0.25;
    x.lineWidth = 1;
    const y0 = rnd() * H;
    const amp = 2 + rnd() * 5;
    const ph = rnd() * 6;
    x.beginPath();
    for (let u = 0; u <= W; u += 8) {
      const y = y0 + Math.sin(u / 40 + ph) * amp;
      u ? x.lineTo(u, y) : x.moveTo(u, y);
    }
    x.stroke();
  }
  x.globalAlpha = 1;
}

function specks(x: Ctx, rnd: Rnd, col: string, n: number, alpha = 0.45): void {
  x.fillStyle = col;
  for (let k = 0; k < n; k++) {
    x.globalAlpha = alpha * (0.4 + rnd() * 0.6);
    x.fillRect(Math.round(rnd() * W), Math.round(rnd() * H), 1 + Math.round(rnd() * 2), 1);
  }
  x.globalAlpha = 1;
}

function scratches(x: Ctx, rnd: Rnd, col: string, n: number): void {
  x.strokeStyle = col;
  x.lineWidth = 1;
  for (let k = 0; k < n; k++) {
    x.globalAlpha = 0.2 + rnd() * 0.35;
    const u = rnd() * W;
    const v = rnd() * H;
    const a = rnd() * Math.PI;
    const l = 4 + rnd() * 22;
    x.beginPath();
    x.moveTo(u, v);
    x.lineTo(u + Math.cos(a) * l, v + Math.sin(a) * l);
    x.stroke();
  }
  x.globalAlpha = 1;
}

function frame(x: Ctx, col: string, w: number, inset = 0): void {
  x.fillStyle = col;
  x.fillRect(inset, inset, W - 2 * inset, w);
  x.fillRect(inset, H - inset - w, W - 2 * inset, w);
  x.fillRect(inset, inset, w, H - 2 * inset);
  x.fillRect(W - inset - w, inset, w, H - 2 * inset);
}

/** Text centered at (u, v), turned by `rot`, optionally outlined. */
function text(x: Ctx, s: string, u: number, v: number, rot: number, font: string, fill: string, outline?: string, ow = 3): void {
  x.save();
  x.translate(u, v);
  x.rotate(rot);
  x.font = font;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  if (outline) {
    x.lineJoin = 'round';
    x.lineWidth = ow;
    x.strokeStyle = outline;
    x.strokeText(s, 0, 0);
  }
  x.fillStyle = fill;
  x.fillText(s, 0, 0);
  x.restore();
}

function path(x: Ctx, pts: [number, number][], close = true): void {
  x.beginPath();
  pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
  if (close) x.closePath();
}

function fillOutline(x: Ctx, fill: string, outline: string, w = 2): void {
  x.fillStyle = fill;
  x.fill();
  x.lineJoin = 'round';
  x.lineWidth = w;
  x.strokeStyle = outline;
  x.stroke();
}

// --------------------------------------------------------------- designs

/** Dark, worn wood with a thin gold-ochre trim, center ticks and a small ΖΨ at each end. */
function plain(x: Ctx, rnd: Rnd): void {
  grain(x, rnd, '#3b2516', '#6a4428', '#24160c', 120);
  // Lighter worn patches where the cups sit and hands rest.
  for (const [u, v, r] of [[60, 72, 34], [228, 72, 34], [150, 60, 40]] as const) {
    const g = x.createRadialGradient(u, v, 2, u, v, r);
    g.addColorStop(0, 'rgba(120, 78, 44, 0.35)');
    g.addColorStop(1, 'rgba(120, 78, 44, 0)');
    x.fillStyle = g;
    x.fillRect(u - r, v - r, 2 * r, 2 * r);
  }
  scratches(x, rnd, '#a8906a', 38);
  specks(x, rnd, '#d8cbb0', 140, 0.5);
  frame(x, '#b8902e', 3);
  x.fillStyle = '#b8902e';
  x.fillRect(W / 2 - 1, 3, 3, 6);
  x.fillRect(W / 2 - 1, H - 9, 3, 6);
  text(x, 'ΖΨ', 22, H / 2, Math.PI / 2, 'bold 14px serif', 'rgba(200, 160, 70, 0.75)');
  text(x, 'ΖΨ', W - 22, H / 2, -Math.PI / 2, 'bold 14px serif', 'rgba(200, 160, 70, 0.75)');
}

/** Bright orange, a red sun, gold ΖΨ, a red jug, a blue swoosh, a sword and the Get Goofy mug. */
function goofy(x: Ctx, rnd: Rnd): void {
  const ink = '#1c1410';
  x.fillStyle = '#f08e3c';
  x.fillRect(0, 0, W, H);
  specks(x, rnd, '#c86a22', 220, 0.4);
  // A soft red sun near Team B's end.
  const g = x.createRadialGradient(236, 108, 4, 236, 108, 38);
  g.addColorStop(0, 'rgba(225, 70, 70, 0.9)');
  g.addColorStop(1, 'rgba(225, 70, 70, 0)');
  x.fillStyle = g;
  x.fillRect(190, 60, 98, 84);
  // A big blue cape sweeping up across Team A's half, with a lighter inner fold.
  x.beginPath();
  x.moveTo(8, 140);
  x.quadraticCurveTo(4, 70, 40, 34);
  x.quadraticCurveTo(70, 8, 104, 6);
  x.quadraticCurveTo(66, 30, 70, 70);
  x.quadraticCurveTo(74, 110, 104, 140);
  x.closePath();
  fillOutline(x, '#2a58a0', ink);
  x.beginPath();
  x.moveTo(22, 136);
  x.quadraticCurveTo(20, 80, 48, 48);
  x.quadraticCurveTo(62, 32, 78, 24);
  x.quadraticCurveTo(54, 56, 58, 92);
  x.quadraticCurveTo(62, 120, 80, 138);
  x.closePath();
  x.fillStyle = '#4a86c8';
  x.fill();
  // A red coat panel and gold trim over the cape (worn paint showing the orange).
  x.beginPath();
  x.roundRect(44, 70, 34, 56, 4);
  fillOutline(x, '#c8302a', ink);
  x.fillStyle = '#e8d6a0';
  for (let k = 0; k < 5; k++) x.fillRect(48 + k * 6, 98, 4, 10);
  specks(x, rnd, '#f08e3c', 90, 0.7);
  // The gray mug with "Get Goofy".
  x.beginPath();
  x.roundRect(98, 18, 34, 40, 6);
  fillOutline(x, '#a8acaa', ink);
  path(x, [[132, 28], [142, 30], [142, 46], [132, 48]], false);
  x.lineWidth = 3;
  x.strokeStyle = ink;
  x.stroke();
  text(x, 'Get', 115, 32, 0, 'bold 9px sans-serif', ink);
  text(x, 'Goofy', 115, 44, 0, 'bold 9px sans-serif', ink);
  // A sword along the near edge.
  path(x, [[30, 132], [128, 120]], false);
  x.lineWidth = 4;
  x.strokeStyle = ink;
  x.stroke();
  x.lineWidth = 2;
  x.strokeStyle = '#b6bcc0';
  x.stroke();
  x.beginPath();
  x.arc(30, 132, 7, 0, Math.PI * 2);
  fillOutline(x, '#8a8e90', ink);
  // Red jugs with a ΖΨ label.
  const jug = (u: number, v: number, rot: number) => {
    x.save();
    x.translate(u, v);
    x.rotate(rot);
    x.beginPath();
    x.roundRect(-11, -14, 22, 28, 4);
    fillOutline(x, '#c8302a', ink);
    x.fillStyle = '#3d6fb0';
    x.fillRect(-4, -20, 8, 7);
    x.beginPath();
    x.arc(0, 2, 7, 0, Math.PI * 2);
    fillOutline(x, '#f2c230', ink, 1);
    text(x, 'ΖΨ', 0, 2, 0, 'bold 7px serif', ink);
    x.restore();
  };
  jug(160, 92, 0.5);
  jug(250, 28, -0.3);
  // Gold ΖΨ in the middle, read from the side.
  text(x, 'Ζ', 196, 58, Math.PI / 2, 'bold 56px serif', '#f2c230', ink, 4);
  text(x, 'Ψ', 196, 104, Math.PI / 2, 'bold 52px serif', '#f2c230', ink, 4);
}

/** Black, tiled with wavy red, yellow, green and orange pieces in drifting bands; 26X in a corner. */
function gummy(x: Ctx, rnd: Rnd): void {
  x.fillStyle = '#101010';
  x.fillRect(0, 0, W, H);
  const cols = ['#e83a3a', '#f2d12a', '#1fae4e', '#f07a1e'];
  const step = 19;
  for (let row = 0; row * step * 0.86 < H + step; row++) {
    for (let col = 0; col * step < W + step; col++) {
      const u = col * step + (row % 2 ? step / 2 : 0);
      const v = row * step * 0.86;
      // Black channels wander diagonally across the top.
      const band = Math.sin(u / 34 - v / 22) + Math.sin(u / 71 + v / 37);
      if (band > 0.55 || rnd() < 0.05) continue;
      const c = cols[Math.floor(rnd() * cols.length)];
      x.fillStyle = c;
      x.beginPath();
      x.arc(u, v, step * 0.42, 0, Math.PI * 2);
      x.fill();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.3;
        x.beginPath();
        x.arc(u + Math.cos(a) * step * 0.42, v + Math.sin(a) * step * 0.42, step * 0.2, 0, Math.PI * 2);
        x.fill();
      }
      // A soft lighter middle (the faint stamped face).
      x.globalAlpha = 0.18;
      x.fillStyle = '#ffffff';
      x.beginPath();
      x.arc(u - 1, v - 1, step * 0.18, 0, Math.PI * 2);
      x.fill();
      x.globalAlpha = 1;
    }
  }
  text(x, '26X', 252, 124, 0, 'italic 18px serif', '#101010');
}

/** A striped soccer pitch: white lines, both boxes, the center circle, and the ball between Ψ and Ζ. */
function pitch(x: Ctx): void {
  const n = 12;
  for (let k = 0; k < n; k++) {
    x.fillStyle = k % 2 ? '#1f9c7e' : '#0f6650';
    x.fillRect(Math.floor((k * W) / n), 0, Math.ceil(W / n) + 1, H);
  }
  const line = '#ece4c8';
  x.strokeStyle = line;
  x.lineWidth = 2;
  const m = 8;
  x.strokeRect(m, m, W - 2 * m, H - 2 * m);
  x.beginPath();
  x.moveTo(W / 2, m);
  x.lineTo(W / 2, H - m);
  x.stroke();
  for (const end of [0, 1]) {
    const s = end ? -1 : 1;
    const ex = end ? W - m : m;
    x.strokeRect(Math.min(ex, ex + s * 46), H / 2 - 40, 46, 80);
    x.strokeRect(Math.min(ex, ex + s * 18), H / 2 - 20, 18, 40);
    x.beginPath();
    x.arc(ex + s * 46, H / 2, 14, end ? Math.PI / 2 : -Math.PI / 2, end ? (Math.PI * 3) / 2 : Math.PI / 2);
    x.stroke();
    x.fillStyle = line;
    x.beginPath();
    x.arc(ex + s * 34, H / 2, 2, 0, Math.PI * 2);
    x.fill();
    // Corner arcs, inside the field only.
    x.save();
    x.beginPath();
    x.rect(m, m, W - 2 * m, H - 2 * m);
    x.clip();
    for (const cy of [m, H - m]) {
      x.beginPath();
      x.arc(ex, cy, 7, 0, Math.PI * 2);
      x.stroke();
    }
    x.restore();
  }
  x.fillStyle = 'rgba(0,0,0,0)';
  // The ball: white with swirling blue, teal and orange panels.
  const bu = W / 2;
  const bv = H / 2;
  x.beginPath();
  x.arc(bu, bv, 22, 0, Math.PI * 2);
  fillOutline(x, '#efe8d8', '#2a3a6a', 1);
  x.save();
  x.beginPath();
  x.arc(bu, bv, 21, 0, Math.PI * 2);
  x.clip();
  const swirl = (rot: number, col: string) => {
    x.save();
    x.translate(bu, bv);
    x.rotate(rot);
    x.strokeStyle = col;
    x.lineWidth = 5;
    x.beginPath();
    x.moveTo(-4, -22);
    x.bezierCurveTo(14, -12, -10, -2, 8, 10);
    x.stroke();
    x.restore();
  };
  [0, 1.05, 2.1, 3.15, 4.2, 5.25].forEach((r, i) => swirl(r, ['#2a4aa8', '#e06a24', '#6ac2c0'][i % 3]));
  x.fillStyle = '#2a4aa8';
  x.beginPath();
  x.arc(bu, bv, 6, 0, Math.PI * 2);
  x.fill();
  x.restore();
  text(x, 'Ψ', bu - 44, bv, 0, 'bold 26px serif', '#e9c24a');
  text(x, 'Ζ', bu + 44, bv, 0, 'bold 26px serif', '#e9c24a');
  // Scuffs near the goal mouths.
  for (const u of [26, W - 26]) {
    const g = x.createRadialGradient(u, bv, 1, u, bv, 18);
    g.addColorStop(0, 'rgba(40, 24, 12, 0.5)');
    g.addColorStop(1, 'rgba(40, 24, 12, 0)');
    x.fillStyle = g;
    x.fillRect(u - 18, bv - 18, 36, 36);
  }
}

/** Black with gray drips, a gold calligraphy line, a yellow bird in flight and red poppies. */
function larks(x: Ctx, rnd: Rnd): void {
  x.fillStyle = '#141412';
  x.fillRect(0, 0, W, H);
  // Pale drips running down from the top.
  for (let k = 0; k < 70; k++) {
    const u = 10 + rnd() * (W - 20);
    const v0 = 30 + rnd() * 30;
    const l = 20 + rnd() * 70;
    x.strokeStyle = k % 5 ? 'rgba(150, 150, 140, 0.22)' : 'rgba(120, 200, 190, 0.22)';
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(u, v0);
    x.lineTo(u + (rnd() - 0.5) * 2, v0 + l);
    x.stroke();
  }
  specks(x, rnd, '#5a5a54', 120, 0.4);
  text(x, 'The larks, still bravely singing, fly', W / 2, 22, 0, 'italic bold 15px serif', '#e3c34a', '#5a4410', 1);
  // The bird, wings spread.
  x.fillStyle = '#d8e04a';
  path(x, [[144, 56], [150, 62], [152, 74], [182, 58], [204, 56], [176, 72], [156, 82], [158, 96], [150, 104], [142, 104], [134, 96], [136, 82], [116, 72], [88, 56], [110, 58], [140, 74], [140, 62]]);
  x.fill();
  // Poppies.
  const poppy = (u: number, v: number, r: number) => {
    x.strokeStyle = '#2e6a30';
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(u, v + r);
    x.lineTo(u + 1, v + r + 18);
    x.stroke();
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      x.fillStyle = k % 2 ? '#a8201c' : '#c22a24';
      x.beginPath();
      x.arc(u + Math.cos(a) * r * 0.5, v + Math.sin(a) * r * 0.5, r * 0.62, 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = '#1a0808';
    x.beginPath();
    x.arc(u, v, r * 0.22, 0, Math.PI * 2);
    x.fill();
  };
  poppy(22, 108, 8);
  poppy(40, 100, 7);
  poppy(232, 104, 8);
  poppy(250, 116, 7);
  poppy(266, 106, 8);
}

/** Black with gold art-deco geometry, mirrored about the middle, around an octagon with ΖΨ. */
function deco(x: Ctx): void {
  const gold = '#c9a33a';
  x.fillStyle = '#0e0e0e';
  x.fillRect(0, 0, W, H);
  x.strokeStyle = gold;
  x.lineCap = 'square';
  const seg = (pts: [number, number][], w = 3) => {
    x.lineWidth = w;
    for (const mirror of [false, true]) {
      path(x, pts.map(([u, v]) => [mirror ? W - u : u, v] as [number, number]), false);
      x.stroke();
    }
  };
  frame(x, gold, 3, 3);
  // Outer stepped columns.
  seg([[20, 10], [20, 134]], 4);
  seg([[34, 10], [34, 60], [52, 78], [52, 134]]);
  seg([[8, 70], [34, 96], [8, 122]]);
  seg([[8, 30], [30, 52]], 2);
  seg([[8, 40], [24, 56]], 2);
  // The stepped "towers" either side of the middle.
  for (const k of [0, 1, 2]) seg([[62 + k * 6, 112 - k * 0], [62 + k * 6, 20 + k * 6], [98 - k * 6, 20 + k * 6], [98 - k * 6, 112]], 2);
  seg([[80, 38], [80, 134]], 2);
  seg([[58, 120], [102, 120]], 3);
  seg([[106, 10], [106, 90], [126, 90], [126, 134]], 4);
  // The middle: a lattice of diagonals, a T and the crest.
  x.lineWidth = 2;
  for (let k = -4; k <= 4; k++) {
    path(x, [[W / 2 + k * 12 - 30, 8], [W / 2 + k * 12 + 30, 68]], false);
    x.stroke();
    path(x, [[W / 2 + k * 12 + 30, 8], [W / 2 + k * 12 - 30, 68]], false);
    x.stroke();
  }
  x.fillStyle = '#0e0e0e';
  x.fillRect(W / 2 - 50, 82, 100, 52);
  seg([[W / 2 - 46, 86], [W / 2 - 4, 86]], 4);
  seg([[W / 2 - 46, 86], [W / 2 - 46, 104], [W / 2 - 12, 104], [W / 2 - 12, 134]], 4);
  // Crest: an octagon with ΖΨ.
  const r = 22;
  const oct = Array.from({ length: 8 }, (_, i) => [W / 2 + Math.cos(Math.PI / 8 + (i * Math.PI) / 4) * r * 1.25, 40 + Math.sin(Math.PI / 8 + (i * Math.PI) / 4) * r] as [number, number]);
  path(x, oct);
  x.fillStyle = '#0e0e0e';
  x.fill();
  x.lineWidth = 3;
  x.stroke();
  text(x, 'ΨΖ', W / 2, 41, 0, 'bold 20px serif', gold);
}

/** Bare wood with a cream border and a big slanted two-color ZETA PSI. */
function retro(x: Ctx, rnd: Rnd): void {
  grain(x, rnd, '#9a6226', '#c08a44', '#6e4214', 100);
  scratches(x, rnd, '#3a2410', 40);
  frame(x, '#e6dab4', 7);
  x.fillStyle = '#e6dab4';
  x.fillRect(W / 2 - 1, 7, 2, 6);
  x.fillRect(W / 2 - 1, H - 13, 2, 6);
  x.fillRect(30, H / 2 - 1, 12, 2);
  x.fillRect(W - 42, H / 2 - 1, 12, 2);
  const slant = (s: string, u: number, v: number, size: number, fill: string) => {
    x.save();
    x.translate(u, v);
    x.transform(1, 0, -0.35, 1, 0, 0);
    x.font = `900 ${size}px sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineJoin = 'miter';
    x.lineWidth = 5;
    x.strokeStyle = '#efe3c0';
    x.strokeText(s, 0, 0);
    x.fillStyle = fill;
    x.fillText(s, 0, 0);
    x.restore();
  };
  slant('PSI', 156, 50, 34, '#d2401e');
  slant('ZETA', 166, 92, 48, '#22508e');
}

/** Cream, covered in wild brushstrokes, an arch and two bars. */
function scribble(x: Ctx, rnd: Rnd): void {
  x.fillStyle = '#e4d9bc';
  x.fillRect(0, 0, W, H);
  specks(x, rnd, '#b8a888', 200, 0.4);
  const cols = ['#161616', '#161616', '#d02a20', '#2a9a3a', '#2a4aa0', '#6a3a9a', '#46c04a'];
  const stroke = (u: number, v: number, l: number, w: number, col: string) => {
    x.strokeStyle = col;
    x.lineWidth = w;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(u, v);
    let a = rnd() * Math.PI * 2;
    let pu = u;
    let pv = v;
    for (let k = 0; k < 4; k++) {
      a += (rnd() - 0.5) * 2;
      pu += Math.cos(a) * l;
      pv += Math.sin(a) * l;
      x.lineTo(pu, pv);
    }
    x.stroke();
  };
  for (let k = 0; k < 160; k++) stroke(rnd() * W, rnd() * H, 3 + rnd() * 7, 1 + rnd() * 3, cols[Math.floor(rnd() * cols.length)]);
  // Two dark bursts.
  for (const [u, v] of [[120, 40], [170, 96]] as const) for (let k = 0; k < 40; k++) stroke(u + (rnd() - 0.5) * 30, v + (rnd() - 0.5) * 20, 5 + rnd() * 8, 2 + rnd() * 2, '#141414');
  // The green patch, the arch and the bars.
  x.globalAlpha = 0.85;
  for (let k = 0; k < 60; k++) stroke(190 + rnd() * 90, 104 + rnd() * 36, 6, 4, '#48b848');
  x.globalAlpha = 1;
  x.strokeStyle = '#141414';
  x.lineWidth = 5;
  x.beginPath();
  x.arc(52, 74, 30, Math.PI * 1.05, Math.PI * 1.95);
  x.stroke();
  x.fillStyle = '#141414';
  x.fillRect(46, 80, 5, 40);
  x.fillRect(58, 80, 5, 40);
}

/** Eight cans on color blocks, two rows of four. */
function cans(x: Ctx, rnd: Rnd): void {
  const blocks = ['#d8402a', '#7ed0c0', '#f0c630', '#7ed0c0', '#efe4c4', '#f0c630', '#efe4c4', '#b8401c'];
  const canBody = ['#284a8a', '#9ed8d0', '#efe8d8', '#5ab040', '#6a3a8a', '#1e3a6a', '#3a9a3a', '#8ac0c8'];
  const canMark = ['#efe4c4', '#7a3a8a', '#141414', '#e0401e', '#f0c630', '#7ed0c0', '#1e3a6a', '#f0c630'];
  const bw = W / 4;
  const bh = H / 2;
  for (let i = 0; i < 8; i++) {
    const u0 = (i % 4) * bw;
    const v0 = Math.floor(i / 4) * bh;
    x.fillStyle = blocks[i];
    x.fillRect(u0, v0, bw + 1, bh + 1);
    specks(x, rnd, '#ffffff', 10, 0.25);
    // A can, standing along the table, with its top towards Team B.
    const cu = u0 + bw / 2;
    const cv = v0 + bh / 2;
    x.save();
    x.translate(cu, cv);
    x.rotate(-Math.PI / 2);
    x.beginPath();
    x.roundRect(-26, -13, 52, 26, 6);
    fillOutline(x, canBody[i], '#141414', 1.5);
    // The wordmark, as two chunky slanted bars (no real brand).
    x.fillStyle = canMark[i];
    x.save();
    x.transform(1, 0, -0.4, 1, 0, 0);
    x.fillRect(-16, -8, 30, 6);
    x.fillRect(-12, 1, 30, 7);
    x.restore();
    x.beginPath();
    x.ellipse(26, 0, 3.5, 12, 0, 0, Math.PI * 2);
    fillOutline(x, i % 3 ? '#9ed8b0' : '#e06a2a', '#141414', 1);
    x.restore();
    if (i === 0) text(x, 'ΖΨ', cu - 4, cv + 14, -Math.PI / 2, 'bold 8px serif', '#efe4c4');
  }
}

/** Paint a design (not one of the original three) onto a 288 x 144 canvas. */
export function paintDesign(x: Ctx, id: TableDesign, rnd: Rnd): boolean {
  switch (id) {
    case 'plain':
      plain(x, rnd);
      return true;
    case 'goofy':
      goofy(x, rnd);
      return true;
    case 'gummy':
      gummy(x, rnd);
      return true;
    case 'pitch':
      pitch(x);
      return true;
    case 'larks':
      larks(x, rnd);
      return true;
    case 'deco':
      deco(x);
      return true;
    case 'retro':
      retro(x, rnd);
      return true;
    case 'scribble':
      scribble(x, rnd);
      return true;
    case 'cans':
      cans(x, rnd);
      return true;
    default:
      return false;
  }
}
