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
      { label: 'Quick match', action: 'quick' as const },
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

// Title screen layout (canvas pixels): option rows in a left column, actions on the right.
const SETUP_X = 56;
const SETUP_W = 470;
const ACTION_X = 588;
const ACTION_W = 486;
const TOP = 232;
const ROW = 34;
const OPTION_ROWS = CHOICES.length;
const PLAY_ROWS = 2;

/** The menu is laid out on a 1131×660 design and scaled (uniformly, centered) to the screen. */
export const MENU_W = 1131;
export const MENU_H = 660;
export function menuLayout(v: View): { s: number; ox: number; oy: number } {
  const s = Math.min(v.width / MENU_W, v.height / MENU_H);
  return { s, ox: (v.width - MENU_W * s) / 2, oy: (v.height - MENU_H * s) / 2 };
}

/** Design-space rectangle of menu row `i` (options, then Play buttons, then More). */
export function menuRowRect(_v: View, i: number) {
  if (i < OPTION_ROWS) return { x: SETUP_X, y: TOP + i * ROW, w: SETUP_W, h: ROW - 5 };
  if (i < OPTION_ROWS + PLAY_ROWS) return { x: ACTION_X, y: TOP + (i - OPTION_ROWS) * 58, w: ACTION_W, h: 50 };
  return { x: ACTION_X, y: TOP + PLAY_ROWS * 58 + 34 + (i - OPTION_ROWS - PLAY_ROWS) * ROW, w: ACTION_W, h: ROW - 5 };
}

let logoCache: HTMLCanvasElement | null = null;
/** The logo, drawn small and scaled up with hard pixel edges. */
function logo(theme: Theme): HTMLCanvasElement {
  if (logoCache) return logoCache;
  const m = theme.menu;
  const c = document.createElement('canvas');
  c.width = 132;
  c.height = 34;
  const x = c.getContext('2d')!;
  x.textBaseline = 'top';
  x.font = 'bold 15px monospace';
  x.fillStyle = m.logoShadow;
  x.fillText('DARTMOUTH', 2, 2);
  x.fillStyle = m.logo;
  x.fillText('DARTMOUTH', 1, 1);
  x.font = 'bold 15px monospace';
  x.fillStyle = m.logoShadow;
  x.fillText('PONG', 2, 19);
  x.fillStyle = m.accent;
  x.fillText('PONG', 1, 18);
  // A little ball in flight.
  x.fillStyle = m.logo;
  x.fillRect(48, 23, 3, 3);
  x.fillStyle = m.logoShadow;
  x.fillRect(56, 24, 2, 1);
  x.fillRect(61, 25, 2, 1);
  logoCache = c;
  return c;
}

function keyCap(ctx: CanvasRenderingContext2D, theme: Theme, x: number, y: number, label: string): number {
  ctx.font = theme.fonts.label;
  const w = Math.max(24, ctx.measureText(label).width + 12);
  ctx.fillStyle = theme.menu.key;
  ctx.fillRect(x, y, w, 22);
  ctx.fillStyle = theme.menu.keyEdge;
  ctx.fillRect(x, y + 19, w, 3);
  ctx.fillStyle = theme.colors.text;
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + 10);
  return w + 5;
}

export function drawMenu(ctx: CanvasRenderingContext2D, theme: Theme, screen: View, menu: Menu, note: string): void {
  const m = theme.menu;
  // Darken the live demo behind, more on the left where the text is.
  const g = ctx.createLinearGradient(0, 0, screen.width, 0);
  g.addColorStop(0, m.shadeLeft);
  g.addColorStop(1, m.shadeRight);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, screen.width, screen.height);
  const L = menuLayout(screen);
  ctx.save();
  ctx.translate(L.ox, L.oy);
  ctx.scale(L.s, L.s);
  const v = { ...screen, width: MENU_W, height: MENU_H };
  drawMenuBody(ctx, theme, v, menu, note);
  ctx.restore();
}

