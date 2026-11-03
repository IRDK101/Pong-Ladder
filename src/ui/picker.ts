// Quick pickers opened from the home screen: which table to play on, and
// which characters the player plays as (in quick matches). Both are grids
// of thumbnails, so a pick is one click (or arrows + Enter).

import type { GameConfig, TableDesign } from '../config';
import type { Character } from '../core/character';
import { characterSprite } from '../core/sprite';
import type { Account } from '../data/shared';
import { DESIGN_ORDER, DESIGNS } from '../render/designs';
import { characterLevel } from '../progress/unlocks';
import { tableShot } from './collection';
import { nameColorOf } from './characters';
import { h, nameTag, spriteImage, type Overlay } from './dom';
import type { PositionKey } from '../game/game';

/** The player's saved picks (kept in this browser). */
export interface Selection {
  design: TableDesign;
  /** Character ids for the player's side, left then right (null = random). */
  chars: (string | null)[];
  mySide: 'A' | 'B';
  /** Against the CPU: character ids for the CPU team, left then right (null = random). */
  cpu?: (string | null)[];
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

export class TablePicker {
  constructor(
    private overlay: Overlay,
    private account: Account,
    private choose: (d: TableDesign) => void,
    private back: () => void,
  ) {}

  show(current: TableDesign): void {
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
        h('div', { class: 'row spread' }, h('h1', {}, 'Pick a table'), h('button', { onclick: () => this.back() }, 'Back')),
        h('p', { class: 'dim' }, `${have} of ${DESIGN_ORDER.length} unlocked. Locked tables come from loot boxes (Collection). Where the table stands is the Spot row.`),
        grid,
      ),
    );
    (grid.querySelector('button.on') as HTMLButtonElement | null)?.focus();
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

/** Against the CPU: the characters picked for the CPU team (any character; missing ones are random). */
export function cpuPinnedFor(cfg: GameConfig, sel: Selection, everyone: Character[], mine: Partial<Record<PositionKey, Character>> = {}): Partial<Record<PositionKey, Character>> {
  if (cfg.players.mode !== 'coop') return {};
  const byId = new Map(everyone.map((c) => [c.id, c]));
  const taken = new Set(Object.values(mine).map((c) => c!.id));
  const keys: PositionKey[] = cfg.teamSize === 1 ? ['B-left'] : ['B-left', 'B-right'];
  const out: Partial<Record<PositionKey, Character>> = {};
  keys.forEach((k, i) => {
    const c = sel.cpu?.[i] ? byId.get(sel.cpu[i]!) : undefined;
    if (c && !taken.has(c.id) && !Object.values(out).some((x) => x!.id === c.id)) {
      out[k] = c;
      if (cfg.teamSize === 1) out['B-right'] = c;
    }
  });
  return out;
}

export function playingAsLabel(cfg: GameConfig, sel: Selection, usable: Character[]): string {
  const pins = pinnedFor(cfg, sel, usable);
  const names = mySlots(cfg).map((k) => pins[k]?.name ?? 'Random');
  let s = names.join(' & ');
  if (s.length > 20) s = `${s.slice(0, 19)}…`;
  return cfg.players.mode === 'versus' ? `${s} (${cfg.players.mySide ?? 'A'})` : s;
}

export class CharacterPicker {
  private slot = 0;
  /** Which side's spots are being picked: yours, or (against the CPU) the CPU team's. */
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
    if (!vsCpu) this.side = 'mine';
    const cpuSide = this.side === 'cpu';
    // Your spots use your unlocked characters; the CPU can field anyone.
    const usable = cpuSide ? a.everyone() : a.usable();
    const slots = mySlots(cfg);
    this.slot = Math.min(this.slot, slots.length - 1);
    if (!this.sel.cpu) this.sel.cpu = [null, null];
    const list = cpuSide ? this.sel.cpu : this.sel.chars;
    const byId = new Map(a.everyone().map((c) => [c.id, c]));
    const versus = cfg.players.mode === 'versus';
    const slotLabel = (i: number) => (slots.length === 1 ? 'You' : vsCpu ? (i ? 'Right · arrows' : 'Left · WASD') : i ? 'Right' : 'Left');
    const cpuLabel = (i: number) => (slots.length === 1 ? 'CPU' : i ? 'CPU right' : 'CPU left');
    const slotButton = (side: 'mine' | 'cpu', i: number) => {
      const ids = side === 'cpu' ? this.sel.cpu! : this.sel.chars;
      const c = ids[i] ? byId.get(ids[i]!) : undefined;
      const on = this.side === side && i === this.slot;
      return h(
        'button',
        { class: `slot${on ? ' on' : ''}${side === 'cpu' ? ' cpu' : ''}`, onclick: () => ((this.side = side), (this.slot = i), this.show()) },
        c ? spriteImage(characterSprite(c.sprite, c.cosmetics.spriteItem ?? null), 2) : h('span', { class: 'slot-random' }, '?'),
        h('span', { style: 'display:flex;flex-direction:column;align-items:flex-start' }, h('span', { class: 'dim', style: 'font-size:11px' }, side === 'cpu' ? cpuLabel(i) : slotLabel(i)), h('span', { class: 'name' }, c ? c.name : 'Random')),
      );
    };

