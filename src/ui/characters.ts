// Character list and character creator/editor (HTML screens).

import { MAX_HIT_STYLES, MIN_HIT_STYLES, NAME_MAX, newCharacter, validateCharacter, type Character, type Sprite } from '../core/character';
import { characterBackSprite, characterSprite, COLOR_PARTS, composeSprite, normalizeParts, PART_GROUPS, PART_LABELS, PART_OPTIONS, randomParts, SPRITE_H, SPRITE_W, spriteFromRgba, type PartKey } from '../core/sprite';
import { STAT_INFO, STAT_KEYS, STAT_MAX, STAT_MIN, type Stats } from '../core/stats';
import { getStyle, stylesOfKind } from '../core/styles';
import type { GameConfig } from '../config';
import type { AppStore } from '../data/storage';
import type { Account } from '../data/shared';
import { characterLevel } from '../progress/unlocks';
import { BADGE_LABELS, isUnlocked, REWARDS, type RewardKind } from '../progress/rewards';
import { theme } from '../theme';
import { careerTable, levelBar, progressFrom, type Progress } from './careerView';
import { h, nameTag, spriteImage, type Overlay } from './dom';

/** A character's equipped name color as a CSS color, if any. */
export function nameColorOf(c: Character): string | null {
  return c.cosmetics.nameColor ? (theme.nameColors[c.cosmetics.nameColor] ?? null) : null;
}

export function badgeChips(c: Character): HTMLElement | null {
  if (!c.cosmetics.badges.length) return null;
  return h('div', { class: 'chips' }, ...c.cosmetics.badges.map((b) => h('span', { class: 'badge reward' }, BADGE_LABELS[b] ?? b)));
}

/** Stat bars, for select and profile screens only (never in the HUD). */
export function statBars(stats: Stats): HTMLElement {
  return h(
    'div',
    { style: 'display:flex;flex-direction:column;gap:3px;width:100%' },
    ...STAT_KEYS.map((k) =>
      h(
        'div',
        { class: 'statline', title: STAT_INFO[k].effect },
        h('span', { class: 'dim' }, STAT_INFO[k].label),
        h('span', { class: 'bar' }, (() => {
          const i = h('i');
          i.style.width = `${(stats[k] / STAT_MAX) * 100}%`;
          return i;
        })()),
        h('span', {}, String(stats[k])),
      ),
    ),
  );
}

/** Character levels come from the player's account (personal per player), not this browser's history alone. */
export function withAccountLevels(cfg: GameConfig, p: Progress, account: Account): Progress {
  return { ...p, characterLevel: (id) => characterLevel(cfg, account.progress, id) };
}

export function characterCard(c: Character, level: number, extra: HTMLElement[] = [], attrs: Record<string, string | EventListener> = {}): HTMLElement {
  return h(
    'div',
    { class: 'box card', ...attrs },
    h(
      'div',
      { class: 'row' },
      spriteImage(characterSprite(c.sprite, c.cosmetics.spriteItem ?? null), 3),
      h('div', { style: 'display:flex;flex-direction:column;gap:2px' }, nameTag(c.name, c.master, nameColorOf(c)), h('p', { class: 'dim' }, `Level ${level}`), badgeChips(c)),
    ),
    statBars(c.stats),
    h('p', { class: 'dim', style: 'font-size:12px' }, `Hits: ${c.hitStyles.map((id) => getStyle(id).name).join(', ')}`),
    ...extra,
  );
}

export class CharactersScreen {
  constructor(
    private overlay: Overlay,
    private store: AppStore,
    private cfg: GameConfig,
    private account: Account,
    private onClose: () => void,
  ) {}

  private progress(): Progress {
    return withAccountLevels(this.cfg, progressFrom(this.cfg, this.store.matches.list()), this.account);
  }

  /** The characters this screen manages: everything for the owner (or offline); a player's own otherwise. */
  private mine(): Character[] {
    const all = this.store.characters.list();
    if (!this.account.canSubmit) return all;
    return all.filter((c) => !this.store.characters.isShared(c.id) || this.account.creators.get(c.id) === this.account.uid);
  }

