// "3D-looking" pixel-art view from behind and above a team's shoulders.
//
// The game's world coordinates are projected through a perspective camera
// (camera.ts) onto a small low-resolution buffer, which is then scaled up
// with nearest-neighbour sampling so everything stays chunky pixel art.
// People and the ball are pixel sprites standing up as billboards; the room,
// table and cups are flat-shaded projected polygons.

import type { GameConfig } from '../config';
import type { Sprite } from '../core/character';
import type { BallEffects, Vec3 } from '../core/physics';
import type { Cup, PlayerId, TeamId } from '../core/types';
import type { Game } from '../game/game';
import type { Theme } from '../theme';
import { project, projectPolygon, teamCamera, type Camera } from './camera';
import { SPIN_LABELS } from '../game/shot';
import type { View } from './renderer';

export type Layout = 'behindA' | 'split';

interface Viewport {
  team: TeamId;
  /** Screen rectangle on the main canvas. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Coarse pixel layer: the room and the people behind the table. */
  cam: Camera;
  buf: HTMLCanvasElement;
  /** Finer pixel layer (camera.detail × the resolution): table, cups, ball, markers. */
  camHi: Camera;
  hi: HTMLCanvasElement;
  /** Coarse layer on top: the near team, over the table. */
  front: HTMLCanvasElement;
}

const PLAYERS: PlayerId[] = [
  { team: 'A', side: 'left' },
  { team: 'A', side: 'right' },
  { team: 'B', side: 'left' },
  { team: 'B', side: 'right' },
];

/** How tall people are drawn (m), feet on the floor. Stylized a little short so the table reads. */
const PERSON_HEIGHT = 1.45;

/** Where a player is drawn standing: off their corner of the table (drawing only; play uses playerSpot). */
function standSpot(game: Game, p: PlayerId): Vec3 {
  const spot = game.playerSpot(p);
  const W = game.cfg.table.width;
  const outward = spot.y < W / 2 ? -0.62 : 0.62;
  return { x: spot.x + (p.team === 'A' ? -0.3 : 0.3), y: spot.y + outward, z: -game.cfg.physics.tableHeight };
}

const buffers = new Map<string, HTMLCanvasElement>();
function buffer(key: string, w: number, h: number): HTMLCanvasElement {
  let c = buffers.get(key);
  if (!c || c.width !== w || c.height !== h) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    buffers.set(key, c);
  }
  return c;
}

/** One Scale2x (EPX) pass: doubles a sprite, rounding stair-step edges while keeping it pixel art. */
function scale2x(s: Sprite): Sprite {
  const w = s.w * 2;
  const out = new Array<string>(w * s.h * 2).fill('');
  const at = (i: number, j: number) => s.pixels[Math.max(0, Math.min(s.h - 1, j)) * s.w + Math.max(0, Math.min(s.w - 1, i))];
  for (let j = 0; j < s.h; j++)
    for (let i = 0; i < s.w; i++) {
      const p = at(i, j);
      const a = at(i, j - 1);
      const b = at(i + 1, j);
      const c = at(i - 1, j);
      const d = at(i, j + 1);
      let e0 = p, e1 = p, e2 = p, e3 = p;
      if (c === a && c !== d && a !== b) e0 = a;
      if (a === b && a !== c && b !== d) e1 = b;
      if (d === c && d !== b && c !== a) e2 = c;
      if (b === d && b !== a && d !== c) e3 = d;
      out[2 * j * w + 2 * i] = e0;
      out[2 * j * w + 2 * i + 1] = e1;
      out[(2 * j + 1) * w + 2 * i] = e2;
      out[(2 * j + 1) * w + 2 * i + 1] = e3;
    }
  return { w, h: s.h * 2, pixels: out };
}

const smoothed = new WeakMap<Sprite, Sprite>();
/** People are drawn from a 4x Scale2x copy of their sprite, so big close-up figures stay clean. */
function smooth(s: Sprite): Sprite {
  let t = smoothed.get(s);
  if (!t) smoothed.set(s, (t = scale2x(scale2x(s))));
  return t;
}

const spriteBitmaps = new WeakMap<Sprite, HTMLCanvasElement>();
function bitmap(s: Sprite): HTMLCanvasElement {
  let c = spriteBitmaps.get(s);
  if (!c) {
    c = document.createElement('canvas');
    c.width = s.w;
    c.height = s.h;
    const x = c.getContext('2d')!;
    s.pixels.forEach((col, i) => {
      if (!col) return;
      x.fillStyle = col;
      x.fillRect(i % s.w, Math.floor(i / s.w), 1, 1);
    });
    spriteBitmaps.set(s, c);
  }
  return c;
}

/** The viewports for a layout, in main-canvas pixels. */
export function viewports(cfg: GameConfig, v: View, layout: Layout): Viewport[] {
  // The scene fills the canvas; the HUD bars are drawn over its top and bottom edges.
  const top = 0;
  const h = v.height;
  const px = Math.max(cfg.camera.pixelSize, Math.round(h / cfg.camera.rows));
  const make = (team: TeamId, x: number, w: number): Viewport => {
    const bw = Math.max(1, Math.round(w / px));
    const bh = Math.max(1, Math.round(h / px));
    const d = cfg.camera.detail;
    return {
      team,
      x,
      y: top,
      w,
      h,
      cam: teamCamera(cfg, team, bw, bh),
      buf: buffer(`${team}-${bw}x${bh}`, bw, bh),
      camHi: teamCamera(cfg, team, bw * d, bh * d),
      hi: buffer(`${team}-hi-${bw * d}x${bh * d}`, bw * d, bh * d),
      front: buffer(`${team}-front-${bw}x${bh}`, bw, bh),
    };
  };
  if (layout === 'split') {
    const half = Math.floor((v.width - 4) / 2);
    return [make('A', 0, half), make('B', v.width - half, half)];
  }
  return [make('A', 0, v.width)];
}

let lastViewports: Viewport[] = [];

/** Draw the 3D view(s) onto the main canvas. */
export function renderGame3D(ctx: CanvasRenderingContext2D, theme: Theme, v: View, game: Game, layout: Layout, labels = true): void {
  const vps = viewports(game.cfg, v, layout);
  lastViewports = vps;
  ctx.fillStyle = theme.room.divider;
  ctx.fillRect(0, 0, v.width, v.height);
  for (const vp of vps) {
    const layers = [vp.buf, vp.hi, vp.front].map((c) => {
      const x = c.getContext('2d')!;
      x.imageSmoothingEnabled = false;
      x.clearRect(0, 0, c.width, c.height);
      return x;
    });
    drawScene(layers[0], layers[1], layers[2], theme, game, vp, labels);
    ctx.imageSmoothingEnabled = false;
    for (const c of [vp.buf, vp.hi, vp.front]) ctx.drawImage(c, vp.x, vp.y, vp.w, vp.h);
    // Vignette, in screen space over all layers.
    const vg = ctx.createRadialGradient(vp.x + vp.w / 2, vp.y + vp.h * 0.55, vp.h * 0.35, vp.x + vp.w / 2, vp.y + vp.h * 0.55, vp.w * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, theme.room.vignette);
    ctx.fillStyle = vg;
    ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
    if (labels) drawLabels(ctx, theme, game, vp);
  }
}

