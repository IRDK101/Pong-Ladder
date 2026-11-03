// Drawing primitives for the 3D views: projected polygons, lines, boxes,
// rings, wall images and text bitmaps. World coordinates in, pixels out.

import type { Vec3 } from '../core/physics';
import { project, projectPolygon, type Camera } from './camera';

export function poly(b: CanvasRenderingContext2D, cam: Camera, pts: Vec3[], fill: string): void {
  const s = projectPolygon(cam, pts);
  if (s.length < 3) return;
  b.fillStyle = fill;
  b.beginPath();
  b.moveTo(s[0].x, s[0].y);
  for (let i = 1; i < s.length; i++) b.lineTo(s[i].x, s[i].y);
  b.closePath();
  b.fill();
}

export function line(b: CanvasRenderingContext2D, cam: Camera, a: Vec3, c: Vec3, color: string, width = 1): void {
  const s = projectPolygon(cam, [a, c, c]);
  if (s.length < 2) return;
  b.strokeStyle = color;
  b.lineWidth = width;
  b.beginPath();
  b.moveTo(s[0].x, s[0].y);
  b.lineTo(s[1].x, s[1].y);
  b.stroke();
}

/** A horizontal circle (ellipse on screen) as a polygon. */
export function disc(b: CanvasRenderingContext2D, cam: Camera, c: Vec3, r: number, fill: string, n = 14): void {
  const pts: Vec3[] = [];
  for (let i = 0; i < n; i++) pts.push({ x: c.x + Math.cos((i / n) * Math.PI * 2) * r, y: c.y + Math.sin((i / n) * Math.PI * 2) * r, z: c.z });
  poly(b, cam, pts, fill);
}

export function ring(b: CanvasRenderingContext2D, cam: Camera, c: Vec3, r: number, color: string, width = 1, n = 20): void {
  const pts: Vec3[] = [];
  for (let i = 0; i <= n; i++) pts.push({ x: c.x + Math.cos((i / n) * Math.PI * 2) * r, y: c.y + Math.sin((i / n) * Math.PI * 2) * r, z: c.z });
  const s = pts.map((p) => project(cam, p));
  b.strokeStyle = color;
  b.lineWidth = width;
  b.beginPath();
  let started = false;
  for (const p of s) {
    if (!p) {
      started = false;
      continue;
    }
    if (!started) b.moveTo(p.x, p.y);
    else b.lineTo(p.x, p.y);
    started = true;
  }
  b.stroke();
}

/** A box from (x0,y0,z0) to (x1,y1,z1), faces shaded, back faces skipped. */
export function box(b: CanvasRenderingContext2D, cam: Camera, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, top: string, side: string, front = side): void {
  const P = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
  const faces: [Vec3[], string, Vec3][] = [
    [[P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], top, P(0, 0, 1)],
    [[P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)], side, P(0, -1, 0)],
    [[P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], side, P(0, 1, 0)],
    [[P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)], front, P(-1, 0, 0)],
    [[P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], front, P(1, 0, 0)],
  ];
  for (const [pts, fill, n] of faces) {
    // Face is visible if the camera is on its outward side.
    const fc = pts.reduce((a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4, z: a.z + p.z / 4 }), P(0, 0, 0));
    const toCam = P(cam.eye.x - fc.x, cam.eye.y - fc.y, cam.eye.z - fc.z);
    if (toCam.x * n.x + toCam.y * n.y + toCam.z * n.z <= 0) continue;
    poly(b, cam, pts, fill);
  }
}


const textCache = new Map<string, HTMLCanvasElement>();
/**
 * Text rendered once to a small bitmap (lines split on \n), so it can be
 * painted onto a wall in perspective. An empty `shadow` draws no drop shadow.
 */
