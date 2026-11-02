// Pre-game menu model (pure) and its canvas drawing.

import { makeConfig, type GameConfig } from '../config';
import type { Theme } from '../theme';
import type { View } from '../render/renderer';
import type { Sprite } from '../core/character';
import type { NameStyle } from '../progress/nameStyles';
import { drawStyledName } from './nameStyle';
import { panel } from '../render/hud';
import { VENUE_ORDER, VENUES } from '../render/basement';
import { DESIGN_ORDER, DESIGNS } from '../render/designs';

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

type OptionId = 'players' | 'cpu' | 'view' | 'table' | 'spot' | 'formation' | 'match' | 'speed' | 'ski';
export type RowId = OptionId | 'playingAs' | 'collection' | 'quick' | 'draft' | 'online' | 'characters' | 'account' | 'leaderboard' | 'help' | 'backup';

const CHOICES: (Choice & { id: OptionId })[] = [
  {
    id: 'players',
    label: 'Mode',
    values: [
      { label: '2v2 head-to-head', apply: players('versus') },
      { label: '2v2 same team vs CPU', apply: players('coop') },
      { label: '1v1 head-to-head', apply: players('versus', 1) },
      { label: '1v1 vs CPU', apply: players('coop', 1) },
    ],
  },
  { id: 'cpu', label: 'CPU level', values: [{ label: 'Medium', apply: cpu('medium') }, { label: 'Hard', apply: cpu('hard') }, { label: 'Easy', apply: cpu('easy') }] },
  { id: 'view', label: 'View', values: [{ label: 'Behind Team A', apply: set('view', 'behindA') }, { label: 'Split screen', apply: set('view', 'split') }] },
  { id: 'table', label: 'Table', values: DESIGN_ORDER.map((d) => ({ label: DESIGNS[d].name, apply: set('design', d) })) },
  { id: 'spot', label: 'Spot', values: VENUE_ORDER.map((v) => ({ label: VENUES[v].spot, apply: set('venue', v) })) },
  { id: 'formation', label: 'Cups', values: [{ label: 'Tree · 11', apply: set('formation', 'tree') }, { label: 'Shrub · 7', apply: set('formation', 'shrub') }] },
  { id: 'match', label: 'Match', values: [{ label: 'Single game', apply: set('matchFormat', 'single') }, { label: 'Best of 3', apply: set('matchFormat', 'bestOf3') }] },
  { id: 'speed', label: 'Speed', values: [{ label: 'Normal', apply: speed(0.62) }, { label: 'Quick', apply: speed(0.78) }, { label: 'Relaxed', apply: speed(0.46) }] },
  { id: 'ski', label: 'Ski collision', values: [{ label: 'Off', apply: set('skiCollision', false) }, { label: 'On', apply: set('skiCollision', true) }] },
];

const TABLE_ROW = CHOICES.findIndex((c) => c.id === 'table');
const choiceIndex = (id: RowId) => CHOICES.findIndex((c) => c.id === id);

export type MenuAction = 'draft' | 'quick' | 'online' | 'leaderboard' | 'pickTable' | 'pickCharacters' | 'collection' | 'characters' | 'account' | 'help' | 'backup' | null;

export interface MenuRow {
  id: RowId;
  label: string;
  value?: string;
  action?: Exclude<MenuAction, null>;
  /** An option row whose value comes from a picker screen (no ◀ ▶ cycling). */
  picker?: boolean;
  /** Shown dimmed: doesn't apply to the chosen mode. */
  dim?: boolean;
}

// ------------------------------------------------------------------ layout
// The title screen is laid out on a 1131×660 design, scaled to the screen.
// Left: MATCH (mode, who you play as, which table, where) and HOUSE RULES
// (a compact grid). Right: the Collection card (level, loot boxes), PLAY, MORE.

const LX = 56;
const LW = 470;
const RX = 588;
const RW = 486;
const CELL = (LW - 8) / 2;
const RULES_Y = 466;

