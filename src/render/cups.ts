// Cup styles and drinks: a look each player picks for the cups on their screen
// (saved in their browser; it doesn't change play). Clear plastic, red and blue
// party cups and a stemmed wine glass; water, lager, stout and red wine.

import type { GameConfig } from '../config';
import type { Cup } from '../core/types';
import type { Theme } from '../theme';
import { lookAt, type Camera } from './camera';
import { screenEllipse } from './prims';

export type CupStyle = 'clear' | 'redSolo' | 'blueSolo' | 'wine';
export type Drink = 'water' | 'beer' | 'stout' | 'redWine';

export const CUP_STYLES: { id: CupStyle; name: string }[] = [
  { id: 'clear', name: 'Clear plastic' },
  { id: 'redSolo', name: 'Red party cup' },
  { id: 'blueSolo', name: 'Blue party cup' },
  { id: 'wine', name: 'Wine glass' },
];
export const DRINKS: { id: Drink; name: string }[] = [
  { id: 'water', name: 'Water' },
  { id: 'beer', name: 'Lager' },
  { id: 'stout', name: 'Stout' },
  { id: 'redWine', name: 'Red wine' },
];

export interface CupLook {
  style: CupStyle;
  drink: Drink;
}

export const DEFAULT_CUP_LOOK: CupLook = { style: 'clear', drink: 'water' };

export function cleanCupLook(v: unknown): CupLook {
  const o = (v ?? {}) as Partial<CupLook>;
  return {
    style: CUP_STYLES.some((s) => s.id === o.style) ? (o.style as CupStyle) : 'clear',
    drink: DRINKS.some((d) => d.id === o.drink) ? (o.drink as Drink) : 'water',
  };
}

let current: CupLook = { ...DEFAULT_CUP_LOOK };
/** The look the game draws cups with on this screen. */
export function setCupLook(l: CupLook): void {
  current = cleanCupLook(l);
}
export function cupLook(): CupLook {
  return current;
}

interface DrinkInk {
  /** The liquid seen through a clear side. */
  body: string;
  /** Its surface (the foam head for beers). */
  top: string;
  shine: string;
  /** A foam band just under the surface (beers). */
  foam: string | null;
  drop: string;
  dropLight: string;
}

export const DRINK_INK: Record<Drink, DrinkInk> = {
  water: { body: 'rgba(170, 215, 240, 0.42)', top: 'rgba(200, 235, 250, 0.7)', shine: '#f2fbff', foam: null, drop: '#9fd8ff', dropLight: '#e6f6ff' },
  beer: { body: 'rgba(232, 158, 34, 0.78)', top: '#fbf3dc', shine: '#ffffff', foam: 'rgba(250, 240, 214, 0.92)', drop: '#f2b640', dropLight: '#fff3cc' },
  stout: { body: 'rgba(28, 15, 8, 0.92)', top: '#dcbc8c', shine: '#f7ead0', foam: 'rgba(214, 182, 134, 0.95)', drop: '#4a2c16', dropLight: '#dcbc8c' },
  redWine: { body: 'rgba(116, 10, 32, 0.82)', top: 'rgba(150, 20, 46, 0.95)', shine: '#f0a8b8', foam: null, drop: '#8a1028', dropLight: '#e05a78' },
};

const SOLO = {
  redSolo: { base: '#c62a20', light: '#ee5544', dark: '#86160f', lip: '#e0483a' },
  blueSolo: { base: '#2552c4', light: '#5a86ee', dark: '#152f86', lip: '#4672e0' },
};

type Ell = { x: number; y: number; rx: number; ry: number };

/** A tapered body between two horizontal ellipses (front half of the bottom one). */
function taper(h: CanvasRenderingContext2D, a: Ell, b: Ell): void {
  h.beginPath();
  h.moveTo(a.x - a.rx, a.y);
  h.lineTo(b.x - b.rx, b.y);
  h.ellipse(b.x, b.y, b.rx, b.ry, 0, Math.PI, 0, true);
  h.lineTo(a.x + a.rx, a.y);
  h.ellipse(a.x, a.y, a.rx, a.ry, 0, 0, Math.PI, true);
  h.closePath();
}

/** A body through several stacked ellipses, top first (for the curved wine bowl). */
function profile(h: CanvasRenderingContext2D, rings: Ell[]): void {
  const top = rings[0];
  const bot = rings[rings.length - 1];
  h.beginPath();
  h.moveTo(top.x - top.rx, top.y);
  for (const e of rings) h.lineTo(e.x - e.rx, e.y);
  h.ellipse(bot.x, bot.y, bot.rx, bot.ry, 0, Math.PI, 0, true);
  for (let i = rings.length - 1; i >= 0; i--) h.lineTo(rings[i].x + rings[i].rx, rings[i].y);
  h.ellipse(top.x, top.y, top.rx, top.ry, 0, 0, Math.PI, true);
  h.closePath();
}