  /** Submission status and buttons on a player's own character. */
  private submitTools(c: Character): HTMLElement | null {
    const a = this.account;
    if (!a.canSubmit) return null;
    if (a.creators.get(c.id) === a.uid && this.store.characters.isShared(c.id)) return h('span', { class: 'badge reward' }, 'In the collection');
    const sub = a.submissionOf(c.id);
    const changed = sub && (sub.character.updatedAt ?? '') < (c.updatedAt ?? '');
    const send = () => {
      a.submit(c);
      this.showList(`Sent ${c.name} to the moderator for approval.`);
    };
    if (!sub) return h('button', { onclick: send, title: 'Ask the moderator to add this character to the collection for everyone' }, 'Submit for approval');
    const label = sub.status === 'pending' ? 'Waiting for approval' : sub.status === 'approved' ? 'Approved' : 'Not approved';
    return h(
      'div',
      { style: 'display:flex;flex-direction:column;gap:6px' },
      h('span', { class: `badge status-${sub.status}` }, changed ? `${label} · edited since` : label),
      sub.status === 'rejected' && sub.note ? h('p', { class: 'dim', style: 'font-size:12px' }, `Note: ${sub.note}`) : null,
      h(
        'div',
        { class: 'row' },
        changed || sub.status === 'rejected' ? h('button', { onclick: send }, 'Resubmit') : null,
        sub.status === 'pending' ? h('button', { onclick: () => (a.withdraw(c.id), this.showList(`Withdrew ${c.name}.`)) }, 'Withdraw') : null,
      ),
    );
  }

  private listPanel: HTMLElement | null = null;

  /** True while the character list (not the editor or a profile) is on screen. */
  isShowingList(): boolean {
    return !!this.listPanel && this.overlay.isOpen() && this.overlay.root.contains(this.listPanel);
  }