export function textBitmap(text: string, font: string, fill: string, shadow: string): HTMLCanvasElement {
  const key = `${text}|${font}|${fill}|${shadow}`;
  let c = textCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    const probe = c.getContext('2d')!;
    probe.font = font;
    const lines = text.split('\n');
    const size = parseInt(/(\d+)px/.exec(font)?.[1] ?? '16', 10);
    const lh = Math.round(size * 1.1);
    c.width = Math.max(16, Math.ceil(Math.max(...lines.map((l) => probe.measureText(l).width))) + 6);
    c.height = lh * lines.length + 4;
    const x = c.getContext('2d')!;
    x.font = font;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    lines.forEach((l, k) => {
      const y = 2 + lh * k + lh / 2;
      if (shadow) {
        x.fillStyle = shadow;
        x.fillText(l, c!.width / 2 + 1, y + 2);
      }
      x.fillStyle = fill;
      x.fillText(l, c!.width / 2, y);
    });
    textCache.set(key, c);
  }
  return c;
}

/** Paint an image onto a wall quad using the affine map of three projected corners. */
export function wallImage(b: CanvasRenderingContext2D, cam: Camera, img: HTMLCanvasElement, tl: Vec3, tr: Vec3, bl: Vec3): void {
  const a = project(cam, tl);
  const c = project(cam, tr);
  const d = project(cam, bl);
  if (!a || !c || !d) return;
  b.save();
  b.setTransform((c.x - a.x) / img.width, (c.y - a.y) / img.width, (d.x - a.x) / img.height, (d.y - a.y) / img.height, a.x, a.y);
  b.drawImage(img, 0, 0);
  b.restore();
}


/** Darken (<1) or lighten (>1) a #rrggbb color. */
export function shadeHex(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

const speckCache = new Map<string, { x: number; y: number; light: boolean }[]>();
/** Fixed random specks on the concrete floor. */
export function floorSpecks(x0: number, x1: number, y0: number, y1: number): { x: number; y: number; light: boolean }[] {
  const key = `${x0},${x1},${y0},${y1}`;
  let list = speckCache.get(key);
  if (!list) {
    let seed = 99;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    list = Array.from({ length: 1100 }, () => ({ x: x0 + rnd() * (x1 - x0), y: y0 + rnd() * (y1 - y0), light: rnd() < 0.5 }));
    speckCache.set(key, list);
  }
  return list;
}



/** Screen ellipse of a horizontal circle (center, radius) as seen by `cam`. */
export function screenEllipse(cam: Camera, c: Vec3, r: number): { x: number; y: number; rx: number; ry: number } | null {
  const p = project(cam, c);
  if (!p) return null;
  const fl = Math.hypot(cam.f.x, cam.f.y) || 1;
  const a = project(cam, { x: c.x + (cam.f.x / fl) * r, y: c.y + (cam.f.y / fl) * r, z: c.z });
  const b = project(cam, { x: c.x - (cam.f.x / fl) * r, y: c.y - (cam.f.y / fl) * r, z: c.z });
  const ry = a && b ? Math.abs(a.y - b.y) / 2 : r * p.scale * 0.4;
  return { x: p.x, y: (a && b ? (a.y + b.y) / 2 : p.y), rx: r * p.scale, ry: Math.max(0.5, ry) };
}


/** A point mapping (e.g. table-local or basement coordinates → the world). */
export type Xf = (p: Vec3) => Vec3;
export const IDENTITY: Xf = (p) => p;

/** box() for an axis-aligned box given in another frame (`xf` must be a rotation by quarter turns plus a shift). */
export function xbox(b: CanvasRenderingContext2D, cam: Camera, xf: Xf, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, top: string, side: string, front = side): void {
  const a = xf({ x: x0, y: y0, z: z0 });
  const c = xf({ x: x1, y: y1, z: z1 });
  box(b, cam, Math.min(a.x, c.x), Math.min(a.y, c.y), Math.min(a.z, c.z), Math.max(a.x, c.x), Math.max(a.y, c.y), Math.max(a.z, c.z), top, side, front);
}

/**
 * Map `img` onto a table top (z = 0, local x 0..L along the image width,
 * local y 0..W down its height) in perspective, as thin strips. `xf` places
 * the table in the world.
 */
export function texturedTop(h: CanvasRenderingContext2D, cam: Camera, img: HTMLCanvasElement, L: number, W: number, xf: Xf = IDENTITY, N = 48): void {
  const sw = img.width / N;
  const P = (x: number, y: number) => project(cam, xf({ x, y, z: 0 }));
  for (let i = 0; i < N; i++) {
    const xa = (i / N) * L;
    const xb = ((i + 1) / N) * L;
    // Each clip strip reaches a little into the next one, so no seams show between strips.
    const xc = Math.min(L, xb + (L / N) * 0.35);
    const tl = P(xa, 0);
    const tr = P(xb, 0);
    const bl = P(xa, W);
    const br = P(xb, W);
    const trc = P(xc, 0);
    const brc = P(xc, W);
    if (!tl || !tr || !bl || !br || !trc || !brc) continue;
    h.save();
    h.beginPath();
    h.moveTo(tl.x, tl.y);
    h.lineTo(trc.x, trc.y);
    h.lineTo(brc.x, brc.y);
    h.lineTo(bl.x, bl.y);
    h.closePath();
    h.clip();
    h.setTransform((tr.x - tl.x) / sw, (tr.y - tl.y) / sw, (bl.x - tl.x) / img.height, (bl.y - tl.y) / img.height, tl.x, tl.y);
    const span = Math.min(sw * 1.6, img.width - i * sw);
    h.drawImage(img, i * sw, 0, span, img.height, 0, 0, span, img.height);
    h.restore();
  }
}

/** A flat stripe painted on a table, `w` meters wide, from a to b (table-local, placed by `xf`). */
export function stripe(h: CanvasRenderingContext2D, cam: Camera, a: { x: number; y: number }, b: { x: number; y: number }, w: number, color: string, xf: Xf = IDENTITY): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * (w / 2);
  const ny = (dx / l) * (w / 2);
  const z = 0.0008;
  poly(h, cam, [{ x: a.x + nx, y: a.y + ny, z }, { x: b.x + nx, y: b.y + ny, z }, { x: b.x - nx, y: b.y - ny, z }, { x: a.x - nx, y: a.y - ny, z }].map(xf), color);
}