const RECTS: Record<RowId, { x: number; y: number; w: number; h: number }> = {
  players: { x: LX, y: 228, w: LW, h: 29 },
  cpu: { x: LX, y: 262, w: LW, h: 29 },
  playingAs: { x: LX, y: 296, w: LW, h: 46 },
  table: { x: LX, y: 347, w: LW, h: 46 },
  spot: { x: LX, y: 398, w: LW, h: 29 },
  formation: { x: LX, y: RULES_Y, w: CELL, h: 29 },
  match: { x: LX + CELL + 8, y: RULES_Y, w: CELL, h: 29 },
  speed: { x: LX, y: RULES_Y + 34, w: CELL, h: 29 },
  ski: { x: LX + CELL + 8, y: RULES_Y + 34, w: CELL, h: 29 },
  view: { x: LX, y: RULES_Y + 68, w: CELL, h: 29 },
  collection: { x: RX, y: 40, w: RW, h: 132 },
  quick: { x: RX, y: 228, w: RW, h: 44 },
  draft: { x: RX, y: 277, w: RW, h: 44 },
  online: { x: RX, y: 326, w: RW, h: 44 },
  characters: { x: RX, y: 412, w: RW, h: 31 },
  account: { x: RX, y: 448, w: RW, h: 31 },
  leaderboard: { x: RX, y: 484, w: RW, h: 31 },
  help: { x: RX, y: 520, w: RW, h: 31 },
  backup: { x: RX, y: 556, w: RW, h: 31 },
};

// Portrait (phones): one column on a 560-wide design — progress, play, match, rules, more.
const PX = 28;
const PW = 504;
const PCELL = (PW - 8) / 2;
const PORTRAIT: Record<RowId, { x: number; y: number; w: number; h: number }> = {
  collection: { x: PX, y: 200, w: PW, h: 132 },
  quick: { x: PX, y: 372, w: PW, h: 46 },
  draft: { x: PX, y: 424, w: PW, h: 46 },
  online: { x: PX, y: 476, w: PW, h: 46 },
  players: { x: PX, y: 564, w: PW, h: 29 },
  cpu: { x: PX, y: 598, w: PW, h: 29 },
  playingAs: { x: PX, y: 632, w: PW, h: 46 },
  table: { x: PX, y: 683, w: PW, h: 46 },
  spot: { x: PX, y: 734, w: PW, h: 29 },
  formation: { x: PX, y: 804, w: PCELL, h: 29 },
  match: { x: PX + PCELL + 8, y: 804, w: PCELL, h: 29 },
  speed: { x: PX, y: 838, w: PCELL, h: 29 },
  ski: { x: PX + PCELL + 8, y: 838, w: PCELL, h: 29 },
  view: { x: PX, y: 872, w: PCELL, h: 29 },
  characters: { x: PX, y: 942, w: PW, h: 33 },
  account: { x: PX, y: 982, w: PW, h: 33 },
  leaderboard: { x: PX, y: 1022, w: PW, h: 33 },
  help: { x: PX, y: 1062, w: PW, h: 33 },
  backup: { x: PX, y: 1102, w: PW, h: 33 },
};

/** Narrow screens get the portrait layout. */
export function isPortrait(v: { width: number; height: number }): boolean {
  return v.width < v.height * 0.9;
}

/** Design-space rectangle of a menu row (for the screen's layout). */
export function rowRect(id: RowId, portrait = false) {
  return (portrait ? PORTRAIT : RECTS)[id];
}

/** The panels around groups of rows, with their headings. */
const GROUPS: { title: string; ids: RowId[] }[] = [
  { title: 'MATCH', ids: ['players', 'cpu', 'playingAs', 'table', 'spot'] },
  { title: 'HOUSE RULES', ids: ['formation', 'match', 'speed', 'ski', 'view'] },
  { title: 'PLAY', ids: ['quick', 'draft', 'online'] },
  { title: 'MORE', ids: ['characters', 'account', 'leaderboard', 'help', 'backup'] },
];