  showList(note = ''): void {
    const chars = this.mine();
    const prog = this.progress();
    const panel = h(
      'div',
      { class: 'panel' },
      h(
        'div',
        { class: 'row spread' },
        h('h1', {}, 'Characters'),
        h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => this.edit(newCharacter('')) }, 'New character'), h('button', { onclick: () => this.onClose() }, 'Back to menu')),
      ),
      h(
        'p',
        { class: 'dim' },
        this.account.canSubmit
          ? 'Characters you make are yours to play right away. Submit one and, once the moderator approves it, it joins the collection for everyone: other players unlock it from loot boxes, and you always have it. From then on only the moderator can change it. Levels and cosmetics are your own.'
          : this.account.owner
            ? 'Your friends, recreated. Everything you make here joins the shared collection: players start with a few and unlock the rest from loot boxes (see Collection). Review other players’ characters under Collection → Submissions. Levels and cosmetics are each player’s own.'
            : 'Your friends, recreated. Drafts pick from these, and quick matches and the title-screen demo use random ones. Characters in the collection are made by the moderator and can’t be changed here; ones you make yourself you can edit.',
      ),
      note ? h('p', { class: 'ok' }, note) : null,
      chars.length
        ? h(
            'div',
            { class: 'grid' },
            ...chars.map((c) =>
              characterCard(c, prog.characterLevel(c.id).level, [
                h(
                  'div',
                  { class: 'row' },
                  h('button', { class: this.account.newRewards(c.id) ? 'primary' : '', onclick: () => this.showProfile(c.id) }, this.account.newRewards(c.id) ? `Profile · ${this.account.newRewards(c.id)} new` : 'Profile'),
                  this.canEdit(c.id) ? h('button', { onclick: () => this.edit(structuredClone(c)) }, 'Edit') : h('span', { class: 'dim', style: 'font-size:12px', title: 'Only the moderator can change characters in the collection' }, '🔒 Moderator only'),
                ),
                this.submitTools(c),
              ].filter((x): x is HTMLElement => !!x)),
            ),
          )
        : h('div', { class: 'box' }, h('p', {}, 'No characters yet. Create your first one with “New character”.')),
    );
    this.listPanel = panel;
    this.overlay.show(panel, true);
  }

  /** Career stats, level, rewards, and choosing which unlocked cosmetics to wear. */
  showProfile(id: string, note = ''): void {
    const c = this.store.characters.get(id);
    if (!c) return this.showList();
    // Rewards unlocked since last time are shown as new once, then they're seen.
    const fresh = this.account.newRewards(id);
    if (fresh && !note) note = `Level up! ${fresh} new reward${fresh === 1 ? '' : 's'} unlocked: equip ${fresh === 1 ? 'it' : 'them'} below.`;
    this.account.sawRewards(id);
    const prog = this.progress();
    const lvl = prog.characterLevel(id);
    const career = prog.characterCareer(id);
    // Cosmetics are this player's own: they're saved with the player, not the character.
    const save = (msg: string) => {
      this.account.equip(c.id, c.cosmetics);
      this.showProfile(id, msg);
    };
    const kinds: [RewardKind, string][] = [
      ['nameColor', 'Name color'],
      ['spriteItem', 'Sprite item'],
      ['celebration', 'Sink celebration'],
      ['badge', 'Badges'],
    ];
    const equip = h(
      'div',
      { class: 'grid' },
      ...kinds.map(([kind, title]) => {
        const rewards = REWARDS.filter((r) => r.kind === kind);
        const current = kind === 'badge' ? null : (c.cosmetics[kind] ?? null);
        const buttons = rewards.map((r) => {
          const open = isUnlocked(lvl.level, kind, r.id);
          const on = kind === 'badge' ? c.cosmetics.badges.includes(r.id) : current === r.id;
          const b = h(
            'button',
            {
              class: on ? 'on' : '',
              disabled: !open,
              title: open ? r.label : `Unlocks at level ${r.level}`,
              onclick: () => {
                if (kind === 'badge') {
                  c.cosmetics.badges = on ? c.cosmetics.badges.filter((x) => x !== r.id) : [...c.cosmetics.badges, r.id];
                } else c.cosmetics[kind] = on ? null : r.id;
                save(on ? `Took off ${r.label}.` : `Wearing ${r.label}.`);
              },
            },
            open ? r.label.replace(/ (name|badge|sink celebration)$/, '') : `Level ${r.level}`,
          );
          if (kind === 'nameColor' && open) b.style.color = theme.nameColors[r.id];
          return b;
        });
        return h('div', { class: 'box', style: 'display:flex;flex-direction:column;gap:8px' }, h('h2', {}, title), h('div', { class: 'chips' }, ...buttons));
      }),
    );
    this.overlay.show(
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'row spread' }, h('h1', {}, `${c.name}`), h('div', { class: 'row' }, this.canEdit(c.id) ? h('button', { onclick: () => this.edit(structuredClone(c)) }, 'Edit') : null, h('button', { onclick: () => this.back() }, 'Back'))),
        h(
          'div',
          { class: 'box row', style: 'align-items:flex-start;gap:20px' },
          spriteImage(characterSprite(c.sprite, c.cosmetics.spriteItem ?? null), 5),
          h(
            'div',
            { style: 'display:flex;flex-direction:column;gap:10px;flex:1;min-width:220px' },
            nameTag(c.name, c.master, nameColorOf(c)),
            badgeChips(c),
            levelBar(lvl),
            h('p', { class: 'dim' }, 'Your level with this character comes from your games with it (wins, sinks, saves, aces, perfect hits) and unlocks cosmetics for your copy only. Its XP also counts towards your player level. Stats never change.'),
            statBars(c.stats),
          ),
        ),
        note ? h('p', { class: 'ok' }, note) : null,
        h('h2', {}, 'Career (games in this browser)'),
        careerTable(career),
        h('h2', {}, 'Rewards'),
        equip,
      ),
    );
  }

  /** Open the editor on any character with custom save / cancel (the moderator uses it to fix a submission before approving). */
  editWith(c: Character, save: (c: Character) => void, cancel: () => void, remove: (() => void) | null = null): void {
    new CharacterEditor(this.overlay, structuredClone(c), {
      save: (done) => {
        done.updatedAt = new Date().toISOString();
        save(done);
      },
      cancel,
      remove,
    }).render();
  }

  /** Where Back from a profile goes (the Collection opens profiles too). */
  backTo: (() => void) | null = null;

  private back(): void {
    const b = this.backTo;
    this.backTo = null;
    if (b) b();
    else this.showList();
  }

  /** Only the moderator edits characters in the shared collection; players edit only the ones they made that aren't in it. */
  private canEdit(id: string): boolean {
    return this.account.owner || !this.store.characters.isShared(id);
  }

  edit(c: Character): void {
    if (!this.canEdit(c.id)) return this.showList('Only the moderator can change characters in the collection.');
    new CharacterEditor(this.overlay, c, {
      save: (done) => {
        if (!this.canEdit(done.id)) return this.showList(`${done.name} is in the collection now: only the moderator can change it.`);
        done.updatedAt = new Date().toISOString();
        this.store.characters.save(done);
        this.showList(`Saved ${done.name}.`);
      },
      cancel: () => this.showList(),
      remove: this.store.characters.get(c.id)
        ? () => {
            this.store.characters.remove(c.id);
            this.showList(`Deleted ${c.name}.`);
          }
        : null,
    }).render();
  }
}

