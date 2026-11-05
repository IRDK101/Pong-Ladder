// Quick pickers opened from the home screen: which table to play on, and
// which characters the player plays as (in quick matches). Both are grids
// of thumbnails, so a pick is one click (or arrows + Enter).

import { controllerOf, customSide, DEFAULT_CONTROL, type Controller, type GameConfig, type SpotKey, type TableDesign } from '../config';
import type { Character } from '../core/character';
import { characterSprite } from '../core/sprite';
import type { Account } from '../data/shared';
import { DESIGN_ORDER, DESIGNS } from '../render/designs';
import { characterLevel } from '../progress/unlocks';
import { tableShot } from './collection';
import { nameColorOf } from './characters';
import { h, nameTag, spriteImage, type Overlay } from './dom';
import type { PositionKey } from '../game/game';
import type { Theme } from '../theme';
import { CUP_STYLES, cupIcon, DRINKS, type CupLook } from '../render/cups';

/** The player's saved picks (kept in this browser). */
export interface Selection {
  design: TableDesign;
  /** Character ids for the player's side, left then right (null = random). */
  chars: (string | null)[];
  mySide: 'A' | 'B';
  /** Against the CPU: character ids for the CPU team, left then right (null = random). */
  cpu?: (string | null)[];
  /** Custom line-up: who plays each spot. */
  control?: Record<SpotKey, Controller>;
}

export const SELECTION_KEY = 'dartmouth-pong/selection/v1';

export function defaultSelection(): Selection {
  return { design: 'plain', chars: [null, null], mySide: 'A', cpu: [null, null] };
}

export function loadSelection(raw: string | null): Selection {
  const s = defaultSelection();
  try {
    const v = JSON.parse(raw ?? 'null') as Partial<Selection> | null;
    if (v && DESIGN_ORDER.includes(v.design as TableDesign)) s.design = v.design as TableDesign;
    if (v && Array.isArray(v.chars)) s.chars = [0, 1].map((i) => (typeof v.chars![i] === 'string' ? (v.chars![i] as string) : null));
    if (v?.mySide === 'B') s.mySide = 'B';
    if (v && Array.isArray(v.cpu)) s.cpu = [0, 1].map((i) => (typeof v.cpu![i] === 'string' ? (v.cpu![i] as string) : null));
    if (v && v.control && typeof v.control === 'object') {
      const c = { ...DEFAULT_CONTROL };
      for (const k of Object.keys(c) as SpotKey[]) if (['p1', 'p2', 'cpu'].includes((v.control as Record<string, string>)[k])) c[k] = (v.control as Record<string, Controller>)[k];
      s.control = c;
    }
  } catch {
    /* defaults */
  }
  return s;
}

