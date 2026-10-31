// "3D-looking" pixel-art view from behind and above a team's shoulders.
//
// The game's world coordinates are projected through a perspective camera
// (camera.ts) onto a small low-resolution buffer, which is then scaled up
// with nearest-neighbour sampling so everything stays chunky pixel art.
// People and the ball are pixel sprites standing up as billboards; the room,
// table and cups are flat-shaded projected polygons.

import type { GameConfig } from '../config';
import type { Sprite } from '../core/character';
import type { Vec3 } from '../core/physics';
import { getStyle } from '../core/styles';
import type { Cup, PlayerId, TeamId } from '../core/types';
import type { Game } from '../game/game';
import type { Theme } from '../theme';
import { project, projectPolygon, teamCamera, type Camera } from './camera';
import type { View } from './renderer';

export type Layout = 'behindA' | 'split';

interface Viewport {
  team: TeamId;
  /** Screen rectangle on the main canvas. */
  x: number;
  y: number;
  w: number;
  h: number;
  cam: Camera;
  buf: HTMLCanvasElement;
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
  const outward = spot.y < W / 2 ? -0.42 : 0.42;
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
  const px = cfg.camera.pixelSize;
  const make = (team: TeamId, x: number, w: number): Viewport => {
    const bw = Math.max(1, Math.round(w / px));
    const bh = Math.max(1, Math.round(h / px));
    return { team, x, y: top, w, h, cam: teamCamera(cfg, team, bw, bh), buf: buffer(`${team}-${bw}x${bh}`, bw, bh) };
  };
  if (layout === 'split') {
    const half = Math.floor((v.width - 4) / 2);
    return [make('A', 0, half), make('B', v.width - half, half)];
  }
  return [make('A', 0, v.width)];
}

let lastViewports: Viewport[] = [];