type SpriteMode = 'parts' | 'draw' | 'upload';

/** Which part of the figure each part's thumbnails show (rows y0..y1), at what scale, and from which side. */
const THUMB_REGION: Record<PartKey, { y0: number; y1: number; scale: number; back?: boolean }> = {
  build: { y0: 0, y1: 23, scale: 2 },
  skin: { y0: 0, y1: 23, scale: 2 },
  faceShape: { y0: 0, y1: 11, scale: 4 },
  eyes: { y0: 2, y1: 9, scale: 5 },
  mouth: { y0: 3, y1: 10, scale: 5 },
  facialHair: { y0: 2, y1: 11, scale: 4 },
  hairStyle: { y0: 0, y1: 11, scale: 4 },
  hairColor: { y0: 0, y1: 11, scale: 4 },
  headwear: { y0: 0, y1: 11, scale: 4 },
  hatColor: { y0: 0, y1: 11, scale: 4 },
  shirtStyle: { y0: 8, y1: 18, scale: 4 },
  shirtColor: { y0: 8, y1: 18, scale: 4 },
  pantsStyle: { y0: 15, y1: 23, scale: 4 },
  pantsColor: { y0: 15, y1: 23, scale: 4 },
  shoes: { y0: 19, y1: 23, scale: 5 },
  accessory: { y0: 0, y1: 17, scale: 3 },
};

/** Rows y0..y1 of a sprite. */
function cropSprite(s: Sprite, y0: number, y1: number): Sprite {
  return { w: s.w, h: y1 - y0 + 1, pixels: s.pixels.slice(y0 * s.w, (y1 + 1) * s.w) };
}

class CharacterEditor {
  private mode: SpriteMode;
  private brush = '#1a1410';
  private recent: string[] = ['#1a1410', '#f2f2f2', '#00693e', '#b5332e', '#e8a33d', '#3a8ec9'];
  private confirmingDelete = false;
  private shown = false;
  /** Which group of parts the Look tabs show. */
  private group = 0;
  private errors: string[] = [];

  constructor(
    private overlay: Overlay,
    private c: Character,
    private actions: { save: (c: Character) => void; cancel: () => void; remove: (() => void) | null },
  ) {
    this.mode = c.sprite.pixels ? 'draw' : 'parts';
    // Older characters predate some parts: fill them in so every control has a value.
    c.sprite.parts = normalizeParts(c.sprite.parts);
  }

