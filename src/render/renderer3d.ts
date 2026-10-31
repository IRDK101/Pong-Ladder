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
  const px = Math.max(cfg.camera.pixelSize, Math.round(h / cfg.camera.rows));
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
export function renderGame3D(ctx: CanvasRenderingContext2D, theme: Theme, v: View, game: Game, layout: Layout, labels = true): void {
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
  // Plywood grain: a few long seams and knots on the top.
  for (const f of [0.17, 0.34, 0.66, 0.83]) line(b, cam, { x: 0.02, y: W * f, z: 0.0005 }, { x: L - 0.02, y: W * f, z: 0.0005 }, theme.room.tableGrain);
  for (const [kx, ky] of [
    [0.4, 0.2],
    [1.6, 0.95],
    [2.1, 0.3],
    [0.9, 1.05],
  ])
    disc(b, cam, { x: kx, y: ky, z: 0.0006 }, 0.03, theme.room.tableGrain, 8);
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
    if (t.cup) {
      // Locked onto a cup: ring its mouth.
      ring(b, cam, { x: t.x, y: t.y, z: cfg.physics.cupHeight + 0.004 }, cfg.cups.diameter * 0.75, theme.colors.activeRing, 2);
      continue;
    }
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
  if (ball.status !== 'sunk') items.push({ depth: depthOf(ball.pos), draw: () => drawBall(b, theme, cfg, cam, ball.pos, ball.vel, ball.fx) });
  const lampAt = { x: L / 2, y: W / 2, z: 1.3 };
  items.push({ depth: depthOf(lampAt), draw: () => drawLamp(b, theme, cam, lampAt, ceilZ) });
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

function drawCup(b: CanvasRenderingContext2D, theme: Theme, cfg: GameConfig, cam: Camera, cup: Cup, selected: boolean, time: number): void {
  const r = cfg.cups.diameter / 2;
  const h = cfg.physics.cupHeight;
  const body = cup.team === 'A' ? theme.colors.cupTeamA : theme.colors.cupTeamB;
  const top = project(cam, { x: cup.x, y: cup.y, z: h });
  const bot = project(cam, { x: cup.x, y: cup.y, z: 0 });
  if (!top || !bot) return;
  const rt = r * top.scale;
  const rb = r * 0.72 * bot.scale;
  // Tapered body, shaded left to right, with the white rim band and two ridges of a party cup.
  const quad = (t0: number, t1: number, u0: number, u1: number, fill: string) => {
    // t = across the body (-1 left … 1 right), u = down from the rim (0 … 1).
    const at = (t: number, u: number) => {
      const x = top.x + (bot.x - top.x) * u + t * (rt + (rb - rt) * u);
      const y = top.y + (bot.y - top.y) * u;
      return [x, y];
    };
    const pts = [at(t0, u0), at(t1, u0), at(t1, u1), at(t0, u1)];
    b.fillStyle = fill;
    b.beginPath();
    b.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 4; i++) b.lineTo(pts[i][0], pts[i][1]);
    b.closePath();
    b.fill();
  };
  quad(-1, 1, 0, 1, body);
  quad(-1, -0.45, 0, 1, shadeHex(body, 1.25));
  quad(0.45, 1, 0, 1, shadeHex(body, 0.7));
  quad(-1, 1, 0, 0.16, theme.colors.cupRim);
  quad(-1, 1, 0.4, 0.45, shadeHex(body, 0.78));
  quad(-1, 1, 0.68, 0.73, shadeHex(body, 0.78));
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
  disc(b, cam, { ...feet, z: feet.z + 0.002 }, 0.24, theme.room.personShadow, 12);
  // Team-colored floor marker; a pulsing yellow ring and a bouncing arrow when it is this player's turn.
  const markerCol = active ? theme.colors.activeRing : p.team === 'A' ? theme.colors.teamA : theme.colors.teamB;
  ring(b, cam, feet, 0.28, markerCol, active ? 2 : 1, 16);
  if (active) {
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 9);
    ring(b, cam, feet, 0.34 + pulse * 0.08, theme.colors.activeRing, 1, 16);
    const tip = project(cam, { ...feet, z: feet.z + PERSON_HEIGHT + 0.12 + pulse * 0.06 });
    if (tip) {
      const s = Math.max(3, tip.scale * 0.09);
      b.fillStyle = theme.colors.activeRing;
      b.beginPath();
      b.moveTo(tip.x - s, tip.y - s * 1.4);
      b.lineTo(tip.x + s, tip.y - s * 1.4);
      b.lineTo(tip.x, tip.y);
      b.closePath();
      b.fill();
    }
  }
  if (!sprite) {
    b.fillStyle = p.team === 'A' ? theme.colors.teamA : theme.colors.teamB;
    b.fillRect(Math.round(base.x - hgt * 0.15), Math.round(head.y), Math.round(hgt * 0.3), Math.round(hgt));
    return;
  }
  const w = (hgt * sprite.w) / sprite.h;
  if (fromBehind) {
    // Your own team, over their shoulders: a see-through silhouette with a team-colored rim,
    // so it reads as "you" without hiding the table.
    const rim = p.team === 'A' ? theme.colors.teamA : theme.colors.teamB;
    b.globalAlpha = 0.72;
    b.drawImage(silhouette(sprite, theme.room.silhouette, rim), Math.round(base.x - w / 2), Math.round(head.y), Math.round(w), Math.round(hgt));
    b.globalAlpha = 1;
    return;
  }
  b.drawImage(bitmap(sprite), Math.round(base.x - w / 2), Math.round(head.y), Math.round(w), Math.round(hgt));
}