/** Arrow keys move focus around a grid of buttons. */
function gridKeys(grid: HTMLElement): void {
  grid.addEventListener('keydown', (e) => {
    const keys: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = keys[e.key];
    if (!d) return;
    const items = [...grid.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const cols = Math.max(1, Math.round(grid.clientWidth / (items[0].offsetWidth + 10)));
    const next = items[Math.max(0, Math.min(items.length - 1, i + d[0] + d[1] * cols))];
    next.focus();
    e.preventDefault();
  });
}

/** What the cup pictures need from the game config and theme, and the cup look saved in this browser. */
export interface CupLookOps {
  theme: Theme;
  cfg: GameConfig;
  get: () => CupLook;
  set: (l: CupLook) => void;
}

export class TablePicker {
  constructor(
    private overlay: Overlay,
    private account: Account,
    private choose: (d: TableDesign) => void,
    private back: () => void,
    private cups: CupLookOps | null = null,
  ) {}

  /** The Cups and Drink rows: each card shows a cup in that look. */
  private cupRows(current: TableDesign): HTMLElement[] {
    const ops = this.cups;
    if (!ops) return [];
    const look = ops.get();
    const card = (l: CupLook, name: string, on: boolean) => {
      const icon = cupIcon(ops.theme, ops.cfg, l);
      const img = h('canvas', { class: 'cup-icon', width: icon.width, height: icon.height });
      img.getContext('2d')!.drawImage(icon, 0, 0);
      return h(
        'button',
        { class: `pickcard${on ? ' on' : ''}`, onclick: () => (ops.set(l), this.show(current, true)) },
        img,
        h('span', { class: 'pickname' }, name),
      );
    };
    const styles = h('div', { class: 'pickgrid cups' }, ...CUP_STYLES.map((st) => card({ ...look, style: st.id }, st.name, st.id === look.style)));
    const drinks = h('div', { class: 'pickgrid cups' }, ...DRINKS.map((d) => card({ ...look, drink: d.id }, d.name, d.id === look.drink)));
    gridKeys(styles);
    gridKeys(drinks);
    return [h('h2', {}, 'Cups'), styles, h('h2', {}, 'Drink'), drinks];
  }

  show(current: TableDesign, keepScroll = false): void {
    const a = this.account;
    const have = DESIGN_ORDER.filter((d) => a.tableUnlocked(d)).length;
    const grid = h(
      'div',
      { class: 'pickgrid tables' },
      ...DESIGN_ORDER.map((d) => {
        const open = a.tableUnlocked(d);
        const b = h(
          'button',
          { class: `pickcard${d === current ? ' on' : ''}${open ? '' : ' locked'}`, disabled: !open, title: open ? DESIGNS[d].blurb : 'Locked: unlock it from a loot box', onclick: () => this.choose(d) },
          h('img', { class: 'table-shot', src: tableShot(d), alt: '' }),
          h('span', { class: 'pickname' }, open ? DESIGNS[d].name : `🔒 ${DESIGNS[d].name}`),
        );
        return b;
      }),
    );
    gridKeys(grid);
    this.overlay.show(
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'row spread' }, h('h1', {}, 'Table and cups'), h('button', { onclick: () => this.back() }, 'Done')),
        h('div', { class: 'row spread' }, h('h2', {}, 'Table'), h('span', { class: 'dim' }, `${have} of ${DESIGN_ORDER.length} unlocked`)),
        grid,
        ...this.cupRows(current),
      ),
      keepScroll,
    );
    if (!keepScroll) (grid.querySelector('button.on') as HTMLButtonElement | null)?.focus();
  }
}

/** The positions the signed-in player fills: 1 in 1v1, 2 in 2v2, on their own team. */
export function mySlots(cfg: GameConfig): PositionKey[] {
  const t = cfg.players.mode === 'coop' ? 'A' : (cfg.players.mySide ?? 'A');
  return cfg.teamSize === 1 ? [`${t}-left` as PositionKey] : [`${t}-left` as PositionKey, `${t}-right` as PositionKey];
}

/** The characters pinned to the player's positions (missing or no-longer-usable picks are random). */
export function pinnedFor(cfg: GameConfig, sel: Selection, usable: Character[]): Partial<Record<PositionKey, Character>> {
  const byId = new Map(usable.map((c) => [c.id, c]));
  const out: Partial<Record<PositionKey, Character>> = {};
  mySlots(cfg).forEach((k, i) => {
    const c = sel.chars[i] ? byId.get(sel.chars[i]!) : undefined;
    if (c && !Object.values(out).some((x) => x!.id === c.id)) {
      out[k] = c;
      if (cfg.teamSize === 1) out[k.replace('left', 'right') as PositionKey] = c;
    }
  });
  return out;
}

/** The positions of the team the player is not on (the CPU, or the other humans on a shared keyboard). */
export function otherSlots(cfg: GameConfig): PositionKey[] {
  const mine = cfg.players.mode === 'coop' ? 'A' : (cfg.players.mySide ?? 'A');
  const t = mine === 'A' ? 'B' : 'A';
  return cfg.teamSize === 1 ? [`${t}-left` as PositionKey] : [`${t}-left` as PositionKey, `${t}-right` as PositionKey];
}

/**
 * The characters picked for the other team (`sel.cpu`): against the CPU any
 * character may be picked, head-to-head the same unlocked ones as yours. A
 * character already on your side is skipped; missing ones are random.
 */
