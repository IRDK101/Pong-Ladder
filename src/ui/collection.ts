// The Collection: tables and characters (unlocked and locked), the player's
// level and loot boxes, and (for the owner) the review queue of characters
// other players have submitted.

import { makeConfig, type GameConfig, type TableDesign } from '../config';
import type { Character, Sprite } from '../core/character';
import { characterSprite } from '../core/sprite';
import type { Account, PlayerSubmissions } from '../data/shared';
import type { AppStore } from '../data/storage';
import { Game } from '../game/game';
import { DESIGNS } from '../render/designs';
import { makeView } from '../render/renderer';
import { renderGame3D } from '../render/renderer3d';
import { playerLevel, type LootItem } from '../progress/unlocks';
import { theme } from '../theme';
import { levelBar } from './careerView';
import { characterCard, statBars, type CharactersScreen } from './characters';
import { h, spriteImage, type Overlay } from './dom';
import { characterLevel } from '../progress/unlocks';
import { getStyle } from '../core/styles';

type Tab = 'tables' | 'characters' | 'submissions';

/** A character's outline only, for locked cards. */
function silhouette(s: Sprite): Sprite {
  return { w: s.w, h: s.h, pixels: s.pixels.map((p) => (p ? '#0b0907' : '')) };
}

const tableShots = new Map<TableDesign, string>();
/** A picture of a table design (played in the middle of the room), rendered once from the game's own camera. */
function tableShot(design: TableDesign): string {
  const hit = tableShots.get(design);
  if (hit) return hit;
  const cfg = makeConfig({ venue: 'saints', design, formation: 'tree' });
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 180;
  try {
    const g = new Game(cfg, () => 0.5);
    renderGame3D(c.getContext('2d')!, theme, makeView(cfg, theme, 320, 180), g, 'behindA', false);
  } catch {
    /* a blank card is fine */
  }
  const url = c.toDataURL();
  tableShots.set(design, url);
  return url;
}

export class CollectionScreen {
  private tab: Tab = 'characters';
  private reveal: LootItem | null = null;
  private note = '';

  constructor(
    private overlay: Overlay,
    private store: AppStore,
    private cfg: GameConfig,
    private account: Account,
    private characters: CharactersScreen,
    private onClose: () => void,
  ) {}

  private panel: HTMLElement | null = null;

  /** True while this screen is on top (so live updates can refresh it). */
  isShowing(): boolean {
    return !!this.panel && this.overlay.isOpen() && this.overlay.root.contains(this.panel);
  }