/** A vertical cylinder (a trash can, a cup stack), shaded by which way each facet faces. */
export function cylinder(h: CanvasRenderingContext2D, cam: Camera, c: Vec3, r: number, z0: number, z1: number, colors: { light: string; mid: string; dark: string }, rings = true): void {
  const n = 20;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const nx = Math.cos(am);
    const ny = Math.sin(am);
    const toCam = (cam.eye.x - (c.x + nx * r)) * nx + (cam.eye.y - (c.y + ny * r)) * ny;
    if (toCam <= 0) continue;
    const lit = 0.5 + 0.5 * Math.cos(am - 2.4);
    const col = lit > 0.75 ? colors.light : lit > 0.35 ? colors.mid : colors.dark;
    poly(h, cam, [
      { x: c.x + Math.cos(a0) * r, y: c.y + Math.sin(a0) * r, z: z0 },
      { x: c.x + Math.cos(a1) * r, y: c.y + Math.sin(a1) * r, z: z0 },
      { x: c.x + Math.cos(a1) * r, y: c.y + Math.sin(a1) * r, z: z1 },
      { x: c.x + Math.cos(a0) * r, y: c.y + Math.sin(a0) * r, z: z1 },
    ], col);
  }
  if (rings) for (const z of [z0 + (z1 - z0) * 0.3, z0 + (z1 - z0) * 0.62]) ring(h, cam, { x: c.x, y: c.y, z }, r + 0.004, colors.dark, 1, n);
}

/**
 * A ribbed metal trash can: slightly wider at the top, with vertical ribs, two
 * pressed bands, a rolled rim and a handle on each side.
 */