function drawMenuBody(ctx: CanvasRenderingContext2D, theme: Theme, v: View, menu: Menu, note: string): void {
  const c = theme.colors;
  const m = theme.menu;

  // Logo and subtitle.
  ctx.imageSmoothingEnabled = false;
  const lg = logo(theme);
  ctx.drawImage(lg, SETUP_X - 4, 34, lg.width * 4, lg.height * 4);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = theme.fonts.label;
  ctx.fillStyle = m.accent;
  ctx.fillRect(SETUP_X, 182, 120, 3);
  ctx.fillStyle = c.textDim;
  ctx.fillText(`${theme.houseLetters} BASEMENT RULES  ·  PADDLE PONG FOR FOUR`, SETUP_X + 132, 184);

  // Column headings and panels.
  const heading = (text: string, x: number, y: number) => {
    ctx.textAlign = 'left';
    ctx.font = theme.fonts.label;
    ctx.fillStyle = m.accent;
    ctx.fillText(text, x, y);
  };
  ctx.fillStyle = m.panel;
  ctx.fillRect(SETUP_X - 12, TOP - 30, SETUP_W + 24, OPTION_ROWS * ROW + 40);
  ctx.fillRect(ACTION_X - 12, TOP - 30, ACTION_W + 24, PLAY_ROWS * 58 + 34 + 4 * ROW + 40);
  heading('MATCH SETUP', SETUP_X, TOP - 14);
  heading('PLAY', ACTION_X, TOP - 14);
  heading('MORE', ACTION_X, TOP + PLAY_ROWS * 58 + 14);

  menu.rows().forEach((row, i) => {
    const r = menuRowRect(v, i);
    const on = i === menu.cursor;
    const play = row.action === 'draft' || row.action === 'quick';
    ctx.fillStyle = on ? m.rowActive : play ? m.rowPlay : m.row;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (on) {
      ctx.fillStyle = m.accentWarm;
      ctx.fillRect(r.x, r.y, 4, r.h);
    }
    const mid = r.y + r.h / 2;
    ctx.textBaseline = 'middle';
    if (row.value !== undefined) {
      ctx.textAlign = 'left';
      ctx.font = theme.fonts.hud;
      ctx.fillStyle = on ? c.text : c.textDim;
      ctx.fillText(row.label, r.x + 16, mid);
      ctx.textAlign = 'right';
      ctx.fillStyle = on ? m.accentWarm : c.text;
      ctx.fillText(on ? `◀  ${row.value}  ▶` : row.value, r.x + r.w - 14, mid);
    } else {
      ctx.textAlign = 'left';
      ctx.font = play ? theme.fonts.title : theme.fonts.hud;
      ctx.fillStyle = on ? m.accentWarm : c.text;
      ctx.fillText(`${on ? '▶ ' : ''}${row.label}`, r.x + 16, mid);
      if (play) {
        ctx.font = theme.fonts.label;
        ctx.fillStyle = c.textDim;
        ctx.textAlign = 'right';
        ctx.fillText(row.action === 'draft' ? 'pick profiles, draft characters' : 'generic players, straight in', r.x + r.w - 14, mid);
      }
    }
  });

  // Controls legend.
  let x = SETUP_X;
  const y = 590;
  ctx.textAlign = 'left';
  ctx.font = theme.fonts.label;
  ctx.fillStyle = c.teamA;
  ctx.fillText('TEAM A', x, y + 11);
  x += 62;
  for (const k of ['W', 'A', 'S', 'D']) x += keyCap(ctx, theme, x, y, k);
  x += keyCap(ctx, theme, x, y, 'SPACE') + 26;
  ctx.textAlign = 'left';
  ctx.font = theme.fonts.label;
  ctx.fillStyle = c.teamB;
  ctx.fillText('TEAM B', x, y + 11);
  x += 62;
  for (const k of ['←', '↑', '↓', '→']) x += keyCap(ctx, theme, x, y, k);
  x += keyCap(ctx, theme, x, y, 'ENTER') + 26;
  ctx.textAlign = 'left';
  ctx.font = theme.fonts.label;
  ctx.fillStyle = c.textDim;
  ctx.fillText('↑↓ move · ←→ change · hit key selects · mouse works too', x, y + 11);
  if (note) {
    ctx.font = theme.fonts.hud;
    ctx.fillStyle = c.good;
    ctx.fillText(note, SETUP_X, y + 44);
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
  ['Aim', 'Your crosshair shows where your shot will land; it stays where you leave it. In the 3D view up/down is deeper/shorter, left/right is across. It can go off the table, so mind the edges. Near a cup it snaps on (a yellow ring): a well-timed hit drops in.'],
  ['Spin', 'When the ring appears your crosshair freezes, and the direction you hold as you hit adds spin: forward = topspin (low, skids on), back = backspin (sits up), sideways = sidespin that curves and kicks that way. Works on serves too.'],
  ['Modes', 'Head-to-head: one of you per team (split screen gives each team its own camera). Same team: you two against the CPU; WASD plays the left teammate, the arrows the right one, and a press out of turn does nothing.'],
  ['Hit', 'After the ball bounces on your side, a ring closes in on it. Hit when it meets the ball and turns green. Early hits land short, late ones long, and both fly lower. Fast balls, long rallies and balls far from you leave less time; too far is out of reach.'],
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

export function drawHelp(ctx: CanvasRenderingContext2D, theme: Theme, screen: View): void {
  const c = theme.colors;
  ctx.fillStyle = c.overlay;
  ctx.fillRect(0, 0, screen.width, screen.height);
  ctx.fillRect(0, 0, screen.width, screen.height);
  const L = menuLayout(screen);
  ctx.save();
  ctx.translate(L.ox, L.oy);
  ctx.scale(L.s, L.s);
  drawHelpBody(ctx, theme, { ...screen, width: MENU_W, height: MENU_H });
  ctx.restore();
}

function drawHelpBody(ctx: CanvasRenderingContext2D, theme: Theme, v: View): void {
  const c = theme.colors;
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