export function otherPinnedFor(cfg: GameConfig, sel: Selection, pool: Character[], mine: Partial<Record<PositionKey, Character>> = {}): Partial<Record<PositionKey, Character>> {
  const byId = new Map(pool.map((c) => [c.id, c]));
  const taken = new Set(Object.values(mine).map((c) => c!.id));
  const out: Partial<Record<PositionKey, Character>> = {};
  otherSlots(cfg).forEach((k, i) => {
    const c = sel.cpu?.[i] ? byId.get(sel.cpu[i]!) : undefined;
    if (c && !taken.has(c.id) && !Object.values(out).some((x) => x!.id === c.id)) {
      out[k] = c;
      if (cfg.teamSize === 1) out[k.replace('left', 'right') as PositionKey] = c;
    }
  });
  return out;
}

/** Against the CPU: the CPU team's picks (kept for callers that only mean the CPU). */
export function cpuPinnedFor(cfg: GameConfig, sel: Selection, everyone: Character[], mine: Partial<Record<PositionKey, Character>> = {}): Partial<Record<PositionKey, Character>> {
  return cfg.players.mode === 'coop' ? otherPinnedFor(cfg, sel, everyone, mine) : {};
}

export function playingAsLabel(cfg: GameConfig, sel: Selection, usable: Character[]): string {
  const pins = pinnedFor(cfg, sel, usable);
  const names = mySlots(cfg).map((k) => pins[k]?.name ?? 'Random');
  let s = names.join(' & ');
  if (s.length > 20) s = `${s.slice(0, 19)}…`;
  return cfg.players.mode === 'versus' ? `${s} (${cfg.players.mySide ?? 'A'})` : s;
}

/** The Players row's value: which team is yours. */
export function playersLabel(cfg: GameConfig): string {
  return cfg.players.mode === 'coop' ? 'You vs CPU' : `You: Team ${cfg.players.mySide ?? 'A'}`;
}

/**
 * Players: a lineup of every spot at the table (Team A and Team B; both
 * players of each in 2v2). Pick a spot, then a character for it. Your team uses
 * your unlocked characters; the CPU can field anyone. Head-to-head, you also
 * choose which team is yours (it earns your XP); switching keeps every pick on
 * its side of the table.
 */
export class CharacterPicker {
  private slot = 0;
  /** Which team's spots are being picked: yours, or the other one (the CPU, or the other humans). */
  private side: 'mine' | 'cpu' = 'mine';
  private filter = '';

  constructor(
    private overlay: Overlay,
    private cfg: () => GameConfig,
    private account: Account,
    private sel: Selection,
    private save: () => void,
    private back: () => void,
  ) {}