  render(): void {
    const c = this.c;
    // Front and back, as the character shows at the far end of the table and over your shoulder.
    const view = (label: string, img: HTMLCanvasElement) => h('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:4px' }, img, h('span', { class: 'dim', style: 'font-size:12px' }, label));
    const preview = h(
      'div',
      { class: 'sprite-stage' },
      view('Front', spriteImage(characterSprite(c.sprite), 6)),
      view('Back', spriteImage(characterBackSprite(c.sprite), 6)),
    );
    const modeTabs = h(
      'div',
      { class: 'row' },
      ...(['parts', 'draw', 'upload'] as SpriteMode[]).map((m) =>
        h('button', { class: this.mode === m ? 'on' : '', onclick: () => ((this.mode = m), this.render()) }, { parts: 'Pick parts', draw: 'Pixel editor', upload: 'Upload image' }[m]),
      ),
    );
    const spriteTools = this.mode === 'parts' ? this.partsPanel() : this.mode === 'draw' ? this.drawPanel() : this.uploadPanel();

    const panel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'row spread' }, h('h1', {}, c.name.trim() ? `Edit ${c.name}` : 'New character'), h('button', { onclick: () => this.actions.cancel() }, 'Cancel')),
      // The look, full width: the preview stays pinned beside the options, so every change shows at once.
      h(
        'div',
        { class: 'box look' },
        h('div', { class: 'look-preview' }, h('h2', {}, 'Look'), preview, modeTabs),
        h('div', { class: 'look-tools' }, spriteTools),
      ),
      h(
        'div',
        { class: 'cols2' },
        h('div', { style: 'display:flex;flex-direction:column;gap:14px;min-width:0' }, this.identityPanel(), this.statsPanel()),
        h('div', { style: 'display:flex;flex-direction:column;gap:14px;min-width:0' }, this.stylesPanel(), this.footer()),
      ),
    );
    // Re-rendering after a change keeps the scroll position (the first show starts at the top).
    this.overlay.show(panel, this.shown);
    this.shown = true;
  }

  private identityPanel(): HTMLElement {
    const c = this.c;
    return h(
      'div',
      { class: 'box', style: 'display:flex;flex-direction:column;gap:10px' },
      h('h2', {}, 'Who'),
      h(
        'label',
        { style: 'display:flex;flex-direction:column;gap:4px' },
        h('span', { class: 'dim' }, 'Name'),
        h('input', {
          id: 'char-name',
          type: 'text',
          maxlength: NAME_MAX,
          value: c.name,
          placeholder: 'e.g. Big Mike',
          oninput: (e: Event) => (c.name = (e.target as HTMLInputElement).value),
        }),
      ),
      h(
        'label',
        { class: 'check' },
        h('input', { id: 'char-master', type: 'checkbox', checked: c.master, onchange: (e: Event) => ((c.master = (e.target as HTMLInputElement).checked), this.render()) }),
        h('span', {}, 'Master '),
        h('span', { class: 'dim' }, '(a title: badge and glowing name, no gameplay effect)'),
      ),
      h('p', {}, 'Shows as ', nameTag(c.name.trim() || 'Name', c.master)),
    );
  }

  private statsPanel(): HTMLElement {
    const c = this.c;
    return h(
      'div',
      { class: 'box', style: 'display:flex;flex-direction:column;gap:8px' },
      h('h2', {}, 'Stats'),
      h('p', { class: 'dim' }, 'Timing matters most; stats nudge results within limits.'),
      ...STAT_KEYS.map((k) => {
        const val = h('span', {}, String(c.stats[k]));
        return h(
          'div',
          {},
          h(
            'div',
            { class: 'stat' },
            h('label', { for: `stat-${k}` }, STAT_INFO[k].label),
            h('input', {
              id: `stat-${k}`,
              type: 'range',
              min: STAT_MIN,
              max: STAT_MAX,
              step: 1,
              value: c.stats[k],
              oninput: (e: Event) => {
                c.stats[k] = Number((e.target as HTMLInputElement).value);
                val.textContent = String(c.stats[k]);
              },
            }),
            val,
          ),
          h('p', { class: 'dim', style: 'font-size:12px;margin-left:98px' }, STAT_INFO[k].effect),
        );
      }),
    );
  }

  private stylesPanel(): HTMLElement {
    const c = this.c;
    const keyHint = ['plain hit key', 'hold Q (Team A) or . (Team B)', 'hold E (Team A) or / (Team B)'];
    const chosen = h(
      'div',
      { style: 'display:flex;flex-direction:column;gap:6px' },
      ...c.hitStyles.map((id, i) =>
        h(
          'div',
          { class: 'row' },
          h('span', { style: 'min-width:150px' }, `${i + 1}. ${getStyle(id).name}`),
          h('span', { class: 'dim', style: 'font-size:12px;flex:1' }, keyHint[i]),
          h('button', { disabled: i === 0, title: 'Move up', onclick: () => (([c.hitStyles[i - 1], c.hitStyles[i]] = [c.hitStyles[i], c.hitStyles[i - 1]]), this.render()) }, '↑'),
          h('button', { disabled: c.hitStyles.length <= MIN_HIT_STYLES, onclick: () => (c.hitStyles.splice(i, 1), this.render()) }, 'Remove'),
        ),
      ),
    );
    const addable = stylesOfKind('hit').filter((s) => !c.hitStyles.includes(s.id));
    return h(
      'div',
      { class: 'box', style: 'display:flex;flex-direction:column;gap:10px' },
      h('h2', {}, 'Hit styles'),
      h('p', { class: 'dim' }, `Pick ${MIN_HIT_STYLES}–${MAX_HIT_STYLES}. The first is the default.`),
      chosen,
      c.hitStyles.length < MAX_HIT_STYLES && addable.length
        ? h('div', { class: 'chips' }, ...addable.map((s) => h('button', { onclick: () => (c.hitStyles.push(s.id), this.render()) }, `+ ${s.name}`)))
        : null,
      h('h2', {}, 'Serve styles'),
      h(
        'div',
        { class: 'chips' },
        ...stylesOfKind('serve').map((s) =>
          h(
            'label',
            { class: 'check' },
            h('input', {
              type: 'checkbox',
              checked: c.serveStyles.includes(s.id),
              onchange: (e: Event) => {
                if ((e.target as HTMLInputElement).checked) c.serveStyles.push(s.id);
                else c.serveStyles = c.serveStyles.filter((x) => x !== s.id);
                this.render();
              },
            }),
            s.name,
          ),
        ),
      ),
    );
  }

  private footer(): HTMLElement {
    const errs = this.errors.length ? h('div', { class: 'error' }, ...this.errors.map((e) => h('p', {}, e))) : null;
    const del = this.actions.remove
      ? this.confirmingDelete
        ? h(
            'div',
            { class: 'row' },
            h('span', { class: 'error' }, `Delete ${this.c.name} for good?`),
            h('button', { class: 'danger', onclick: () => this.actions.remove!() }, 'Yes, delete'),
            h('button', { onclick: () => ((this.confirmingDelete = false), this.render()) }, 'Keep'),
          )
        : h('button', { class: 'danger', onclick: () => ((this.confirmingDelete = true), this.render()) }, 'Delete character')
      : null;
    return h(
      'div',
      { style: 'display:flex;flex-direction:column;gap:10px' },
      errs,
      h(
        'div',
        { class: 'row spread' },
        del ?? h('span'),
        h(
          'button',
          {
            class: 'primary',
            onclick: () => {
              this.c.name = this.c.name.trim();
              this.errors = validateCharacter(this.c);
              if (this.errors.length) return this.render();
              this.actions.save(this.c);
            },
          },
          'Save character',
        ),
      ),
    );
  }

  // --------------------------------------------------------- sprite tools

  /**
   * The parts picker: a tab per group (Body, Face, Hair, Clothes, Extras).
   * Each part shows every option as a thumbnail of this character wearing
   * it (colors as swatches), so the choices can be compared at a glance.
   */
  private partsPanel(): HTMLElement {
    const parts = this.c.sprite.parts as Required<typeof this.c.sprite.parts>;
    const overridden = this.c.sprite.pixels !== null;
    const luma = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    };
    const set = (key: PartKey, i: number) => {
      parts[key] = i;
      this.c.sprite.pixels = null;
      this.render();
    };
    const control = (key: PartKey) => {
      const opts = PART_OPTIONS[key] as readonly string[];
      const v = parts[key];
      let body: HTMLElement;
      if (COLOR_PARTS.includes(key)) {
        // Skin tones show light to dark (they are stored in the order they were added).
        const order = key === 'skin' ? [...opts.keys()].sort((a, b) => luma(opts[b]) - luma(opts[a])) : [...opts.keys()];
        body = h(
          'div',
          { class: 'chips' },
          ...order.map((i) => {
            const b = h('button', { class: v === i ? 'swatch on' : 'swatch', title: opts[i], 'aria-label': `${PART_LABELS[key]} ${i + 1}`, onclick: () => set(key, i) });
            b.style.background = opts[i];
            return b;
          }),
        );
      } else {
        const region = THUMB_REGION[key];
        body = h(
          'div',
          { class: 'thumbs' },
          ...opts.map((name, i) => {
            // Hair thumbnails go hatless, so each style shows; the preview still wears the hat.
            const bare = key === 'hairStyle' ? { headwear: 0 } : {};
            const look = composeSprite({ ...parts, ...bare, [key]: i }, region.back ? 'back' : 'front');
            const img = spriteImage(cropSprite(look, region.y0, region.y1), region.scale, 'sprite');
            return h('button', { class: v === i ? 'thumb on' : 'thumb', title: name, 'aria-label': `${PART_LABELS[key]}: ${name}`, 'aria-pressed': v === i ? 'true' : 'false', onclick: () => set(key, i) }, img, h('span', {}, name));
          }),
        );
      }
      return h('div', { class: 'part' }, h('div', { class: 'row spread' }, h('span', { class: 'part-label' }, PART_LABELS[key]), h('span', { class: 'dim' }, opts[v] && !COLOR_PARTS.includes(key) ? opts[v] : '')), body);
    };
    const g = PART_GROUPS[this.group] ?? PART_GROUPS[0];
    return h(
      'div',
      { style: 'display:flex;flex-direction:column;gap:12px;min-width:0' },
      overridden
        ? h('div', { class: 'row' }, h('span', { class: 'dim' }, 'A custom drawing is showing instead of these parts.'), h('button', { onclick: () => ((this.c.sprite.pixels = null), this.render()) }, 'Use parts'))
        : null,
      h(
        'div',
        { class: 'row spread' },
        h('div', { class: 'tabs', role: 'tablist' }, ...PART_GROUPS.map((grp, i) => h('button', { class: i === this.group ? 'on' : '', role: 'tab', 'aria-selected': i === this.group ? 'true' : 'false', onclick: () => ((this.group = i), this.render()) }, grp.title))),
        h('button', { onclick: () => ((this.c.sprite.parts = randomParts()), (this.c.sprite.pixels = null), this.render()) }, 'Randomize look'),
      ),
      ...g.keys.map(control),
    );
  }

  private drawPanel(): HTMLElement {
    const sprite = this.c.sprite;
    // Start from the current look; it only becomes a custom drawing once you paint.
    const px: Sprite = sprite.pixels ?? composeSprite(sprite.parts);
    const cell = 14;
    const grid = h('canvas', { class: 'pixelgrid', width: SPRITE_W * cell, height: SPRITE_H * cell });
    const ctx = grid.getContext('2d')!;
    const paint = () => {
      ctx.clearRect(0, 0, grid.width, grid.height);
      px.pixels.forEach((col, i) => {
        if (!col) return;
        ctx.fillStyle = col;
        ctx.fillRect((i % px.w) * cell, Math.floor(i / px.w) * cell, cell, cell);
      });
    };
    paint();
    let down = false;
    const at = (e: PointerEvent) => {
      const r = grid.getBoundingClientRect();
      const x = Math.floor(((e.clientX - r.left) / r.width) * px.w);
      const y = Math.floor(((e.clientY - r.top) / r.height) * px.h);
      if (x < 0 || y < 0 || x >= px.w || y >= px.h) return;
      px.pixels[y * px.w + x] = this.brush === 'erase' ? '' : this.brush;
      sprite.pixels = px;
      paint();
    };
    grid.addEventListener('pointerdown', (e) => {
      down = true;
      grid.setPointerCapture(e.pointerId);
      at(e);
    });
    grid.addEventListener('pointermove', (e) => down && at(e));
    grid.addEventListener('pointerup', () => {
      down = false;
      this.render(); // refresh the preview
    });

    const colorInput = h('input', {
      type: 'color',
      value: this.brush === 'erase' ? '#1a1410' : this.brush,
      'aria-label': 'Brush color',
      onchange: (e: Event) => {
        this.brush = (e.target as HTMLInputElement).value;
        this.recent = [this.brush, ...this.recent.filter((c) => c !== this.brush)].slice(0, 10);
        this.render();
      },
    });
    const used = [...new Set(px.pixels.filter(Boolean))].slice(0, 12);
    const swatches = [...new Set([...this.recent, ...used])].slice(0, 16);
    return h(
      'div',
      { class: 'box', style: 'display:flex;flex-direction:column;gap:10px' },
      h('p', { class: 'dim' }, 'Click or drag to paint. Pick a color below, or erase.'),
      grid,
      h(
        'div',
        { class: 'chips' },
        colorInput,
        ...swatches.map((col) => {
          const b = h('button', { class: this.brush === col ? 'swatch on' : 'swatch', title: col, onclick: () => ((this.brush = col), this.render()) });
          b.style.background = col;
          return b;
        }),
        h('button', { class: this.brush === 'erase' ? 'on' : '', onclick: () => ((this.brush = 'erase'), this.render()) }, 'Eraser'),
      ),
      h(
        'div',
        { class: 'row' },
        h('button', { onclick: () => ((sprite.pixels = composeSprite(sprite.parts)), this.render()) }, 'Reset to parts drawing'),
        h('button', { onclick: () => ((sprite.pixels = null), (this.mode = 'parts'), this.render()) }, 'Discard drawing'),
      ),
    );
  }

  private uploadPanel(): HTMLElement {
    const status = h('p', { class: 'dim' }, `Any image works. It is shrunk to ${SPRITE_W}×${SPRITE_H} pixels; a picture with a plain or transparent background works best.`);
    const input = h('input', {
      type: 'file',
      accept: 'image/*',
      onchange: async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        try {
          this.c.sprite.pixels = await imageToSprite(file);
          this.mode = 'draw';
          this.render();
        } catch {
          status.textContent = 'That file could not be read as an image. Try a PNG or JPEG.';
          status.className = 'error';
        }
      },
    });
    return h('div', { class: 'box', style: 'display:flex;flex-direction:column;gap:10px' }, status, input, h('p', { class: 'dim' }, 'After uploading you can touch it up in the pixel editor.'));
  }
}

/** Load an image file, fit it (keeping aspect) into the sprite size with nearest-neighbour scaling, and quantize. */
async function imageToSprite(file: File): Promise<Sprite> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const c = document.createElement('canvas');
    c.width = SPRITE_W;
    c.height = SPRITE_H;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    const s = Math.min(SPRITE_W / img.width, SPRITE_H / img.height);
    const w = img.width * s;
    const hgt = img.height * s;
    ctx.drawImage(img, (SPRITE_W - w) / 2, SPRITE_H - hgt, w, hgt);
    return spriteFromRgba(ctx.getImageData(0, 0, SPRITE_W, SPRITE_H).data, SPRITE_W, SPRITE_H);
  } finally {
    URL.revokeObjectURL(url);
  }
}
