// Pre-game menu model (pure) and its canvas drawing.

import { makeConfig, type GameConfig } from '../config';
import type { Theme } from '../theme';
import type { View } from '../render/renderer';
import type { Sprite } from '../core/character';
import type { NameStyle } from '../progress/nameStyles';
import { drawStyledName } from './nameStyle';
import { updateLabel } from '../version';
import { panel } from '../render/hud';
import { VENUE_ORDER, VENUES } from '../render/basement';
import { DESIGN_ORDER, DESIGNS } from '../render/designs';

interface Choice {
  label: string;
  values: { label: string; apply: (cfg: GameConfig) => void }[];
  /** The value picked at first (default 0). */
  start?: number;
}

const set =
  <K extends keyof GameConfig>(key: K, value: GameConfig[K]) =>
  (cfg: GameConfig) => {
    cfg[key] = value;
  };
/** Speed / difficulty levels: faster play and smaller timing windows (saves included). */
// Slowest to fastest. Normal is the game's realistic pace (the base physics) and the default;
// the others spread a wide range around it, each a step faster with a smaller timing window.
export const LEVELS = [
  { label: 'Relaxed', timeScale: 0.44, window: 1.15 },
  { label: 'Slow', timeScale: 0.53, window: 1.07 },
  { label: 'Normal', timeScale: 0.62, window: 1 },
  { label: 'Fast', timeScale: 0.72, window: 0.92 },
  { label: 'Extreme', timeScale: 0.84, window: 0.8 },
  { label: 'Masters', timeScale: 0.96, window: 0.68 },
] as const;
export const DEFAULT_LEVEL = 'Normal';

/**
 * The Speed spectrum: 13 notches from Relaxed (far left) to Masters (far right),
 * with Normal in the middle. The named levels sit on notches (Relaxed 0, Slow 3,
 * Normal 6, Fast 8, Extreme 10, Masters 12); the notches between them blend
 * their neighbours' speed and timing window evenly. In-between notches are
 * named after the closest level: "Slow +" is a touch faster than Slow, "Normal −"
 * a touch slower than Normal.
 */
const ANCHOR_AT: Record<(typeof LEVELS)[number]['label'], number> = { Relaxed: 0, Slow: 3, Normal: 6, Fast: 8, Extreme: 10, Masters: 12 };
export interface SpeedStep {
  label: string;
  timeScale: number;
  window: number;
}
export const SPEED_STEPS: SpeedStep[] = (() => {
  const out: SpeedStep[] = [];
  const at = LEVELS.map((l) => ({ ...l, pos: ANCHOR_AT[l.label] }));
  for (let k = 0; k <= 12; k++) {
    const hi = at.findIndex((a) => a.pos >= k);
    const b = at[hi];
    if (b.pos === k) {
      out.push({ label: b.label, timeScale: b.timeScale, window: b.window });
      continue;
    }
    const a = at[hi - 1];
    const t = (k - a.pos) / (b.pos - a.pos);
    const r3 = (x: number) => Math.round(x * 1000) / 1000;
    // Name it after the nearer level (ties go to the slower one, with a +).
    const label = t <= 0.5 ? `${a.label} +` : `${b.label} −`;
    out.push({ label, timeScale: r3(a.timeScale + (b.timeScale - a.timeScale) * t), window: r3(a.window + (b.window - a.window) * t) });
  }
  return out;
})();
export const SPEED_MID = SPEED_STEPS.findIndex((st) => st.label === DEFAULT_LEVEL);
/** The spectrum notch closest to a speed (time scale). */
export function speedStepOf(timeScale: number): SpeedStep {
  let best = SPEED_STEPS[0];
  for (const st of SPEED_STEPS) if (Math.abs(st.timeScale - timeScale) < Math.abs(best.timeScale - timeScale)) best = st;
  return best;
}
const speed = (timeScale: number, window: number) => (cfg: GameConfig) => {
  cfg.physics.timeScale = timeScale;
  cfg.hitting.windowScale = window;
};
/** The level (spectrum notch) a config was set to, by its speed, for display. */
export function levelOf(timeScale: number): string {
  return speedStepOf(timeScale).label;
}