export class Menu {
  private picks: number[] = CHOICES.map(() => 0);
  /** Tables this player hasn't unlocked can't be picked. */
  tableLocked: (venue: string) => boolean = () => false;
  /** Which team the signed-in player is on in head-to-head (set in the character picker). */
  mySide: 'A' | 'B' = 'A';
  /** The "Playing as" row's value: the characters picked for the player's side. */
  playingAs: () => string = () => 'Random';
  /** The profile row: its label, a hint, and how many things wait there (moderator reviews). */
  accountInfo: () => { label: string; hint: string; alert: number } = () => ({ label: 'Your profile', hint: 'not signed in · this browser only', alert: 0 });
  /** The leaderboard row's hint (e.g. your rank). */
  leaderboardHint: () => string = () => 'XP of every approved player';
  /** Starts on Quick match, so the hit key plays straight away. */
  cursor = this.rows().findIndex((r) => r.id === 'quick');

  /** Bring back a saved table pick (kept even while it reads as locked: unlocks can arrive after the menu loads). */
  restoreDesign(id: string): void {
    const i = DESIGN_ORDER.indexOf(id as (typeof DESIGN_ORDER)[number]);
    if (i >= 0) this.picks[TABLE_ROW] = i;
  }

  /** Choose a table from the table picker. */
  setDesign(id: string): void {
    const i = DESIGN_ORDER.indexOf(id as (typeof DESIGN_ORDER)[number]);
    if (i >= 0 && !this.tableLocked(id)) this.picks[TABLE_ROW] = i;
  }

  /** Put the cursor on a row. */
  focus(id: RowId): void {
    const i = this.rows().findIndex((r) => r.id === id);
    if (i >= 0) this.cursor = i;
  }

  get current(): RowId {
    return this.rows()[this.cursor].id;
  }

  /** The picked table, or the first unlocked one if the pick is locked. */
  private tablePick(): number {
    const p = this.picks[TABLE_ROW];
    if (!this.tableLocked(DESIGN_ORDER[p])) return p;
    const free = DESIGN_ORDER.findIndex((v) => !this.tableLocked(v));
    return free < 0 ? 0 : free;
  }

  private pickOf(i: number): number {
    return i === TABLE_ROW ? this.tablePick() : this.picks[i];
  }

  rows(): MenuRow[] {
    const opt = (id: OptionId): MenuRow => {
      const i = choiceIndex(id);
      return { id, label: CHOICES[i].label, value: CHOICES[i].values[this.pickOf(i)].label };
    };
    const mode = this.picks ? this.modeNow() : 'versus';
    return [
      opt('players'),
      { ...opt('cpu'), dim: mode !== 'coop' },
      { id: 'playingAs', label: 'Playing as', value: this.playingAs(), action: 'pickCharacters', picker: true },
      opt('table'),
      opt('spot'),
      opt('formation'),
      opt('match'),
      opt('speed'),
      opt('ski'),
      { ...opt('view'), dim: mode === 'coop' },
      { id: 'collection', label: 'Collection', action: 'collection' },
      { id: 'quick', label: 'Quick match', action: 'quick' },
      { id: 'draft', label: 'Draft match', action: 'draft' },
      { id: 'online', label: 'Online match', action: 'online' },
      { id: 'characters', label: 'Characters', action: 'characters' },
      { id: 'account', label: this.accountInfo().label, action: 'account' },
      { id: 'leaderboard', label: 'Leaderboard', action: 'leaderboard' },
      { id: 'help', label: 'How to play', action: 'help' },
      { id: 'backup', label: 'Back up / restore', action: 'backup' },
    ];
  }

  private modeNow(): GameConfig['players']['mode'] {
    const cfg = makeConfig();
    CHOICES[0].values[this.picks[0]].apply(cfg);
    return cfg.players.mode;
  }

