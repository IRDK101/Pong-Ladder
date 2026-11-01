// Canvas 2D renderer for the table, cups, ball and players. Reads state, never mutates it.

import type { GameConfig } from '../config';
import type { Theme } from '../theme';
import type { Sprite } from '../core/character';
import type { Cup, PlayerId, TeamId } from '../core/types';
import { getStyle } from '../core/styles';
import type { Game } from '../game/game';

export interface View {
  /** Screen pixels per meter. */
  scale: number;
  /** Screen position of table origin (x = 0, y = 0). */
  ox: number;
  oy: number;
  width: number;
  height: number;
}

/**
 * The screen layout. Without a size it is the classic fixed layout; with one
 * (the window), the top-down table is scaled and centered to fill it.
 */
export function makeView(cfg: GameConfig, theme: Theme, width?: number, height?: number): View {
  if (width === undefined || height === undefined) {
    const pad = theme.tablePadding;
    const scale = theme.pixelsPerMeter;
    return {
      scale,
      ox: pad,
      oy: theme.hudTop + 40,
      width: Math.round(cfg.table.length * scale + pad * 2),
      height: Math.round(cfg.table.width * scale + theme.hudTop + 40 + theme.hudBottom + 40),
    };
  }
  const usableH = Math.max(100, height - theme.hudTop - theme.hudBottom - 80);
  // Leave room at both ends for the players standing behind the table (and their names).
  const ends = (cfg.hitting.standOff + 0.45) * 2;
  const scale = Math.max(80, Math.min((width - 40) / (cfg.table.length + ends), usableH / cfg.table.width));
  return {
    scale,
    ox: (width - cfg.table.length * scale) / 2,
    oy: theme.hudTop + 40 + (usableH - cfg.table.width * scale) / 2,
    width,
    height,
  };
}

export const toScreen = (v: View, x: number, y: number): [number, number] => [v.ox + x * v.scale, v.oy + y * v.scale];

export const toTable = (v: View, sx: number, sy: number): [number, number] => [(sx - v.ox) / v.scale, (sy - v.oy) / v.scale];

const teamColor = (theme: Theme, t: TeamId) => (t === 'A' ? theme.colors.teamA : theme.colors.teamB);

/** Cup under a screen point, if any. */
export function cupAt(cfg: GameConfig, v: View, cups: Cup[], sx: number, sy: number): Cup | undefined {
  const [x, y] = toTable(v, sx, sy);
  const r = cfg.cups.diameter / 2;
  return cups.find((c) => c.state !== 'removed' && Math.hypot(c.x - x, c.y - y) <= r * 1.2);
}

export function drawField(ctx: CanvasRenderingContext2D, cfg: GameConfig, theme: Theme, v: View, cups: Cup[]): void {
  drawBasement(ctx, cfg, theme, v);
  drawTable(ctx, cfg, theme, v);
  drawSki(ctx, cfg, theme, v);
  for (const cup of cups) drawCup(ctx, cfg, theme, v, cup);
}