export function trashCan(h: CanvasRenderingContext2D, cam: Camera, c: Vec3, r: number, z0: number, z1: number, colors: { light: string; mid: string; dark: string }): void {
  const n = 28;
  const rb = r * 0.86; // narrower at the bottom
  const rAt = (z: number) => rb + (r - rb) * ((z - z0) / (z1 - z0));
  const lip = Math.min(0.05, (z1 - z0) * 0.08);
  const body = z1 - lip;
  const at = (a: number, z: number, rr = rAt(z)) => ({ x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr, z });
  const faces = (a0: number, a1: number) => {
    const am = (a0 + a1) / 2;
    return (cam.eye.x - (c.x + Math.cos(am) * r)) * Math.cos(am) + (cam.eye.y - (c.y + Math.sin(am) * r)) * Math.sin(am) > 0;
  };
  const shade = (am: number, rib: boolean) => {
    const lit = 0.5 + 0.5 * Math.cos(am - 2.4);
    const base = lit > 0.72 ? colors.light : lit > 0.32 ? colors.mid : colors.dark;
    return rib ? shadeHex(base, 1.12) : shadeHex(base, 0.9);
  };
  // Shadow ring on the floor.
  disc(h, cam, { x: c.x, y: c.y, z: z0 + 0.001 }, rb * 1.08, 'rgba(0,0,0,0.35)', 20);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    if (!faces(a0, a1)) continue;
    const am = (a0 + a1) / 2;
    poly(h, cam, [at(a0, z0), at(a1, z0), at(a1, body), at(a0, body)], shade(am, i % 2 === 0));
    // The rolled rim: a short, slightly wider band at the top.
    poly(h, cam, [at(a0, body, r * 1.05), at(a1, body, r * 1.05), at(a1, z1, r * 1.05), at(a0, z1, r * 1.05)], shadeHex(shade(am, true), 1.08));
  }
  // Pressed bands, a dark line under the rim, and a darker foot: only the half facing the camera
  // (a full circle would show its back half through the front of the can).
  const frontArc = (z: number, rr: number, color: string, width: number) => {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      if (faces(a0, a1)) line(h, cam, at(a0, z, rr), at(a1, z, rr), color, width);
    }
  };
  for (const f of [0.22, 0.62]) {
    const z = z0 + (body - z0) * f;
    frontArc(z, rAt(z) + 0.004, colors.dark, 3);
    frontArc(z + 0.012, rAt(z) + 0.004, shadeHex(colors.light, 1.15), 1);
  }
  frontArc(body, r * 1.05, colors.dark, 2);
  frontArc(z0 + 0.02, rb + 0.004, colors.dark, 2);
  // Handles on the left and right of the can, as seen from its table's long sides.
  for (const a of [Math.PI / 2, -Math.PI / 2]) {
    if (!faces(a - 0.2, a + 0.2)) continue;
    const z = z0 + (body - z0) * 0.8;
    const rr = rAt(z) + 0.02;
    const p0 = at(a - 0.28, z, rr);
    const p1 = at(a + 0.28, z, rr);
    const lift = { x: 0, y: 0, z: 0.05 };
    line(h, cam, p0, { x: p0.x + lift.x, y: p0.y + lift.y, z: p0.z + lift.z }, colors.dark, 3);
    line(h, cam, p1, { x: p1.x, y: p1.y, z: p1.z + lift.z }, colors.dark, 3);
    line(h, cam, { ...p0, z: p0.z + lift.z }, { ...p1, z: p1.z + lift.z }, colors.dark, 3);
  }
}

/** Whether a flat face (center `at`, outward normal `n`) faces the camera. */
export function facing(cam: Camera, at: Vec3, n: Vec3): boolean {
  return (cam.eye.x - at.x) * n.x + (cam.eye.y - at.y) * n.y + (cam.eye.z - at.z) * n.z > 0;
}