  /**
   * Arrow keys. Up/down move to the next row above or below in the same
   * column (wrapping). Left/right change an option's value; on other rows
   * they hop to the nearest row in the other column.
   */
  move(dy: number, dx: number): void {
    const rows = this.rows();
    const here = RECTS[rows[this.cursor].id];
    const cx = (r: { x: number; w: number }) => r.x + r.w / 2;
    const cy = (r: { y: number; h: number }) => r.y + r.h / 2;
    if (dy) {
      const col = rows.map((r, i) => ({ i, r: RECTS[r.id] })).filter(({ r }) => Math.abs(r.x - here.x) < 4);
      col.sort((a, b) => cy(a.r) - cy(b.r));
      const k = col.findIndex(({ i }) => i === this.cursor);
      this.cursor = col[(k + dy + col.length) % col.length].i;
      return;
    }
    if (!dx) return;
    const ci = choiceIndex(rows[this.cursor].id);
    if (ci >= 0) {
      const k = CHOICES[ci].values.length;
      if (ci === TABLE_ROW) this.picks[TABLE_ROW] = this.tablePick();
      // Locked tables are skipped.
      for (let n = 0; n < k; n++) {
        this.picks[ci] = (this.picks[ci] + dx + k) % k;
        if (ci !== TABLE_ROW || !this.tableLocked(DESIGN_ORDER[this.picks[TABLE_ROW]])) break;
      }
      return;
    }
    // Hop columns, to the row nearest in height.
    const left = here.x < RX;
    const other = rows.map((r, i) => ({ i, r: RECTS[r.id] })).filter(({ r }) => (r.x < RX) !== left);
    other.sort((a, b) => Math.abs(cy(a.r) - cy(here)) - Math.abs(cy(b.r) - cy(here)) || Math.abs(cx(a.r) - cx(here)) - Math.abs(cx(b.r) - cx(here)));
    if (other.length) this.cursor = other[0].i;
  }

  /** Activate the current row. Option rows cycle forward; action rows return their action. */
  activate(): MenuAction {
    const row = this.rows()[this.cursor];
    if (row.action) return row.action;
    // The Table row opens the table picker (left/right still flips through tables).
    if (row.id === 'table') return 'pickTable';
    this.move(0, 1);
    return null;
  }

  config(base: GameConfig = makeConfig()): GameConfig {
    const cfg = structuredClone(base);
    CHOICES.forEach((c, i) => c.values[this.pickOf(i)].apply(cfg));
    cfg.players.mySide = cfg.players.mode === 'coop' ? 'A' : this.mySide;
    return cfg;
  }
}

/** The menu is laid out on a 1131×660 design (560×1070 in portrait) and scaled (uniformly, centered) to the screen. */
export const MENU_W = 1131;
export const MENU_H = 660;
export function menuLayout(v: View): { s: number; ox: number; oy: number; portrait: boolean } {
  const portrait = isPortrait(v);
  const W = portrait ? 560 : MENU_W;
  const H = portrait ? 1190 : MENU_H;
  const s = Math.min(v.width / W, v.height / H);
  return { s, ox: (v.width - W * s) / 2, oy: portrait ? Math.max(0, (v.height - H * s) / 2) : (v.height - H * s) / 2, portrait };
}

