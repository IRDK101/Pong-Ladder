// Pre-game menu model (pure) and its canvas drawing.

import { makeConfig, type GameConfig } from '../config';
import type { Theme } from '../theme';
import type { View } from '../render/renderer';

interface Choice<K extends keyof GameConfig> {
  key: K;
  label: string;
  values: { value: GameConfig[K]; label: string }[];
}

type AnyChoice = { [K in keyof GameConfig]: Choice<K> }[keyof GameConfig];

const CHOICES: AnyChoice[] = [
  { key: 'formation', label: 'Formation', values: [{ value: 'tree', label: 'Tree (11 cups)' }, { value: 'shrub', label: 'Shrub (7 cups)' }] },
  { key: 'matchFormat', label: 'Match', values: [{ value: 'single', label: 'Single game' }, { value: 'bestOf3', label: 'Best of 3' }] },
  { key: 'penaltyCupSelection', label: 'Penalty cup', values: [{ value: 'choose', label: 'Team chooses' }, { value: 'auto', label: 'Automatic' }] },
  { key: 'skiCollision', label: 'Ski collision', values: [{ value: false, label: 'Off' }, { value: true, label: 'On' }] },
];

export type MenuAction = 'start' | 'export' | 'import' | null;

export interface MenuRow {
  label: string;
  value?: string;
  action?: Exclude<MenuAction, null>;
}

export class Menu {
  cursor = 0;
  private picks: number[] = CHOICES.map(() => 0);

  rows(): MenuRow[] {
    return [
      ...CHOICES.map((c, i) => ({ label: c.label, value: c.values[this.picks[i]].label })),
      { label: 'Start match', action: 'start' as const },
      { label: 'Export match logs (JSON)', action: 'export' as const },
      { label: 'Import match logs (JSON)', action: 'import' as const },
    ];
  }

  /** Move the cursor (dy) or change the current option (dx). */
  move(dy: number, dx: number): void {
    const n = this.rows().length;
    if (dy) this.cursor = (this.cursor + dy + n) % n;
    if (dx && this.cursor < CHOICES.length) {
      const k = CHOICES[this.cursor].values.length;
      this.picks[this.cursor] = (this.picks[this.cursor] + dx + k) % k;
    }
  }

  /** Activate the current row. Option rows cycle forward; action rows return their action. */
  activate(): MenuAction {
    const row = this.rows()[this.cursor];
    if (row.action) return row.action;
    this.move(0, 1);
    return null;
  }

  config(base: GameConfig = makeConfig()): GameConfig {
    const cfg = structuredClone(base) as unknown as Record<string, unknown>;
    CHOICES.forEach((c, i) => (cfg[c.key] = c.values[this.picks[i]].value));
    return cfg as unknown as GameConfig;
  }
}

const ROW_H = 38;

export function menuRowRect(v: View, i: number) {
  const w = 460;
  return { x: v.width / 2 - w / 2, y: 190 + i * ROW_H, w, h: ROW_H - 6 };
}

export function drawMenu(ctx: CanvasRenderingContext2D, theme: Theme, v: View, menu: Menu, note: string): void {
  const c = theme.colors;
  ctx.fillStyle = c.overlay;
  ctx.fillRect(0, 0, v.width, v.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = c.text;
  ctx.font = 'bold 40px monospace';
  ctx.fillText('DARTMOUTH PONG', v.width / 2, 90);
  ctx.font = theme.fonts.hud;
  ctx.fillStyle = c.textDim;
  ctx.fillText('Zeta Psi basement rules', v.width / 2, 130);

  menu.rows().forEach((row, i) => {
    const r = menuRowRect(v, i);
    ctx.fillStyle = i === menu.cursor ? c.buttonActive : c.button;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.font = theme.fonts.hud;
    ctx.fillStyle = c.text;
    if (row.value !== undefined) {
      ctx.textAlign = 'left';
      ctx.fillText(row.label, r.x + 16, r.y + r.h / 2);
      ctx.textAlign = 'right';
      ctx.fillText(`◀ ${row.value} ▶`, r.x + r.w - 16, r.y + r.h / 2);
    } else {
      ctx.textAlign = 'center';
      ctx.font = row.action === 'start' ? theme.fonts.title : theme.fonts.hud;
      ctx.fillText(row.label, r.x + r.w / 2, r.y + r.h / 2);
    }
  });

  ctx.textAlign = 'center';
  ctx.font = theme.fonts.hud;
  ctx.fillStyle = c.textDim;
  const y = menuRowRect(v, menu.rows().length).y + 20;
  ctx.fillText('Up/down: move · Left/right: change · Space/Enter: select · or use the mouse', v.width / 2, y);
  ctx.fillText('Team A: WASD + Space    ·    Team B: Arrows + Enter', v.width / 2, y + 24);
  if (note) {
    ctx.fillStyle = c.good;
    ctx.fillText(note, v.width / 2, y + 54);
  }
}

export function drawEndScreen(ctx: CanvasRenderingContext2D, theme: Theme, v: View, title: string, lines: string[], prompt: string): void {
  const c = theme.colors;
  ctx.fillStyle = c.overlay;
  ctx.fillRect(0, 0, v.width, v.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = c.text;
  ctx.font = 'bold 44px monospace';
  ctx.fillText(title, v.width / 2, v.height / 2 - 90);
  ctx.font = theme.fonts.title;
  ctx.fillStyle = c.textDim;
  lines.forEach((l, i) => ctx.fillText(l, v.width / 2, v.height / 2 - 30 + i * 30));
  ctx.fillStyle = c.activeRing;
  ctx.font = theme.fonts.hud;
  ctx.fillText(prompt, v.width / 2, v.height / 2 + 30 + lines.length * 30);
}
