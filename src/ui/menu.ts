// Pre-game menu model (pure) and its canvas drawing.

import { makeConfig, type GameConfig } from '../config';
import type { Theme } from '../theme';
import type { View } from '../render/renderer';
import { panel } from '../render/hud';
import { VENUE_ORDER, VENUES } from '../render/basement';

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

const players = (mode: GameConfig['players']['mode'], teamSize: 1 | 2 = 2) => (cfg: GameConfig) => {
  cfg.players.mode = mode;
  cfg.teamSize = teamSize;
};
const cpu = (d: GameConfig['players']['cpu']) => (cfg: GameConfig) => {
  cfg.players.cpu = d;
};

const CHOICES: Choice[] = [
  {
    label: 'Players',
    values: [
      { label: '2v2 head-to-head', apply: players('versus') },
      { label: '2v2 same team vs CPU', apply: players('coop') },
      { label: '1v1 head-to-head', apply: players('versus', 1) },
      { label: '1v1 vs CPU', apply: players('coop', 1) },
    ],
  },
  { label: 'CPU level', values: [{ label: 'Medium', apply: cpu('medium') }, { label: 'Hard', apply: cpu('hard') }, { label: 'Easy', apply: cpu('easy') }] },
  { label: 'View', values: [{ label: 'Behind Team A', apply: set('view', 'behindA') }, { label: 'Split screen', apply: set('view', 'split') }] },
  { label: 'Table', values: VENUE_ORDER.map((v) => ({ label: VENUES[v].name, apply: set('venue', v) })) },
  { label: 'Formation', values: [{ label: 'Tree (11 cups)', apply: set('formation', 'tree') }, { label: 'Shrub (7 cups)', apply: set('formation', 'shrub') }] },
  { label: 'Match', values: [{ label: 'Single game', apply: set('matchFormat', 'single') }, { label: 'Best of 3', apply: set('matchFormat', 'bestOf3') }] },
  { label: 'Game speed', values: [{ label: 'Normal', apply: speed(0.62) }, { label: 'Quick', apply: speed(0.78) }, { label: 'Relaxed', apply: speed(0.46) }] },
  { label: 'Ski collision', values: [{ label: 'Off', apply: set('skiCollision', false) }, { label: 'On', apply: set('skiCollision', true) }] },
  {
    label: 'Your side',
    values: [
      { label: 'Team A', apply: (cfg) => void (cfg.players.mySide = 'A') },
      { label: 'Team B', apply: (cfg) => void (cfg.players.mySide = 'B') },
    ],
  },
];

const TABLE_ROW = CHOICES.findIndex((c) => c.label === 'Table');
const SIDE_ROW = CHOICES.findIndex((c) => c.label === 'Your side');

export type MenuAction = 'draft' | 'quick' | 'collection' | 'characters' | 'profiles' | 'help' | 'backup' | null;

export interface MenuRow {
  label: string;
  value?: string;
  action?: Exclude<MenuAction, null>;
}

export class Menu {
  cursor = 0;
  private picks: number[] = CHOICES.map(() => 0);
  /** Tables this player hasn't unlocked can't be picked. */
  tableLocked: (venue: string) => boolean = () => false;

  /** The picked table, or the first unlocked one if the pick is locked. */
  private tablePick(): number {
    const p = this.picks[TABLE_ROW];
    if (!this.tableLocked(VENUE_ORDER[p])) return p;
    const free = VENUE_ORDER.findIndex((v) => !this.tableLocked(v));
    return free < 0 ? 0 : free;
  }

  private pickOf(i: number): number {
    return i === TABLE_ROW ? this.tablePick() : this.picks[i];
  }