/** The end screens keep the landscape design (they're small panels). */
function endLayout(v: View): { s: number; ox: number; oy: number } {
  const s = Math.min(v.width / MENU_W, v.height / MENU_H) * (isPortrait(v) ? 1.6 : 1);
  const sc = Math.min(s, v.width / 680);
  return { s: sc, ox: (v.width - MENU_W * sc) / 2, oy: (v.height - MENU_H * sc) / 2 };
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

/** What the title screen shows besides the rows: the player's progress and picks. */
export interface MenuExtras {
  level: number;
  xpInto: number;
  xpSpan: number;
  /** Loot boxes waiting to be opened (0 = none), and whether anything is left to unlock. */
  boxes: number;
  nothingLeft: boolean;
  /** Character cosmetics unlocked since the player last looked. */
  newRewards: number;
  /** Owner: characters waiting for review. */
  pending: number;
  offline: boolean;
  /** Why games don't earn XP right now (no approved profile), if so. */
  progressNote?: string;
  /** The moderator: everything is unlocked, no loot boxes. */
  allAccess?: boolean;
  /** The picked characters' sprites (null = random). */
  team: (Sprite | null)[];
  /** The picked table's painted top. */
  tableArt: HTMLCanvasElement | null;
  /** The player's profile name and its style (null = no profile). */
  me?: { name: string; style: NameStyle } | null;
}

const NO_EXTRAS: MenuExtras = { level: 1, xpInto: 0, xpSpan: 150, boxes: 0, nothingLeft: false, newRewards: 0, pending: 0, offline: true, team: [], tableArt: null };

export function drawMenu(ctx: CanvasRenderingContext2D, theme: Theme, screen: View, menu: Menu, note: string, extras: MenuExtras = NO_EXTRAS): void {
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
  drawMenuBody(ctx, theme, menu, note, extras, L.portrait);
  ctx.restore();
}

const spriteCanvases = new WeakMap<Sprite, HTMLCanvasElement>();
function spriteCanvas(sp: Sprite): HTMLCanvasElement {
  let c = spriteCanvases.get(sp);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = sp.w;
  c.height = sp.h;
  const x = c.getContext('2d')!;
  sp.pixels.forEach((col, i) => {
    if (!col) return;
    x.fillStyle = col;
    x.fillRect(i % sp.w, Math.floor(i / sp.w), 1, 1);
  });
  spriteCanvases.set(sp, c);
  return c;
}

/** A small red count badge (reward alerts), pulsing gently. */
function badge(ctx: CanvasRenderingContext2D, theme: Theme, x: number, y: number, text: string, pulse = true): void {
  ctx.font = theme.fonts.label;
  const w = Math.max(22, ctx.measureText(text).width + 12);
  const t = pulse ? (Math.sin(performance.now() / 260) + 1) / 2 : 0;
  ctx.fillStyle = `rgba(255, 90, 70, ${0.25 + 0.35 * t})`;
  ctx.fillRect(x - w / 2 - 3, y - 14, w + 6, 28);
  ctx.fillStyle = '#0d0b09';
  ctx.fillRect(x - w / 2 - 1, y - 12, w + 2, 24);
  ctx.fillStyle = theme.colors.bad;
  ctx.fillRect(x - w / 2, y - 11, w, 22);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

/** A pixel crate (the loot box), lid lifting when there's something inside. */
function crate(ctx: CanvasRenderingContext2D, theme: Theme, x: number, y: number, ready: boolean): void {
  const gold = theme.menu.accent;
  const lift = ready ? Math.max(0, Math.sin(performance.now() / 300)) * 4 : 0;
  ctx.fillStyle = '#0d0b09';
  ctx.fillRect(x - 2, y + 12, 52, 34);
  ctx.fillStyle = '#3a2416';
  ctx.fillRect(x, y + 14, 48, 30);
  ctx.fillStyle = gold;
  ctx.fillRect(x, y + 14, 48, 3);
  ctx.fillRect(x, y + 41, 48, 3);
  ctx.fillRect(x, y + 14, 3, 30);
  ctx.fillRect(x + 45, y + 14, 3, 30);
  ctx.font = 'bold 16px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Ζ', x + 24, y + 30);
  ctx.fillStyle = '#0d0b09';
  ctx.fillRect(x - 4, y + 1 - lift, 56, 14);
  ctx.fillStyle = gold;
  ctx.fillRect(x - 2, y + 3 - lift, 52, 10);
  if (ready) {
    ctx.fillStyle = `rgba(255, 224, 138, ${0.35 + 0.35 * Math.sin(performance.now() / 300)})`;
    ctx.fillRect(x + 4, y + 13 - lift, 40, Math.max(1, lift));
  }
}

function drawMenuBody(ctx: CanvasRenderingContext2D, theme: Theme, menu: Menu, note: string, ex: MenuExtras, portrait: boolean): void {
  const RR = portrait ? PORTRAIT : RECTS;
  const X0 = portrait ? PX : LX;
  const c = theme.colors;
  const m = theme.menu;

  // Logo and subtitle.
  ctx.imageSmoothingEnabled = false;
  const lg = logo(theme);
  ctx.drawImage(lg, X0 - 4, 34, lg.width * 4, lg.height * 4);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = theme.fonts.label;
  ctx.fillStyle = m.accent;
  ctx.fillRect(X0, 182, 120, 3);
  ctx.fillStyle = c.textDim;
  ctx.fillText('ZETA PSI BASEMENT RULES  ·  2V2 OR 1V1', X0 + 132, 184);

  const heading = (text: string, x: number, y: number) => {
    ctx.textAlign = 'left';
    ctx.font = theme.fonts.label;
    ctx.fillStyle = m.accent;
    ctx.fillText(text, x, y);
  };
  // Panels: the same dark, 2px-bordered boxes as the in-game HUD, fitted around each group of rows.
  for (const g of GROUPS) {
    const rs = g.ids.map((id) => RR[id]);
    const x0 = Math.min(...rs.map((r) => r.x));
    const y0 = Math.min(...rs.map((r) => r.y));
    const x1 = Math.max(...rs.map((r) => r.x + r.w));
    const y1 = Math.max(...rs.map((r) => r.y + r.h));
    panel(ctx, theme, x0 - 14, y0 - 28, x1 - x0 + 28, y1 - y0 + 42, c.uiEdge, m.panel);
    heading(g.title, x0, y0 - 14);
  }

  const rows = menu.rows();
  rows.forEach((row, i) => {
    const r = RR[row.id];
    const on = i === menu.cursor;
    const play = row.id === 'quick' || row.id === 'draft' || row.id === 'online';
    const card = row.id === 'collection';
    if (card) return drawCollectionCard(ctx, theme, r, on, ex);
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
      const cell = r.w < 300;
      ctx.textAlign = 'left';
      ctx.font = cell ? theme.fonts.label : theme.fonts.bar;
      ctx.fillStyle = on ? ink : row.dim ? 'rgba(200, 190, 170, 0.35)' : c.textDim;
      ctx.fillText(row.label, r.x + (cell ? 10 : 14), mid);
      let right = r.x + r.w - 14;
      if (row.picker && !on) {
        ctx.font = theme.fonts.label;
        ctx.fillStyle = c.textDim;
        ctx.textAlign = 'right';
        ctx.fillText('▸', right, mid);
        right -= 16;
      }
      ctx.textAlign = 'right';
      ctx.font = theme.fonts.bar;
      ctx.fillStyle = on ? ink : row.dim ? 'rgba(220, 210, 190, 0.35)' : c.text;
      const value = row.dim && !on ? (row.id === 'cpu' ? 'vs CPU only' : 'head-to-head only') : row.value;
      const text = on ? (row.picker ? `${value}  ▸` : row.id === 'table' ? `◀ ${value} ▶` : `◀  ${value}  ▶`) : value;
      ctx.fillText(text, right, mid);
      const tw = ctx.measureText(text).width;
      // Portraits of the picked characters, and a preview of the picked table.
      if (row.id === 'playingAs') {
        let px = r.x + 132;
        for (const sp of ex.team) {
          if (sp) ctx.drawImage(spriteCanvas(sp), 0, 0, sp.w, 18, px, r.y + 5, sp.w * 2, 36);
          else {
            ctx.strokeStyle = on ? ink : c.uiEdge;
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(px + 4, r.y + 6, 24, 34);
            ctx.setLineDash([]);
            ctx.font = theme.fonts.bar;
            ctx.textAlign = 'center';
            ctx.fillStyle = on ? ink : m.accent;
            ctx.fillText('?', px + 16, mid);
          }
          px += 38;
        }
      } else if (row.id === 'table' && ex.tableArt) {
        const ax = r.x + 80;
        const aw = Math.min(76, r.w - tw - 110);
        if (aw > 30) {
          ctx.fillStyle = '#0d0b09';
          ctx.fillRect(ax - 2, r.y + 5, aw + 4, aw / 2 + 4);
          ctx.drawImage(ex.tableArt, ax, r.y + 7, aw, aw / 2);
        }
      }
    } else {
      ctx.textAlign = 'left';
      ctx.font = play ? theme.fonts.title : theme.fonts.bar;
      ctx.fillStyle = on ? ink : play ? m.accentWarm : c.text;
      ctx.fillText(`${on ? '▶ ' : ''}${row.label}`, r.x + 16, mid);
      ctx.font = theme.fonts.label;
      ctx.fillStyle = on ? ink : c.textDim;
      ctx.textAlign = 'right';
      if (play) ctx.fillText(row.id === 'draft' ? 'take turns drafting characters' : row.id === 'online' ? '1v1 against a player on another device' : 'your picks, straight in', r.x + r.w - 14, mid);
      if (row.id === 'leaderboard') ctx.fillText(menu.leaderboardHint(), r.x + r.w - 14, mid);
      if (row.id === 'characters') {
        if (ex.newRewards) badge(ctx, theme, r.x + r.w - 70, mid + 1, `${ex.newRewards} NEW REWARD${ex.newRewards === 1 ? '' : 'S'}`);
        else ctx.fillText('make and edit, levels, cosmetics', r.x + r.w - 14, mid);
      }
      if (row.id === 'account') {
        const info = menu.accountInfo();
        if (info.alert) badge(ctx, theme, r.x + r.w - 60, mid + 1, `${info.alert} TO REVIEW`);
        else ctx.fillText(info.hint, r.x + r.w - 14, mid);
      }
    }
  });

  if (portrait) {
    ctx.textAlign = 'left';
    ctx.font = theme.fonts.label;
    ctx.fillStyle = c.textDim;
    ctx.fillText(note || 'Tap a row to choose. Playing needs a keyboard: WASD + Space, arrows + Enter.', PX, 1170);
    return;
  }
  // Controls legend.
  let x = LX;
  const y = 628;
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
  ctx.fillText('arrows move · ←→ change · hit key selects · mouse too', x, y + 11);
  if (note) {
    ctx.font = theme.fonts.hud;
    ctx.fillStyle = m.accent;
    ctx.textAlign = 'left';
    ctx.fillText(note, LX, 604);
  }
}