/** Where the Speed bar's track runs inside its row (menu coordinates). */
export function speedTrack(r: { x: number; y: number; w: number; h: number }): { x0: number; x1: number; y: number } {
  return { x0: r.x + 14, x1: r.x + r.w - 14, y: r.y + r.h - 13 };
}

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
  { id: 'speed', label: 'Speed', values: SPEED_STEPS.map((l) => ({ label: l.label, apply: speed(l.timeScale, l.window) })), start: SPEED_MID },
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
  view: { x: LX, y: RULES_Y + 34, w: CELL, h: 29 },
  ski: { x: LX + CELL + 8, y: RULES_Y + 34, w: CELL, h: 29 },
  speed: { x: LX, y: RULES_Y + 68, w: LW, h: 46 },
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
  view: { x: PX, y: 838, w: PCELL, h: 29 },
  ski: { x: PX + PCELL + 8, y: 838, w: PCELL, h: 29 },
  speed: { x: PX, y: 872, w: PW, h: 46 },
  characters: { x: PX, y: 960, w: PW, h: 33 },
  account: { x: PX, y: 1000, w: PW, h: 33 },
  leaderboard: { x: PX, y: 1040, w: PW, h: 33 },
  help: { x: PX, y: 1080, w: PW, h: 33 },
  backup: { x: PX, y: 1120, w: PW, h: 33 },
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
/** Which home-screen group a row is in (its index in GROUPS), or -1 (the Collection card). */
function groupOf(id: RowId): number {
  return GROUPS.findIndex((g) => g.ids.includes(id));
}

const GROUPS: { title: string; ids: RowId[] }[] = [
  { title: 'MATCH', ids: ['players', 'cpu', 'playingAs', 'table', 'spot'] },
  { title: 'HOUSE RULES', ids: ['formation', 'match', 'view', 'ski', 'speed'] },
  { title: 'PLAY', ids: ['quick', 'draft', 'online'] },
  { title: 'MORE', ids: ['characters', 'account', 'leaderboard', 'help', 'backup'] },
];

export class Menu {
  private picks: number[] = CHOICES.map((c) => c.start ?? 0);
  /** Called after any setting changes (the home screen saves them). */
  onChange: () => void = () => {};

  /** The settings, by row and value label (the table is saved with the player's picks instead). */
  snapshot(): Record<string, string> {
    const out: Record<string, string> = {};
    CHOICES.forEach((c, i) => {
      if (i !== TABLE_ROW) out[c.id] = c.values[this.picks[i]].label;
    });
    return out;
  }