    const slotRow = h(
      'div',
      { class: 'slots' },
      ...slots.map((_, i) => slotButton('mine', i)),
      vsCpu ? h('span', { class: 'vs-mark' }, 'VS') : null,
      ...(vsCpu ? slots.map((_, i) => slotButton('cpu', i)) : []),
      versus
        ? h(
            'div',
            { class: 'side-toggle' },
            h('span', { class: 'dim', style: 'font-size:12px' }, 'Your team (earns your XP)'),
            h(
              'div',
              { class: 'tabs' },
              ...(['A', 'B'] as const).map((t) => h('button', { class: (cfg.players.mySide ?? 'A') === t ? 'on' : '', onclick: () => ((this.sel.mySide = t), this.save(), this.show()) }, `Team ${t}`)),
            ),
          )
        : null,
    );

    const pick = (id: string | null) => {
      const other = list.findIndex((x, i) => i !== this.slot && i < slots.length && x === id && id !== null);
      if (other >= 0) list[other] = list[this.slot]; // swap instead of doubling up
      // A character can't be on both teams: picking one of yours for the CPU (or the reverse) frees it there.
      const across = cpuSide ? this.sel.chars : this.sel.cpu!;
      for (let i = 0; i < across.length; i++) if (id && across[i] === id) across[i] = null;
      list[this.slot] = id;
      if (this.slot < slots.length - 1) this.slot++;
      this.save();
      this.show();
    };

    const q = this.filter.trim().toLowerCase();
    const shown = usable.filter((c) => !q || c.name.toLowerCase().includes(q));
    const level = (id: string) => characterLevel(this.cfgBase(), a.progress, id).level;
    const current = list[this.slot];
    const grid = h(
      'div',
      { class: 'pickgrid chars' },
      h('button', { class: `pickcard${current === null ? ' on' : ''}`, onclick: () => pick(null) }, h('span', { class: 'slot-random big' }, '?'), h('span', { class: 'pickname' }, 'Random'), h('span', { class: 'dim', style: 'font-size:11px' }, 'a new one each match')),
      ...shown.map((c) => {
        const taken = list.findIndex((x, i) => i < slots.length && x === c.id);
        return h(
          'button',
          { class: `pickcard${current === c.id ? ' on' : ''}`, title: `${c.name}: level ${level(c.id)}`, onclick: () => pick(c.id) },
          spriteImage(characterSprite(c.sprite, c.cosmetics.spriteItem ?? null), 2),
          nameTag(c.name, c.master, nameColorOf(c)),
          h('span', { class: 'dim', style: 'font-size:11px' }, taken >= 0 && taken !== this.slot ? (cpuSide ? cpuLabel(taken) : slotLabel(taken)) : cpuSide ? `Lv ${level(c.id)}${a.canUse(c.id) ? '' : ' · locked for you'}` : `Level ${level(c.id)}`),
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
    const locked = this.account.everyone().length - usable.length;
    this.overlay.show(
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'row spread' }, h('h1', {}, vsCpu ? 'Playing as & against' : 'Playing as'), h('button', { class: 'primary', onclick: () => this.back() }, 'Done')),
        h(
          'p',
          { class: 'dim' },
          vsCpu
            ? `Pick your characters, then (after VS) who the CPU plays as: any character, even ones you haven't unlocked. Random spots get a new one each match.${cpuSide ? '' : locked > 0 ? ` ${locked} more are locked for you: unlock them from loot boxes in the Collection.` : ''}`
            : `Quick matches put these characters on your side; the other spots get random ones. Pick a spot above, then a character.${locked > 0 ? ` ${locked} more are locked: unlock them from loot boxes in the Collection.` : ''}`,
        ),
        slotRow,
        usable.length > 8 ? search : null,
        grid,
      ),
      true,
    );
    // Keyboard players land on the current pick, ready for arrows + Enter.
    if (!q) (grid.querySelector('button.on') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }

  private cfgBase(): GameConfig {
    return this.cfg();
  }
}