/** The Collection card: player level, XP bar, loot boxes waiting, and the owner's review queue. */
function drawCollectionCard(ctx: CanvasRenderingContext2D, theme: Theme, r: { x: number; y: number; w: number; h: number }, on: boolean, ex: MenuExtras): void {
  const c = theme.colors;
  const m = theme.menu;
  const alert = ex.boxes > 0 && !ex.nothingLeft;
  panel(ctx, theme, r.x - 14, r.y - 8, r.w + 28, r.h + 16, on ? c.activeRing : alert ? m.accent : c.uiEdge, on ? m.rowActive : m.panel);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = theme.fonts.label;
  ctx.fillStyle = m.accent;
  ctx.fillText(on ? '▶ COLLECTION' : 'COLLECTION', r.x, r.y + 10);
  ctx.font = theme.fonts.label;
  ctx.fillStyle = c.textDim;
  ctx.textAlign = 'right';
  ctx.fillText(ex.offline ? 'saved in this browser' : 'tables · characters · loot boxes', r.x + r.w, r.y + 10);
  // Level and XP bar.
  ctx.textAlign = 'left';
  ctx.font = theme.fonts.title;
  ctx.fillStyle = c.text;
  if (ex.me) {
    // The player's styled name, then their level.
    const w = drawStyledName(ctx, ex.me.name, ex.me.style, r.x, r.y + 40, theme.fonts.title, r.w - 200, performance.now());
    ctx.font = theme.fonts.label;
    ctx.fillStyle = c.textDim;
    ctx.textAlign = 'left';
    ctx.fillText(`LV ${ex.level}`, r.x + w + 10, r.y + 41);
  } else ctx.fillText(`Level ${ex.level}`, r.x, r.y + 40);
  const bx = r.x;
  const by = r.y + 58;
  const bw = r.w - 92;
  ctx.fillStyle = '#0d0b09';
  ctx.fillRect(bx, by, bw, 10);
  ctx.fillStyle = '#2e2820';
  ctx.fillRect(bx + 1, by + 1, bw - 2, 8);
  ctx.fillStyle = m.accent;
  ctx.fillRect(bx + 1, by + 1, Math.round((bw - 2) * Math.min(1, ex.xpInto / Math.max(1, ex.xpSpan))), 8);
  ctx.font = theme.fonts.label;
  ctx.fillStyle = c.textDim;
  ctx.textAlign = 'right';
  ctx.fillText(`${ex.xpInto} / ${ex.xpSpan} XP`, bx + bw, r.y + 40);
  // What's waiting.
  ctx.textAlign = 'left';
  ctx.font = theme.fonts.bar;
  let msg = ex.progressNote ? ex.progressNote : ex.allAccess ? 'Moderator: every table and character unlocked' : ex.boxes && !ex.nothingLeft ? `LEVEL UP!  ${ex.boxes} loot box${ex.boxes === 1 ? '' : 'es'} to open` : ex.boxes ? `${ex.boxes} box${ex.boxes === 1 ? '' : 'es'} saved for new unlocks` : `Next loot box at level ${ex.level + 1}`;
  if (ex.pending) msg += `  ·  ${ex.pending} to review`;
  ctx.fillStyle = alert || ex.pending || ex.progressNote ? m.accentWarm : c.textDim;
  ctx.fillText(msg, r.x, r.y + 92);
  ctx.font = theme.fonts.label;
  ctx.fillStyle = c.textDim;
  ctx.fillText(ex.progressNote ? 'Everything is playable now; approved profiles level up and unlock more.' : ex.allAccess ? 'Players start with 4 characters and the plain table, and unlock the rest.' : alert ? 'Open them in the Collection: new tables and characters.' : 'Every player level gives a loot box: a table or a character.', r.x, r.y + 116);
  crate(ctx, theme, r.x + r.w - 54, r.y + 22, alert);
  if (alert) badge(ctx, theme, r.x + r.w - 6, r.y + 26, String(ex.boxes));
  else if (ex.pending) badge(ctx, theme, r.x + r.w - 6, r.y + 26, String(ex.pending));
}