  /** Put back saved settings; unknown rows or values are skipped. */
  restore(saved: unknown): void {
    if (!saved || typeof saved !== 'object') return;
    CHOICES.forEach((c, i) => {
      if (i === TABLE_ROW) return;
      const label = (saved as Record<string, unknown>)[c.id];
      const k = c.values.findIndex((v) => v.label === label);
      if (k >= 0) this.picks[i] = k;
    });
  }
  /** Tables this player hasn't unlocked can't be picked. */
  tableLocked: (venue: string) => boolean = () => false;
  /** Which team the signed-in player is on in head-to-head (set in the character picker). */
  mySide: 'A' | 'B' = 'A';
  /** The "Players" row's value: the characters picked for the player's side. */
  playingAs: () => string = () => 'Random';
  /** The profile row: its label, a hint, and how many things wait there (moderator reviews). */
  accountInfo: () => { label: string; hint: string; alert: number } = () => ({ label: 'Your profile', hint: 'not signed in · this browser only', alert: 0 });
  /** The leaderboard row's hint (e.g. your rank). */
  leaderboardHint: () => string = () => 'XP of every approved player';
  /** The Online match row: who's in the lobby, and challenges waiting. */
  onlineInfo: () => { hint: string; challenges: number } = () => ({ hint: '1v1 against a player on another device', challenges: 0 });
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
      { id: 'playingAs', label: 'Players', value: this.playingAs(), action: 'pickCharacters', picker: true },
      opt('table'),
      opt('spot'),
      opt('formation'),
      opt('match'),
      { ...opt('view'), dim: mode === 'coop' },
      opt('ski'),
      opt('speed'),
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
      if (CHOICES[ci].id === 'speed') {
        // The spectrum stops at its ends instead of wrapping around.
        const n = Math.max(0, Math.min(k - 1, this.picks[ci] + Math.sign(dx)));
        if (n === this.picks[ci]) return;
        this.setSpeedStep(n);
        return;
      }
      if (ci === TABLE_ROW) this.picks[TABLE_ROW] = this.tablePick();
      // Locked tables are skipped.
      for (let n = 0; n < k; n++) {
        this.picks[ci] = (this.picks[ci] + dx + k) % k;
        if (ci !== TABLE_ROW || !this.tableLocked(DESIGN_ORDER[this.picks[TABLE_ROW]])) break;
      }
      this.changeAt = { id: rows[this.cursor].id, dir: Math.sign(dx), at: typeof performance !== 'undefined' ? performance.now() : 0 };
      this.onChange();
      return;
    }
    // Hop columns, to the row nearest in height.
    const left = here.x < RX;
    const other = rows.map((r, i) => ({ i, r: RECTS[r.id] })).filter(({ r }) => (r.x < RX) !== left);
    other.sort((a, b) => Math.abs(cy(a.r) - cy(here)) - Math.abs(cy(b.r) - cy(here)) || Math.abs(cx(a.r) - cx(here)) - Math.abs(cx(b.r) - cx(here)));
    if (other.length) this.cursor = other[0].i;
  }

  // ------------------------------------------------------------ animation and pointer

  /** The row under the pointer (hover effect), or null. */
  hover: RowId | null = null;
  private pressAt: { id: RowId; at: number } | null = null;
  private changeAt: { id: RowId; dir: number; at: number } | null = null;
  private hoverT = new Map<RowId, number>();
  private slider: { x: number; y: number; w: number; h: number } | null = null;
  private lastFrame = 0;
  /** Where each row's value text sits (menu coordinates), from the last draw: for clicks on ◀ / ▶. */
  valueZones = new Map<RowId, { cx: number; l: number; r: number }>();

  /** Show a press on a row (pointer down, or Enter). */
  pressed(id: RowId): void {
    this.pressAt = { id, at: performance.now() };
  }

  private enterAt = 0;
  /** The home screen just came up: its panels and rows slide in again. */
  entered(): void {
    this.enterAt = typeof performance !== 'undefined' ? performance.now() : 0;
  }

  /** 0..1: how far a panel (or row) with this delay (ms) has slid in. */
  enterAmount(now: number, delay: number): number {
    if (!this.enterAt) return 1;
    const e = (now - this.enterAt - delay) / 320;
    if (e <= 0) return 0;
    if (e >= 1) return 1;
    return 1 - Math.pow(1 - e, 3);
  }

  /** 0..1 for about 380 ms after a press: a ripple spreading out from the row. */
  rippleAmount(id: RowId, now: number): number {
    if (!this.pressAt || this.pressAt.id !== id) return 0;
    const e = (now - this.pressAt.at) / 380;
    return e > 0 && e < 1 ? e : 0;
  }

  /** Seconds since the last drawn frame (capped), for easing. */
  frameDt(now: number): number {
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    return dt;
  }

  /** 0..1: how hovered a row is, easing in and out. */
  hoverAmount(id: RowId, dt: number): number {
    const want = this.hover === id ? 1 : 0;
    const cur = this.hoverT.get(id) ?? 0;
    const next = cur + (want - cur) * (1 - Math.exp(-dt * 18));
    const v = Math.abs(next - want) < 0.01 ? want : next;
    this.hoverT.set(id, v);
    return v;
  }

  /** 0..1: a quick dip that springs back over about 160 ms after a press. */
  pressAmount(id: RowId, now: number): number {
    if (!this.pressAt || this.pressAt.id !== id) return 0;
    const e = (now - this.pressAt.at) / 160;
    if (e >= 1) return 0;
    return e < 0.3 ? e / 0.3 : 1 - (e - 0.3) / 0.7;
  }

  /** For a value that just changed: its direction, and 1..0 as the slide-in finishes (about 180 ms). */
  changeAmount(id: RowId, now: number): { dir: number; e: number } | null {
    if (!this.changeAt || this.changeAt.id !== id) return null;
    const e = 1 - (now - this.changeAt.at) / 180;
    return e > 0 ? { dir: this.changeAt.dir, e: e * e } : null;
  }

  /** The selection highlight, gliding toward the selected row. */
  slide(target: { x: number; y: number; w: number; h: number }, dt: number, snap: boolean): { x: number; y: number; w: number; h: number } {
    const s = this.slider;
    if (!s || snap || dt === 0) return (this.slider = { ...target });
    const k = 1 - Math.exp(-dt * 20);
    const n = { x: s.x + (target.x - s.x) * k, y: s.y + (target.y - s.y) * k, w: s.w + (target.w - s.w) * k, h: s.h + (target.h - s.h) * k };
    const close = Math.abs(n.x - target.x) + Math.abs(n.y - target.y) + Math.abs(n.w - target.w) + Math.abs(n.h - target.h) < 1;
    return (this.slider = close ? { ...target } : n);
  }

  /**
   * A click (or tap) on row `i` at menu x `mx`. On a setting, the left side of
   * the value (with ◀) steps back and the right side (with ▶) steps forward. On
   * the Table row the arrows flip tables and the rest opens the picker. Other
   * rows run their action.
   */
  /** The Speed spectrum's notch (0 = Relaxed … 12 = Masters). */
  speedStep(): number {
    return this.picks[choiceIndex('speed')];
  }

  /** Move the Speed spectrum to a notch (clamped). */
  setSpeedStep(n: number): void {
    const ci = choiceIndex('speed');
    const k = Math.max(0, Math.min(SPEED_STEPS.length - 1, Math.round(n)));
    if (k === this.picks[ci]) return;
    const dir = Math.sign(k - this.picks[ci]);
    this.picks[ci] = k;
    this.changeAt = { id: 'speed', dir, at: typeof performance !== 'undefined' ? performance.now() : 0 };
    this.onChange();
  }

  /** The Speed notch under menu x `mx` on the bar (for clicks and drags). */
  speedStepAt(mx: number, portrait = false): number {
    const t = speedTrack(rowRect('speed', portrait));
    const f = (mx - t.x0) / (t.x1 - t.x0);
    return Math.max(0, Math.min(SPEED_STEPS.length - 1, Math.round(f * (SPEED_STEPS.length - 1))));
  }

  click(i: number, mx: number, portrait = false): MenuAction {
    const rows = this.rows();
    const row = rows[i];
    if (!row) return null;
    this.cursor = i;
    this.pressed(row.id);
    if (row.action) return row.action;
    const z = this.valueZones.get(row.id);
    if (row.id === 'table') {
      if (z && mx <= z.l + 22) return this.move(0, -1), null;
      if (z && mx >= z.r - 22) return this.move(0, 1), null;
      return 'pickTable';
    }
    if (row.id === 'speed') {
      // The bar: a click picks the notch under the pointer.
      this.setSpeedStep(this.speedStepAt(mx, portrait));
      return null;
    }
    this.move(0, z && mx < z.cx ? -1 : 1);
    return null;
  }

  /** Activate the current row. Option rows cycle forward; action rows return their action. */
  activate(): MenuAction {
    const row = this.rows()[this.cursor];
    this.pressed(row.id);
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

/** The Speed bar's thumb position (it glides between notches). */
const speedThumb = new WeakMap<Menu, number>();

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
  /** Everything is unlocked for every player for now (not just the moderator). */
  openToAll?: boolean;
  /** The picked characters' sprites (null = random). */
  team: (Sprite | null)[];
  /** The picked table's painted top. */
  tableArt: HTMLCanvasElement | null;
  /** Against the CPU: the CPU team's picked sprites (null = random). */
  otherTeam?: (Sprite | null)[];
  /** Which team the player is on (the Players row shows Team A, then Team B). */
  myTeamId?: 'A' | 'B';
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
  // The update number, small and dim in the bottom-left corner.
  ctx.save();
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(220, 205, 180, 0.38)';
  ctx.fillText(updateLabel(), 8, screen.height - 6);
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
  const nowT = performance.now();
  const le = menu.enterAmount(nowT, 0);
  ctx.save();
  ctx.globalAlpha = le;
  ctx.drawImage(lg, X0 - 4, 34 - (1 - le) * 20, lg.width * 4, lg.height * 4);
  ctx.restore();
  // Every few seconds a band of light sweeps across the logo.
  const sweep = (nowT % 5200) / 900;
  if (sweep < 1 && le >= 1) {
    const sc = logoShine(lg, sweep);
    ctx.drawImage(sc, X0 - 4, 34, lg.width * 4, lg.height * 4);
  }
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
  GROUPS.forEach((g, gi) => {
    const rs = g.ids.map((id) => RR[id]);
    const x0 = Math.min(...rs.map((r) => r.x));
    const y0 = Math.min(...rs.map((r) => r.y));
    const x1 = Math.max(...rs.map((r) => r.x + r.w));
    const y1 = Math.max(...rs.map((r) => r.y + r.h));
    const e = menu.enterAmount(nowT, 60 + gi * 70);
    if (e <= 0) return;
    ctx.save();
    ctx.globalAlpha = e;
    ctx.translate(0, (1 - e) * 18);
    panel(ctx, theme, x0 - 14, y0 - 28, x1 - x0 + 28, y1 - y0 + 42, c.uiEdge, m.panel);
    // A thin accent line across the top of each panel, drawn in as it arrives.
    ctx.fillStyle = m.accent;
    ctx.fillRect(x0 - 12, y0 - 26, (x1 - x0 + 24) * e, 2);
    heading(g.title, x0, y0 - 14);
    ctx.restore();
  });
  /** A row's entrance (after its panel), as alpha and a slide. */
  const rowIn = (id: RowId) => {
    const gi = groupOf(id);
    const k = gi < 0 ? 0 : GROUPS[gi].ids.indexOf(id);
    return menu.enterAmount(nowT, gi < 0 ? 40 : 110 + gi * 70 + k * 28);
  };
  const enterRow = (id: RowId): boolean => {
    const e = rowIn(id);
    if (e <= 0) return false;
    ctx.globalAlpha = e;
    ctx.translate((1 - e) * -14, 0);
    return true;
  };

  const rows = menu.rows();
  const now = performance.now();
  const dt = menu.frameDt(now);
  const curRow = rows[menu.cursor];
  // Rows: a flat fill with a hairline edge and a faint top highlight.
  const rowBox = (r: { x: number; y: number; w: number; h: number }, edge: string, fill: string) => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(r.x, r.y + r.h, r.w, 2);
    ctx.fillStyle = fill;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.fillStyle = 'rgba(255, 240, 210, 0.05)';
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, 1);
  };
  // Every row's own box first; then the gold highlight glides over to the selected row.
  for (const row of rows) {
    if (row.id === 'collection' || row === curRow) continue;
    const play = row.id === 'quick' || row.id === 'draft' || row.id === 'online';
    ctx.save();
    if (enterRow(row.id)) rowBox(RR[row.id], play ? m.accent : c.uiEdge, play ? m.rowPlay : m.row);
    ctx.restore();
  }
  const slid = menu.slide(RR[curRow.id], dt, curRow.id === 'collection');
  if (curRow.id !== 'collection' && rowIn(curRow.id) > 0) {
    const pk = menu.pressAmount(curRow.id, now);
    const sh = pk * 1.5;
    ctx.save();
    enterRow(curRow.id);
    ctx.save();
    // The highlight breathes gently.
    ctx.shadowColor = 'rgba(255, 214, 110, 0.5)';
    ctx.shadowBlur = 12 + 6 * Math.sin(now / 380) - pk * 8;
    ctx.fillStyle = c.activeRing;
    ctx.fillRect(slid.x + sh, slid.y + sh, slid.w - sh * 2, slid.h - sh * 2);
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(slid.x + sh, slid.y + slid.h - 3 - sh, slid.w - sh * 2, 3);
    // A soft shine across the highlight.
    const shine = ctx.createLinearGradient(0, slid.y, 0, slid.y + slid.h);
    shine.addColorStop(0, 'rgba(255,255,255,0.22)');
    shine.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.fillRect(slid.x + sh, slid.y + sh, slid.w - sh * 2, slid.h / 2);
    ctx.restore();
  }

  rows.forEach((row, i) => {
    const r = RR[row.id];
    const on = i === menu.cursor;
    const play = row.id === 'quick' || row.id === 'draft' || row.id === 'online';
    const card = row.id === 'collection';
    const ht = menu.hoverAmount(row.id, dt);
    const pk = menu.pressAmount(row.id, now);
    ctx.save();
    if (!enterRow(row.id)) {
      ctx.restore();
      return;
    }
    // A press sends a ripple out from the row.
    const rp = menu.rippleAmount(row.id, now);
    if (rp) {
      const g = 2 + rp * 12;
      ctx.save();
      ctx.globalAlpha *= (1 - rp) * 0.9;
      ctx.strokeStyle = m.accentWarm;
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x - g, r.y - g, r.w + g * 2, r.h + g * 2);
      ctx.restore();
    }
    // A press dips the row slightly toward its center.
    if (pk) {
      const s = 1 - 0.03 * pk;
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      ctx.scale(s, s);
      ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
    }
    if (card) {
      drawCollectionCard(ctx, theme, r, on || ht > 0.5, ex);
      ctx.restore();
      return;
    }
    if (ht && !on) {
      // Hover: the row warms up, with an accent bar sliding in on its left edge.
      ctx.fillStyle = `rgba(255, 228, 160, ${0.08 * ht})`;
      ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      ctx.fillStyle = m.accent;
      ctx.fillRect(r.x + 1, r.y + 1, Math.round(3 * ht), r.h - 2);
    }
    ctx.translate(on ? 0 : Math.round(ht * 3), 0);
    drawRowText(row, r, on, play);
    ctx.restore();
  });
  return drawNotes();

  /** The Speed row: a spectrum from Relaxed (left) to Masters (right), with a thumb on the picked notch. */
  function drawSpeedBar(r: { x: number; y: number; w: number; h: number }, on: boolean, ink: string): void {
    const n = SPEED_STEPS.length;
    const k = menu.speedStep();
    const t = speedTrack(r);
    const xAt = (i: number) => t.x0 + ((t.x1 - t.x0) * i) / (n - 1);
    const top = r.y + 14;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = theme.fonts.label;
    ctx.fillStyle = on ? ink : c.textDim;
    ctx.fillText('Speed', r.x + 14, top);
    // The value, and how its pace compares with Normal.
    const st = SPEED_STEPS[k];
    const pace = Math.round((st.timeScale / SPEED_STEPS[SPEED_MID].timeScale) * 100);
    ctx.textAlign = 'right';
    ctx.font = theme.fonts.bar;
    ctx.fillStyle = on ? ink : c.text;
    const ch = menu.changeAmount('speed', now);
    ctx.fillText(st.label, r.x + r.w - 14, top);
    const vw = ctx.measureText(st.label).width;
    ctx.font = theme.fonts.label;
    ctx.fillStyle = on ? ink : c.textDim;
    ctx.save();
    ctx.globalAlpha *= 0.75;
    ctx.fillText(k === SPEED_MID ? 'realistic pace  ·' : `${pace}% pace  ·`, r.x + r.w - 22 - vw, top);
    ctx.restore();
    // The track: cool on the slow end, warm toward Masters.
    const grad = ctx.createLinearGradient(t.x0, 0, t.x1, 0);
    grad.addColorStop(0, '#4fb3c9');
    grad.addColorStop(0.5, '#e8d27a');
    grad.addColorStop(0.75, '#f08a3c');
    grad.addColorStop(1, '#e0413a');
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(t.x0 - 1, t.y - 3, t.x1 - t.x0 + 2, 6);
    ctx.save();
    ctx.globalAlpha *= on ? 0.55 : 0.4;
    ctx.fillStyle = grad;
    ctx.fillRect(t.x0, t.y - 2, t.x1 - t.x0, 4);
    ctx.restore();
    // The filled part, up to the thumb.
    const tx = xAt(k);
    ctx.fillStyle = grad;
    ctx.fillRect(t.x0, t.y - 2, tx - t.x0, 4);
    // Notches: taller for the named levels, tallest for Normal.
    for (let i = 0; i < n; i++) {
      const named = !/[+−]$/.test(SPEED_STEPS[i].label);
      const hgt = i === SPEED_MID ? 7 : named ? 5 : 3;
      ctx.fillStyle = i <= k ? (on ? ink : 'rgba(255, 244, 220, 0.85)') : 'rgba(255, 244, 220, 0.35)';
      ctx.fillRect(Math.round(xAt(i)) - 1, t.y - hgt, 2, hgt * 2);
    }
    // The thumb glides to its notch, and gives a little pop when it lands.
    const prev = speedThumb.get(menu) ?? tx;
    const gx = dt ? prev + (tx - prev) * (1 - Math.exp(-dt * 22)) : tx;
    speedThumb.set(menu, Math.abs(gx - tx) < 0.3 ? tx : gx);
    const pop = ch ? ch.e : 0;
    const R = 6 + pop * 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = on ? ink : '#fff4dc';
    ctx.fillRect(Math.round(gx - R), Math.round(t.y - R), R * 2, R * 2);
    ctx.restore();
    ctx.fillStyle = grad;
    ctx.fillRect(Math.round(gx - R + 2), Math.round(t.y - R + 2), R * 2 - 4, R * 2 - 4);
    if (on) {
      // Arrow hints at the ends while the row is selected.
      ctx.font = theme.fonts.label;
      ctx.fillStyle = ink;
      ctx.textAlign = 'center';
      if (k > 0) ctx.fillText('◀', r.x + 6, t.y);
      if (k < n - 1) ctx.fillText('▶', r.x + r.w - 6, t.y);
    }
  }

  function drawRowText(row: MenuRow, r: { x: number; y: number; w: number; h: number }, on: boolean, play: boolean): void {
    const ink = on ? c.activeText : c.text;
    const mid = r.y + r.h / 2 - 1;
    ctx.textBaseline = 'middle';
    if (row.id === 'speed') return drawSpeedBar(r, on, ink);
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
      const arrows = on && !row.picker;
      const text = on ? (row.picker ? `${value}  ▸` : row.id === 'table' ? `◀ ${value} ▶` : `◀  ${value}  ▶`) : value;
      const tw = ctx.measureText(text).width;
      menu.valueZones.set(row.id, { cx: right - tw / 2, l: right - tw, r: right });
      const ch = menu.changeAmount(row.id, now);
      if (ch && arrows) {
        // A changed value slides in from the side it came from; the arrow that was pressed nudges outward.
        const aw = ctx.measureText(row.id === 'table' ? '◀ ' : '◀  ').width;
        const vw = ctx.measureText(String(value)).width;
        ctx.fillText(ch.dir > 0 ? '▶' : '◀', ch.dir > 0 ? right + ch.e * 3 : right - tw + ctx.measureText('◀').width - ch.e * 3, mid);
        ctx.fillText(ch.dir > 0 ? '◀' : '▶', ch.dir > 0 ? right - tw + ctx.measureText('◀').width : right, mid);
        ctx.save();
        ctx.globalAlpha = 1 - 0.7 * ch.e;
        ctx.fillText(String(value), right - tw + aw + vw + ch.dir * ch.e * 14, mid);
        ctx.restore();
      } else ctx.fillText(text, right, mid);
      // Portraits of the picked characters, and a preview of the picked table.
      if (row.id === 'playingAs') {
        // The whole lineup as heads: Team A, "vs", Team B (yours outlined in gold). Dashed boxes are random.
        const mineFirst = (ex.myTeamId ?? 'A') === 'A';
        const teams = mineFirst ? [ex.team, ex.otherTeam ?? []] : [ex.otherTeam ?? [], ex.team];
        let px = r.x + 100;
        teams.forEach((sprites, ti) => {
          const isMine = (ti === 0) === mineFirst;
          const x0 = px;
          for (const sp of sprites) {
            if (sp) ctx.drawImage(spriteCanvas(sp), 0, 0, sp.w, Math.round(sp.h * 0.75), px, r.y + 5, 28, 36);
            else {
              ctx.strokeStyle = on ? ink : c.uiEdge;
              ctx.setLineDash([3, 3]);
              ctx.strokeRect(px + 3, r.y + 7, 22, 32);
              ctx.setLineDash([]);
              ctx.font = theme.fonts.label;
              ctx.textAlign = 'center';
              ctx.fillStyle = on ? ink : m.accent;
              ctx.fillText('?', px + 14, mid);
            }
            px += 31;
          }
          if (isMine && sprites.length) {
            ctx.fillStyle = on ? ink : m.accent;
            ctx.fillRect(x0, r.y + r.h - 5, px - x0 - 3, 2);
          }
          if (ti === 0) {
            ctx.font = theme.fonts.label;
            ctx.textAlign = 'center';
            ctx.fillStyle = on ? ink : c.textDim;
            ctx.fillText('vs', px + 9, mid);
            px += 20;
          }
        });
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
      const oi = row.id === 'online' ? menu.onlineInfo() : null;
      if (oi?.challenges) badge(ctx, theme, r.x + r.w - 80, mid + 1, oi.challenges === 1 ? 'CHALLENGE!' : `${oi.challenges} CHALLENGES`);
      else if (play) ctx.fillText(row.id === 'draft' ? 'take turns drafting characters' : oi ? oi.hint : 'your picks, straight in', r.x + r.w - 14, mid);
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
  }

  function drawNotes(): void {
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
  let msg = ex.openToAll ? 'Every table and character is unlocked for now' : ex.progressNote ? ex.progressNote : ex.allAccess ? 'Moderator: every table and character unlocked' : ex.boxes && !ex.nothingLeft ? `LEVEL UP!  ${ex.boxes} loot box${ex.boxes === 1 ? '' : 'es'} to open` : ex.boxes ? `${ex.boxes} box${ex.boxes === 1 ? '' : 'es'} saved for new unlocks` : `Next loot box at level ${ex.level + 1}`;
  if (ex.pending) msg += `  ·  ${ex.pending} to review`;
  ctx.fillStyle = alert || ex.pending || ex.progressNote ? m.accentWarm : c.textDim;
  ctx.fillText(msg, r.x, r.y + 92);
  ctx.font = theme.fonts.label;
  ctx.fillStyle = c.textDim;
  ctx.fillText(ex.openToAll ? (ex.progressNote ? ex.progressNote : 'Your XP and levels still count; loot boxes wait for later.') : ex.progressNote ? 'Everything is playable now; approved profiles level up and unlock more.' : ex.allAccess ? 'Players start with 4 characters and the plain table, and unlock the rest.' : alert ? 'Open them in the Collection: new tables and characters.' : 'Every player level gives a loot box: a table or a character.', r.x, r.y + 116);
  crate(ctx, theme, r.x + r.w - 54, r.y + 22, alert);
  if (alert) badge(ctx, theme, r.x + r.w - 6, r.y + 26, String(ex.boxes));
  else if (ex.pending) badge(ctx, theme, r.x + r.w - 6, r.y + 26, String(ex.pending));
}

/** The logo with a diagonal band of light at `t` (0..1) of the way across, cached by step. */
const shineCache = new Map<number, HTMLCanvasElement>();
function logoShine(lg: HTMLCanvasElement, t: number): HTMLCanvasElement {
  const step = Math.round(t * 30);
  const hit = shineCache.get(step);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = lg.width;
  c.height = lg.height;
  const x = c.getContext('2d')!;
  x.drawImage(lg, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  const cx = -lg.height + (lg.width + lg.height * 2) * (step / 30);
  const g = x.createLinearGradient(cx - 6, 0, cx + 6, lg.height);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  // Only the band itself: clear the logo underneath so this draws on top of the real one.
  x.globalCompositeOperation = 'destination-in';
  const mask = x.createLinearGradient(cx - 6, 0, cx + 6, lg.height);
  mask.addColorStop(0, 'rgba(0,0,0,0)');
  mask.addColorStop(0.5, 'rgba(0,0,0,1)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = mask;
  x.fillRect(0, 0, c.width, c.height);
  shineCache.set(step, c);
  return c;
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
  ['Keys', 'Team A: WASD to aim, Space to hit.  Team B: arrow keys to aim, Enter to hit.  Hold Q / E (Team A) or . / / (Team B) for a character\u2019s other hit styles. Esc pauses (R restarts from the pause card, or rematches after a match).'],
  ['Aim', 'The marker on the table is where your shot will land, and it stays where you leave it. Up/down is deeper/shorter, left/right is across. It turns red with an X when you are aiming off the table. To sink a cup, put the marker right over it.'],
  ['Hit', 'After the ball bounces on your side, a colored ring closes in on a white ring around the ball. Hit as they meet: yellow is early, green is right, red is late. Early hits land short, late ones long, and the further from perfect, the less accurate the shot. Fast balls, long rallies and balls far from you leave less time.'],
  ['Spin', 'Once the rings appear, your marker flashes: your aim is locked. The direction you hold as you hit adds spin: forward = topspin, back = backspin, sideways = sidespin. Works on serves too. Spin on the ball you return pushes your shot (topspin long, backspin short, sidespin wide) unless you hit the opposite spin to cancel it; the same spin adds to yours.'],
  ['Serve', 'Hit to toss, then hit again as the rings meet. The ball must bounce once on your side, then land in the diagonal quarter. Two serves off the table cost half a cup. A serve that hits the other team\u2019s cups also costs half a cup, and they pick which one.'],
  ['Saves', 'When a ball hits your cup, either teammate can return it before it bounces twice. The window is shorter, so react quickly.'],
  ['Cups', 'Hit a full cup: half. Hit a half cup: gone. Sink: gone, and the sinker gets served to again. Penalties never take your last half cup: the other team has to hit it off.'],
  ['Speed', 'The Speed setting goes Relaxed, Slow, Normal, Fast, Extreme and Masters (Normal is the realistic pace): each step plays faster with smaller timing windows (saves included).'],
  ['Turns', 'Teammates alternate hits. The yellow tag and floor ring show who is up.'],
  ['Modes', '2v2 head-to-head (split screen gives each team its own camera), or 2v2 same team vs the CPU (WASD = left teammate, arrows = right). 1v1: one player a side makes every hit and serves from alternating halves.'],
  ['Unlocks', 'Character XP adds up to your player level. Each level gives a loot box (Collection) with a new table or character. On a shared keyboard, Players sets your team, which earns the XP.'],
  ['Players', 'The Players row picks your characters, and against the CPU also who the CPU plays as (any character, even locked ones). Spots left on Random get a new character each match.'],
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