  rows(): MenuRow[] {
    return [
      ...CHOICES.map((c, i) => ({ label: c.label, value: i === SIDE_ROW && this.picksMode() === 'coop' ? 'Team A (vs CPU)' : c.values[this.pickOf(i)].label })),
      { label: 'Draft match', action: 'draft' as const },
      { label: 'Quick match', action: 'quick' as const },
      { label: 'Collection', action: 'collection' as const },
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
      if (this.cursor === TABLE_ROW) this.picks[TABLE_ROW] = this.tablePick();
      // Locked tables are skipped.
      for (let n = 0; n < k; n++) {
        this.picks[this.cursor] = (this.picks[this.cursor] + dx + k) % k;
        if (this.cursor !== TABLE_ROW || !this.tableLocked(VENUE_ORDER[this.picks[TABLE_ROW]])) break;
      }
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
    CHOICES.forEach((c, i) => c.values[this.pickOf(i)].apply(cfg));
    if (cfg.players.mode === 'coop') cfg.players.mySide = 'A';
    return cfg;
  }

  private picksMode(): GameConfig['players']['mode'] {
    const cfg = makeConfig();
    CHOICES[0].values[this.picks[0]].apply(cfg);
    return cfg.players.mode;
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
/**
 * The logo, "PONG ZIMULATOR", drawn small and scaled up with hard pixel
 * edges. The Z is a gold Greek capital zeta (Ζ), for Zeta Psi.
 */
function logo(theme: Theme): HTMLCanvasElement {
  if (logoCache) return logoCache;
  const m = theme.menu;
  const c = document.createElement('canvas');
  c.width = 132;
  c.height = 36;
  const x = c.getContext('2d')!;
  x.textBaseline = 'top';
  const word = (text: string, px: number, py: number, font: string, fill: string) => {
    x.font = font;
    x.fillStyle = m.logoShadow;
    x.fillText(text, px + 1, py + 1);
    x.fillStyle = fill;
    x.fillText(text, px, py);
    return x.measureText(text).width;
  };
  word('PONG', 1, 1, 'bold 15px monospace', m.logo);
  const zw = word('\u0396', 1, 17, 'bold 18px serif', m.accent);
  word('IMULATOR', 1 + Math.ceil(zw) + 1, 19, 'bold 15px monospace', m.logo);
  logoCache = c;
  return c;
}

function keyCap(ctx: CanvasRenderingContext2D, theme: Theme, x: number, y: number, label: string): number {
  ctx.font = theme.fonts.label;
  const w = Math.max(26, ctx.measureText(label).width + 14);
  panel(ctx, theme, x, y - 2, w, 26, theme.colors.uiEdge, theme.menu.key);
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
  ctx.fillText('ZETA PSI BASEMENT RULES  ·  PADDLE PONG, 2V2 OR 1V1', SETUP_X + 132, 184);

  // Column headings and panels.
  const heading = (text: string, x: number, y: number) => {
    ctx.textAlign = 'left';
    ctx.font = theme.fonts.label;
    ctx.fillStyle = m.accent;
    ctx.fillText(text, x, y);
  };
  // Same pieces as the in-game HUD: dark panels with 2px borders, and the bright turn-tag
  // style (yellow, dark text) for whatever row is selected.
  panel(ctx, theme, SETUP_X - 14, TOP - 32, SETUP_W + 28, OPTION_ROWS * ROW + 44, c.uiEdge, m.panel);
  panel(ctx, theme, ACTION_X - 14, TOP - 32, ACTION_W + 28, PLAY_ROWS * 58 + 34 + 5 * ROW + 40, c.uiEdge, m.panel);
  heading('MATCH SETUP', SETUP_X, TOP - 14);
  heading('PLAY', ACTION_X, TOP - 14);
  heading('MORE', ACTION_X, TOP + PLAY_ROWS * 58 + 14);

  menu.rows().forEach((row, i) => {
    const r = menuRowRect(v, i);
    const on = i === menu.cursor;
    const play = row.action === 'draft' || row.action === 'quick';
    if (on) {
      // The selected row looks like the in-game "HIT · name" tag.
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
      ctx.fillStyle = c.activeRing;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(r.x, r.y + r.h - 3, r.w, 3);
    } else panel(ctx, theme, r.x, r.y, r.w, r.h, play ? m.accent : c.uiEdge, play ? m.rowPlay : m.row);
    const ink = on ? c.activeText : c.text;
    const mid = r.y + r.h / 2 - 1;
    ctx.textBaseline = 'middle';
    if (row.value !== undefined) {
      ctx.textAlign = 'left';
      ctx.font = theme.fonts.bar;
      ctx.fillStyle = on ? ink : c.textDim;
      ctx.fillText(row.label, r.x + 14, mid);
      ctx.textAlign = 'right';
      ctx.fillStyle = on ? ink : c.text;
      ctx.fillText(on ? `◀  ${row.value}  ▶` : row.value, r.x + r.w - 14, mid);
    } else {
      ctx.textAlign = 'left';
      ctx.font = play ? theme.fonts.title : theme.fonts.bar;
      ctx.fillStyle = on ? ink : play ? m.accentWarm : c.text;
      ctx.fillText(`${on ? '▶ ' : ''}${row.label}`, r.x + 16, mid);
      if (play) {
        ctx.font = theme.fonts.label;
        ctx.fillStyle = on ? ink : c.textDim;
        ctx.textAlign = 'right';
        ctx.fillText(row.action === 'draft' ? 'pick profiles, draft characters' : 'random characters, straight in', r.x + r.w - 14, mid);
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
    ctx.fillStyle = m.accent;
    ctx.fillText(note, SETUP_X, y + 44);
  }
}

/** Game / match over: a centered panel in the menu style, scaled like the menu. */
export function drawEndScreen(ctx: CanvasRenderingContext2D, theme: Theme, screen: View, title: string, lines: string[], prompt: string): void {
  const c = theme.colors;
  const m = theme.menu;
  ctx.fillStyle = c.overlay;
  ctx.fillRect(0, 0, screen.width, screen.height);
  const L = menuLayout(screen);
  ctx.save();
  ctx.translate(L.ox, L.oy);
  ctx.scale(L.s, L.s);
  const w = 640;
  const h = 150 + lines.length * 30;
  const x = (MENU_W - w) / 2;
  const y = (MENU_H - h) / 2;
  panel(ctx, theme, x, y, w, h, m.accent, m.panel);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = c.text;
  ctx.font = 'bold 34px monospace';
  ctx.fillText(title, MENU_W / 2, y + 48);
  ctx.font = theme.fonts.hud;
  ctx.fillStyle = c.textDim;
  lines.forEach((l, i) => ctx.fillText(l, MENU_W / 2, y + 96 + i * 30));
  if (prompt) {
    ctx.fillStyle = m.accent;
    ctx.font = theme.fonts.label;
    ctx.fillText(prompt.toUpperCase(), MENU_W / 2, y + h - 26);
  }
  ctx.restore();
}

const HELP: [string, string][] = [
  ['Keys', 'Team A: WASD to aim, Space to hit.  Team B: arrow keys to aim, Enter to hit.  Hold Q / E (Team A) or . / / (Team B) for a character\u2019s other hit styles.'],
  ['Aim', 'The marker on the table is where your shot will land, and it stays where you leave it. Up/down is deeper/shorter, left/right is across. It turns red with an X when you are aiming off the table. To sink a cup, put the marker right over it.'],
  ['Hit', 'After the ball bounces on your side, a colored ring closes in on a white ring around the ball. Hit as they meet: yellow is early, green is right, red is late. Early hits land short, late ones long. Fast balls, long rallies and balls far from you leave less time.'],
  ['Spin', 'Once the rings appear, your marker flashes: your aim is locked. The direction you hold as you hit adds spin: forward = topspin, back = backspin, sideways = sidespin. Works on serves too.'],
  ['Serve', 'Hit to toss, then hit again as the rings meet. The ball must bounce once on your side, then land in the diagonal quarter. Two serves off the table cost half a cup. A serve that hits the other team\u2019s cups also costs half a cup, and they pick which one.'],
  ['Saves', 'When a ball hits your cup, either teammate can return it before it bounces twice. The window is shorter, so react quickly.'],
  ['Cups', 'Hit a full cup: half. Hit a half cup: gone. Sink: gone, and the sinker gets served to again. Penalties never take your last half cup: the other team has to hit it off.'],
  ['Turns', 'Teammates alternate hits. The yellow tag and floor ring show who is up.'],
  ['Modes', '2v2 head-to-head (split screen gives each team its own camera), or 2v2 same team vs the CPU (WASD = left teammate, arrows = right). 1v1: one player a side makes every hit and serves from alternating halves.'],
  ['Unlocks', 'Character XP adds up to your player level. Each level gives a loot box (Collection) with a new table or character. Your side (menu) picks which team earns XP.'],
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
  const m = theme.menu;
  const x = 90;
  const w = v.width - 180;
  const textX = x + 110;
  const maxW = x + w - 28 - textX;
  // Measure first so the panel fits the text.
  ctx.font = theme.fonts.hud;
  const blocks = HELP.map(([k, t]) => ({ k, lines: wrap(ctx, t, maxW) }));
  const bodyH = blocks.reduce((a, b) => a + b.lines.length * 19 + 12, 0);
  const top = Math.max(16, (v.height - (bodyH + 120)) / 2);
  panel(ctx, theme, x, top, w, bodyH + 120, m.accent, m.panel);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = c.text;
  ctx.font = 'bold 26px monospace';
  ctx.fillText('HOW TO PLAY', x + 28, top + 38);
  let y = top + 80;
  for (const b of blocks) {
    ctx.font = theme.fonts.label;
    ctx.fillStyle = m.accent;
    ctx.fillText(b.k.toUpperCase(), x + 28, y);
    ctx.font = theme.fonts.hud;
    ctx.fillStyle = c.text;
    for (const line of b.lines) {
      ctx.fillText(line, textX, y);
      y += 19;
    }
    y += 12;
  }
  ctx.textAlign = 'right';
  ctx.font = theme.fonts.label;
  ctx.fillStyle = c.textDim;
  ctx.fillText('ANY KEY OR CLICK TO GO BACK', x + w - 28, top + 38);
}