/** Game / match over: a centered panel in the menu style, scaled like the menu. */
export function drawEndScreen(ctx: CanvasRenderingContext2D, theme: Theme, screen: View, title: string, lines: string[], prompt: string): void {
  const c = theme.colors;
  const m = theme.menu;
  ctx.fillStyle = c.overlay;
  ctx.fillRect(0, 0, screen.width, screen.height);
  const L = endLayout(screen);
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

export const HELP: [string, string][] = [
  ['Keys', 'Team A: WASD to aim, Space to hit.  Team B: arrow keys to aim, Enter to hit.  Hold Q / E (Team A) or . / / (Team B) for a character\u2019s other hit styles.'],
  ['Aim', 'The marker on the table is where your shot will land, and it stays where you leave it. Up/down is deeper/shorter, left/right is across. It turns red with an X when you are aiming off the table. To sink a cup, put the marker right over it.'],
  ['Hit', 'After the ball bounces on your side, a colored ring closes in on a white ring around the ball. Hit as they meet: yellow is early, green is right, red is late. Early hits land short, late ones long. Fast balls, long rallies and balls far from you leave less time.'],
  ['Spin', 'Once the rings appear, your marker flashes: your aim is locked. The direction you hold as you hit adds spin: forward = topspin, back = backspin, sideways = sidespin. Works on serves too.'],
  ['Serve', 'Hit to toss, then hit again as the rings meet. The ball must bounce once on your side, then land in the diagonal quarter. Two serves off the table cost half a cup. A serve that hits the other team\u2019s cups also costs half a cup, and they pick which one.'],
  ['Saves', 'When a ball hits your cup, either teammate can return it before it bounces twice. The window is shorter, so react quickly.'],
  ['Cups', 'Hit a full cup: half. Hit a half cup: gone. Sink: gone, and the sinker gets served to again. Penalties never take your last half cup: the other team has to hit it off.'],
  ['Turns', 'Teammates alternate hits. The yellow tag and floor ring show who is up.'],
  ['Modes', '2v2 head-to-head (split screen gives each team its own camera), or 2v2 same team vs the CPU (WASD = left teammate, arrows = right). 1v1: one player a side makes every hit and serves from alternating halves.'],
  ['Unlocks', 'Character XP adds up to your player level. Each level gives a loot box (Collection) with a new table or character. On a shared keyboard, Playing as sets your team, which earns the XP.'],
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
  const L = endLayout(screen);
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
