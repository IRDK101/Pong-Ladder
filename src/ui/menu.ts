// Pre-game menu model (pure) and its canvas drawing.

import { makeConfig, type GameConfig } from '../config';
import type { Theme } from '../theme';
import type { View } from '../render/renderer';

interface Choice {
  label: string;
  values: { label: string; apply: (cfg: GameConfig) => void }[];
}

const set =
  <K extends keyof GameConfig>(key: K, value: GameConfig[K]) =>
  (cfg: GameConfig) => {
    cfg[key] = value;
  };
const speed = (timeScale: number) => (cfg: GameConfig) => {
  cfg.physics.timeScale = timeScale;
};

const players = (mode: GameConfig['players']['mode']) => (cfg: GameConfig) => {
  cfg.players.mode = mode;
};
const cpu = (d: GameConfig['players']['cpu']) => (cfg: GameConfig) => {
  cfg.players.cpu = d;
};

const CHOICES: Choice[] = [
  { label: 'Players', values: [{ label: 'Head-to-head', apply: players('versus') }, { label: 'Same team vs CPU', apply: players('coop') }] },
  { label: 'CPU level', values: [{ label: 'Medium', apply: cpu('medium') }, { label: 'Hard', apply: cpu('hard') }, { label: 'Easy', apply: cpu('easy') }] },
  { label: 'View', values: [{ label: 'Behind Team A', apply: set('view', 'behindA') }, { label: 'Split screen', apply: set('view', 'split') }, { label: 'Classic top-down', apply: set('view', 'topDown') }] },
  { label: 'Formation', values: [{ label: 'Tree (11 cups)', apply: set('formation', 'tree') }, { label: 'Shrub (7 cups)', apply: set('formation', 'shrub') }] },
  { label: 'Match', values: [{ label: 'Single game', apply: set('matchFormat', 'single') }, { label: 'Best of 3', apply: set('matchFormat', 'bestOf3') }] },
  { label: 'Game speed', values: [{ label: 'Normal', apply: speed(0.55) }, { label: 'Quick', apply: speed(0.7) }, { label: 'Relaxed', apply: speed(0.42) }] },
  { label: 'Penalty cup', values: [{ label: 'Team chooses', apply: set('penaltyCupSelection', 'choose') }, { label: 'Automatic', apply: set('penaltyCupSelection', 'auto') }] },
  { label: 'Ski collision', values: [{ label: 'Off', apply: set('skiCollision', false) }, { label: 'On', apply: set('skiCollision', true) }] },
];

export type MenuAction = 'draft' | 'quick' | 'characters' | 'profiles' | 'help' | 'backup' | null;

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
      { label: 'Draft match', action: 'draft' as const },
      { label: 'Quick match (generic players)', action: 'quick' as const },
      { label: 'Characters', action: 'characters' as const },
      { label: 'Players', action: 'profiles' as const },
      { label: 'How to play', action: 'help' as const },
      { label: 'Back up / restore', action: 'backup' as const },
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
    const cfg = structuredClone(base);
    CHOICES.forEach((c, i) => c.values[this.picks[i]].apply(cfg));
    return cfg;
  }
}

const ROW_H = 29;

export function menuRowRect(v: View, i: number) {
  const w = 460;
  return { x: v.width / 2 - w / 2, y: 128 + i * ROW_H, w, h: ROW_H - 4 };
}

export function drawMenu(ctx: CanvasRenderingContext2D, theme: Theme, v: View, menu: Menu, note: string): void {
  const c = theme.colors;
  ctx.fillStyle = c.overlay;
  ctx.fillRect(0, 0, v.width, v.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = c.text;
  ctx.font = 'bold 40px monospace';
  ctx.fillText('DARTMOUTH PONG', v.width / 2, 58);
  ctx.font = theme.fonts.hud;
  ctx.fillStyle = c.textDim;
  ctx.fillText('Zeta Psi basement rules', v.width / 2, 94);

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
      ctx.font = row.action === 'draft' ? theme.fonts.title : theme.fonts.hud;
      ctx.fillText(row.label, r.x + r.w / 2, r.y + r.h / 2);
    }
  });

  ctx.textAlign = 'center';
  ctx.font = theme.fonts.hud;
  ctx.fillStyle = c.textDim;
  const y = menuRowRect(v, menu.rows().length).y + 14;
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

const HELP: [string, string][] = [
  ['Keys', 'Team A: WASD to aim, Space to hit.   Team B: arrow keys to aim, Enter to hit.'],
  ['Aim', 'Your crosshair shows where your shot will land. Hold an aim key to slide it; it stays where you leave it. Keys follow your screen: in the 3D view, up/down is deeper/shorter and left/right is across the table.'],
  ['Modes', 'Head-to-head: one of you per team (split screen gives each team its own camera). Same team: you two against the CPU; WASD plays the left teammate, the arrows the right one, and a press out of turn does nothing.'],
  ['Hit', 'After the ball bounces on your side, a ring closes in on it. Hit when the ring meets the ball and turns green. Early or late hits land wide and fly lower; below shoulder height is a low hit and loses the rally.'],
  ['Serve', 'Press hit to toss the ball, then hit again as the ring closes at the top of the toss. It must bounce once on your side, then land in the diagonal quarter. Three serves off the table cost half a cup.'],
  ['Saves', 'When a ball hits your cup, return it before it bounces twice. The ring closes faster: react quickly.'],
  ['Cups', 'Hit a full cup: half. Hit a half cup: gone. Sink: gone, and the sinker gets served to again.'],
  ['Turns', 'Teammates alternate hits. The yellow ring marks whose turn it is; control switches automatically.'],
];

/** Split text into lines no wider than maxWidth with the current font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export function drawHelp(ctx: CanvasRenderingContext2D, theme: Theme, v: View): void {
  const c = theme.colors;
  ctx.fillStyle = c.overlay;
  ctx.fillRect(0, 0, v.width, v.height);
  ctx.fillRect(0, 0, v.width, v.height);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = c.text;
  ctx.font = 'bold 32px monospace';
  ctx.fillText('HOW TO PLAY', v.width / 2, 80);
  const x = Math.max(40, v.width / 2 - 440);
  const textX = x + 90;
  const maxW = v.width - textX - 40;
  let y = 150;
  for (const [k, text] of HELP) {
    ctx.textAlign = 'left';
    ctx.font = theme.fonts.title;
    ctx.fillStyle = c.activeRing;
    ctx.fillText(k, x, y);
    ctx.font = theme.fonts.hud;
    ctx.fillStyle = c.text;
    for (const line of wrap(ctx, text, maxW)) {
      ctx.fillText(line, textX, y);
      y += 20;
    }
    y += 16;
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = c.textDim;
  ctx.fillText('Press any key or click to go back', v.width / 2, y + 10);
}
