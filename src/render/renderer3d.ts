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
import { project, teamCamera, type Camera } from './camera';
import { drawBasement, drawTableAt } from './basement3d';
import { disc, IDENTITY, line, ring, screenEllipse } from './prims';
import { SPIN_LABELS } from '../game/shot';
import type { View } from './renderer';

/** behindB: the second device in online play sees the table from Team B's end. */
export type Layout = 'behindA' | 'behindB' | 'split';

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
  return [make(layout === 'behindB' ? 'B' : 'A', 0, v.width)];
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
    // Flatten the layers at low resolution when they match (the usual case), so the
    // full-screen upscale happens once a frame instead of three times.
    if (vp.hi.width === vp.buf.width && vp.hi.height === vp.buf.height) {
      layers[0].drawImage(vp.hi, 0, 0);
      layers[0].drawImage(vp.front, 0, 0);
      ctx.drawImage(vp.buf, vp.x, vp.y, vp.w, vp.h);
    } else for (const c of [vp.buf, vp.hi, vp.front]) ctx.drawImage(c, vp.x, vp.y, vp.w, vp.h);
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

function drawScene(b: CanvasRenderingContext2D, h: CanvasRenderingContext2D, f: CanvasRenderingContext2D, theme: Theme, game: Game, vp: Viewport, ui: boolean): void {
  const cfg = game.cfg;
  const cam = vp.cam;
  const R = theme.room;
  const { length: L, width: W } = cfg.table;
  const floorZ = -cfg.physics.tableHeight;
  drawBasement(b, theme, cfg, cam, cfg.venue);

  // --- People standing behind the far end of the table go first, so the table hides their legs.
  const viewDepth = (p: Vec3) => (p.x - cam.eye.x) * cam.f.x + (p.y - cam.eye.y) * cam.f.y + (p.z - cam.eye.z) * cam.f.z;
  const farEnd = viewDepth({ x: cam.f.x >= 0 ? L : 0, y: W / 2, z: 0 });
  const activeNow = [game.activePlayer('A'), game.activePlayer('B')];
  const isActive = (p: PlayerId) => activeNow.some((a) => a && a.team === p.team && a.side === p.side);
  const shown = game.shownPlayers();
  const behindTable = shown.map((p) => ({ p, pos: standSpot(game, p) }))
    .filter(({ pos }) => viewDepth(pos) > farEnd)
    .sort((a, c) => viewDepth(c.pos) - viewDepth(a.pos));
  for (const { p, pos } of behindTable) drawPerson(b, theme, game, cam, p, pos, vp.team === p.team, isActive(p));

  // --- Fine layer: the table, the ski, then cups and the ball.
  const ch = vp.camHi;
  drawTableAt(h, theme, cfg, ch, cfg.venue, IDENTITY, false, cfg.design);

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
    const wob = game.cupWobble(cup.team, cup.id);
    const shown = wob.dx || wob.dy ? { ...cup, x: cup.x + wob.dx, y: cup.y + wob.dy } : cup;
    items.push({ depth: depthOf({ x: cup.x, y: cup.y, z: 0 }), draw: () => drawCup(h, theme, cfg, ch, shown, cup === penaltyCup, game.time) });
  }
  if (ball.status !== 'sunk') items.push({ depth: depthOf(ball.pos), draw: () => drawBall(h, theme, cfg, ch, ball.pos, ball.vel, ball.fx) });
  items.sort((a, c) => c.depth - a.depth);
  for (const it of items) it.draw();
  if (ui) drawTimingRings(h, theme, game, ch);
  drawCupFx(h, theme, game, ch);
  drawCelebrations3D(h, theme, game, ch);

  // --- Front coarse layer: everyone not behind the table (your own team, over its shoulders).
  const nearPeople = shown.filter((p) => !behindTable.some((x) => x.p === p))
    .map((p) => ({ p, pos: standSpot(game, p) }))
    .sort((a, c) => viewDepth(c.pos) - viewDepth(a.pos));
  // While the other team aims on this screen, the players in front fade so its marker (often right
  // behind them, near this end of the table) stays readable.
  const otherAims = (t: TeamId) => ui && showsAim(game, vp, t === 'A' ? 'B' : 'A');
  for (const { p, pos } of nearPeople) drawPerson(f, theme, game, cam, p, pos, vp.team === p.team, isActive(p), otherAims(p.team));
}