  show(): void {
    const cfg = this.cfg();
    const a = this.account;
    const vsCpu = cfg.players.mode === 'coop';
    const versus = cfg.players.mode === 'versus';
    const myTeam: 'A' | 'B' = vsCpu ? 'A' : (cfg.players.mySide ?? 'A');
    if (!this.sel.cpu) this.sel.cpu = [null, null];
    const cpuSide = this.side === 'cpu';
    // Your spots use your unlocked characters; the CPU can field anyone; other humans share your unlocks.
    const poolFor = (side: 'mine' | 'cpu') => (side === 'cpu' && vsCpu ? a.everyone() : a.usable());
    const usable = poolFor(this.side);
    const slots = mySlots(cfg);
    this.slot = Math.min(this.slot, slots.length - 1);
    const list = cpuSide ? this.sel.cpu : this.sel.chars;
    const byId = new Map(a.everyone().map((c) => [c.id, c]));
    const solo = slots.length === 1;
    const custom = cfg.players.mode === 'custom';
    const teamOf = (side: 'mine' | 'cpu'): 'A' | 'B' => (side === 'mine' ? myTeam : myTeam === 'A' ? 'B' : 'A');
    const CTL_LABEL: Record<Controller, string> = { p1: 'P1 · WASD', p2: 'P2 · arrows', cpu: 'CPU' };
    const roleOf = (side: 'mine' | 'cpu', i: number) => {
      if (custom) return `${solo ? '' : i ? 'Right · ' : 'Left · '}${CTL_LABEL[controllerOf(cfg, teamOf(side), i ? 'right' : 'left')]}`;
      if (side === 'cpu') return vsCpu ? (solo ? 'CPU' : i ? 'CPU · right' : 'CPU · left') : solo ? 'Opponent' : i ? 'Right' : 'Left';
      if (solo) return 'You';
      return vsCpu ? (i ? 'You · right · arrows' : 'You · left · WASD') : i ? 'You · right' : 'You · left';
    };
    const card = (side: 'mine' | 'cpu', i: number, k: number) => {
      const ids = side === 'cpu' ? this.sel.cpu! : this.sel.chars;
      const c = ids[i] ? byId.get(ids[i]!) : undefined;
      const on = this.side === side && i === this.slot;
      const b = h(
        'button',
        { class: `spot${on ? ' on' : ''}`, style: `--i:${k}`, onclick: () => ((this.side = side), (this.slot = i), this.show()) },
        h('span', { class: 'spot-art' }, c ? spriteImage(characterSprite(c.sprite, c.cosmetics.spriteItem ?? null), 3) : h('span', { class: 'slot-random big' }, '?')),
        h('span', { class: 'spot-role' }, roleOf(side, i)),
        h('span', { class: 'spot-name' }, c ? c.name : 'Random'),
      );
      if (!custom) return b;
      // Custom line-up: who plays this spot.
      const team = teamOf(side);
      const now = controllerOf(cfg, team, i ? 'right' : 'left');
      const ctl = h(
        'div',
        { class: 'chips ctl-row', role: 'group', 'aria-label': `Who plays ${team} ${i ? 'right' : 'left'}` },
        ...(['p1', 'p2', 'cpu'] as Controller[]).map((who) =>
          h('button', { class: `small${who === now ? ' on' : ''}`, onclick: () => this.setControl(team, i ? 'right' : 'left', who) }, who === 'cpu' ? 'CPU' : who.toUpperCase()),
        ),
      );
      return h('div', { class: 'spot-wrap' }, b, ctl);
    };
    const teamCol = (team: 'A' | 'B', k0: number) => {
      const side: 'mine' | 'cpu' = team === myTeam ? 'mine' : 'cpu';
      const title = custom ? `Team ${team}` : side === 'mine' ? `Team ${team} · you` : vsCpu ? `Team ${team} · CPU` : `Team ${team}`;
      return h(
        'div',
        { class: `team-col team${team}${side === 'mine' ? ' mine' : ''}` },
        h('div', { class: 'team-head' }, h('span', {}, title), versus && side !== 'mine' ? h('button', { class: 'small', onclick: () => this.swapTeams() }, 'Make this my team') : null),
        h('div', { class: 'team-spots' }, ...slots.map((_, i) => card(side, i, k0 + i))),
      );
    };
    const lineup = h('div', { class: 'lineup' }, teamCol('A', 0), h('div', { class: 'vs-badge' }, 'VS'), teamCol('B', slots.length));

    const pick = (id: string | null) => {
      const other = list.findIndex((x, i) => i !== this.slot && i < slots.length && x === id && id !== null);
      if (other >= 0) list[other] = list[this.slot]; // swap instead of doubling up
      // A character can't be on both teams: picking one for one side frees it on the other.
      const across = cpuSide ? this.sel.chars : this.sel.cpu!;
      for (let i = 0; i < across.length; i++) if (id && across[i] === id) across[i] = null;
      list[this.slot] = id;
      // Move on to the next empty-feeling spot: the rest of this team, then the other team.
      if (this.slot < slots.length - 1) this.slot++;
      else if (this.side === 'mine') ((this.side = 'cpu'), (this.slot = 0));
      this.save();
      this.show();
    };

    const q = this.filter.trim().toLowerCase();
    const shown = usable.filter((c) => !q || c.name.toLowerCase().includes(q));
    const level = (id: string) => characterLevel(this.cfgBase(), a.progress, id).level;
    const current = list[this.slot];
    const where = (id: string): string | null => {
      for (const [side, ids] of [['mine', this.sel.chars], ['cpu', this.sel.cpu!]] as const) {
        const i = ids.findIndex((x, j) => j < slots.length && x === id);
        if (i >= 0 && !(side === this.side && i === this.slot)) return roleOf(side, i);
      }
      return null;
    };
    const grid = h(
      'div',
      { class: 'pickgrid chars' },
      h('button', { class: `pickcard${current === null ? ' on' : ''}`, style: '--i:0', onclick: () => pick(null) }, h('span', { class: 'slot-random big' }, '?'), h('span', { class: 'pickname' }, 'Random'), h('span', { class: 'dim', style: 'font-size:11px' }, 'a new one each match')),
      ...shown.map((c, n) => {
        const at = where(c.id);
        return h(
          'button',
          { class: `pickcard${current === c.id ? ' on' : ''}${at ? ' taken' : ''}`, style: `--i:${Math.min(n + 1, 24)}`, title: `${c.name}: level ${level(c.id)}`, onclick: () => pick(c.id) },
          spriteImage(characterSprite(c.sprite, c.cosmetics.spriteItem ?? null), 2),
          nameTag(c.name, c.master, nameColorOf(c)),
          h('span', { class: 'dim', style: 'font-size:11px' }, at ?? (cpuSide && vsCpu && !a.canUse(c.id) ? `Lv ${level(c.id)} · locked for you` : `Level ${level(c.id)}`)),
        );
      }),
    );
    gridKeys(grid);
    const search = h('input', { type: 'text', placeholder: 'Search characters', value: this.filter, 'aria-label': 'Search characters' }) as HTMLInputElement;
    search.addEventListener('input', () => {
      this.filter = search.value;
      this.show();
      const s = this.overlay.root.querySelector('input[type=text]') as HTMLInputElement | null;
      s?.focus();
      s?.setSelectionRange(s.value.length, s.value.length);
    });
    const pickingFor = `${roleOf(this.side, this.slot)} · Team ${this.side === 'mine' ? myTeam : myTeam === 'A' ? 'B' : 'A'}`;
    this.overlay.show(
      h(
        'div',
        { class: 'panel players-panel' },
        h('div', { class: 'row spread' }, h('h1', {}, 'Players'), h('button', { class: 'primary', onclick: () => this.back() }, 'Done')),
        lineup,
        h('div', { class: 'row spread' }, h('h2', {}, `Choosing: ${pickingFor}`), usable.length > 8 ? search : null),
        grid,
      ),
      true,
    );
    // Keyboard players land on the current pick, ready for arrows + Enter.
    if (!q) (grid.querySelector('button.on') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }

  /** Head-to-head: make the other team yours. Every pick stays on its side of the table. */
  /** Custom line-up: set who plays a spot. If "you" (P1) change teams, every pick stays on its side of the table. */
  private setControl(team: 'A' | 'B', side: 'left' | 'right', who: Controller): void {
    const before = customSide(this.cfg());
    const control = { ...DEFAULT_CONTROL, ...this.sel.control };
    control[`${team}-${side}` as SpotKey] = who;
    if (this.cfg().teamSize === 1) control[`${team}-right` as SpotKey] = who;
    this.sel.control = control;
    this.save();
    const after = customSide(this.cfg());
    if (after !== before) {
      const mine = this.sel.chars;
      this.sel.chars = this.sel.cpu ?? [null, null];
      this.sel.cpu = mine;
      this.side = this.side === 'mine' ? 'cpu' : 'mine';
      this.save();
    }
    this.show();
  }

  private swapTeams(): void {
    const mine = this.sel.chars;
    this.sel.chars = this.sel.cpu ?? [null, null];
    this.sel.cpu = mine;
    this.sel.mySide = this.sel.mySide === 'A' ? 'B' : 'A';
    this.side = this.side === 'mine' ? 'cpu' : 'mine';
    this.save();
    this.show();
  }

  private cfgBase(): GameConfig {
    return this.cfg();
  }
}