/** Draw the 3D view(s) onto the main canvas. */
export function renderGame3D(ctx: CanvasRenderingContext2D, theme: Theme, v: View, game: Game, layout: Layout): void {
  const vps = viewports(game.cfg, v, layout);
  lastViewports = vps;
  ctx.fillStyle = theme.room.divider;
  ctx.fillRect(0, 0, v.width, v.height);
  for (const vp of vps) {
    const b = vp.buf.getContext('2d')!;
    b.imageSmoothingEnabled = false;
    drawScene(b, theme, game, vp);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(vp.buf, vp.x, vp.y, vp.w, vp.h);
    drawLabels(ctx, theme, game, vp);
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

function drawScene(b: CanvasRenderingContext2D, theme: Theme, game: Game, vp: Viewport): void {
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
  b.clearRect(0, 0, vp.buf.width, vp.buf.height);

  // --- Room shell.
  poly(b, cam, [{ x: X0, y: Y0, z: ceilZ }, { x: X1, y: Y0, z: ceilZ }, { x: X1, y: Y1, z: ceilZ }, { x: X0, y: Y1, z: ceilZ }], R.ceiling);
  poly(b, cam, [{ x: X0, y: Y0, z: floorZ }, { x: X1, y: Y0, z: floorZ }, { x: X1, y: Y1, z: floorZ }, { x: X0, y: Y1, z: floorZ }], R.floor);
  const wall = (pts: Vec3[], fill: string) => poly(b, cam, pts, fill);
  wall([{ x: X0, y: Y0, z: floorZ }, { x: X1, y: Y0, z: floorZ }, { x: X1, y: Y0, z: ceilZ }, { x: X0, y: Y0, z: ceilZ }], R.wall);
  wall([{ x: X0, y: Y1, z: floorZ }, { x: X1, y: Y1, z: floorZ }, { x: X1, y: Y1, z: ceilZ }, { x: X0, y: Y1, z: ceilZ }], R.wall);
  wall([{ x: X0, y: Y0, z: floorZ }, { x: X0, y: Y1, z: floorZ }, { x: X0, y: Y1, z: ceilZ }, { x: X0, y: Y0, z: ceilZ }], R.wallDark);
  wall([{ x: X1, y: Y0, z: floorZ }, { x: X1, y: Y1, z: floorZ }, { x: X1, y: Y1, z: ceilZ }, { x: X1, y: Y0, z: ceilZ }], R.wallDark);

  // Floor slab seams and sticky stains.
  for (let x = Math.ceil(X0); x <= X1; x += 1.2) line(b, cam, { x, y: Y0, z: floorZ }, { x, y: Y1, z: floorZ }, R.floorSeam);
  for (let y = Y0; y <= Y1; y += 1.2) line(b, cam, { x: X0, y, z: floorZ }, { x: X1, y, z: floorZ }, R.floorSeam);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) disc(b, cam, { x: X0 + rnd() * (X1 - X0), y: Y0 + rnd() * (Y1 - Y0), z: floorZ }, 0.06 + rnd() * 0.18, R.stain, 9);

  // Wood paneling grooves and baseboards on the side walls.
  for (let x = X0; x <= X1; x += 0.32) {
    line(b, cam, { x, y: Y0, z: floorZ }, { x, y: Y0, z: ceilZ }, R.wallDark);
    line(b, cam, { x, y: Y1, z: floorZ }, { x, y: Y1, z: ceilZ }, R.wallDark);
  }
  for (const y of [Y0, Y1]) line(b, cam, { x: X0, y, z: floorZ + 0.05 }, { x: X1, y, z: floorZ + 0.05 }, R.baseboard, 2);

  // Ceiling joists and a pipe run.
  for (let x = X0; x <= X1; x += 0.6) line(b, cam, { x, y: Y0, z: ceilZ - 0.01 }, { x, y: Y1, z: ceilZ - 0.01 }, R.joist, 2);
  line(b, cam, { x: X0, y: Y0 + 0.5, z: ceilZ - 0.12 }, { x: X1, y: Y0 + 0.5, z: ceilZ - 0.12 }, R.pipe, 2);
  line(b, cam, { x: X0, y: Y1 - 0.8, z: ceilZ - 0.18 }, { x: X1, y: Y1 - 0.8, z: ceilZ - 0.18 }, R.pipe, 1);

  // End-wall decor at both ends, so either camera sees the far wall dressed.
  for (const endX of [X0, X1]) drawEndWall(b, theme, cam, endX, endX === X1 ? -1 : 1, W, floorZ);
  // Posters and a paddle rack on the side walls.
  for (const [y, inward] of [
    [Y0, 1],
    [Y1, -1],
  ] as const) {
    R.posters.forEach((col, i) => {
      const x = -1.4 + i * ((L + 2.8) / R.posters.length) + 0.3;
      const yy = y + inward * 0.01;
      poly(b, cam, [{ x, y: yy, z: 0.2 }, { x: x + 0.36, y: yy, z: 0.2 }, { x: x + 0.36, y: yy, z: 0.7 }, { x, y: yy, z: 0.7 }], col);
      poly(b, cam, [{ x: x + 0.05, y: yy, z: 0.5 }, { x: x + 0.31, y: yy, z: 0.5 }, { x: x + 0.31, y: yy, z: 0.62 }, { x: x + 0.05, y: yy, z: 0.62 }], R.posterInk);
    });
  }

  // String lights sagging along both long walls.
  for (const y of [Y0 + 0.15, Y1 - 0.15]) {
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      const x = X0 + 0.3 + t * (X1 - X0 - 0.6);
      const sag = Math.sin(((t * 7) % 1) * Math.PI) * 0.12;
      const p = project(cam, { x, y, z: ceilZ - 0.1 - sag });
      if (!p) continue;
      b.fillStyle = R.stringLights[i % R.stringLights.length];
      const s = Math.max(1, Math.round(p.scale * 0.03));
      b.fillRect(Math.round(p.x), Math.round(p.y), s, s);
    }
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

  // --- Table: legs, sides, top, lines.
  const legs: [number, number][] = [
    [0.1, 0.1],
    [L - 0.18, 0.1],
    [0.1, W - 0.18],
    [L - 0.18, W - 0.18],
    [L / 2 - 0.04, 0.1],
    [L / 2 - 0.04, W - 0.18],
  ];
  for (const [x, y] of legs) box(b, cam, x, y, floorZ, x + 0.08, y + 0.08, -0.04, R.tableLeg, R.tableLeg);
  box(b, cam, 0, 0, -0.04, L, W, 0, theme.colors.tableTop, R.tableSide, theme.colors.tableEdge);
  const T = theme.colors.tableLine;
  const z = 0.001;
  line(b, cam, { x: 0, y: 0, z }, { x: L, y: 0, z }, T);
  line(b, cam, { x: 0, y: W, z }, { x: L, y: W, z }, T);
  line(b, cam, { x: 0, y: 0, z }, { x: 0, y: W, z }, T);
  line(b, cam, { x: L, y: 0, z }, { x: L, y: W, z }, T);
  line(b, cam, { x: 0, y: W / 2, z }, { x: L, y: W / 2, z }, T);
  line(b, cam, { x: L / 2, y: 0, z }, { x: L / 2, y: W, z }, T);
  // Ski across the middle.
  const sk = cfg.ski;
  box(b, cam, L / 2 - sk.width / 2, W / 2 - sk.length / 2, 0, L / 2 + sk.width / 2, W / 2 + sk.length / 2, cfg.physics.skiHeight, theme.colors.skiBody, theme.colors.skiStripe);

  // Light pool from the hanging lamp.
  const lamp = project(cam, { x: L / 2, y: W / 2, z: 0 });
  if (lamp) {
    const g = b.createRadialGradient(lamp.x, lamp.y, 2, lamp.x, lamp.y, lamp.scale * 2.2);
    g.addColorStop(0, R.lampGlow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = g;
    b.fillRect(0, 0, vp.buf.width, vp.buf.height);
  }

  // Ground shadow of the ball (on the table or the floor).
  const ball = game.ball;
  if (ball.status !== 'sunk') {
    const surf = ball.onTable(ball.pos.x, ball.pos.y) && ball.pos.z >= 0 ? 0.002 : floorZ + 0.002;
    disc(b, cam, { x: ball.pos.x, y: ball.pos.y, z: surf }, cfg.physics.ballRadius * (1 + Math.max(0, ball.pos.z - surf) * 0.4), theme.colors.shadow, 10);
  }

  // Crosshair for whoever hits next, and the penalty cursor.
  const st = game.engine.peek();
  for (const team of ['A', 'B'] as TeamId[]) {
    if (!game.aiming(team)) continue;
    const t = game.aimTarget(team, game.aim[team], getStyle(st.phase === 'awaitServe' ? 'standardServe' : 'standardHit'));
    const col = team === 'A' ? theme.colors.teamA : theme.colors.teamB;
    ring(b, cam, { x: t.x, y: t.y, z: 0.003 }, 0.07, col, 1);
    line(b, cam, { x: t.x - 0.1, y: t.y, z: 0.003 }, { x: t.x + 0.1, y: t.y, z: 0.003 }, col);
    line(b, cam, { x: t.x, y: t.y - 0.1, z: 0.003 }, { x: t.x, y: t.y + 0.1, z: 0.003 }, col);
  }

  // --- Depth-sorted objects: cups, people, ball.
  type Item = { depth: number; draw: () => void };
  const items: Item[] = [];
  const depthOf = (p: Vec3) => (p.x - cam.eye.x) * cam.f.x + (p.y - cam.eye.y) * cam.f.y + (p.z - cam.eye.z) * cam.f.z;
  const penaltyCup = st.phase === 'penalty' ? game.penaltyCups()[Math.min(game.penaltyCursor, game.penaltyCups().length - 1)] : undefined;
  for (const cup of game.cups) {
    if (cup.state === 'removed') continue;
    items.push({ depth: depthOf({ x: cup.x, y: cup.y, z: 0 }), draw: () => drawCup(b, theme, cfg, cam, cup, cup === penaltyCup, game.time) });
  }
  for (const p of PLAYERS) {
    const pos = standSpot(game, p);
    if (behindTable.some((x) => x.p === p)) continue;
    items.push({ depth: depthOf(pos), draw: () => drawPerson(b, theme, game, cam, p, pos, vp.team === p.team, isActive(p)) });
  }
  if (ball.status !== 'sunk') items.push({ depth: depthOf(ball.pos), draw: () => drawBall(b, theme, cfg, cam, ball.pos) });
  items.sort((a, c) => c.depth - a.depth);
  for (const it of items) it.draw();

  drawTimingRings(b, theme, game, cam);
  drawCelebrations3D(b, theme, game, cam);

  // Vignette.
  const vg = b.createRadialGradient(vp.buf.width / 2, vp.buf.height * 0.55, vp.buf.height * 0.35, vp.buf.width / 2, vp.buf.height * 0.55, vp.buf.width * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, R.vignette);
  b.fillStyle = vg;
  b.fillRect(0, 0, vp.buf.width, vp.buf.height);
}

const textCache = new Map<string, HTMLCanvasElement>();
/** Text rendered once to a small bitmap, so it can be painted onto a wall in perspective. */
function textBitmap(text: string, font: string, fill: string, shadow: string): HTMLCanvasElement {
  const key = `${text}|${font}|${fill}`;
  let c = textCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = 64;
    c.height = 32;
    const x = c.getContext('2d')!;
    x.font = font;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = shadow;
    x.fillText(text, 33, 18);
    x.fillStyle = fill;
    x.fillText(text, 32, 16);
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
  wallImage(b, cam, textBitmap(theme.houseLetters, 'bold 26px serif', R.letters, R.letterShadow), { x: wx, y: Y(-0.8), z: 0.95 }, { x: wx, y: Y(0.8), z: 0.95 }, { x: wx, y: Y(-0.8), z: 0.2 });
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

function drawCup(b: CanvasRenderingContext2D, theme: Theme, cfg: GameConfig, cam: Camera, cup: Cup, selected: boolean, time: number): void {
  const r = cfg.cups.diameter / 2;
  const h = cfg.physics.cupHeight;
  const body = cup.team === 'A' ? theme.colors.cupTeamA : theme.colors.cupTeamB;
  const top = project(cam, { x: cup.x, y: cup.y, z: h });
  const bot = project(cam, { x: cup.x, y: cup.y, z: 0 });
  if (!top || !bot) return;
  const rt = r * top.scale;
  const rb = r * 0.72 * bot.scale;
  // Tapered body.
  b.fillStyle = body;
  b.beginPath();
  b.moveTo(top.x - rt, top.y);
  b.lineTo(top.x + rt, top.y);
  b.lineTo(bot.x + rb, bot.y);
  b.lineTo(bot.x - rb, bot.y);
  b.closePath();
  b.fill();
  // Highlight stripe.
  b.fillStyle = 'rgba(255,255,255,0.22)';
  b.fillRect(Math.round(top.x - rt * 0.55), Math.round(top.y), Math.max(1, Math.round(rt * 0.2)), Math.max(1, Math.round(bot.y - top.y)));
  // Mouth: rim, inside, water.
  disc(b, cam, { x: cup.x, y: cup.y, z: h }, r, theme.colors.cupRim, 14);
  disc(b, cam, { x: cup.x, y: cup.y, z: h }, r * 0.82, theme.room.cupInside, 14);
  disc(b, cam, { x: cup.x, y: cup.y, z: h }, r * (cup.state === 'full' ? 0.78 : 0.45), cup.state === 'full' ? theme.colors.water : theme.colors.waterHalf, 12);
  if (selected) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 10);
    ring(b, cam, { x: cup.x, y: cup.y, z: h + 0.005 }, r * (1.3 + pulse * 0.3), theme.colors.penaltyCursor, 1);
  }
}

function drawPerson(b: CanvasRenderingContext2D, theme: Theme, game: Game, cam: Camera, p: PlayerId, feet: Vec3, fromBehind: boolean, active: boolean): void {
  const who = game.participant(p);
  const sprite = (fromBehind ? who.spriteBack : null) ?? who.sprite;
  const base = project(cam, feet);
  const head = project(cam, { ...feet, z: feet.z + PERSON_HEIGHT });
  if (!base || !head) return;
  const hgt = base.y - head.y;
  if (hgt <= 0) return;
  // Team-colored floor marker; yellow when it is this player's turn.
  const markerCol = active ? theme.colors.activeRing : p.team === 'A' ? theme.colors.teamA : theme.colors.teamB;
  ring(b, cam, feet, 0.28, markerCol, active ? 2 : 1, 16);
  if (!sprite) {
    b.fillStyle = p.team === 'A' ? theme.colors.teamA : theme.colors.teamB;
    b.fillRect(Math.round(base.x - hgt * 0.15), Math.round(head.y), Math.round(hgt * 0.3), Math.round(hgt));
    return;
  }
  const w = (hgt * sprite.w) / sprite.h;
  // Your own team, seen over their shoulders, is slightly see-through so it never hides the table.
  b.globalAlpha = fromBehind ? 0.55 : 1;
  b.drawImage(bitmap(sprite), Math.round(base.x - w / 2), Math.round(head.y), Math.round(w), Math.round(hgt));
  b.globalAlpha = 1;
}

function drawBall(b: CanvasRenderingContext2D, theme: Theme, cfg: GameConfig, cam: Camera, pos: Vec3): void {
  const c = project(cam, { ...pos, z: pos.z + cfg.physics.ballRadius });
  if (!c) return;
  const r = Math.max(1.2, cfg.physics.ballRadius * c.scale);
  b.fillStyle = theme.colors.ballOutline;
  b.beginPath();
  b.arc(c.x, c.y, r + 0.6, 0, Math.PI * 2);
  b.fill();
  b.fillStyle = theme.colors.ball;
  b.beginPath();
  b.arc(c.x, c.y, r, 0, Math.PI * 2);
  b.fill();
}

function drawTimingRings(b: CanvasRenderingContext2D, theme: Theme, game: Game, cam: Camera): void {
  const pos = game.ball.pos;
  const c = project(cam, { ...pos, z: pos.z + game.cfg.physics.ballRadius });
  if (!c) return;
  for (const team of ['A', 'B'] as TeamId[]) {
    const cue = game.timingCue(team);
    if (!cue) continue;
    const { offset, window: w } = cue;
    if (offset > w) continue;
    const base = Math.max(3, game.cfg.physics.ballRadius * c.scale + 2);
    const radius = base + Math.min(1, Math.max(0, -offset) / (w * 2.5)) * 14;
    const col = Math.abs(offset) <= w * 0.25 ? theme.colors.good : offset > 0 ? theme.colors.bad : theme.colors.activeRing;
    b.strokeStyle = col;
    b.lineWidth = 1;
    b.beginPath();
    b.arc(c.x, c.y, radius, 0, Math.PI * 2);
    b.stroke();
  }
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

/** Crisp full-resolution names, style labels and timing feedback over the scaled-up scene. */
function drawLabels(ctx: CanvasRenderingContext2D, theme: Theme, game: Game, vp: Viewport): void {
  const k = vp.w / vp.buf.width;
  const st = game.engine.peek();
  ctx.save();
  ctx.beginPath();
  ctx.rect(vp.x, vp.y, vp.w, vp.h);
  ctx.clip();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = theme.fonts.label;
  const floorZ = -game.cfg.physics.tableHeight;
  for (const p of PLAYERS) {
    const who = game.participant(p);
    const head = project(vp.cam, { ...standSpot(game, p), z: floorZ + PERSON_HEIGHT + 0.12 });
    if (!head) continue;
    const sx = vp.x + head.x * k;
    const sy = Math.max(vp.y + theme.hudTop + 10, Math.min(vp.y + vp.h - theme.hudBottom - 10, vp.y + head.y * k));
    const label = (who.master ? '★ ' : '') + who.name + (st.server.team === p.team && st.server.side === p.side ? ' ●' : '');
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const w = ctx.measureText(label).width + 8;
    ctx.fillRect(sx - w / 2, sy - 8, w, 16);
    if (who.master) {
      ctx.shadowColor = theme.colors.masterGlow;
      ctx.shadowBlur = 8;
    }
    ctx.fillStyle = who.nameColor ?? (who.master ? theme.colors.master : theme.colors.text);
    ctx.fillText(label, sx, sy);
    ctx.shadowBlur = 0;
    const active = game.activePlayer(p.team);
    if (active && active.side === p.side) {
      const style = game.currentStyle(p.team);
      if (style) {
        ctx.fillStyle = game.selectedStyle[p.team] ? theme.colors.activeRing : theme.colors.textDim;
        ctx.fillText(style.name, sx, sy + 15);
      }
    }
  }
  const fb = game.feedback;
  if (fb && game.time - fb.time < 0.9) {
    const p = game.activePlayer(fb.team) ?? { team: fb.team, side: 'left' as const };
    const at = project(vp.cam, { ...standSpot(game, p), z: 0.6 });
    if (at) {
      ctx.globalAlpha = 1 - (game.time - fb.time) / 0.9;
      ctx.fillStyle = fb.quality === null ? theme.colors.bad : fb.quality > 0.55 ? theme.colors.good : theme.colors.text;
      ctx.font = theme.fonts.title;
      ctx.fillText(fb.label, vp.x + at.x * k, Math.max(vp.y + 20, vp.y + at.y * k - 30 - (game.time - fb.time) * 30));
      ctx.globalAlpha = 1;
    }
  }
  if (vp.team === 'B' || lastViewports.length > 1) {
    ctx.font = theme.fonts.label;
    ctx.fillStyle = vp.team === 'A' ? theme.colors.teamA : theme.colors.teamB;
    ctx.textAlign = 'left';
    ctx.fillText(`Team ${vp.team} view`, vp.x + 8, vp.y + theme.hudTop + 12);
  }
  ctx.restore();
}