function edges(h: CanvasRenderingContext2D, rings: Ell[], lit: string, shade: string): void {
  h.lineWidth = 1;
  h.strokeStyle = lit;
  h.beginPath();
  rings.forEach((e, i) => (i ? h.lineTo(e.x - e.rx, e.y) : h.moveTo(e.x - e.rx, e.y)));
  h.stroke();
  h.strokeStyle = shade;
  h.beginPath();
  rings.forEach((e, i) => (i ? h.lineTo(e.x + e.rx, e.y) : h.moveTo(e.x + e.rx, e.y)));
  h.stroke();
}

function fillEllipse(h: CanvasRenderingContext2D, e: Ell, color: string): void {
  h.fillStyle = color;
  h.beginPath();
  h.ellipse(e.x, e.y, e.rx, e.ry, 0, 0, Math.PI * 2);
  h.fill();
}

/** Draw one cup in the chosen look (shadow, body, drink, rim). */
export function drawStyledCup(h: CanvasRenderingContext2D, theme: Theme, cfg: Pick<GameConfig, 'cups' | 'physics' | 'table'>, cam: Camera, cup: Pick<Cup, 'x' | 'y' | 'state'>, look: CupLook = current): void {
  const C = theme.cup;
  const ink = DRINK_INK[look.drink];
  const r = cfg.cups.diameter / 2;
  const H = cfg.physics.cupHeight;
  const at = (z: number, rad: number) => screenEllipse(cam, { x: cup.x, y: cup.y, z }, rad);
  const full = cup.state === 'full';
  // Soft shadow, cast away from the middle of the room.
  const dx = cup.x - cfg.table.length / 2;
  const dy = cup.y - cfg.table.width / 2;
  const dl = Math.hypot(dx, dy) || 1;
  const sh = screenEllipse(cam, { x: cup.x + (dx / dl) * 0.025, y: cup.y + (dy / dl) * 0.025, z: 0.001 }, r * (look.style === 'wine' ? 0.75 : 1.02));
  if (sh) fillEllipse(h, sh, C.shadow);

  if (look.style === 'wine') {
    const zb = H * 0.42;
    const R = (t: number) => (r * (0.16 + Math.sin(Math.min(1, t) * Math.PI * 0.6))) / (0.16 + Math.sin(Math.PI * 0.6));
    const rings: Ell[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = 1 - i / 8;
      const e = at(zb + (H - zb) * t, R(t));
      if (!e) return;
      rings.push(e);
    }
    // Foot and stem.
    const foot = at(0.002, r * 0.62);
    const footTop = at(0.006, r * 0.6);
    if (foot && footTop) {
      fillEllipse(h, foot, C.glassShade);
      fillEllipse(h, footTop, C.glass);
      h.strokeStyle = C.glassEdge;
      h.lineWidth = 1;
      h.beginPath();
      h.ellipse(foot.x, foot.y, foot.rx, foot.ry, 0, 0, Math.PI);
      h.stroke();
      const bowl = rings[rings.length - 1];
      h.lineWidth = Math.max(1, Math.round(foot.rx * 0.09));
      h.strokeStyle = C.glassEdge;
      h.beginPath();
      h.moveTo(Math.round(foot.x) + 0.5, footTop.y);
      h.lineTo(Math.round(bowl.x) + 0.5, bowl.y);
      h.stroke();
    }
    h.fillStyle = C.glass;
    profile(h, rings);
    h.fill();
    // The drink fills the bottom of the bowl.
    const level = full ? 0.6 : 0.3;
    const liq: Ell[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = level * (1 - i / 6);
      const e = at(zb + (H - zb) * t, R(t) * 0.93);
      if (e) liq.push(e);
    }
    if (liq.length > 1) {
      h.fillStyle = ink.body;
      profile(h, liq);
      h.fill();
      fillEllipse(h, liq[0], ink.top);
      h.fillStyle = ink.shine;
      h.fillRect(Math.round(liq[0].x - liq[0].rx * 0.5), Math.round(liq[0].y - liq[0].ry * 0.3), Math.max(1, Math.round(liq[0].rx * 0.3)), 1);
    }
    edges(h, rings, C.glassEdge, C.glassShade);
    h.strokeStyle = C.rim;
    h.lineWidth = 1;
    h.beginPath();
    h.ellipse(rings[0].x, rings[0].y, rings[0].rx, rings[0].ry, 0, 0, Math.PI * 2);
    h.stroke();
    return;
  }

  const rb = r * 0.72;
  const radiusAt = (z: number) => rb + (r - rb) * (z / H);
  const top = at(H, r);
  const bot = at(0, rb);
  if (!top || !bot) return;
  const zw = H * (full ? 0.62 : 0.28);
  const wat = at(zw, radiusAt(zw) * 0.94);

  if (look.style === 'redSolo' || look.style === 'blueSolo') {
    const S = SOLO[look.style];
    h.fillStyle = S.base;
    taper(h, top, bot);
    h.fill();
    // A lit band down the left, a shaded band down the right.
    const band = (k0: number, k1: number, color: string) => {
      h.fillStyle = color;
      h.beginPath();
      h.moveTo(top.x + top.rx * k0, top.y);
      h.lineTo(bot.x + bot.rx * k0, bot.y + bot.ry * Math.sqrt(Math.max(0, 1 - k0 * k0)));
      h.lineTo(bot.x + bot.rx * k1, bot.y + bot.ry * Math.sqrt(Math.max(0, 1 - k1 * k1)));
      h.lineTo(top.x + top.rx * k1, top.y);
      h.closePath();
      h.fill();
    };
    band(-0.75, -0.35, S.light);
    band(0.55, 1, S.dark);
    // The party cup's ridges: two near the bottom, one under the rim.
    h.lineWidth = 1;
    for (const z of [0.12, 0.24, 0.86]) {
      const e = at(H * z, radiusAt(H * z));
      if (!e) continue;
      h.strokeStyle = S.dark;
      h.beginPath();
      h.ellipse(e.x, e.y, e.rx, e.ry, 0, Math.PI * 0.05, Math.PI * 0.95);
      h.stroke();
    }
    // Looking in: white inside, the drink at its level (clipped to the mouth).
    h.save();
    h.beginPath();
    h.ellipse(top.x, top.y, top.rx, top.ry, 0, 0, Math.PI * 2);
    h.clip();
    fillEllipse(h, top, '#f3efe6');
    h.fillStyle = 'rgba(0, 0, 0, 0.12)';
    h.fillRect(top.x, top.y - top.ry, top.rx, top.ry * 2);
    if (wat) {
      fillEllipse(h, wat, ink.foam ? ink.top : ink.body.replace(/[\d.]+\)$/, '1)'));
      if (!ink.foam) fillEllipse(h, { ...wat, rx: wat.rx * 0.98, ry: wat.ry * 0.96 }, ink.top);
      h.fillStyle = ink.shine;
      h.fillRect(Math.round(wat.x - wat.rx * 0.5), Math.round(wat.y - wat.ry * 0.3), Math.max(1, Math.round(wat.rx * 0.3)), 1);
    }
    h.restore();
    // Rolled lip.
    h.lineWidth = Math.max(1.5, top.ry * 0.35);
    h.strokeStyle = S.lip;
    h.beginPath();
    h.ellipse(top.x, top.y, top.rx, top.ry, 0, 0, Math.PI * 2);
    h.stroke();
    h.lineWidth = 1;
    h.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    h.beginPath();
    h.ellipse(top.x, top.y - 0.5, top.rx * 0.97, top.ry * 0.9, 0, Math.PI * 1.1, Math.PI * 1.6);
    h.stroke();
    return;
  }

  // Clear plastic: a faint body you can see the drink through.
  h.fillStyle = C.glass;
  taper(h, top, bot);
  h.fill();
  if (wat) {
    const wb = { ...bot, rx: bot.rx * 0.94, ry: bot.ry * 0.94 };
    h.fillStyle = ink.body;
    taper(h, wat, wb);
    h.fill();
    if (ink.foam) {
      const zf = zw - H * 0.08;
      const fb = at(zf, radiusAt(zf) * 0.94);
      if (fb) {
        h.fillStyle = ink.foam;
        taper(h, wat, fb);
        h.fill();
      }
    }
    fillEllipse(h, wat, ink.top);
    h.fillStyle = ink.shine;
    h.fillRect(Math.round(wat.x - wat.rx * 0.5), Math.round(wat.y - wat.ry * 0.3), Math.max(1, Math.round(wat.rx * 0.35)), 1);
  }
  edges(h, [top, bot], C.glassEdge, C.glassShade);
  h.strokeStyle = C.glassEdge;
  h.globalAlpha = 0.6;
  h.beginPath();
  h.moveTo(top.x - top.rx * 0.5, top.y + top.ry);
  h.lineTo(bot.x - bot.rx * 0.5, bot.y + bot.ry * 0.6);
  h.stroke();
  h.globalAlpha = 1;
  for (const z of [0.18, 0.82]) {
    const e = at(H * z, radiusAt(H * z));
    if (!e) continue;
    h.strokeStyle = C.glassShade;
    h.beginPath();
    h.ellipse(e.x, e.y, e.rx, e.ry, 0, Math.PI, 0, true);
    h.stroke();
  }
  h.strokeStyle = C.glassShade;
  h.beginPath();
  h.ellipse(bot.x, bot.y, bot.rx, bot.ry, 0, Math.PI, 0, true);
  h.stroke();
  h.strokeStyle = C.rim;
  h.beginPath();
  h.ellipse(top.x, top.y, top.rx, top.ry, 0, 0, Math.PI * 2);
  h.stroke();
}

/** A small picture of a cup in a look, for the picker (drawn small; show it scaled up, pixelated). */
export function cupIcon(theme: Theme, cfg: Pick<GameConfig, 'cups' | 'physics' | 'table'>, look: CupLook, w = 36, hgt = 40): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hgt;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const H = cfg.physics.cupHeight;
  const cam = lookAt({ x: -0.34, y: 0, z: H + 0.16 }, { x: 0, y: 0, z: H * 0.45 }, 26, w, hgt);
  const sized = { ...cfg, table: { ...cfg.table, length: 0, width: 0 } };
  drawStyledCup(g, theme, sized, cam, { x: 0, y: 0, state: 'full' }, look);
  return c;
}