/** Which cup (if any) of `cups` is under a main-canvas point, in whichever viewport it falls. */
export function pickCup3D(game: Game, cups: Cup[], sx: number, sy: number): Cup | undefined {
  for (const vp of lastViewports) {
    if (sx < vp.x || sx > vp.x + vp.w || sy < vp.y || sy > vp.y + vp.h) continue;
    const k = vp.buf.width / vp.w;
    const bx = (sx - vp.x) * k;
    const by = (sy - vp.y) * k;
    let best: Cup | undefined;
    let bestD = Infinity;
    for (const c of cups) {
      const p = project(vp.cam, { x: c.x, y: c.y, z: game.cfg.physics.cupHeight / 2 });
      if (!p) continue;
      const d = Math.hypot(p.x - bx, p.y - by);
      if (d < Math.max(4, game.cfg.cups.diameter * p.scale) && d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  }
  return undefined;
}

// --------------------------------------------------------------- scene

function poly(b: CanvasRenderingContext2D, cam: Camera, pts: Vec3[], fill: string): void {
  const s = projectPolygon(cam, pts);
  if (s.length < 3) return;
  b.fillStyle = fill;
  b.beginPath();
  b.moveTo(s[0].x, s[0].y);
  for (let i = 1; i < s.length; i++) b.lineTo(s[i].x, s[i].y);
  b.closePath();
  b.fill();
}

function line(b: CanvasRenderingContext2D, cam: Camera, a: Vec3, c: Vec3, color: string, width = 1): void {
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
function disc(b: CanvasRenderingContext2D, cam: Camera, c: Vec3, r: number, fill: string, n = 14): void {
  const pts: Vec3[] = [];
  for (let i = 0; i < n; i++) pts.push({ x: c.x + Math.cos((i / n) * Math.PI * 2) * r, y: c.y + Math.sin((i / n) * Math.PI * 2) * r, z: c.z });
  poly(b, cam, pts, fill);
}

function ring(b: CanvasRenderingContext2D, cam: Camera, c: Vec3, r: number, color: string, width = 1, n = 20): void {
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
function box(b: CanvasRenderingContext2D, cam: Camera, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, top: string, side: string, front = side): void {
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

function drawScene(b: CanvasRenderingContext2D, h: CanvasRenderingContext2D, f: CanvasRenderingContext2D, theme: Theme, game: Game, vp: Viewport, ui: boolean): void {
  const cfg = game.cfg;
  const cam = vp.cam;
  const R = theme.room;
  const { length: L, width: W } = cfg.table;
  const floorZ = -cfg.physics.tableHeight;
  const ceilZ = 2.05;
  const X0 = -2.5;
  const X1 = L + 2.5;
  const Y0 = -1.9;
  const Y1 = W + 1.9;
  drawRoom(b, theme, cfg, cam, { X0, X1, Y0, Y1, floorZ, ceilZ });

  // --- People standing behind the far end of the table go first, so the table hides their legs.
  const viewDepth = (p: Vec3) => (p.x - cam.eye.x) * cam.f.x + (p.y - cam.eye.y) * cam.f.y + (p.z - cam.eye.z) * cam.f.z;
  const farEnd = viewDepth({ x: cam.f.x >= 0 ? L : 0, y: W / 2, z: 0 });
  const activeNow = [game.activePlayer('A'), game.activePlayer('B')];
  const isActive = (p: PlayerId) => activeNow.some((a) => a && a.team === p.team && a.side === p.side);
  const behindTable = PLAYERS.map((p) => ({ p, pos: standSpot(game, p) }))
    .filter(({ pos }) => viewDepth(pos) > farEnd)
    .sort((a, c) => viewDepth(c.pos) - viewDepth(a.pos));
  for (const { p, pos } of behindTable) drawPerson(b, theme, game, cam, p, pos, vp.team === p.team, isActive(p));

  // --- Fine layer: the table, the ski, then cups and the ball.
  const ch = vp.camHi;
  drawTable3D(h, theme, cfg, ch);

  // Cool wash from the fluorescent tubes over the middle of the table.
  const pool = project(ch, { x: L / 2, y: W / 2, z: 0 });
  if (pool) {
    const g = h.createRadialGradient(pool.x, pool.y, 2, pool.x, pool.y, pool.scale * 1.9);
    g.addColorStop(0, R.lightPool);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    h.fillStyle = g;
    h.fillRect(0, 0, vp.hi.width, vp.hi.height);
  }

  // Ground shadow of the ball (on the table or the floor).
  const ball = game.ball;
  if (ball.status !== 'sunk') {
    const onTop = ball.onTable(ball.pos.x, ball.pos.y) && ball.pos.z >= 0;
    const surf = onTop ? 0.002 : floorZ + 0.002;
    disc(onTop ? h : b, onTop ? ch : cam, { x: ball.pos.x, y: ball.pos.y, z: surf }, cfg.physics.ballRadius * (1 + Math.max(0, ball.pos.z - surf) * 0.4), theme.colors.shadow, 12);
  }

  // Aim: a path preview and a landing marker for each team that is about to hit.
  const st = game.engine.peek();
  for (const team of ['A', 'B'] as TeamId[]) if (ui && showsAim(game, vp, team)) drawAim(h, theme, game, ch, team);

  // Depth-sorted fine objects: cups and the ball.
  type Item = { depth: number; draw: () => void };
  const items: Item[] = [];
  const depthOf = (p: Vec3) => (p.x - ch.eye.x) * ch.f.x + (p.y - ch.eye.y) * ch.f.y + (p.z - ch.eye.z) * ch.f.z;
  const penaltyCup = st.phase === 'penalty' ? game.penaltyCups()[Math.min(game.penaltyCursor, game.penaltyCups().length - 1)] : undefined;
  for (const cup of game.cups) {
    if (cup.state === 'removed') continue;
    items.push({ depth: depthOf({ x: cup.x, y: cup.y, z: 0 }), draw: () => drawCup(h, theme, cfg, ch, cup, cup === penaltyCup, game.time) });
  }
  if (ball.status !== 'sunk') items.push({ depth: depthOf(ball.pos), draw: () => drawBall(h, theme, cfg, ch, ball.pos, ball.vel, ball.fx) });
  items.sort((a, c) => c.depth - a.depth);
  for (const it of items) it.draw();
  if (ui) drawTimingRings(h, theme, game, ch);
  drawCelebrations3D(h, theme, game, ch);

  // --- Front coarse layer: everyone not behind the table (your own team, over its shoulders).
  const nearPeople = PLAYERS.filter((p) => !behindTable.some((x) => x.p === p))
    .map((p) => ({ p, pos: standSpot(game, p) }))
    .sort((a, c) => viewDepth(c.pos) - viewDepth(a.pos));
  for (const { p, pos } of nearPeople) drawPerson(f, theme, game, cam, p, pos, vp.team === p.team, isActive(p));
}

const textCache = new Map<string, HTMLCanvasElement>();
/**
 * Text rendered once to a small bitmap (lines split on \n), so it can be
 * painted onto a wall in perspective. An empty `shadow` draws no drop shadow.
 */
function textBitmap(text: string, font: string, fill: string, shadow: string): HTMLCanvasElement {
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
function wallImage(b: CanvasRenderingContext2D, cam: Camera, img: HTMLCanvasElement, tl: Vec3, tr: Vec3, bl: Vec3): void {
  const a = project(cam, tl);
  const c = project(cam, tr);
  const d = project(cam, bl);
  if (!a || !c || !d) return;
  b.save();
  b.setTransform((c.x - a.x) / img.width, (c.y - a.y) / img.width, (d.x - a.x) / img.height, (d.y - a.y) / img.height, a.x, a.y);
  b.drawImage(img, 0, 0);
  b.restore();
}

// ------------------------------------------------------------ the room
//
// Modeled on the Zeta Psi basement:
// - a rust-red stained concrete floor and a low, sooty black ceiling with fluorescent tubes;
// - dark stained wood paneling covered in scratched names, with a bench ledge along the walls;
// - a black painted header band with hand-lettered slogans;
// - wood pillars with black painted tops;
// - road signs, tombstones and a bar with a fridge.

interface RoomBox {
  X0: number;
  X1: number;
  Y0: number;
  Y1: number;
  floorZ: number;
  ceilZ: number;
}

/** Height where the black painted header band starts on the walls. */
const HEADER_Z = 1.5;

/** A wall as a 2D surface: along-wall distance t (reading left to right from inside the room) and height z. */
type WallMap = (t: number, z: number, out?: number) => Vec3;

/** Whether the camera is on the room side of a wall (so its paint is visible). */
function facesCamera(cam: Camera, m: WallMap, t: number, z: number): boolean {
  const a = m(t, z, 0);
  const n = m(t, z, 1);
  return (cam.eye.x - a.x) * (n.x - a.x) + (cam.eye.y - a.y) * (n.y - a.y) + (cam.eye.z - a.z) * (n.z - a.z) > 0;
}

function wallQuad(m: WallMap, t0: number, t1: number, z0: number, z1: number, out = 0): Vec3[] {
  return [m(t0, z0, out), m(t1, z0, out), m(t1, z1, out), m(t0, z1, out)];
}

/**
 * Paint a text bitmap onto a wall, fitted (keeping its proportions) and
 * centered in the box t0..t1 by z0..z1, pushed `out` meters into the room.
 */
function wallText(b: CanvasRenderingContext2D, cam: Camera, m: WallMap, text: string, font: string, fill: string, t0: number, t1: number, z0: number, z1: number, out = 0.004, shadow = ''): void {
  if (!facesCamera(cam, m, (t0 + t1) / 2, (z0 + z1) / 2)) return;
  const img = textBitmap(text, font, fill, shadow);
  const aspect = img.width / img.height;
  let w = t1 - t0;
  let h = z1 - z0;
  if (w / h > aspect) w = h * aspect;
  else h = w / aspect;
  const tc = (t0 + t1) / 2;
  const zc = (z0 + z1) / 2;
  wallImage(b, cam, img, m(tc - w / 2, zc + h / 2, out), m(tc + w / 2, zc + h / 2, out), m(tc - w / 2, zc - h / 2, out));
}

function drawRoom(b: CanvasRenderingContext2D, theme: Theme, cfg: GameConfig, cam: Camera, rm: RoomBox): void {
  const R = theme.room;
  const { X0, X1, Y0, Y1, floorZ, ceilZ } = rm;
  const { length: L, width: W } = cfg.table;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // Ceiling: sooty black with paler water stains.
  poly(b, cam, [{ x: X0, y: Y0, z: ceilZ }, { x: X1, y: Y0, z: ceilZ }, { x: X1, y: Y1, z: ceilZ }, { x: X0, y: Y1, z: ceilZ }], R.ceiling);
  for (let i = 0; i < 18; i++) disc(b, cam, { x: X0 + rnd() * (X1 - X0), y: Y0 + rnd() * (Y1 - Y0), z: ceilZ - 0.001 }, 0.2 + rnd() * 0.5, R.ceilingStain, 10);

  // Floor: rust-red stained concrete, patchy, with worn and wet spots.
  poly(b, cam, [{ x: X0, y: Y0, z: floorZ }, { x: X1, y: Y0, z: floorZ }, { x: X1, y: Y1, z: floorZ }, { x: X0, y: Y1, z: floorZ }], R.floor);
  const patch = [R.floorDark, R.floorLight, R.floorWorn];
  for (let i = 0; i < 46; i++) disc(b, cam, { x: X0 + rnd() * (X1 - X0), y: Y0 + rnd() * (Y1 - Y0), z: floorZ + 0.0005 }, 0.12 + rnd() * 0.5, patch[i % 3], 10);
  for (const sp of floorSpecks(X0, X1, Y0, Y1)) {
    const p = project(cam, { x: sp.x, y: sp.y, z: floorZ });
    if (!p) continue;
    b.fillStyle = sp.light ? R.floorSpeck : R.floorDark;
    b.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
  }
  // Light washes on the floor under the tubes, and the table's shadow.
  for (const fx of FIXTURES(L, W)) {
    const p = project(cam, { x: fx.x, y: fx.y, z: floorZ });
    if (!p) continue;
    const r = p.scale * 1.1;
    const g = b.createRadialGradient(p.x, p.y, 1, p.x, p.y, r);
    g.addColorStop(0, R.floorGlow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = g;
    b.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }
  poly(b, cam, [{ x: -0.05, y: -0.08, z: floorZ + 0.001 }, { x: L + 0.05, y: -0.08, z: floorZ + 0.001 }, { x: L + 0.05, y: W + 0.08, z: floorZ + 0.001 }, { x: -0.05, y: W + 0.08, z: floorZ + 0.001 }], R.tableShadow);

  // Walls, each mapped so its text reads left to right from inside the room.
  const walls: { m: WallMap; len: number; key: 'left' | 'right' | 'endB' | 'endA' }[] = [
    { m: (t, z, o = 0) => ({ x: X0 + t, y: Y0 + o, z }), len: X1 - X0, key: 'left' },
    { m: (t, z, o = 0) => ({ x: X1 - t, y: Y1 - o, z }), len: X1 - X0, key: 'right' },
    { m: (t, z, o = 0) => ({ x: X1 - o, y: Y0 + t, z }), len: Y1 - Y0, key: 'endB' },
    { m: (t, z, o = 0) => ({ x: X0 + o, y: Y1 - t, z }), len: Y1 - Y0, key: 'endA' },
  ];
  for (const w of walls) drawPaneledWall(b, theme, cam, w.m, w.len, floorZ, ceilZ, rnd);

  // Hand-lettered slogans on the black header band.
  const hz0 = HEADER_Z + 0.06;
  const hz1 = ceilZ - 0.05;
  const [left, right, endB, endA] = walls;
  wallText(b, cam, left.m, 'BIG BRIGGS', 'bold 30px sans-serif', R.paintWhite, 0.2, 1.9, hz0, hz1);
  wallText(b, cam, left.m, 'THE CLASS OF 1962 ROOM', 'bold 22px serif', R.paintGold, 2.2, 5.0, hz0 + 0.05, hz1 - 0.05);
  wallText(b, cam, left.m, 'RONA RUINED MY DAY', 'bold 18px sans-serif', R.paintGold, 5.4, 7.2, hz0 + 0.08, hz1 - 0.08);
  wallText(b, cam, right.m, 'On the Seventh Cup, He Rested.', 'bold 22px serif', R.paintGold, 0.3, 3.4, hz0 + 0.06, hz1 - 0.06);
  wallText(b, cam, right.m, 'TYRANNOSAURUS REX ON A BOAT', 'bold 20px sans-serif', R.paintGreen, 3.7, 6.9, hz0 + 0.07, hz1 - 0.07);
  wallText(b, cam, endB.m, 'Brothers should be nicer to other brothers', 'bold 20px sans-serif', R.paintGold, 0.3, (Y1 - Y0) - 0.3, hz0 + 0.06, hz1 - 0.06);
  wallText(b, cam, endA.m, 'STEP YOUR LEVEL UP', 'bold 26px sans-serif', R.paintPink, 0.4, (Y1 - Y0) - 0.4, hz0 + 0.04, hz1 - 0.04);

  // Bench ledges along the long walls.
  for (const [ya, yb] of [
    [Y0, Y0 + 0.34],
    [Y1 - 0.34, Y1],
  ]) {
    box(b, cam, X0, ya, floorZ, X1, yb, floorZ + 0.4, R.benchFront, R.benchFront, R.benchFront);
    box(b, cam, X0, ya - 0.02, floorZ + 0.4, X1, yb + 0.02, floorZ + 0.46, R.benchTop, R.bench, R.bench);
  }

  // End-wall dressing: each camera sees the opposite end.
  drawSignsEnd(b, theme, cam, endB.m, Y1 - Y0, floorZ);
  drawBarEnd(b, theme, cam, endA.m, Y1 - Y0, floorZ, X0);

  // Fluorescent fixtures, then the pillars (far to near).
  for (const fx of FIXTURES(L, W)) drawFixture(b, theme, cam, fx.x, fx.y, ceilZ);
  const depth = (p: Vec3) => (p.x - cam.eye.x) * cam.f.x + (p.y - cam.eye.y) * cam.f.y + (p.z - cam.eye.z) * cam.f.z;
  PILLARS(L, W)
    .sort((a, c) => depth({ x: c.x, y: c.y, z: 0 }) - depth({ x: a.x, y: a.y, z: 0 }))
    .forEach((pl) => drawPillar(b, theme, cam, pl, floorZ, ceilZ));
}

/** Fixture centers: tube boxes running along the table, two rows. */
const FIXTURES = (L: number, W: number) =>
  [-1.4, 0.5, L - 0.5, L + 1.4].flatMap((x) => [
    { x, y: -0.75 },
    { x, y: W + 0.75 },
  ]);

/** Pillars beside the middle of the table, each with a painted slogan on the side facing each end. */
const PILLARS = (L: number, W: number) => [
  { x: L / 2, y: -1.45, a: 'SWEAT\nSAVES\nBLOOD', b: 'GET\nGOOFY\nNOW!' },
  { x: L / 2, y: W + 1.45, a: 'IF I\nDIE,\nI DIE.', b: 'MY MOM\nSAYS\nWE\'RE\nA-SIDE' },
];

function drawPaneledWall(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, m: WallMap, len: number, floorZ: number, ceilZ: number, rnd: () => number): void {
  const R = theme.room;
  poly(b, cam, wallQuad(m, 0, len, floorZ, HEADER_Z), R.wall);
  // Raised panels: a lower row under the bench line and a tall upper row.
  const rows: [number, number][] = [
    [floorZ + 0.5, floorZ + 0.95],
    [floorZ + 1.02, HEADER_Z - 0.1],
  ];
  const step = 0.62;
  for (let t = 0.04; t + step <= len + 0.01; t += step) {
    for (const [z0, z1] of rows) {
      poly(b, cam, wallQuad(m, t + 0.05, t + step - 0.05, z0, z1, 0.002), R.panel);
      line(b, cam, m(t + 0.05, z1, 0.003), m(t + step - 0.05, z1, 0.003), R.panelShade);
      line(b, cam, m(t + 0.05, z0, 0.003), m(t + step - 0.05, z0, 0.003), R.panelLight);
    }
  }
  // Rail under the header, and names scratched into the wood.
  poly(b, cam, wallQuad(m, 0, len, HEADER_Z - 0.06, HEADER_Z, 0.003), R.rail);
  for (let k = 0; k < len * 5; k++) {
    const t = rnd() * (len - 0.4);
    const z = floorZ + 1.05 + rnd() * (HEADER_Z - floorZ - 1.25);
    const w = 0.08 + rnd() * 0.22;
    const tilt = (rnd() - 0.5) * 0.03;
    line(b, cam, m(t, z, 0.004), m(t + w, z + tilt, 0.004), rnd() < 0.8 ? R.scratch : R.scratchColor);
    if (rnd() < 0.5) line(b, cam, m(t + 0.02, z - 0.035, 0.004), m(t + w * 0.7, z - 0.035 + tilt, 0.004), R.scratch);
  }
  // The black painted header band up to the ceiling.
  poly(b, cam, wallQuad(m, 0, len, HEADER_Z, ceilZ, 0.004), R.header);
  line(b, cam, m(0, HEADER_Z, 0.005), m(len, HEADER_Z, 0.005), R.headerEdge);
}

/** A flat polygon on a wall from (t, z) points. */
function wallShape(b: CanvasRenderingContext2D, cam: Camera, m: WallMap, pts: [number, number][], fill: string, out = 0.006): void {
  if (!facesCamera(cam, m, pts[0][0], pts[0][1])) return;
  poly(b, cam, pts.map(([t, z]) => m(t, z, out)), fill);
}

function circlePts(t: number, z: number, r: number, n = 18, a0 = 0): [number, number][] {
  return Array.from({ length: n }, (_, i) => [t + Math.cos(a0 + (i / n) * Math.PI * 2) * r, z + Math.sin(a0 + (i / n) * Math.PI * 2) * r] as [number, number]);
}

/** Far end behind Team B (what Team A's camera sees): road signs, the 74, the letters, tombstones, a caution sign. */
function drawSignsEnd(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, m: WallMap, len: number, floorZ: number): void {
  const R = theme.room;
  const c = len / 2;
  // LEFT TURN YIELD ON GREEN.
  wallShape(b, cam, m, [[c + 0.2, 0.42], [c + 0.72, 0.42], [c + 0.72, 1.12], [c + 0.2, 1.12]], R.signEdge);
  wallShape(b, cam, m, [[c + 0.23, 0.45], [c + 0.69, 0.45], [c + 0.69, 1.09], [c + 0.23, 1.09]], R.signWhite, 0.007);
  wallText(b, cam, m, 'LEFT TURN\nYIELD\nON GREEN', 'bold 18px sans-serif', R.signInk, c + 0.25, c + 0.67, 0.68, 1.06, 0.008);
  wallShape(b, cam, m, circlePts(c + 0.46, 0.55, 0.07), R.smiley, 0.008);
  // The 74, and the gold letters beside it.
  wallShape(b, cam, m, circlePts(c - 0.75, 1.0, 0.22, 22), R.signEdge);
  wallShape(b, cam, m, circlePts(c - 0.75, 1.0, 0.2, 22), R.signWhite, 0.007);
  wallText(b, cam, m, '74', 'bold 28px sans-serif', R.signInk, c - 0.92, c - 0.58, 0.86, 1.14, 0.008);
  wallText(b, cam, m, theme.houseLetters, 'bold 28px serif', R.letters, c - 0.42, c - 0.02, 0.92, 1.25, 0.006);
  wallText(b, cam, m, 'ITS KCAO A WORLD', 'bold 20px sans-serif', R.paintBlue, c - 1.75, c - 0.6, 0.45, 0.68, 0.006);
  // A faded STOP sign.
  wallShape(b, cam, m, circlePts(c + 1.35, 0.95, 0.27, 8, Math.PI / 8), R.signWhite);
  wallShape(b, cam, m, circlePts(c + 1.35, 0.95, 0.24, 8, Math.PI / 8), R.stop, 0.007);
  wallText(b, cam, m, 'STOP', 'bold 22px sans-serif', R.signWhite, c + 1.17, c + 1.53, 0.86, 1.04, 0.008);
  // Tombstones on the bench, and a caution sign on the floor in the corner.
  for (const [t, label] of [
    [0.35, 'RIP'],
    [0.72, 'RIP'],
  ] as const)
    drawTombstone(b, theme, cam, m, t, floorZ + 0.46, label);
  drawCaution(b, theme, cam, m, len - 0.45, floorZ);
}

/** Far end behind Team A (what Team B's camera sees): the bar with its fridge, and a sign. */
function drawBarEnd(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, m: WallMap, len: number, floorZ: number, X0: number): void {
  const R = theme.room;
  const c = len / 2;
  // Bar counter out from the wall, with the painted KCAO on its front.
  const t0 = c - 1.8;
  const t1 = c + 0.5;
  const a = m(t0, floorZ, 0);
  const d = m(t1, floorZ, 0.55);
  box(b, cam, Math.min(a.x, d.x), Math.min(a.y, d.y), floorZ, Math.max(a.x, d.x), Math.max(a.y, d.y), floorZ + 1.0, R.barTop, R.bar, R.bar);
  wallText(b, cam, m, 'KCAO', 'bold 30px sans-serif', R.paintBlue, t0 + 0.3, t0 + 1.3, floorZ + 0.35, floorZ + 0.85, 0.56);
  wallText(b, cam, m, 'Now Serving\nFrankenstein Family Ale', 'bold 16px serif', R.paintGold, t0 + 0.1, t1 - 0.1, 1.05, 1.42, 0.006);
  // White fridge and a JOHNSON CONTROLS sign.
  const f0 = m(c + 0.7, floorZ, 0);
  const f1 = m(c + 1.3, floorZ, 0.6);
  box(b, cam, Math.min(f0.x, f1.x), Math.min(f0.y, f1.y), floorZ, Math.max(f0.x, f1.x), Math.max(f0.y, f1.y), floorZ + 1.55, R.fridgeTop, R.fridgeDark, R.fridge);
  wallShape(b, cam, m, [[c + 1.5, 0.55], [c + 2.05, 0.55], [c + 2.05, 0.95], [c + 1.5, 0.95]], R.signEdge);
  wallShape(b, cam, m, [[c + 1.52, 0.57], [c + 2.03, 0.57], [c + 2.03, 0.93], [c + 1.52, 0.93]], R.signWhite, 0.007);
  wallText(b, cam, m, 'JOHNSON\nCONTROLS', 'bold 16px sans-serif', R.signInk, c + 1.55, c + 2.0, 0.6, 0.9, 0.008);
  drawTombstone(b, theme, cam, m, len - 0.5, floorZ + 0.46, 'RIP');
  void X0;
}

function drawTombstone(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, m: WallMap, t: number, z: number, label: string): void {
  const R = theme.room;
  const w = 0.13;
  const h = 0.3;
  const out = 0.2;
  const pts: [number, number][] = [[t - w, z], [t + w, z]];
  for (let i = 0; i <= 8; i++) pts.push([t + Math.cos((i / 8) * Math.PI) * w, z + h - w + Math.sin((i / 8) * Math.PI) * w]);
  wallShape(b, cam, m, pts.map(([a, c]) => [a, c]), R.stoneDark, out);
  wallShape(b, cam, m, pts.map(([a, c]) => [a + (a - t) * -0.12, z + (c - z) * 0.94]), R.stone, out + 0.002);
  wallText(b, cam, m, label, 'bold 16px serif', R.stoneDark, t - w * 0.7, t + w * 0.7, z + h * 0.35, z + h * 0.62, out + 0.004);
}

function drawCaution(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, m: WallMap, t: number, floorZ: number): void {
  const R = theme.room;
  const out = 0.35;
  wallShape(b, cam, m, [[t - 0.16, floorZ], [t + 0.16, floorZ], [t + 0.1, floorZ + 0.62], [t - 0.1, floorZ + 0.62]], R.caution, out);
  wallShape(b, cam, m, [[t - 0.1, floorZ + 0.62], [t + 0.1, floorZ + 0.62], [t + 0.08, floorZ + 0.66], [t - 0.08, floorZ + 0.66]], R.cautionDark, out);
  wallText(b, cam, m, 'CAUTION', 'bold 14px sans-serif', R.signInk, t - 0.12, t + 0.12, floorZ + 0.42, floorZ + 0.52, out + 0.004);
}

/** A ceiling fluorescent fixture: dark housing, bright diffuser and a soft glow. */
function drawFixture(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, x: number, y: number, ceilZ: number): void {
  const R = theme.room;
  const hl = 0.6;
  const hw = 0.14;
  const z0 = ceilZ - 0.07;
  box(b, cam, x - hl, y - hw, z0, x + hl, y + hw, ceilZ, R.fixture, R.fixture, R.fixture);
  poly(b, cam, [{ x: x - hl + 0.03, y: y - hw + 0.03, z: z0 - 0.001 }, { x: x + hl - 0.03, y: y - hw + 0.03, z: z0 - 0.001 }, { x: x + hl - 0.03, y: y + hw - 0.03, z: z0 - 0.001 }, { x: x - hl + 0.03, y: y + hw - 0.03, z: z0 - 0.001 }], R.tube);
  const p = project(cam, { x, y, z: z0 });
  if (!p) return;
  const r = Math.max(4, p.scale * 0.9);
  const g = b.createRadialGradient(p.x, p.y, 1, p.x, p.y, r);
  g.addColorStop(0, R.tubeGlow);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  b.fillStyle = g;
  b.fillRect(p.x - r, p.y - r, r * 2, r * 2);
}

/** A square pillar: stained wood below, black painted above, a slogan painted on each end-facing side. */
function drawPillar(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, pl: { x: number; y: number; a: string; b: string }, floorZ: number, ceilZ: number): void {
  const R = theme.room;
  const s = 0.17;
  const mid = 0.8;
  box(b, cam, pl.x - s, pl.y - s, floorZ, pl.x + s, pl.y + s, mid, R.pillarTop, R.pillarWood, R.pillarWoodLit);
  box(b, cam, pl.x - s - 0.01, pl.y - s - 0.01, mid, pl.x + s + 0.01, pl.y + s + 0.01, ceilZ, R.header, R.header, R.headerLit);
  // Panel lines on the wood, and a slogan on the face toward each end of the table.
  for (const side of [-1, 1] as const) {
    const fx = pl.x + side * (s + 0.012);
    // Text reads left to right for someone facing this side: +y from the A end, -y from the B end.
    const faceM: WallMap = (t, z, o = 0) => ({ x: fx + side * o, y: side === -1 ? pl.y - s + t : pl.y + s - t, z });
    if (!facesCamera(cam, faceM, s, mid)) continue;
    poly(b, cam, wallQuad(faceM, 0.05, 2 * s - 0.05, floorZ + 0.1, mid - 0.1, 0.002), R.pillarPanel);
    wallText(b, cam, faceM, side === -1 ? pl.a : pl.b, 'bold 18px sans-serif', R.paintGold, 0.02, 2 * s - 0.02, mid + 0.08, mid + 0.68, 0.004);
    void ceilZ;
  }
}

function drawPerson(b: CanvasRenderingContext2D, theme: Theme, game: Game, cam: Camera, p: PlayerId, feet: Vec3, fromBehind: boolean, active: boolean): void {
  const who = game.participant(p);
  const raw = (fromBehind ? who.spriteBack : null) ?? who.sprite;
  const base = project(cam, feet);
  const head = project(cam, { ...feet, z: feet.z + PERSON_HEIGHT });
  if (!base || !head) return;
  const hgt = base.y - head.y;
  if (hgt <= 0) return;
  const teamCol = p.team === 'A' ? theme.colors.teamA : theme.colors.teamB;
  disc(b, cam, { ...feet, z: feet.z + 0.002 }, 0.24, theme.room.personShadow, 16);
  // Floor ring in the team color; yellow, with a pulse, when it is this player's turn.
  ring(b, cam, feet, 0.28, active ? theme.colors.activeRing : teamCol, active ? 2 : 1, 20);
  if (active) {
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 9);
    ring(b, cam, feet, 0.33 + pulse * 0.06, theme.colors.activeRing, 1, 20);
  }
  if (!raw) {
    b.fillStyle = teamCol;
    b.fillRect(Math.round(base.x - hgt * 0.15), Math.round(head.y), Math.round(hgt * 0.3), Math.round(hgt));
    return;
  }
  const sprite = smooth(raw);
  const w = (hgt * sprite.w) / sprite.h;
  const x = Math.round(base.x - w / 2);
  const y = Math.round(head.y);
  // Your own team, seen over their shoulders, is a little see-through so the table stays readable.
  if (fromBehind) b.globalAlpha = 0.88;
  b.drawImage(bitmap(sprite), x, y, Math.round(w), Math.round(hgt));
  b.globalAlpha = 1;
  if (active) {
    // A small bobbing marker over the head of whoever is up.
    const bob = Math.round(Math.sin(game.time * 6) * 2);
    const s = Math.max(3, Math.round(hgt * 0.045));
    const tx = Math.round(base.x);
    const ty = y - 3 - bob;
    b.fillStyle = theme.colors.ballOutline;
    tri(b, tx, ty + 1, s + 1);
    b.fillStyle = theme.colors.activeRing;
    tri(b, tx, ty, s);
  }
}

/** A downward-pointing pixel triangle with its tip at (x, y). */
function tri(b: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  for (let k = 0; k <= s; k++) b.fillRect(x - (s - k), y - s + k, (s - k) * 2 + 1, 1);
}

/**
 * Timing cue around the ball: a fixed white ring and a colored ring closing
 * in on it. Swing as they meet: green is the sweet spot, red is late.
 */
function drawTimingRings(b: CanvasRenderingContext2D, theme: Theme, game: Game, cam: Camera): void {
  const pos = game.ball.pos;
  const c = project(cam, { ...pos, z: pos.z + game.cfg.physics.ballRadius });
  if (!c) return;
  const circle = (r: number, col: string, w: number) => {
    b.strokeStyle = col;
    b.lineWidth = w;
    b.beginPath();
    b.arc(Math.round(c.x) + 0.5, Math.round(c.y) + 0.5, Math.max(1, r), 0, Math.PI * 2);
    b.stroke();
  };
  for (const team of ['A', 'B'] as TeamId[]) {
    const cue = game.timingCue(team);
    if (!cue) continue;
    const { offset, window: w } = cue;
    if (offset > w) continue;
    const target = Math.max(5, game.cfg.physics.ballRadius * c.scale + 4);
    const early = Math.min(1, Math.max(0, -offset) / (w * 2.5));
    const late = Math.max(0, offset) / w;
    const radius = target + early * 18 - late * (target - 2);
    const col = Math.abs(offset) <= w * 0.25 ? theme.colors.good : offset > 0 ? theme.colors.bad : theme.colors.activeRing;
    circle(target, theme.colors.ballOutline, 3);
    circle(target, theme.colors.text, 1);
    circle(radius, theme.colors.ballOutline, 4);
    circle(radius, col, 2);
  }
}

/** Whether a viewport shows `team`'s aim: humans only, and in split screen only on that team's own half. */
function showsAim(game: Game, vp: Viewport, team: TeamId): boolean {
  if (!game.aiming(team)) return false;
  if (game.cfg.players.mode === 'coop' && team === 'B') return false; // the CPU's aim stays hidden
  return lastViewports.length < 2 || vp.team === team;
}

/**
 * The aim marker on the table: a ring with four ticks and a center dot. It
 * flashes once the shot is locked in (the timing rings are up), and turns red
 * with an X when aimed off the table. No path preview and no cup highlight:
 * reading the shot is the player's job.
 */
function drawAim(h: CanvasRenderingContext2D, theme: Theme, game: Game, cam: Camera, team: TeamId): void {
  const cfg = game.cfg;
  const style = game.currentStyle(team);
  if (!style) return;
  const t = game.aimTarget(team, game.aim[team], style);
  const locked = game.timingCue(team) !== null;
  const { length: L, width: W } = cfg.table;
  const off = t.x < 0 || t.x > L || t.y < 0 || t.y > W;
  const base = off ? theme.colors.bad : team === 'A' ? theme.colors.aimA : theme.colors.aimB;
  // Locked: flash between white and the team color (about 8 times a second).
  const flash = locked && Math.floor(game.time * 16) % 2 === 0;
  const col = flash ? theme.colors.lockFlash : base;
  const dark = theme.colors.ballOutline;
  // The marker floats at table height, even past the edge, so it reads as just off the table.
  const z = 0.003;
  const R = 0.085 + (locked ? 0 : 0.008 * Math.sin(game.time * 6));
  const c = { x: t.x, y: t.y, z };
  if (locked) {
    h.globalAlpha = flash ? 0.45 : 0.25;
    disc(h, cam, c, R, col, 24);
    h.globalAlpha = 1;
  }
  ring(h, cam, c, R, dark, 4, 28);
  ring(h, cam, c, R, col, 2, 28);
  const tick = (dx: number, dy: number) => {
    const a = { x: t.x + dx * R * 1.25, y: t.y + dy * R * 1.25, z };
    const e = { x: t.x + dx * R * (locked ? 1.45 : 1.75), y: t.y + dy * R * (locked ? 1.45 : 1.75), z };
    line(h, cam, a, e, dark, 4);
    line(h, cam, a, e, col, 2);
  };
  tick(1, 0);
  tick(-1, 0);
  tick(0, 1);
  tick(0, -1);
  if (off) {
    const d = R * 0.5;
    line(h, cam, { x: t.x - d, y: t.y - d, z }, { x: t.x + d, y: t.y + d, z }, col, 2);
    line(h, cam, { x: t.x - d, y: t.y + d, z }, { x: t.x + d, y: t.y - d, z }, col, 2);
  } else disc(h, cam, c, 0.012, col, 10);
}

function drawCelebrations3D(b: CanvasRenderingContext2D, theme: Theme, game: Game, cam: Camera): void {
  for (const k of game.celebrations) {
    const t = game.time - k.time;
    const colors = theme.celebrations[k.palette];
    if (t < 0 || t > 1.6 || !colors) continue;
    let seed = k.seed;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    b.globalAlpha = Math.max(0, 1 - t / 1.6);
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2;
      const sp = 0.4 + rnd() * 0.9;
      const up = 1.2 + rnd() * 1.6;
      const p = project(cam, { x: k.x + Math.cos(a) * sp * t, y: k.y + Math.sin(a) * sp * t, z: 0.12 + up * t - 2.5 * t * t });
      if (!p) continue;
      b.fillStyle = colors[i % colors.length];
      b.fillRect(Math.round(p.x), Math.round(p.y), 1 + (i % 2), 1 + (i % 2));
    }
    b.globalAlpha = 1;
  }
}

/** A flat label pill: dark (or colored) fill with a 1px darker edge, text centered. */
function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, ink: string, edge = 'rgba(0,0,0,0.6)', bounds?: [number, number]): void {
  const w = Math.ceil(ctx.measureText(text).width) + 12;
  if (bounds) x = Math.max(bounds[0] + 8 + w / 2, Math.min(bounds[1] - 8 - w / 2, x));
  const x0 = Math.round(x - w / 2);
  const y0 = Math.round(y - 9);
  ctx.fillStyle = edge;
  ctx.fillRect(x0 - 1, y0 - 1, w + 2, 20);
  ctx.fillStyle = fill;
  ctx.fillRect(x0, y0, w, 18);
  ctx.fillStyle = ink;
  ctx.fillText(text, x0 + w / 2, y0 + 10);
}

/** Crisp full-resolution names, turn tags and timing feedback over the scaled-up scene. */
function drawLabels(ctx: CanvasRenderingContext2D, theme: Theme, game: Game, vp: Viewport): void {
  const k = vp.w / vp.buf.width;
  const st = game.engine.peek();
  const c = theme.colors;
  ctx.save();
  ctx.beginPath();
  ctx.rect(vp.x, vp.y, vp.w, vp.h);
  ctx.clip();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = theme.fonts.label;
  const floorZ = -game.cfg.physics.tableHeight;
  const minY = vp.y + theme.hudTop + 24;
  const maxY = vp.y + vp.h - theme.hudBottom - 24;
  for (const p of PLAYERS) {
    const who = game.participant(p);
    const head = project(vp.cam, { ...standSpot(game, p), z: floorZ + PERSON_HEIGHT + 0.16 });
    if (!head) continue;
    const sx = vp.x + head.x * k;
    const bounds: [number, number] = [vp.x, vp.x + vp.w];
    const sy = Math.max(minY, Math.min(maxY, vp.y + head.y * k));
    const name = (who.master ? '★ ' : '') + who.name + (st.server.team === p.team && st.server.side === p.side ? ' ●' : '');
    const up = game.activePlayer(p.team);
    if (up && up.side === p.side) {
      // Whose turn it is: one bright tag saying what they are about to do.
      const what = st.phase === 'awaitServe' ? 'SERVE' : st.rally?.cupAtRisk ? 'SAVE!' : 'HIT';
      pill(ctx, `${what} · ${name}`, sx, sy, c.activeRing, c.activeText, undefined, bounds);
      const spin = game.heldSpin[p.team];
      const style = game.currentStyle(p.team);
      const extra = [game.selectedStyle[p.team] ? style?.name : null, spin ? SPIN_LABELS[spin.type] : null].filter(Boolean).join(' · ');
      if (extra) pill(ctx, extra, sx, sy + 22, 'rgba(20,14,10,0.85)', c.activeRing, undefined, bounds);
    } else {
      ctx.globalAlpha = 0.85;
      pill(ctx, name, sx, sy, 'rgba(20,14,10,0.75)', who.nameColor ?? (who.master ? c.master : c.text), undefined, bounds);
      ctx.globalAlpha = 1;
    }
  }
  // Timing feedback ("Perfect", "Late"...) rising from the hitter.
  const fb = game.feedback;
  if (fb && game.time - fb.time < 0.9) {
    const p = fb.player ?? game.activePlayer(fb.team) ?? { team: fb.team, side: 'left' as const };
    const at = project(vp.cam, { ...standSpot(game, p), z: 0.05 });
    if (at) {
      const age = game.time - fb.time;
      ctx.globalAlpha = 1 - age / 0.9;
      ctx.font = theme.fonts.title;
      const half = ctx.measureText(fb.label).width / 2 + 12;
      const tx = Math.max(vp.x + half, Math.min(vp.x + vp.w - half, vp.x + at.x * k));
      const ty = Math.max(minY + 30, Math.min(maxY, vp.y + at.y * k - 30 - age * 30));
      ctx.fillStyle = c.ballOutline;
      ctx.fillText(fb.label, tx + 2, ty + 2);
      ctx.fillStyle = fb.quality === null ? c.bad : fb.quality > 0.55 ? c.good : c.text;
      ctx.fillText(fb.label, tx, ty);
      ctx.globalAlpha = 1;
    }
  }
  // Ball out of view (a sky-high lob): an arrow at the screen edge where it is.
  const ball = game.ball;
  if (ball.status === 'flying') {
    const q = project(vp.cam, ball.pos);
    const bx = q ? vp.x + q.x * k : vp.x + vp.w / 2;
    const by = q ? vp.y + q.y * k : vp.y + vp.h;
    const top = vp.y + theme.hudTop + 6;
    if (!q || by < top || by > vp.y + vp.h || bx < vp.x || bx > vp.x + vp.w) {
      const ax = Math.max(vp.x + 20, Math.min(vp.x + vp.w - 20, bx));
      const below = !!q && by > vp.y + vp.h;
      const ay = below ? vp.y + vp.h - theme.hudBottom - 10 : top + 4;
      const dir = below ? 1 : -1;
      ctx.fillStyle = c.ballOutline;
      ctx.beginPath();
      ctx.moveTo(ax, ay + dir * 12);
      ctx.lineTo(ax - 11, ay - dir * 4);
      ctx.lineTo(ax + 11, ay - dir * 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c.ball;
      ctx.beginPath();
      ctx.moveTo(ax, ay + dir * 9);
      ctx.lineTo(ax - 8, ay - dir * 2);
      ctx.lineTo(ax + 8, ay - dir * 2);
      ctx.closePath();
      ctx.fill();
    }
  }
  if (vp.team === 'B' || lastViewports.length > 1) {
    ctx.font = theme.fonts.label;
    ctx.textAlign = 'center';
    pill(ctx, `Team ${vp.team} view`, vp.x + 64, vp.y + theme.hudTop + 30, 'rgba(20,14,10,0.8)', vp.team === 'A' ? c.teamA : c.teamB);
  }
  ctx.restore();
}

/** Darken (<1) or lighten (>1) a #rrggbb color. */
function shadeHex(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

const speckCache = new Map<string, { x: number; y: number; light: boolean }[]>();
/** Fixed random specks on the concrete floor. */
function floorSpecks(x0: number, x1: number, y0: number, y1: number): { x: number; y: number; light: boolean }[] {
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


// ------------------------------------------------------------ table art

let tableTexture: HTMLCanvasElement | null = null;
/**
 * The painted table top, after the real ones: a brushy blue field, a big
 * hand-painted figure in red, green and gold across both halves, gold
 * letters, and a chipped cream border. Drawn once; mapped onto the table in
 * perspective. u runs along the table (Team A's end at 0), v across it.
 */
function tableTex(theme: Theme): HTMLCanvasElement {
  if (tableTexture) return tableTexture;
  const T = theme.table;
  const W = 288;
  const H = 144;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  x.fillStyle = T.paint;
  x.fillRect(0, 0, W, H);
  // Brush strokes in the blue.
  for (let k = 0; k < 520; k++) {
    x.fillStyle = k % 2 ? T.paintDark : T.paintLight;
    x.globalAlpha = 0.35 + rnd() * 0.3;
    x.fillRect(Math.round(rnd() * W), Math.round(rnd() * H), 2 + Math.round(rnd() * 7), 1);
  }
  x.globalAlpha = 1;
  const [red, robe, gold, green, skin] = T.art;
  const blob = (cx: number, cy: number, rx: number, ry: number, rot: number, fill: string) => {
    x.beginPath();
    x.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
    x.fillStyle = fill;
    x.fill();
    x.lineWidth = 2;
    x.strokeStyle = T.artOutline;
    x.stroke();
  };
  const limb = (pts: [number, number][], w: number, fill: string) => {
    x.lineCap = 'round';
    x.lineJoin = 'round';
    x.strokeStyle = T.artOutline;
    x.lineWidth = w + 3;
    x.beginPath();
    pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
    x.stroke();
    x.strokeStyle = fill;
    x.lineWidth = w;
    x.stroke();
  };
  // Team B's half: a reclining figure in a red cape and a green robe.
  blob(208, 52, 60, 22, -0.35, red);
  blob(214, 66, 42, 15, -0.3, robe);
  limb([[178, 84], [160, 98], [150, 104]], 6, gold);
  limb([[246, 40], [262, 30]], 6, gold);
  blob(262, 82, 9, 8, 0, skin);
  // Team A's half: a green hill and a reaching gold arm, toward the middle.
  x.beginPath();
  x.moveTo(30, H);
  x.quadraticCurveTo(70, 70, 140, 98);
  x.lineTo(140, H);
  x.closePath();
  x.fillStyle = green;
  x.fill();
  x.lineWidth = 2;
  x.strokeStyle = T.artOutline;
  x.stroke();
  limb([[70, 60], [100, 52], [128, 46]], 7, gold);
  limb([[92, 92], [112, 78]], 6, gold);
  blob(140, 70, 8, 7, 0, skin);
  // Gold letters: each team reads its own on the far half.
  const letters = (text: string, cx: number, cy: number, rot: number, size: number) => {
    x.save();
    x.translate(cx, cy);
    x.rotate(rot);
    x.font = `bold ${size}px serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = 3;
    x.strokeStyle = T.artOutline;
    x.strokeText(text, 0, 0);
    x.fillStyle = T.letters;
    x.fillText(text, 0, 0);
    x.restore();
  };
  letters(theme.houseLetters, 186, 104, Math.PI / 2, 24);
  letters("'16X", 98, 28, -Math.PI / 2, 18);
  // Scuffs and the chipped cream border.
  for (let k = 0; k < 60; k++) {
    x.fillStyle = T.edgeChip;
    x.globalAlpha = 0.25 + rnd() * 0.3;
    x.fillRect(Math.round(rnd() * W), Math.round(rnd() * H), 1 + Math.round(rnd() * 2), 1);
  }
  x.globalAlpha = 1;
  x.fillStyle = T.edge;
  x.fillRect(0, 0, W, 4);
  x.fillRect(0, H - 4, W, 4);
  x.fillRect(0, 0, 4, H);
  x.fillRect(W - 4, 0, 4, H);
  x.fillStyle = T.edgeChip;
  for (let k = 0; k < 40; k++) {
    const side = k % 4;
    const t = rnd();
    const px = side < 2 ? t * W : side === 2 ? 1 + rnd() * 2 : W - 3 + rnd() * 2;
    const py = side >= 2 ? t * H : side === 0 ? 1 + rnd() * 2 : H - 3 + rnd() * 2;
    x.fillRect(Math.round(px), Math.round(py), 2, 1);
  }
  tableTexture = c;
  return c;
}

/** Map `img` onto the table top (z = 0) in perspective, as thin strips across the table. */
function texturedTop(h: CanvasRenderingContext2D, cam: Camera, img: HTMLCanvasElement, L: number, W: number): void {
  const N = 48;
  const sw = img.width / N;
  for (let i = 0; i < N; i++) {
    const xa = (i / N) * L;
    const xb = ((i + 1) / N) * L;
    const tl = project(cam, { x: xa, y: 0, z: 0 });
    // Each clip strip reaches a little into the next one, so no seams show between strips.
    const xc = Math.min(L, xb + (L / N) * 0.35);
    const tr = project(cam, { x: xb, y: 0, z: 0 });
    const bl = project(cam, { x: xa, y: W, z: 0 });
    const br = project(cam, { x: xb, y: W, z: 0 });
    const trc = project(cam, { x: xc, y: 0, z: 0 });
    const brc = project(cam, { x: xc, y: W, z: 0 });
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
    // A little extra width covers the strip's far corner (the strip is a slight trapezoid).
    h.drawImage(img, i * sw, 0, Math.min(sw * 1.6, img.width - i * sw), img.height, 0, 0, Math.min(sw * 1.6, img.width - i * sw), img.height);
    h.restore();
  }
}

/** A flat stripe painted on the table, `w` meters wide, from a to b. */
function stripe(h: CanvasRenderingContext2D, cam: Camera, a: { x: number; y: number }, b: { x: number; y: number }, w: number, color: string): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * (w / 2);
  const ny = (dx / l) * (w / 2);
  const z = 0.0008;
  poly(h, cam, [{ x: a.x + nx, y: a.y + ny, z }, { x: b.x + nx, y: b.y + ny, z }, { x: b.x - nx, y: b.y - ny, z }, { x: a.x - nx, y: a.y - ny, z }], color);
}

/** A vertical cylinder (the trash can the table sits on), shaded by facing. */
function cylinder(h: CanvasRenderingContext2D, theme: Theme, cam: Camera, cx: number, cy: number, r: number, z0: number, z1: number): void {
  const T = theme.table;
  const n = 20;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const nx = Math.cos(am);
    const ny = Math.sin(am);
    const toCam = (cam.eye.x - (cx + nx * r)) * nx + (cam.eye.y - (cy + ny * r)) * ny;
    if (toCam <= 0) continue;
    // Lit from above-left of the room: a highlight band and a dark side.
    const lit = 0.5 + 0.5 * Math.cos(am - 2.4);
    const col = lit > 0.75 ? T.canLight : lit > 0.35 ? T.can : T.canDark;
    poly(h, cam, [
      { x: cx + Math.cos(a0) * r, y: cy + Math.sin(a0) * r, z: z0 },
      { x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r, z: z0 },
      { x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r, z: z1 },
      { x: cx + Math.cos(a0) * r, y: cy + Math.sin(a0) * r, z: z1 },
    ], col);
  }
  // Molded rings around the can.
  for (const z of [z0 + (z1 - z0) * 0.3, z0 + (z1 - z0) * 0.62]) ring(h, cam, { x: cx, y: cy, z }, r + 0.004, T.canDark, 1, n);
}

function drawTable3D(h: CanvasRenderingContext2D, theme: Theme, cfg: GameConfig, cam: Camera): void {
  const T = theme.table;
  const { length: L, width: W } = cfg.table;
  const floorZ = -cfg.physics.tableHeight;
  const th = 0.035; // plywood thickness
  // The trash can it sits on, then the plywood edge and the painted top.
  cylinder(h, theme, cam, L / 2, W / 2, 0.3, floorZ, -th);
  box(h, cam, 0, 0, -th, L, W, 0, T.paint, T.side, T.sideDark);
  texturedTop(h, cam, tableTex(theme), L, W);
  // Faint chalk center lines (the quarters matter for serves).
  stripe(h, cam, { x: 0.04, y: W / 2 }, { x: L - 0.04, y: W / 2 }, 0.01, T.centerLine);
  stripe(h, cam, { x: L / 2, y: 0.04 }, { x: L / 2, y: W - 0.04 }, 0.01, T.centerLine);
  drawSki(h, theme, cfg, cam);
}

/**
 * A real ski laid across the middle of the table, hanging over both sides,
 * tip curled up at one end, with its graphics and a binding.
 */
function drawSki(h: CanvasRenderingContext2D, theme: Theme, cfg: GameConfig, cam: Camera): void {
  const T = theme.table;
  const { length: L, width: W } = cfg.table;
  const hz = cfg.physics.skiHeight * 0.7;
  const hw = cfg.ski.width / 2;
  const x0 = L / 2 - hw;
  const x1 = L / 2 + hw;
  const y0 = -0.2;
  const y1 = W + 0.24;
  poly(h, cam, [{ x: x0 - 0.01, y: 0, z: 0.0008 }, { x: x1 + 0.02, y: 0, z: 0.0008 }, { x: x1 + 0.02, y: W, z: 0.0008 }, { x: x0 - 0.01, y: W, z: 0.0008 }], T.skiShadow);
  box(h, cam, x0, y0, 0, x1, y1, hz, T.ski, T.skiSide, T.skiSide);
  // Upturned tip.
  const tip = (y: number, z: number): Vec3[] => [{ x: x0, y, z }, { x: x1, y, z }];
  const t0 = tip(y0, hz);
  const t1 = tip(y0 - 0.09, hz + 0.025);
  const t2 = tip(y0 - 0.14, hz + 0.065);
  poly(h, cam, [t0[0], t0[1], t1[1], t1[0]], T.ski);
  poly(h, cam, [t1[0], t1[1], t2[1], t2[0]], T.skiSide);
  // Graphics on the top: black bands, pale lettering dashes, and the binding.
  const top = hz + 0.0006;
  const band = (ya: number, yb: number, col: string, inset = 0) =>
    poly(h, cam, [{ x: x0 + inset, y: ya, z: top }, { x: x1 - inset, y: ya, z: top }, { x: x1 - inset, y: yb, z: top }, { x: x0 + inset, y: yb, z: top }], col);
  band(0.05, 0.32, T.skiStripe);
  band(W - 0.3, W - 0.02, T.skiStripe);
  for (let y = 0.09; y < 0.3; y += 0.05) band(y, y + 0.03, T.skiGraphic, hw * 0.55);
  box(h, cam, x0 + 0.008, W / 2 - 0.09, hz, x1 - 0.008, W / 2 + 0.05, hz + 0.018, T.skiBinding, shadeHex(T.skiBinding, 0.7), shadeHex(T.skiBinding, 0.8));
}

/** Screen ellipse of a horizontal circle (center, radius) as seen by `cam`. */
function screenEllipse(cam: Camera, c: Vec3, r: number): { x: number; y: number; rx: number; ry: number } | null {
  const p = project(cam, c);
  if (!p) return null;
  const fl = Math.hypot(cam.f.x, cam.f.y) || 1;
  const a = project(cam, { x: c.x + (cam.f.x / fl) * r, y: c.y + (cam.f.y / fl) * r, z: c.z });
  const b = project(cam, { x: c.x - (cam.f.x / fl) * r, y: c.y - (cam.f.y / fl) * r, z: c.z });
  const ry = a && b ? Math.abs(a.y - b.y) / 2 : r * p.scale * 0.4;
  return { x: p.x, y: (a && b ? (a.y + b.y) / 2 : p.y), rx: r * p.scale, ry: Math.max(0.5, ry) };
}

/**
 * A clear plastic cup: a faint glass body you can see the table through, the
 * water inside at its level (low in a half cup, so it reads through the
 * side), bright edge highlights, ridges and the rim.
 */
function drawCup(h: CanvasRenderingContext2D, theme: Theme, cfg: GameConfig, cam: Camera, cup: Cup, selected: boolean, time: number): void {
  const C = theme.cup;
  const r = cfg.cups.diameter / 2;
  const H = cfg.physics.cupHeight;
  const rb = r * 0.72;
  const radiusAt = (z: number) => rb + (r - rb) * (z / H);
  const top = screenEllipse(cam, { x: cup.x, y: cup.y, z: H }, r);
  const bot = screenEllipse(cam, { x: cup.x, y: cup.y, z: 0 }, rb);
  if (!top || !bot) return;
  const { length: L, width: W } = cfg.table;
  // Soft shadow, cast away from the middle of the room.
  const dx = cup.x - L / 2;
  const dy = cup.y - W / 2;
  const dl = Math.hypot(dx, dy) || 1;
  const sh = screenEllipse(cam, { x: cup.x + (dx / dl) * 0.025, y: cup.y + (dy / dl) * 0.025, z: 0.001 }, r * 1.02);
  if (sh) {
    h.fillStyle = C.shadow;
    h.beginPath();
    h.ellipse(sh.x, sh.y, sh.rx, sh.ry, 0, 0, Math.PI * 2);
    h.fill();
  }
  const taper = (a: { x: number; y: number; rx: number; ry: number }, b: { x: number; y: number; rx: number; ry: number }) => {
    h.beginPath();
    h.moveTo(a.x - a.rx, a.y);
    h.lineTo(b.x - b.rx, b.y);
    h.ellipse(b.x, b.y, b.rx, b.ry, 0, Math.PI, 0, true);
    h.lineTo(a.x + a.rx, a.y);
    h.ellipse(a.x, a.y, a.rx, a.ry, 0, 0, Math.PI, true);
    h.closePath();
  };
  // Glass body.
  h.fillStyle = C.glass;
  taper(top, bot);
  h.fill();
  // Water column and its surface.
  const zw = H * (cup.state === 'full' ? 0.62 : 0.28);
  const wat = screenEllipse(cam, { x: cup.x, y: cup.y, z: zw }, radiusAt(zw) * 0.94);
  if (wat) {
    const wb = { ...bot, rx: bot.rx * 0.94, ry: bot.ry * 0.94 };
    h.fillStyle = C.water;
    taper(wat, wb);
    h.fill();
    h.fillStyle = C.waterTop;
    h.beginPath();
    h.ellipse(wat.x, wat.y, wat.rx, wat.ry, 0, 0, Math.PI * 2);
    h.fill();
    h.fillStyle = C.waterShine;
    h.fillRect(Math.round(wat.x - wat.rx * 0.5), Math.round(wat.y - wat.ry * 0.3), Math.max(1, Math.round(wat.rx * 0.35)), 1);
  }
  // Edges: a bright lit side, a darker far side, a vertical shine, ridges.
  h.lineWidth = 1;
  h.strokeStyle = C.glassEdge;
  h.beginPath();
  h.moveTo(top.x - top.rx, top.y);
  h.lineTo(bot.x - bot.rx, bot.y);
  h.stroke();
  h.strokeStyle = C.glassShade;
  h.beginPath();
  h.moveTo(top.x + top.rx, top.y);
  h.lineTo(bot.x + bot.rx, bot.y);
  h.stroke();
  h.strokeStyle = C.glassEdge;
  h.globalAlpha = 0.6;
  h.beginPath();
  h.moveTo(top.x - top.rx * 0.5, top.y + top.ry);
  h.lineTo(bot.x - bot.rx * 0.5, bot.y + bot.ry * 0.6);
  h.stroke();
  h.globalAlpha = 1;
  for (const z of [0.18, 0.82]) {
    const e = screenEllipse(cam, { x: cup.x, y: cup.y, z: H * z }, radiusAt(H * z));
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
  // Rim.
  h.strokeStyle = C.rim;
  h.beginPath();
  h.ellipse(top.x, top.y, top.rx, top.ry, 0, 0, Math.PI * 2);
  h.stroke();
  if (selected) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 10);
    ring(h, cam, { x: cup.x, y: cup.y, z: H + 0.005 }, r * (1.3 + pulse * 0.3), theme.colors.penaltyCursor, 2, 28);
  }
}

/** The ball: shaded sphere with an outline, a highlight and (when spinning) a colored streak. */
function drawBall(h: CanvasRenderingContext2D, theme: Theme, cfg: GameConfig, cam: Camera, pos: Vec3, vel: Vec3, fx: BallEffects): void {
  const c = project(cam, { ...pos, z: pos.z + cfg.physics.ballRadius });
  if (!c) return;
  const r = Math.max(1.5, cfg.physics.ballRadius * c.scale);
  const spin = fx.topspin > 0.05 ? theme.colors.spinTop : fx.topspin < -0.05 ? theme.colors.spinBack : Math.abs(fx.sideKick) > 0.01 ? theme.colors.spinSide : null;
  if (spin) {
    const tail = project(cam, { x: pos.x - vel.x * 0.06, y: pos.y - vel.y * 0.06, z: pos.z - vel.z * 0.06 + cfg.physics.ballRadius });
    if (tail) {
      h.strokeStyle = spin;
      h.lineWidth = Math.max(2, r * 0.8);
      h.beginPath();
      h.moveTo(tail.x, tail.y);
      h.lineTo(c.x, c.y);
      h.stroke();
    }
  }
  h.fillStyle = theme.colors.ballOutline;
  h.beginPath();
  h.arc(c.x, c.y, r + 1, 0, Math.PI * 2);
  h.fill();
  h.fillStyle = theme.colors.ball;
  h.beginPath();
  h.arc(c.x, c.y, r, 0, Math.PI * 2);
  h.fill();
  h.fillStyle = theme.cup.ballShade;
  h.beginPath();
  h.arc(c.x + r * 0.25, c.y + r * 0.25, r * 0.75, -0.2, Math.PI * 0.9);
  h.fill();
  h.fillStyle = theme.colors.ballShine;
  h.fillRect(Math.round(c.x - r * 0.45), Math.round(c.y - r * 0.5), Math.max(1, Math.round(r * 0.4)), Math.max(1, Math.round(r * 0.3)));
}