function drawBall(b: CanvasRenderingContext2D, theme: Theme, cfg: GameConfig, cam: Camera, pos: Vec3, vel: Vec3, fx: BallEffects): void {
  const c = project(cam, { ...pos, z: pos.z + cfg.physics.ballRadius });
  if (!c) return;
  // A spinning ball leaves a short colored streak.
  const spin = fx.topspin > 0.05 ? theme.colors.spinTop : fx.topspin < -0.05 ? theme.colors.spinBack : Math.abs(fx.sideKick) > 0.01 ? theme.colors.spinSide : null;
  if (spin) {
    const tail = project(cam, { x: pos.x - vel.x * 0.06, y: pos.y - vel.y * 0.06, z: pos.z - vel.z * 0.06 + cfg.physics.ballRadius });
    if (tail) {
      b.strokeStyle = spin;
      b.lineWidth = 2;
      b.beginPath();
      b.moveTo(tail.x, tail.y);
      b.lineTo(c.x, c.y);
      b.stroke();
    }
  }
  const r = Math.max(1.2, cfg.physics.ballRadius * c.scale);
  b.fillStyle = theme.colors.ballOutline;
  b.beginPath();
  b.arc(c.x, c.y, r + 0.6, 0, Math.PI * 2);
  b.fill();
  b.fillStyle = theme.colors.ball;
  b.beginPath();
  b.arc(c.x, c.y, r, 0, Math.PI * 2);
  b.fill();
  b.fillStyle = theme.colors.ballShine;
  b.fillRect(Math.round(c.x - r * 0.45), Math.round(c.y - r * 0.45), 1, 1);
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
    const activeHere = game.activePlayer(p.team);
    // Keep the name (and the turn tag above it) clear of the HUD bars.
    const minY = vp.y + theme.hudTop + (activeHere && activeHere.side === p.side ? 40 : 10);
    const sy = Math.max(minY, Math.min(vp.y + vp.h - theme.hudBottom - 10, vp.y + head.y * k));
    const label = (who.master ? '★ ' : '') + who.name + (st.server.team === p.team && st.server.side === p.side ? ' ●' : '');
    const activeP = game.activePlayer(p.team);
    const isUp = !!activeP && activeP.side === p.side;
    const w = ctx.measureText(label).width + 10;
    if (isUp) {
      // Whose turn it is: a bright tag saying what they are about to do.
      const what = st.phase === 'awaitServe' ? 'SERVE' : st.rally?.cupAtRisk ? 'SAVE!' : 'HIT';
      ctx.font = theme.fonts.title;
      const tw = Math.max(w, ctx.measureText(what).width + 14);
      ctx.fillStyle = theme.colors.activeRing;
      ctx.fillRect(sx - tw / 2, sy - 30, tw, 22);
      ctx.fillStyle = theme.colors.activeText;
      ctx.fillText(what, sx, sy - 19);
      ctx.font = theme.fonts.label;
      ctx.fillStyle = theme.colors.activeRing;
      ctx.fillRect(sx - w / 2, sy - 8, w, 16);
      ctx.fillStyle = theme.colors.activeText;
      ctx.fillText(label, sx, sy);
      const style = game.currentStyle(p.team);
      const spin = game.heldSpin[p.team];
      const bits = [style?.name, spin ? (spin.type === 'side' ? 'Sidespin' : spin.type === 'top' ? 'Topspin' : 'Backspin') : null].filter(Boolean).join(' · ');
      if (bits) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const bw = ctx.measureText(bits).width + 8;
        ctx.fillRect(sx - bw / 2, sy + 9, bw, 15);
        ctx.fillStyle = spin ? theme.colors.activeRing : theme.colors.text;
        ctx.fillText(bits, sx, sy + 16);
      }
    } else {
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(sx - w / 2, sy - 8, w, 16);
      if (who.master) {
        ctx.shadowColor = theme.colors.masterGlow;
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = who.nameColor ?? (who.master ? theme.colors.master : theme.colors.text);
      ctx.fillText(label, sx, sy);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }
  const fb = game.feedback;
  if (fb && game.time - fb.time < 0.9) {
    const p = fb.player ?? game.activePlayer(fb.team) ?? { team: fb.team, side: 'left' as const };
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
    ctx.fillText(`Team ${vp.team} view`, vp.x + 14, vp.y + theme.hudTop + 30);
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

const silhouettes = new WeakMap<Sprite, Map<string, HTMLCanvasElement>>();
/** A sprite as a flat silhouette with a 1px rim along its top and side edges. */
function silhouette(s: Sprite, fill: string, rim: string): HTMLCanvasElement {
  let byKey = silhouettes.get(s);
  if (!byKey) silhouettes.set(s, (byKey = new Map()));
  const key = fill + rim;
  let c = byKey.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = s.w;
    c.height = s.h;
    const x = c.getContext('2d')!;
    const at = (i: number, j: number) => i >= 0 && j >= 0 && i < s.w && j < s.h && s.pixels[j * s.w + i] !== '';
    for (let j = 0; j < s.h; j++)
      for (let i = 0; i < s.w; i++) {
        if (!at(i, j)) continue;
        const edge = !at(i - 1, j) || !at(i + 1, j) || !at(i, j - 1);
        x.fillStyle = edge ? rim : fill;
        x.fillRect(i, j, 1, 1);
      }
    byKey.set(key, c);
  }
  return c;
}