  show(tab: Tab = this.tab): void {
    this.tab = tab === 'submissions' && !this.account.owner ? 'characters' : tab;
    const a = this.account;
    const lvl = playerLevel(this.cfg, a.progress);
    const boxes = a.boxes();
    const nothingLeft = a.allUnlocked();
    const pending = a.pendingCount();
    const tabBtn = (t: Tab, label: string) => h('button', { class: this.tab === t ? 'on' : '', onclick: () => ((this.reveal = null), this.show(t)) }, label);

    const head = h(
      'div',
      { class: 'box loot-head' },
      h(
        'div',
        { style: 'display:flex;flex-direction:column;gap:6px;flex:1;min-width:220px' },
        h('h2', {}, 'Player level'),
        levelBar(lvl),
        h('p', { class: 'dim', style: 'font-size:12px' }, 'All the XP your characters earn adds up to your player level. Every level gives a loot box.'),
      ),
      h(
        'div',
        { class: 'loot-box-col' },
        h('div', { class: `loot-box${boxes ? ' ready' : ''}`, 'aria-hidden': 'true' }, h('i'), h('b'), boxes ? h('span', { class: 'count' }, String(boxes)) : null),
        h(
          'button',
          { class: 'primary', disabled: !boxes || nothingLeft, onclick: () => this.open() },
          boxes ? (nothingLeft ? 'Box saved for later' : `Open a loot box (${boxes})`) : 'No boxes yet',
        ),
        boxes && nothingLeft ? h('p', { class: 'dim', style: 'font-size:12px;max-width:220px;text-align:center' }, 'You have everything. Boxes wait here until new tables or characters are added.') : null,
      ),
    );

    const body = this.tab === 'tables' ? this.tables() : this.tab === 'characters' ? this.chars() : this.submissions();
    const panel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'row spread' }, h('h1', {}, 'Collection'), h('button', { onclick: () => this.onClose() }, 'Back to menu')),
      a.mode === 'local' ? h('p', { class: 'dim' }, 'Offline: your level and unlocks are saved in this browser. Open the published game signed in to keep them with your account.') : null,
      a.problem ? h('p', { class: 'error' }, a.problem) : null,
      this.note ? h('p', { class: 'ok' }, this.note) : null,
      head,
      this.reveal ? this.revealCard(this.reveal) : null,
      h('div', { class: 'tabs' }, tabBtn('characters', 'Characters'), tabBtn('tables', 'Tables'), a.owner ? tabBtn('submissions', pending ? `Submissions (${pending})` : 'Submissions') : null),
      body,
    );
    this.panel = panel;
    this.overlay.show(panel, true);
  }

  private open(): void {
    const item = this.account.openBox();
    this.note = '';
    this.reveal = item;
    this.show(item?.kind === 'table' ? 'tables' : this.tab === 'submissions' ? 'characters' : this.tab);
  }

  private revealCard(item: LootItem): HTMLElement {
    const art =
      item.kind === 'table'
        ? h('img', { class: 'table-shot', src: tableShot(item.id as TableDesign), alt: '' })
        : (() => {
            const c = this.store.characters.get(item.id);
            return c ? spriteImage(characterSprite(c.sprite, null), 4) : h('span');
          })();
    const name = item.kind === 'table' ? DESIGNS[item.id as TableDesign]?.name ?? item.id : this.store.characters.get(item.id)?.name ?? 'A new character';
    return h(
      'div',
      { class: 'box loot-reveal', role: 'status' },
      h('div', { class: 'burst', 'aria-hidden': 'true' }),
      h('h2', {}, item.kind === 'table' ? 'New table unlocked!' : 'New character unlocked!'),
      h('div', { class: 'reveal-art' }, art),
      h('p', { class: 'name', style: 'font-size:20px' }, name),
      h('p', { class: 'dim' }, item.kind === 'table' ? 'Pick it from the Table row in the menu, and set up at any spot in the room.' : 'You can draft them now.'),
    );
  }

  private tables(): HTMLElement {
    const a = this.account;
    const list = a.tables() as TableDesign[];
    const have = list.filter((t) => a.tableUnlocked(t)).length;
    return h(
      'div',
      { style: 'display:flex;flex-direction:column;gap:10px' },
      h('p', { class: 'dim' }, `${have} of ${list.length} tables unlocked.`),
      h(
        'div',
        { class: 'grid wide' },
        ...list.map((t) => {
          const open = a.tableUnlocked(t);
          const v = DESIGNS[t];
          return h(
            'div',
            { class: `box card${open ? '' : ' locked'}` },
            h('img', { class: 'table-shot', src: tableShot(t), alt: '', loading: 'lazy' }),
            h('span', { class: 'name' }, open ? v.name : `${v.name} · locked`),
            h('p', { class: 'dim', style: 'font-size:12px' }, open ? v.blurb : 'Unlock it from a loot box.'),
          );
        }),
      ),
    );
  }

  private chars(): HTMLElement {
    const a = this.account;
    const shared = this.store.characters.list().filter((c) => this.store.characters.isShared(c.id));
    const own = this.store.characters.list().filter((c) => !this.store.characters.isShared(c.id));
    const open = shared.filter((c) => a.canUse(c.id));
    const level = (id: string) => characterLevel(this.cfg, a.progress, id).level;
    const card = (c: Character) =>
      a.canUse(c.id)
        ? characterCard(c, level(c.id), [h('button', { onclick: () => this.profile(c.id) }, 'Profile')])
        : h(
            'div',
            { class: 'box card locked' },
            h('div', { class: 'row' }, spriteImage(silhouette(characterSprite(c.sprite, null)), 3), h('div', {}, h('span', { class: 'name' }, '???'), h('p', { class: 'dim' }, 'Locked'))),
            h('p', { class: 'dim', style: 'font-size:12px' }, 'Unlock from a loot box. Until then, the CPU can still play them.'),
          );
    return h(
      'div',
      { style: 'display:flex;flex-direction:column;gap:10px' },
      shared.length
        ? h('p', { class: 'dim' }, `${open.length} of ${shared.length} characters unlocked.`)
        : h('p', { class: 'dim' }, 'The shared collection is empty so far.'),
      shared.length ? h('div', { class: 'grid' }, ...[...shared].sort((x, y) => Number(a.canUse(y.id)) - Number(a.canUse(x.id))).map(card)) : null,
      own.length ? h('h2', {}, 'Made in this browser') : null,
      own.length ? h('p', { class: 'dim' }, a.canSubmit ? 'Yours to play. Submit them from Characters to add them for everyone.' : 'Yours to play.') : null,
      own.length ? h('div', { class: 'grid' }, ...own.map(card)) : null,
    );
  }

  private profile(id: string): void {
    this.characters.backTo = () => this.show('characters');
    this.characters.showProfile(id);
  }

  private submissions(): HTMLElement {
    const a = this.account;
    if (!a.allSubmissions.length) return h('div', { class: 'box' }, h('p', {}, 'No submissions yet. When players submit characters, they show up here for you to approve.'));
    const order = { pending: 0, rejected: 1, approved: 2 } as const;
    const player = (s: PlayerSubmissions) => {
      const items = Object.entries(s.items).sort(([, x], [, y]) => order[x.status] - order[y.status]);
      return h(
        'div',
        { style: 'display:flex;flex-direction:column;gap:8px' },
        h('h2', {}, s.name || 'A player'),
        h(
          'div',
          { class: 'grid' },
          ...items.map(([id, sub]) => {
            const c = sub.character;
            const noteInput = h('input', { type: 'text', placeholder: 'Note if turning down (optional)', maxlength: '200' }) as HTMLInputElement;
            return h(
              'div',
              { class: 'box card' },
              h('div', { class: 'row' }, spriteImage(characterSprite(c.sprite, null), 3), h('div', {}, h('span', { class: 'name' }, c.name), h('p', { class: 'dim' }, sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString() : ''))),
              statBars(c.stats),
              h('p', { class: 'dim', style: 'font-size:12px' }, `Hits: ${c.hitStyles.map((x) => getStyle(x).name).join(', ')}`),
              h('span', { class: `badge status-${sub.status}` }, sub.status === 'pending' ? 'Waiting for you' : sub.status === 'approved' ? 'Approved' : 'Turned down'),
              sub.status !== 'approved' ? noteInput : null,
              h(
                'div',
                { class: 'row' },
                sub.status !== 'approved' ? h('button', { class: 'primary', onclick: () => (a.approve(s.uid, id), (this.note = `Added ${c.name} to the collection.`), this.show('submissions')) }, 'Approve') : null,
                sub.status === 'pending' ? h('button', { class: 'danger', onclick: () => (a.reject(s.uid, id, noteInput.value.trim()), (this.note = `Turned down ${c.name}.`), this.show('submissions')) }, 'Turn down') : null,
              ),
            );
          }),
        ),
      );
    };
    return h(
      'div',
      { style: 'display:flex;flex-direction:column;gap:14px' },
      h('p', { class: 'dim' }, 'Approved characters join the collection: everyone else unlocks them from loot boxes, and the player who made them always has them. To remove one later, delete it in Characters.'),
      ...a.allSubmissions.map(player),
    );
  }
}
