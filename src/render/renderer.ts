// Canvas 2D renderer. Reads state, never mutates it.

import type { GameConfig } from '../config';
import type { Theme } from '../theme';
import type { Cup, PlayerId } from '../core/types';
import { laneOf } from '../core/table';

export interface View {
  /** Screen pixels per meter. */
  scale: number;
  /** Screen position of table origin (x = 0, y = 0). */
  ox: number;
  oy: number;
  width: number;
  height: number;
}

export function makeView(cfg: GameConfig, theme: Theme): View {
  const scale = theme.pixelsPerMeter;
  const pad = theme.tablePadding;
  return {
    scale,
    ox: pad,
    oy: pad,
    width: Math.round(cfg.table.length * scale + pad * 2),
    height: Math.round(cfg.table.width * scale + pad * 2),
  };
}

export const toScreen = (v: View, x: number, y: number): [number, number] => [v.ox + x * v.scale, v.oy + y * v.scale];

export const toTable = (v: View, sx: number, sy: number): [number, number] => [(sx - v.ox) / v.scale, (sy - v.oy) / v.scale];

export interface Scene {
  cups: Cup[];
  players: PlayerId[];
  caption: string;
}

export function render(ctx: CanvasRenderingContext2D, cfg: GameConfig, theme: Theme, v: View, scene: Scene): void {
  const c = theme.colors;
  ctx.fillStyle = c.floor;
  ctx.fillRect(0, 0, v.width, v.height);

  drawTable(ctx, cfg, theme, v);
  drawSki(ctx, cfg, theme, v);
  for (const cup of scene.cups) drawCup(ctx, cfg, theme, v, cup);
  for (const p of scene.players) drawPlayerMarker(ctx, cfg, theme, v, p);

  ctx.fillStyle = c.textDim;
  ctx.font = theme.fonts.hud;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(scene.caption, v.width / 2, v.height - theme.tablePadding / 3);
}

function drawTable(ctx: CanvasRenderingContext2D, cfg: GameConfig, theme: Theme, v: View): void {
  const c = theme.colors;
  const [x0, y0] = toScreen(v, 0, 0);
  const [x1, y1] = toScreen(v, cfg.table.length, cfg.table.width);
  const edge = 6;
  ctx.fillStyle = c.tableEdge;
  ctx.fillRect(x0 - edge, y0 - edge, x1 - x0 + edge * 2, y1 - y0 + edge * 2);
  ctx.fillStyle = c.tableTop;
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
  ctx.fillStyle = c.skiBody;
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

  ctx.fillStyle = cup.team === 'A' ? c.cupTeamA : c.cupTeamB;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();

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

function drawPlayerMarker(ctx: CanvasRenderingContext2D, cfg: GameConfig, theme: Theme, v: View, p: PlayerId): void {
  const c = theme.colors;
  const lane = laneOf(p);
  const y = cfg.table.width * (lane === 'low' ? 0.25 : 0.75);
  const x = p.team === 'A' ? 0 : cfg.table.length;
  const [sx, sy] = toScreen(v, x, y);
  const dx = p.team === 'A' ? -theme.tablePadding / 2 : theme.tablePadding / 2;
  ctx.fillStyle = p.team === 'A' ? c.teamA : c.teamB;
  ctx.font = theme.fonts.label;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${p.team}-${p.side}`, sx + dx, sy);
}
