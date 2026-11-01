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
import { solveArc, solveServe } from '../core/trajectory';
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
  const ceilZ = 2.25;
  const X0 = -2.5;
  const X1 = L + 2.5;
  const Y0 = -1.9;
  const Y1 = W + 1.9;

  // --- Room shell.
  poly(b, cam, [{ x: X0, y: Y0, z: ceilZ }, { x: X1, y: Y0, z: ceilZ }, { x: X1, y: Y1, z: ceilZ }, { x: X0, y: Y1, z: ceilZ }], R.ceiling);
  poly(b, cam, [{ x: X0, y: Y0, z: floorZ }, { x: X1, y: Y0, z: floorZ }, { x: X1, y: Y1, z: floorZ }, { x: X0, y: Y1, z: floorZ }], R.floor);

  // Concrete: speckles, slab seams, sticky stains.
  for (const s of floorSpecks(X0, X1, Y0, Y1)) {
    const p = project(cam, { x: s.x, y: s.y, z: floorZ });
    if (!p) continue;
    b.fillStyle = s.light ? R.floorSpeck : R.floorSeam;
    b.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
  }
  for (let x = Math.ceil(X0); x <= X1; x += 1.2) line(b, cam, { x, y: Y0, z: floorZ }, { x, y: Y1, z: floorZ }, R.floorSeam);
  for (let y = Y0; y <= Y1; y += 1.2) line(b, cam, { x: X0, y, z: floorZ }, { x: X1, y, z: floorZ }, R.floorSeam);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) disc(b, cam, { x: X0 + rnd() * (X1 - X0), y: Y0 + rnd() * (Y1 - Y0), z: floorZ }, 0.06 + rnd() * 0.18, R.stain, 9);
  // The table's shadow on the floor.
  poly(b, cam, [{ x: -0.08, y: -0.1, z: floorZ + 0.001 }, { x: L + 0.08, y: -0.1, z: floorZ + 0.001 }, { x: L + 0.08, y: W + 0.1, z: floorZ + 0.001 }, { x: -0.08, y: W + 0.1, z: floorZ + 0.001 }], R.tableShadow);

  // Wood-plank walls in alternating tones, with grooves, a chair rail and baseboards.
  const plank = 0.24;
  for (let i = 0, x = X0; x < X1; i++, x += plank) {
    const col = i % 3 === 0 ? R.wallAlt : i % 3 === 1 ? R.wall : R.wallWarm;
    for (const y of [Y0, Y1]) {
      poly(b, cam, [{ x, y, z: floorZ }, { x: x + plank, y, z: floorZ }, { x: x + plank, y, z: ceilZ }, { x, y, z: ceilZ }], col);
      line(b, cam, { x, y, z: floorZ }, { x, y, z: ceilZ }, R.wallDark);
    }
  }
  for (let i = 0, y = Y0; y < Y1; i++, y += plank) {
    const col = i % 2 ? R.wallDark : R.wallAlt;
    for (const x of [X0, X1]) poly(b, cam, [{ x, y, z: floorZ }, { x, y: y + plank, z: floorZ }, { x, y: y + plank, z: ceilZ }, { x, y, z: ceilZ }], col);
  }
  for (const y of [Y0, Y1]) {
    poly(b, cam, [{ x: X0, y, z: floorZ }, { x: X1, y, z: floorZ }, { x: X1, y, z: floorZ + 0.12 }, { x: X0, y, z: floorZ + 0.12 }], R.baseboard);
    poly(b, cam, [{ x: X0, y, z: 0.08 }, { x: X1, y, z: 0.08 }, { x: X1, y, z: 0.12 }, { x: X0, y, z: 0.12 }], R.rail);
  }
  for (const x of [X0, X1]) poly(b, cam, [{ x, y: Y0, z: floorZ }, { x, y: Y1, z: floorZ }, { x, y: Y1, z: floorZ + 0.12 }, { x, y: Y0, z: floorZ + 0.12 }], R.baseboard);

  // Ceiling joists (real boxes) and pipe runs.
  for (let x = X0 + 0.3; x <= X1; x += 0.6) box(b, cam, x, Y0, ceilZ - 0.14, x + 0.07, Y1, ceilZ, R.joist, R.joistDark, R.joistDark);
  box(b, cam, X0, Y0 + 0.48, ceilZ - 0.26, X1, Y0 + 0.56, ceilZ - 0.18, R.pipeLight, R.pipe, R.pipe);
  box(b, cam, X0, Y1 - 0.84, ceilZ - 0.3, X1, Y1 - 0.78, ceilZ - 0.24, R.pipeLight, R.pipe, R.pipe);

  // End-wall decor at both ends, so either camera sees the far wall dressed.
  for (const endX of [X0, X1]) drawEndWall(b, theme, cam, endX, endX === X1 ? -1 : 1, W, floorZ);
  // Posters (with words on them) and a dartboard on the side walls.
  for (const [y, inward] of [
    [Y0, 1],
    [Y1, -1],
  ] as const) {
    const yy = y + inward * 0.012;
    R.posters.forEach((col, i) => {
      const x = -1.4 + i * ((L + 2.8) / R.posters.length) + 0.3;
      poly(b, cam, [{ x: x - 0.02, y: yy, z: 0.18 }, { x: x + 0.38, y: yy, z: 0.18 }, { x: x + 0.38, y: yy, z: 0.72 }, { x: x - 0.02, y: yy, z: 0.72 }], R.posterFrame);
      poly(b, cam, [{ x, y: yy, z: 0.2 }, { x: x + 0.36, y: yy, z: 0.2 }, { x: x + 0.36, y: yy, z: 0.7 }, { x, y: yy, z: 0.7 }], col);
      // Simple poster art: a ball over two stripes.
      const k = (i + (inward === 1 ? 0 : 1)) % 2;
      wallDisc(b, cam, { x: x + 0.18, y: yy + inward * 0.001, z: 0.56 }, 0.07, k ? R.posterInk : R.posterFrame, 10);
      poly(b, cam, [{ x: x + 0.05, y: yy + inward * 0.001, z: 0.3 }, { x: x + 0.31, y: yy + inward * 0.001, z: 0.3 }, { x: x + 0.31, y: yy + inward * 0.001, z: 0.34 }, { x: x + 0.05, y: yy + inward * 0.001, z: 0.34 }], R.posterInk);
      poly(b, cam, [{ x: x + 0.05, y: yy + inward * 0.001, z: 0.38 }, { x: x + 0.31, y: yy + inward * 0.001, z: 0.38 }, { x: x + 0.31, y: yy + inward * 0.001, z: 0.4 }, { x: x + 0.05, y: yy + inward * 0.001, z: 0.4 }], R.posterInk);
    });
    const dx = L / 2 + (inward === 1 ? 0.25 : -0.25);
    for (const [rad, ringCol] of [
      [0.2, R.dartRim],
      [0.17, R.dartA],
      [0.12, R.dartB],
      [0.07, R.dartA],
      [0.025, R.dartBull],
    ] as const)
      wallDisc(b, cam, { x: dx, y: yy + inward * 0.002, z: 0.75 }, rad, ringCol);
  }

  // String lights sagging along both long walls, each bulb with a small glow.
  for (const y of [Y0 + 0.15, Y1 - 0.15]) {
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      const x = X0 + 0.3 + t * (X1 - X0 - 0.6);
      const sag = Math.sin(((t * 7) % 1) * Math.PI) * 0.12;
      const p = project(cam, { x, y, z: ceilZ - 0.32 - sag });
      if (!p) continue;
      const col = R.stringLights[i % R.stringLights.length];
      const glow = Math.max(2, p.scale * 0.07);
      const g = b.createRadialGradient(p.x, p.y, 0, p.x, p.y, glow);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      b.globalAlpha = 0.45;
      b.fillStyle = g;
      b.fillRect(p.x - glow, p.y - glow, glow * 2, glow * 2);
      b.globalAlpha = 1;
      b.fillStyle = col;
      const s = Math.max(1, Math.round(p.scale * 0.025));
      b.fillRect(Math.round(p.x), Math.round(p.y), s, s);
    }
  }

  // Corner props: a mini fridge and a trash can at each end.
  for (const end of [X0, X1]) {
    const inward = end === X0 ? 1 : -1;
    const fx0 = end + inward * 0.05;
    const fx1 = end + inward * 0.6;
    box(b, cam, Math.min(fx0, fx1), Y0 + 0.08, floorZ, Math.max(fx0, fx1), Y0 + 0.62, floorZ + 0.85, R.fridgeTop, R.fridge, R.fridgeDark);
    const tx0 = end + inward * 0.1;
    const tx1 = end + inward * 0.45;
    box(b, cam, Math.min(tx0, tx1), Y1 - 0.45, floorZ, Math.max(tx0, tx1), Y1 - 0.1, floorZ + 0.6, R.trashTop, R.trash, R.trashDark);
  }

  // --- People standing behind the far end of the table go first, so the table hides their legs.
  const viewDepth = (p: Vec3) => (p.x - cam.eye.x) * cam.f.x + (p.y - cam.eye.y) * cam.f.y + (p.z - cam.eye.z) * cam.f.z;
  const farEnd = viewDepth({ x: cam.f.x >= 0 ? L : 0, y: W / 2, z: 0 });
  const activeNow = [game.activePlayer('A'), game.activePlayer('B')];
  const isActive = (p: PlayerId) => activeNow.some((a) => a && a.team === p.team && a.side === p.side);
  const behindTable = PLAYERS.map((p) => ({ p, pos: standSpot(game, p) }))
    .filter(({ pos }) => viewDepth(pos) > farEnd)
    .sort((a, c) => viewDepth(c.pos) - viewDepth(a.pos));
  for (const { p, pos } of behindTable) drawPerson(b, theme, game, cam, p, pos, vp.team === p.team, isActive(p));

  // --- Fine layer: the table, its markings, the ski, then cups, ball and lamp.
  const ch = vp.camHi;
  drawTable3D(h, theme, cfg, ch);

  // Light pool from the hanging lamp.
  const lamp = project(ch, { x: L / 2, y: W / 2, z: 0 });
  if (lamp) {
    const g = h.createRadialGradient(lamp.x, lamp.y, 2, lamp.x, lamp.y, lamp.scale * 2.2);
    g.addColorStop(0, R.lampGlow);
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

  // Depth-sorted fine objects: cups, ball, lamp.
  type Item = { depth: number; draw: () => void };
  const items: Item[] = [];
  const depthOf = (p: Vec3) => (p.x - ch.eye.x) * ch.f.x + (p.y - ch.eye.y) * ch.f.y + (p.z - ch.eye.z) * ch.f.z;
  const penaltyCup = st.phase === 'penalty' ? game.penaltyCups()[Math.min(game.penaltyCursor, game.penaltyCups().length - 1)] : undefined;
  for (const cup of game.cups) {
    if (cup.state === 'removed') continue;
    items.push({ depth: depthOf({ x: cup.x, y: cup.y, z: 0 }), draw: () => drawCup(h, theme, cfg, ch, cup, cup === penaltyCup, game.time) });
  }
  if (ball.status !== 'sunk') items.push({ depth: depthOf(ball.pos), draw: () => drawBall(h, theme, cfg, ch, ball.pos, ball.vel, ball.fx) });
  const lampAt = { x: L / 2, y: W / 2, z: 1.3 };
  items.push({ depth: depthOf(lampAt), draw: () => drawLamp(h, theme, ch, lampAt, ceilZ) });
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
/** Text rendered once to a small bitmap, so it can be painted onto a wall in perspective. */
function textBitmap(text: string, font: string, fill: string, shadow: string): HTMLCanvasElement {
  const key = `${text}|${font}|${fill}`;
  let c = textCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    const probe = c.getContext('2d')!;
    probe.font = font;
    c.width = Math.max(64, Math.ceil(probe.measureText(text).width) + 8);
    c.height = 32;
    const x = c.getContext('2d')!;
    x.font = font;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = shadow;
    x.fillText(text, c.width / 2 + 1, 18);
    x.fillStyle = fill;
    x.fillText(text, c.width / 2, 16);
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

function drawEndWall(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, x: number, inward: 1 | -1, W: number, floorZ: number): void {
  const R = theme.room;
  const wx = x + inward * 0.01;
  // y runs so the decor reads left-to-right from the camera facing this wall.
  const Y = (t: number) => (inward === -1 ? W / 2 + t : W / 2 - t);
  // House letters above the couch.
  wallImage(b, cam, textBitmap(theme.houseLetters, 'bold 26px serif', R.letters, R.letterShadow), { x: wx, y: Y(-0.7), z: 0.66 }, { x: wx, y: Y(0.7), z: 0.66 }, { x: wx, y: Y(-0.7), z: 0.12 });
  // Big Green flag to one side.
  const fy0 = Y(1.3);
  const fy1 = Y(2.0);
  poly(b, cam, [{ x: wx, y: fy0, z: 0.85 }, { x: wx, y: fy1, z: 0.85 }, { x: wx, y: fy1, z: 0.35 }, { x: wx, y: fy0, z: 0.35 }], R.flag);
  wallImage(b, cam, textBitmap('D', 'bold 30px serif', R.flagMark, R.flag), { x: wx, y: fy0, z: 0.85 }, { x: wx, y: fy1, z: 0.85 }, { x: wx, y: fy0, z: 0.35 });
  // Paddle rack on the other side.
  for (let i = 0; i < 3; i++) {
    const py = Y(-1.4 - i * 0.22);
    const p = project(cam, { x: wx, y: py, z: 0.55 });
    if (!p) continue;
    const r = Math.max(1, p.scale * 0.08);
    b.fillStyle = R.paddleHandle;
    b.fillRect(Math.round(p.x - r * 0.2), Math.round(p.y + r * 0.7), Math.max(1, Math.round(r * 0.4)), Math.max(1, Math.round(r * 1.2)));
    b.fillStyle = R.paddle;
    b.beginPath();
    b.arc(p.x, p.y, r, 0, Math.PI * 2);
    b.fill();
  }
  // Beat-up couch against the wall.
  const cx0 = x + inward * 0.02;
  const cx1 = x + inward * 0.75;
  const [lo, hi] = [Math.min(cx0, cx1), Math.max(cx0, cx1)];
  const yA = Math.min(Y(-1.0), Y(1.0));
  const yB = Math.max(Y(-1.0), Y(1.0));
  box(b, cam, lo, yA, floorZ, hi, yB, floorZ + 0.42, R.couch, R.couchDark);
  const back0 = inward === 1 ? x + 0.02 : x - 0.25;
  box(b, cam, back0, yA, floorZ, back0 + 0.23, yB, floorZ + 0.85, R.couchDark, R.couchDark, R.couch);
  for (const ay of [yA, yB - 0.2]) box(b, cam, lo, ay, floorZ, hi, ay + 0.2, floorZ + 0.62, R.couch, R.couchDark);
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

/** Sampled flight path of a shot (no spin or scatter), for the aim preview. */
function previewPath(game: Game, team: TeamId): { pts: Vec3[]; target: { x: number; y: number; cup: Cup | null } } | null {
  const style = game.currentStyle(team);
  const p = game.activePlayer(team);
  if (!style || !p) return null;
  const cfg = game.cfg;
  const g = cfg.physics.gravity;
  const t = game.aimTarget(team, game.aim[team], style);
  const ball = game.ball.pos;
  const serving = style.kind === 'serve';
  const spot = game.playerSpot(p);
  const from: Vec3 = serving || game.timingCue(team) ? { ...ball } : { x: spot.x, y: spot.y, z: 0.3 };
  const pts: Vec3[] = [];
  const arc = (o: Vec3, v: Vec3, landZ: number) => {
    const dt = 1 / 90;
    const q = { ...o };
    const vel = { ...v };
    for (let k = 0; k < 400; k++) {
      pts.push({ ...q });
      vel.z -= g * dt;
      q.x += vel.x * dt;
      q.y += vel.y * dt;
      q.z += vel.z * dt;
      if (vel.z < 0 && q.z <= landZ) break;
    }
    return { pos: { ...q, z: landZ }, vel };
  };
  if (serving) {
    const { vel } = solveServe(cfg, from, t, style.peak);
    const first = arc(from, vel, 0);
    const ph = cfg.physics;
    arc(first.pos, { x: first.vel.x * ph.tableFriction, y: first.vel.y * ph.tableFriction, z: -first.vel.z * ph.restitution }, 0);
  } else {
    const landZ = t.cup ? cfg.physics.cupHeight : 0;
    arc(from, solveArc(from, t, style.peak, g, 0, landZ), landZ);
  }
  return { pts, target: t };
}

/** The aim preview: a dotted path and a landing marker (a ring on a locked cup, red when off the table). */
function drawAim(h: CanvasRenderingContext2D, theme: Theme, game: Game, cam: Camera, team: TeamId): void {
  const cfg = game.cfg;
  const path = previewPath(game, team);
  if (!path) return;
  const { pts, target: t } = path;
  const frozen = game.timingCue(team) !== null;
  const { length: L, width: W } = cfg.table;
  const off = !t.cup && (t.x < 0 || t.x > L || t.y < 0 || t.y > W);
  const col = off ? theme.colors.bad : team === 'A' ? theme.colors.aimA : theme.colors.aimB;
  const dark = theme.colors.ballOutline;

  // Dotted path, marching toward the target and fading in from the hitter.
  const step = 5;
  const phase = Math.floor(game.time * 30) % step;
  for (let k = phase; k < pts.length; k += step) {
    const q = project(cam, pts[k]);
    if (!q) continue;
    const a = k / pts.length;
    const s = q.scale > 260 ? 3 : 2;
    h.globalAlpha = 0.45 + 0.55 * a;
    h.fillStyle = dark;
    h.fillRect(Math.round(q.x) - 1, Math.round(q.y) - 1, s + 2, s + 2);
    h.fillStyle = col;
    h.fillRect(Math.round(q.x), Math.round(q.y), s, s);
  }
  h.globalAlpha = 1;

  if (t.cup) {
    // Locked on a cup: a bright ring around its rim and a marker over it.
    const H = cfg.physics.cupHeight;
    const r = cfg.cups.diameter / 2;
    ring(h, cam, { x: t.x, y: t.y, z: H + 0.004 }, r * 1.25, dark, 4, 28);
    ring(h, cam, { x: t.x, y: t.y, z: H + 0.004 }, r * 1.25, theme.colors.activeRing, 2, 28);
    const top = project(cam, { x: t.x, y: t.y, z: H + 0.09 + (frozen ? 0 : Math.sin(game.time * 8) * 0.01) });
    if (top) {
      const s = Math.max(3, Math.round(top.scale * 0.025));
      h.fillStyle = dark;
      tri(h, Math.round(top.x), Math.round(top.y) + 1, s + 1);
      h.fillStyle = theme.colors.activeRing;
      tri(h, Math.round(top.x), Math.round(top.y), s);
    }
    return;
  }
  // Landing marker on the table (or the floor beyond it): ring, four ticks, center dot.
  // Off the table the marker floats at table height, so it reads as just past the edge.
  const z = 0.003;
  const R = 0.085 + (frozen ? 0 : 0.008 * Math.sin(game.time * 6));
  const c = { x: t.x, y: t.y, z };
  if (frozen) {
    h.globalAlpha = 0.3;
    disc(h, cam, c, R, col, 24);
    h.globalAlpha = 1;
  }
  ring(h, cam, c, R, dark, 4, 28);
  ring(h, cam, c, R, col, 2, 28);
  const tick = (dx: number, dy: number) => {
    const a = { x: t.x + dx * R * 1.25, y: t.y + dy * R * 1.25, z };
    const e = { x: t.x + dx * R * (frozen ? 1.45 : 1.75), y: t.y + dy * R * (frozen ? 1.45 : 1.75), z };
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

/** A circle on a side wall (in the x–z plane at the given y). */
function wallDisc(b: CanvasRenderingContext2D, cam: Camera, c: Vec3, r: number, fill: string, n = 16): void {
  const pts: Vec3[] = [];
  for (let i = 0; i < n; i++) pts.push({ x: c.x + Math.cos((i / n) * Math.PI * 2) * r, y: c.y, z: c.z + Math.sin((i / n) * Math.PI * 2) * r });
  poly(b, cam, pts, fill);
}

/** The hanging lamp over the table: cord, shade and a glowing bulb. */
function drawLamp(b: CanvasRenderingContext2D, theme: Theme, cam: Camera, at: Vec3, ceilZ: number): void {
  const R = theme.room;
  line(b, cam, { ...at, z: ceilZ }, { ...at, z: at.z + 0.12 }, R.lampCord);
  const top = project(cam, { ...at, z: at.z + 0.12 });
  const bot = project(cam, at);
  if (!top || !bot) return;
  const wTop = 0.1 * top.scale;
  const wBot = 0.26 * bot.scale;
  b.fillStyle = R.lampShade;
  b.beginPath();
  b.moveTo(top.x - wTop, top.y);
  b.lineTo(top.x + wTop, top.y);
  b.lineTo(bot.x + wBot, bot.y);
  b.lineTo(bot.x - wBot, bot.y);
  b.closePath();
  b.fill();
  b.fillStyle = R.lampShadeLight;
  b.fillRect(Math.round(bot.x - wBot), Math.round(bot.y) - 1, Math.round(wBot * 2), 1);
  const glow = Math.max(3, bot.scale * 0.16);
  const g = b.createRadialGradient(bot.x, bot.y + 1, 0, bot.x, bot.y + 1, glow);
  g.addColorStop(0, R.bulb);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  b.fillStyle = g;
  b.fillRect(bot.x - glow, bot.y + 1 - glow, glow * 2, glow * 2);
}

// ------------------------------------------------------------ table art

let tableTexture: HTMLCanvasElement | null = null;
/**
 * Pixel-art plywood for the table top: boards running the length of the
 * table, staggered butt joints, wavy grain, knots, ring stains and darker worn
 * edges. Drawn once; mapped onto the table in perspective.
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
  const boards = 6;
  const bh = H / boards;
  for (let i = 0; i < boards; i++) {
    const tone = T.boards[i % T.boards.length];
    x.fillStyle = tone;
    x.fillRect(0, Math.round(i * bh), W, Math.ceil(bh));
    // Grain: wavy darker and lighter streaks along the board.
    for (let k = 0; k < 9; k++) {
      const y0 = i * bh + 2 + rnd() * (bh - 4);
      const amp = 0.6 + rnd() * 1.4;
      const freq = 0.02 + rnd() * 0.05;
      const ph = rnd() * 6.28;
      const start = rnd() * W * 0.3;
      const len = W * (0.4 + rnd() * 0.6);
      x.fillStyle = k % 3 === 0 ? T.grainLight : T.grain;
      for (let px = start; px < Math.min(W, start + len); px++) x.fillRect(Math.round(px), Math.round(y0 + Math.sin(px * freq + ph) * amp), 1, 1);
    }
    // Board seam and a staggered butt joint.
    x.fillStyle = T.seam;
    x.fillRect(0, Math.round((i + 1) * bh) - 1, W, 1);
    const joint = Math.round(((i * 0.37 + 0.2) % 1) * W);
    x.fillRect(joint, Math.round(i * bh), 1, Math.round(bh));
  }
  // Knots.
  for (let k = 0; k < 7; k++) {
    const kx = Math.round(rnd() * W);
    const ky = Math.round(rnd() * H);
    x.fillStyle = T.knot;
    x.fillRect(kx - 2, ky - 1, 5, 3);
    x.fillRect(kx - 1, ky - 2, 3, 5);
    x.fillStyle = T.grain;
    x.fillRect(kx - 3, ky, 1, 1);
    x.fillRect(kx + 3, ky, 1, 1);
  }
  // Faint ring stains where cups have stood, near both ends.
  x.strokeStyle = T.stain;
  for (const [sx, sy] of [
    [26, 60],
    [40, 84],
    [252, 52],
    [262, 92],
    [140, 30],
  ]) {
    x.beginPath();
    x.arc(sx, sy, 5, 0, Math.PI * 2);
    x.stroke();
  }
  // Worn, darker edges.
  x.fillStyle = T.edgeWear;
  x.fillRect(0, 0, W, 2);
  x.fillRect(0, H - 2, W, 2);
  x.fillRect(0, 0, 2, H);
  x.fillRect(W - 2, 0, 2, H);
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
    const tr = project(cam, { x: xb, y: 0, z: 0 });
    const bl = project(cam, { x: xa, y: W, z: 0 });
    const br = project(cam, { x: xb, y: W, z: 0 });
    if (!tl || !tr || !bl || !br) continue;
    h.save();
    h.beginPath();
    h.moveTo(tl.x, tl.y);
    h.lineTo(tr.x, tr.y);
    h.lineTo(br.x, br.y);
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

function drawTable3D(h: CanvasRenderingContext2D, theme: Theme, cfg: GameConfig, cam: Camera): void {
  const T = theme.table;
  const { length: L, width: W } = cfg.table;
  const floorZ = -cfg.physics.tableHeight;
  const th = 0.045; // top thickness
  // Legs with a lighter lit face, and a stretcher between each pair.
  const legs: [number, number][] = [
    [0.1, 0.1],
    [L - 0.18, 0.1],
    [0.1, W - 0.18],
    [L - 0.18, W - 0.18],
    [L / 2 - 0.04, 0.1],
    [L / 2 - 0.04, W - 0.18],
  ];
  for (const y of [0.13, W - 0.15]) box(h, cam, 0.12, y, floorZ + 0.14, L - 0.12, y + 0.03, floorZ + 0.19, T.legLight, T.leg, T.legDark);
  for (const [x, y] of legs) box(h, cam, x, y, floorZ, x + 0.08, y + 0.08, -th, T.legLight, T.leg, T.legDark);
  // Apron/edge of the top, then the textured surface.
  box(h, cam, 0, 0, -th, L, W, 0, T.boards[0], T.side, T.sideDark);
  texturedTop(h, cam, tableTex(theme), L, W);
  // A lit bevel along every edge of the top.
  for (const [a, b] of [
    [{ x: 0, y: 0 }, { x: L, y: 0 }],
    [{ x: 0, y: W }, { x: L, y: W }],
    [{ x: 0, y: 0 }, { x: 0, y: W }],
    [{ x: L, y: 0 }, { x: L, y: W }],
  ])
    line(h, cam, { ...a, z: 0.0005 }, { ...b, z: 0.0005 }, T.bevel, 1);
  // Painted markings: border, the lengthwise and widthwise center lines.
  const paint = theme.colors.tableLine;
  const e = 0.025;
  stripe(h, cam, { x: e, y: e }, { x: L - e, y: e }, 0.02, paint);
  stripe(h, cam, { x: e, y: W - e }, { x: L - e, y: W - e }, 0.02, paint);
  stripe(h, cam, { x: e, y: e }, { x: e, y: W - e }, 0.02, paint);
  stripe(h, cam, { x: L - e, y: e }, { x: L - e, y: W - e }, 0.02, paint);
  stripe(h, cam, { x: e, y: W / 2 }, { x: L - e, y: W / 2 }, 0.012, paint);
  stripe(h, cam, { x: L / 2, y: e }, { x: L / 2, y: W - e }, 0.012, paint);
  drawSki(h, theme, cfg, cam);
}

/** The ski across the middle: a capsule with thickness, a center stripe and a highlight. */
function drawSki(h: CanvasRenderingContext2D, theme: Theme, cfg: GameConfig, cam: Camera): void {
  const { length: L, width: W } = cfg.table;
  const sk = cfg.ski;
  const hz = cfg.physics.skiHeight;
  const capsule = (half: number, rad: number, z: number): Vec3[] => {
    const pts: Vec3[] = [];
    const ends = [W / 2 - half + rad, W / 2 + half - rad];
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      pts.push({ x: L / 2 + Math.cos(a) * rad, y: ends[0] + Math.sin(a) * rad, z });
    }
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI;
      pts.push({ x: L / 2 + Math.cos(a) * rad, y: ends[1] + Math.sin(a) * rad, z });
    }
    return pts;
  };
  const half = sk.length / 2;
  const rad = sk.width / 2;
  poly(h, cam, capsule(half, rad * 1.05, 0.001), theme.table.skiShadow);
  poly(h, cam, capsule(half, rad, hz * 0.4), theme.table.skiSide);
  poly(h, cam, capsule(half, rad, hz), theme.colors.skiBody);
  poly(h, cam, capsule(half * 0.92, rad * 0.28, hz + 0.0005), theme.colors.skiStripe);
  line(h, cam, { x: L / 2 - rad * 0.6, y: W / 2 - half * 0.85, z: hz + 0.001 }, { x: L / 2 - rad * 0.6, y: W / 2 + half * 0.85, z: hz + 0.001 }, theme.table.skiShine, 1);
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
 * A party cup: shadow on the table, tapered body with banded shading and a
 * specular streak, ridges, a rolled rim, the pale inside wall and the water
 * surface at its level (lower for a half cup).
 */
function drawCup(h: CanvasRenderingContext2D, theme: Theme, cfg: GameConfig, cam: Camera, cup: Cup, selected: boolean, time: number): void {
  const C = theme.cup;
  const r = cfg.cups.diameter / 2;
  const H = cfg.physics.cupHeight;
  const rb = r * 0.72;
  const radiusAt = (z: number) => rb + (r - rb) * (z / H);
  const body = cup.team === 'A' ? theme.colors.cupTeamA : theme.colors.cupTeamB;
  const top = screenEllipse(cam, { x: cup.x, y: cup.y, z: H }, r);
  const bot = screenEllipse(cam, { x: cup.x, y: cup.y, z: 0 }, rb);
  if (!top || !bot) return;
  const { length: L, width: W } = cfg.table;
  // Shadow, cast away from the lamp over the table's center.
  const dx = cup.x - L / 2;
  const dy = cup.y - W / 2;
  const dl = Math.hypot(dx, dy) || 1;
  const sh = screenEllipse(cam, { x: cup.x + (dx / dl) * 0.03, y: cup.y + (dy / dl) * 0.03, z: 0.001 }, r * 1.05);
  if (sh) {
    h.fillStyle = C.shadow;
    h.beginPath();
    h.ellipse(sh.x, sh.y, sh.rx, sh.ry, 0, 0, Math.PI * 2);
    h.fill();
  }
  // Body outline: rim edges down to the front half of the base.
  const bodyPath = () => {
    h.beginPath();
    h.moveTo(top.x - top.rx, top.y);
    h.lineTo(bot.x - bot.rx, bot.y);
    h.ellipse(bot.x, bot.y, bot.rx, bot.ry, 0, Math.PI, 0, true);
    h.lineTo(top.x + top.rx, top.y);
    h.closePath();
  };
  h.save();
  bodyPath();
  h.clip();
  const left = top.x - top.rx;
  const span = top.rx * 2;
  const bands: [number, number, number][] = [
    [0, 0.1, 0.82],
    [0.1, 0.22, 1.12],
    [0.22, 0.3, 1.55],
    [0.3, 0.55, 1.04],
    [0.55, 0.78, 0.88],
    [0.78, 1, 0.68],
  ];
  const yTop = top.y - 1;
  const yBot = bot.y + bot.ry + 1;
  for (const [a, b, k] of bands) {
    h.fillStyle = shadeHex(body, k);
    h.fillRect(Math.floor(left + a * span), yTop, Math.ceil((b - a) * span) + 1, yBot - yTop);
  }
  // Ridges (an embossed line pair around the body) and the foot ring.
  for (const [z, k] of [
    [0.3, 0.7],
    [0.44, 0.7],
    [0.06, 0.55],
  ] as const) {
    const e = screenEllipse(cam, { x: cup.x, y: cup.y, z: H * z }, radiusAt(H * z));
    if (!e) continue;
    h.strokeStyle = shadeHex(body, k);
    h.lineWidth = 1;
    h.beginPath();
    h.ellipse(e.x, e.y, e.rx, e.ry, 0, Math.PI, 0, true);
    h.stroke();
    h.strokeStyle = shadeHex(body, 1.3);
    h.beginPath();
    h.ellipse(e.x, e.y + 1, e.rx, e.ry, 0, Math.PI * 0.85, Math.PI * 0.55, true);
    h.stroke();
  }
  h.restore();
  // Rolled rim, then the pale inside, then the water at its level.
  h.fillStyle = shadeHex(body, 1.18);
  h.beginPath();
  h.ellipse(top.x, top.y, top.rx + 0.5, top.ry + 0.5, 0, 0, Math.PI * 2);
  h.fill();
  const inner = { ...top, rx: top.rx * 0.87, ry: top.ry * 0.87 };
  h.fillStyle = C.inside;
  h.beginPath();
  h.ellipse(inner.x, inner.y, inner.rx, inner.ry, 0, 0, Math.PI * 2);
  h.fill();
  // The far inside wall catches more light than the near one.
  h.fillStyle = C.insideShade;
  h.beginPath();
  h.ellipse(inner.x, inner.y, inner.rx, inner.ry, 0, 0, Math.PI);
  h.fill();
  const zw = H * (cup.state === 'full' ? 0.8 : 0.42);
  const wat = screenEllipse(cam, { x: cup.x, y: cup.y, z: zw }, radiusAt(zw) * 0.9);
  if (wat) {
    // Keep a strip of water in view even when the near rim would hide it, so half cups read clearly.
    wat.y = Math.min(wat.y, inner.y + inner.ry * (cup.state === 'full' ? 0.35 : 0.85));
    h.save();
    h.beginPath();
    h.ellipse(inner.x, inner.y, inner.rx, inner.ry, 0, 0, Math.PI * 2);
    h.clip();
    h.fillStyle = cup.state === 'full' ? theme.colors.water : theme.colors.waterHalf;
    h.beginPath();
    h.ellipse(wat.x, wat.y, wat.rx, wat.ry, 0, 0, Math.PI * 2);
    h.fill();
    h.fillStyle = C.waterShine;
    h.fillRect(Math.round(wat.x - wat.rx * 0.45), Math.round(wat.y - wat.ry * 0.35), Math.max(1, Math.round(wat.rx * 0.4)), 1);
    h.strokeStyle = C.waterEdge;
    h.lineWidth = 1;
    h.beginPath();
    h.ellipse(wat.x, wat.y, wat.rx, wat.ry, 0, Math.PI, 0, true);
    h.stroke();
    h.restore();
  }
  h.strokeStyle = shadeHex(body, 0.6);
  h.lineWidth = 1;
  h.beginPath();
  h.ellipse(top.x, top.y, top.rx + 0.5, top.ry + 0.5, 0, 0, Math.PI);
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