function drawPerson(b: CanvasRenderingContext2D, theme: Theme, game: Game, cam: Camera, p: PlayerId, feet: Vec3, fromBehind: boolean, active: boolean, fade = false): void {
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
  // The hit jolt: for a moment after striking the ball, the player lunges at it (a quick dip and a
  // lean toward the ball, squashing a little), then springs back.
  const j = hitJolt(game, p);
  const ballAt = j ? project(cam, game.ball.pos) : null;
  const lean = j && ballAt ? Math.sign(ballAt.x - base.x) * j * hgt * 0.07 : 0;
  const dh = hgt * (1 - 0.06 * j);
  const w = ((hgt * sprite.w) / sprite.h) * (1 + 0.08 * j);
  const x = Math.round(base.x - w / 2 + lean);
  const y = Math.round(head.y + (hgt - dh) + j * hgt * 0.03);
  // Your own team, seen over their shoulders, is a little see-through so the table stays readable.
  if (fromBehind) b.globalAlpha = fade ? 0.45 : 0.88;
  b.drawImage(bitmap(sprite), x, y, Math.round(w), Math.round(dh));
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

/** How far into its hit jolt a player is: 0 at rest, rising quickly to 1 and easing back over about a fifth of a second. */
export function hitJolt(game: Game, p: PlayerId): number {
  const t = game.hitTimes[`${p.team}-${p.side}`];
  if (t === undefined) return 0;
  const e = (game.time - t) / Math.max(0.05, 0.2 * game.cfg.physics.timeScale);
  if (e < 0 || e >= 1) return 0;
  return e < 0.25 ? e / 0.25 : 1 - (e - 0.25) / 0.75;
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
  // Online, each device shows only its own crosshair, like split screen.
  if (game.online) return vp.team === team;
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
  const locked = game.aimLocked(team);
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
  // Depth guide: near the far end of the table (the end this shot is aimed at), that end's edge lights
  // up in the team color, brighter the closer the marker gets, with a line from the marker to it, so
  // how far the shot is from going long reads at a glance, even foreshortened.
  const endX = team === 'A' ? L : 0;
  const toEnd = (endX - t.x) * (team === 'A' ? 1 : -1); // > 0: still on the table
  if (toEnd < 0.4 && t.y > -0.2 && t.y < W + 0.2) {
    const k = Math.max(0, Math.min(1, 1 - toEnd / 0.4));
    const edgeCol = toEnd < 0 ? theme.colors.bad : base;
    h.globalAlpha = 0.35 + 0.55 * k;
    line(h, cam, { x: endX, y: 0, z }, { x: endX, y: W, z }, dark, 5);
    line(h, cam, { x: endX, y: 0, z }, { x: endX, y: W, z }, edgeCol, 3);
    const ey = Math.max(0, Math.min(W, t.y));
    line(h, cam, { x: t.x, y: ey, z }, { x: endX, y: ey, z }, edgeCol, 1);
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

/**
 * Cup effects:
 * - a hit: an impact burst at the rim, and while a save is on, a pulsing
 *   red ring round the cup with a "!" over it;
 * - a sink: a splash of water drops, a ring spreading over the table and a
 *   "SINK!" that pops up from the cup.
 */
function drawCupFx(h: CanvasRenderingContext2D, theme: Theme, game: Game, cam: Camera): void {
  const cfg = game.cfg;
  const H = cfg.physics.cupHeight;
  const r = cfg.cups.diameter / 2;
  const F = theme.fx;
  for (const f of game.cupFx) {
    const t = game.time - f.time;
    if (f.kind === 'hit') {
      if (t > 0.35) continue;
      // Short white impact streaks out from the rim.
      const k = t / 0.35;
      h.globalAlpha = 1 - k;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        const r0 = r * (1.1 + k * 0.6);
        const r1 = r * (1.45 + k * 0.9);
        line(h, cam, { x: f.x + Math.cos(a) * r0, y: f.y + Math.sin(a) * r0, z: H }, { x: f.x + Math.cos(a) * r1, y: f.y + Math.sin(a) * r1, z: H + 0.01 }, F.impact, 2);
      }
      h.globalAlpha = 1;
      continue;
    }
    // Sink.
    if (t > 1.1) continue;
    const k = t / 1.1;
    h.globalAlpha = Math.max(0, 1 - k);
    ring(h, cam, { x: f.x, y: f.y, z: 0.002 }, r * (1.2 + k * 3.5), F.splashRing, 2, 28);
    ring(h, cam, { x: f.x, y: f.y, z: 0.002 }, r * (1 + k * 2.2), F.splashRing, 1, 28);
    let seed = (f.x * 1000 + f.y * 37) | 0 || 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const sp = 0.25 + rnd() * 0.55;
      const up = 0.9 + rnd() * 1.1;
      const z = H + up * t - 3.2 * t * t;
      if (z < 0) continue;
      const p = project(cam, { x: f.x + Math.cos(a) * sp * t, y: f.y + Math.sin(a) * sp * t, z });
      if (!p) continue;
      const s = Math.max(1, Math.round(p.scale * 0.012));
      h.fillStyle = i % 3 ? F.drop : F.dropLight;
      h.fillRect(Math.round(p.x), Math.round(p.y), s, s);
    }
    h.globalAlpha = 1;
  }
  // While a save is on: the hit cup pulses red, with a "!" over it.
  const risk = game.engine.peek().rally?.cupAtRisk;
  if (risk) {
    const cup = game.engine.peek().cups[risk.team].find((c) => c.id === risk.cupId);
    if (cup && cup.state !== 'removed') {
      const pulse = 0.5 + 0.5 * Math.sin(game.time * 14);
      ring(h, cam, { x: cup.x, y: cup.y, z: 0.003 }, r * (1.25 + pulse * 0.2), F.danger, 2, 28);
      ring(h, cam, { x: cup.x, y: cup.y, z: H + 0.004 }, r * 1.05, F.danger, 1, 28);
      const top = project(cam, { x: cup.x, y: cup.y, z: H + 0.1 + pulse * 0.015 });
      if (top) {
        const s = Math.max(2, Math.round(top.scale * 0.012));
        h.fillStyle = theme.colors.ballOutline;
        h.fillRect(Math.round(top.x) - s, Math.round(top.y) - s * 5, s * 3, s * 6 + s * 2);
        h.fillStyle = F.danger;
        h.fillRect(Math.round(top.x) - Math.floor(s / 2), Math.round(top.y) - s * 4, s * 2, s * 4);
        h.fillRect(Math.round(top.x) - Math.floor(s / 2), Math.round(top.y) + s, s * 2, s * 2);
      }
    }
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
  for (const p of game.shownPlayers()) {
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
  // "SINK!" popping up from a sunk cup.
  for (const f of game.cupFx) {
    const t = game.time - f.time;
    if (f.kind !== 'sink' || t > 1.0) continue;
    const at = project(vp.cam, { x: f.x, y: f.y, z: game.cfg.physics.cupHeight + 0.1 + t * 0.25 });
    if (!at) continue;
    const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.6 : 1.2 - Math.min(0.2, (t - 0.12) * 0.5);
    ctx.save();
    ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    ctx.translate(vp.x + at.x * k, Math.max(minY + 20, vp.y + at.y * k));
    ctx.scale(pop, pop);
    ctx.font = 'bold 28px monospace';
    ctx.lineWidth = 5;
    ctx.strokeStyle = theme.colors.activeText;
    ctx.strokeText('SINK!', 0, 0);
    ctx.fillStyle = theme.fx.sinkText;
    ctx.fillText('SINK!', 0, 0);
    ctx.restore();
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