export function renderGame(ctx: CanvasRenderingContext2D, theme: Theme, v: View, game: Game): void {
  const cfg = game.cfg;
  const st = game.engine.peek();
  drawField(ctx, cfg, theme, v, game.cups);

  // Penalty cursor.
  if (st.phase === 'penalty') {
    const cups = game.penaltyCups();
    const cup = cups[Math.min(game.penaltyCursor, cups.length - 1)];
    if (cup) {
      const [sx, sy] = toScreen(v, cup.x, cup.y);
      const pulse = 0.5 + 0.5 * Math.sin(game.time * 10);
      ctx.strokeStyle = theme.colors.penaltyCursor;
      ctx.lineWidth = 2 + pulse * 2;
      ctx.beginPath();
      ctx.arc(sx, sy, (cfg.cups.diameter / 2) * v.scale + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Players.
  const players: PlayerId[] = game.shownPlayers();
  const active = [game.activePlayer('A'), game.activePlayer('B')].filter(Boolean) as PlayerId[];
  for (const p of players) {
    const isActive = active.some((a) => a.team === p.team && a.side === p.side);
    drawPlayer(ctx, theme, v, game, p, isActive, st.server.team === p.team && st.server.side === p.side);
  }

  // Crosshair for the team that hits next (sticky: it stays where it was left).
  for (const team of ['A', 'B'] as TeamId[]) {
    if (!game.aiming(team)) continue;
    const serving = st.phase === 'awaitServe';
    const t = game.aimTarget(team, game.aim[team], getStyle(serving ? 'standardServe' : 'standardHit'));
    drawReticle(ctx, v, t.x, t.y, teamColor(theme, team));
  }

  drawBall(ctx, cfg, theme, v, game);
  for (const team of ['A', 'B'] as TeamId[]) drawTimingRing(ctx, theme, v, game, team);
  drawCelebrations(ctx, theme, v, game);

  // Timing feedback near the hitter.
  const fb = game.feedback;
  if (fb && game.time - fb.time < 0.9) {
    const p = fb.player ?? active.find((a) => a.team === fb.team) ?? { team: fb.team, side: 'left' as const };
    const spot = game.playerSpot(p);
    const [sx, sy] = toScreen(v, spot.x, spot.y);
    ctx.globalAlpha = 1 - (game.time - fb.time) / 0.9;
    ctx.fillStyle = fb.quality === null ? theme.colors.bad : fb.quality > 0.55 ? theme.colors.good : theme.colors.text;
    ctx.font = theme.fonts.title;
    ctx.textAlign = 'center';
    ctx.fillText(fb.label, sx, sy - 28 - (game.time - fb.time) * 30);
    ctx.globalAlpha = 1;
  }
}

function drawTable(ctx: CanvasRenderingContext2D, cfg: GameConfig, theme: Theme, v: View): void {
  const c = theme.colors;
  const [x0, y0] = toScreen(v, 0, 0);
  const [x1, y1] = toScreen(v, cfg.table.length, cfg.table.width);
  const edge = 6;
  ctx.fillStyle = c.tableEdge;
  ctx.fillRect(x0 - edge, y0 - edge, x1 - x0 + edge * 2, y1 - y0 + edge * 2);
  ctx.fillStyle = theme.venues[cfg.venue].top;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  ctx.strokeStyle = c.tableLine;
  ctx.lineWidth = theme.lineWidth;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  const [mx, my] = toScreen(v, cfg.table.length / 2, cfg.table.width / 2);
  ctx.beginPath();
  // Lengthwise center line.
  ctx.moveTo(x0, my);
  ctx.lineTo(x1, my);
  // Widthwise center line.
  ctx.moveTo(mx, y0);
  ctx.lineTo(mx, y1);
  ctx.stroke();
}

function drawSki(ctx: CanvasRenderingContext2D, cfg: GameConfig, theme: Theme, v: View): void {
  const c = theme.colors;
  const [mx, my] = toScreen(v, cfg.table.length / 2, cfg.table.width / 2);
  const w = cfg.ski.width * v.scale;
  const l = cfg.ski.length * v.scale;
  ctx.fillStyle = theme.venues[cfg.venue].ski.body;
  ctx.beginPath();
  ctx.roundRect(mx - w / 2, my - l / 2, w, l, w / 2);
  ctx.fill();
  ctx.fillStyle = c.skiStripe;
  ctx.fillRect(mx - 1, my - l / 2 + w, 2, l - w * 2);
}

function drawCup(ctx: CanvasRenderingContext2D, cfg: GameConfig, theme: Theme, v: View, cup: Cup): void {
  if (cup.state === 'removed') return;
  const c = theme.colors;
  const [sx, sy] = toScreen(v, cup.x, cup.y);
  const r = (cfg.cups.diameter / 2) * v.scale;

  // Clear plastic cups, as in the 3D view, with a thin team-colored base ring so each side reads.
  ctx.fillStyle = theme.cup.glass;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx, sy, r + 1.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = cup.team === 'A' ? c.teamA : c.teamB;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Water: full fills most of the mouth; half is a smaller, darker pool.
  ctx.fillStyle = cup.state === 'full' ? c.water : c.waterHalf;
  ctx.beginPath();
  ctx.arc(sx, sy, r * (cup.state === 'full' ? 0.68 : 0.4), 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = c.cupRim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(sx, sy, r - 0.75, 0, Math.PI * 2);
  ctx.stroke();
}

const spriteCache = new WeakMap<Sprite, HTMLCanvasElement>();

function spriteBitmap(sprite: Sprite): HTMLCanvasElement {
  let c = spriteCache.get(sprite);
  if (!c) {
    c = document.createElement('canvas');
    c.width = sprite.w;
    c.height = sprite.h;
    const sctx = c.getContext('2d')!;
    sprite.pixels.forEach((col, i) => {
      if (!col) return;
      sctx.fillStyle = col;
      sctx.fillRect(i % sprite.w, Math.floor(i / sprite.w), 1, 1);
    });
    spriteCache.set(sprite, c);
  }
  return c;
}

function drawPlayer(ctx: CanvasRenderingContext2D, theme: Theme, v: View, game: Game, p: PlayerId, active: boolean, server: boolean): void {
  const who = game.participant(p);
  const spot = game.playerSpot(p);
  const [sx, sy] = toScreen(v, spot.x + (p.team === 'A' ? -0.12 : 0.12), spot.y);
  const r = theme.playerPixelRadius;
  if (active) {
    ctx.strokeStyle = theme.colors.activeRing;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sx, sy, r + 9, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (who.sprite) {
    const scale = theme.spriteScale;
    const w = who.sprite.w * scale;
    const hgt = who.sprite.h * scale;
    // Team-colored base under the figure.
    ctx.fillStyle = teamColor(theme, p.team);
    ctx.beginPath();
    ctx.ellipse(sx, sy + hgt / 2 - 2, w / 2, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(spriteBitmap(who.sprite), sx - w / 2, sy - hgt / 2, w, hgt);
  } else {
    ctx.fillStyle = teamColor(theme, p.team);
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.colors.background;
    ctx.font = theme.fonts.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.side === 'left' ? 'L' : 'R', sx, sy + 1);
  }
  ctx.font = theme.fonts.label;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labelY = sy + (who.sprite ? (who.sprite.h * theme.spriteScale) / 2 + 10 : r + 12);
  const label = (who.master ? '★ ' : '') + who.name + (server ? ' ●' : '');
  if (who.master) {
    ctx.save();
    ctx.shadowColor = theme.colors.masterGlow;
    ctx.shadowBlur = 8;
    ctx.fillStyle = who.nameColor ?? theme.colors.master;
    ctx.fillText(label, sx, labelY);
    ctx.restore();
  } else {
    ctx.fillStyle = who.nameColor ?? theme.colors.textDim;
    ctx.fillText(label, sx, labelY);
  }
  // The style this player would hit with right now.
  if (active) {
    const style = game.currentStyle(p.team);
    if (style) {
      ctx.fillStyle = game.selectedStyle[p.team] ? theme.colors.activeRing : theme.colors.textDim;
      ctx.fillText(style.name, sx, labelY + 15);
    }
  }
}

function drawReticle(ctx: CanvasRenderingContext2D, v: View, x: number, y: number, color: string): void {
  const [sx, sy] = toScreen(v, x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(sx, sy, 9, 0, Math.PI * 2);
  ctx.moveTo(sx - 14, sy);
  ctx.lineTo(sx - 4, sy);
  ctx.moveTo(sx + 4, sy);
  ctx.lineTo(sx + 14, sy);
  ctx.moveTo(sx, sy - 14);
  ctx.lineTo(sx, sy - 4);
  ctx.moveTo(sx, sy + 4);
  ctx.lineTo(sx, sy + 14);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawBall(ctx: CanvasRenderingContext2D, cfg: GameConfig, theme: Theme, v: View, game: Game): void {
  const b = game.ball;
  const z = b.pos.z;
  if (b.status === 'sunk') return; // it's in the cup
  const [sx, sy] = toScreen(v, b.pos.x, b.pos.y);
  // Shadow: on the table (or the floor when off the table / below it), offset by height.
  const surface = b.onTable(b.pos.x, b.pos.y) && z >= 0 ? 0 : -cfg.physics.tableHeight;
  const h = Math.max(0, z - surface);
  const shadowOff = h * 22;
  ctx.fillStyle = theme.colors.shadow;
  ctx.beginPath();
  ctx.ellipse(sx + shadowOff, sy + shadowOff * 0.6, theme.ballPixelRadius * (1 + h * 0.3), theme.ballPixelRadius * 0.7 * (1 + h * 0.3), 0, 0, Math.PI * 2);
  ctx.fill();
  // Ball: bigger the higher it is.
  const r = theme.ballPixelRadius * (1 + Math.max(z, -0.5) * 0.9);
  ctx.fillStyle = theme.colors.ball;
  ctx.strokeStyle = theme.colors.ballOutline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sx, sy, Math.max(2, r), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/**
 * Timing cue: a ring that closes in on the ball and is smallest (and green) at
 * the ideal moment to hit. After the ideal moment it reddens until the window shuts.
 */
function drawTimingRing(ctx: CanvasRenderingContext2D, theme: Theme, v: View, game: Game, team: TeamId): void {
  const cue = game.timingCue(team);
  if (!cue) return;
  const { offset, window: w } = cue;
  if (offset > w) return;
  const [sx, sy] = toScreen(v, game.ball.pos.x, game.ball.pos.y);
  const base = theme.ballPixelRadius * (1 + Math.max(game.ball.pos.z, 0) * 0.9) + 5;
  const early = Math.max(0, -offset);
  const radius = base + Math.min(1, early / (w * 2.5)) * 40;
  const c = theme.colors;
  const color = Math.abs(offset) <= w * 0.25 ? c.good : offset > 0 ? c.bad : Math.abs(offset) <= w ? c.activeRing : c.textDim;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(sx, sy, radius, 0, Math.PI * 2);
  ctx.stroke();
  // Fixed target ring the closing ring should meet.
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  ctx.strokeStyle = c.good;
  ctx.beginPath();
  ctx.arc(sx, sy, base, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Cosmetic sink celebrations: a burst of particles from the sunk cup. */
function drawCelebrations(ctx: CanvasRenderingContext2D, theme: Theme, v: View, game: Game): void {
  for (const k of game.celebrations) {
    const t = game.time - k.time;
    if (t < 0 || t > 1.6) continue;
    const colors = theme.celebrations[k.palette];
    if (!colors) continue;
    const [sx, sy] = toScreen(v, k.x, k.y);
    let seed = k.seed;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    ctx.globalAlpha = Math.max(0, 1 - t / 1.6);
    for (let i = 0; i < 36; i++) {
      const ang = rnd() * Math.PI * 2;
      const speed = 60 + rnd() * 140;
      const px = sx + Math.cos(ang) * speed * t;
      const py = sy + Math.sin(ang) * speed * t + 60 * t * t;
      ctx.fillStyle = colors[i % colors.length];
      const size = 3 + (i % 3);
      ctx.fillRect(Math.round(px), Math.round(py), size, size);
    }
    ctx.globalAlpha = 1;
  }
}

const basementCache = new Map<string, HTMLCanvasElement>();

/** Placeholder pixel-art basement: concrete floor with seams and stains, brick walls, light pool over the table. */
function drawBasement(ctx: CanvasRenderingContext2D, cfg: GameConfig, theme: Theme, v: View): void {
  const key = `${v.width}x${v.height}`;
  let bg = basementCache.get(key);
  if (!bg) {
    bg = document.createElement('canvas');
    bg.width = v.width;
    bg.height = v.height;
    const b = bg.getContext('2d')!;
    const B = theme.basement;
    b.fillStyle = B.floor;
    b.fillRect(0, 0, v.width, v.height);
    // Poured-concrete slab seams.
    b.fillStyle = B.floorSeam;
    for (let x = 0; x < v.width; x += 96) b.fillRect(x, 0, 2, v.height);
    for (let y = 0; y < v.height; y += 96) b.fillRect(0, y, v.width, 2);
    // Stains (deterministic).
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    b.fillStyle = B.stain;
    for (let i = 0; i < 26; i++) {
      const x = rnd() * v.width;
      const y = rnd() * v.height;
      const r = 6 + rnd() * 26;
      for (let k = 0; k < 5; k++) b.fillRect(Math.round(x + (rnd() - 0.5) * r), Math.round(y + (rnd() - 0.5) * r * 0.6), Math.round(r * (0.4 + rnd() * 0.6)), Math.round(4 + rnd() * 6));
    }
    // Brick walls along the top and bottom edges.
    const brickW = 24;
    const brickH = 10;
    const wall = (y0: number) => {
      b.fillStyle = B.mortar;
      b.fillRect(0, y0, v.width, B.wallDepth);
      for (let row = 0; row * brickH < B.wallDepth; row++)
        for (let x = (row % 2) * -(brickW / 2); x < v.width; x += brickW) {
          b.fillStyle = (row + Math.floor(x / brickW)) % 3 === 0 ? B.brickDark : B.brick;
          b.fillRect(Math.round(x) + 1, y0 + row * brickH + 1, brickW - 2, brickH - 2);
        }
    };
    wall(0);
    wall(v.height - B.wallDepth);
    basementCache.set(key, bg);
  }
  ctx.drawImage(bg, 0, 0);
  // The hanging light over the table.
  const [cx, cy] = toScreen(v, cfg.table.length / 2, cfg.table.width / 2);
  const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(v.width, v.height) * 0.6);
  g.addColorStop(0, theme.basement.lightGlow);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, v.width, v.height);
}
