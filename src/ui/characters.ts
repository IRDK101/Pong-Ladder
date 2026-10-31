// Character list and character creator/editor (HTML screens).

import { MAX_HIT_STYLES, MIN_HIT_STYLES, NAME_MAX, newCharacter, validateCharacter, type Character, type Sprite } from '../core/character';
import { characterSprite, COLOR_PARTS, composeSprite, PART_LABELS, PART_OPTIONS, SPRITE_H, SPRITE_W, spriteFromRgba, type PartKey } from '../core/sprite';
import { STAT_INFO, STAT_KEYS, STAT_MAX, STAT_MIN, type Stats } from '../core/stats';
import { getStyle, stylesOfKind } from '../core/styles';
import type { GameConfig } from '../config';
import type { AppStore } from '../data/storage';
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
    private onClose: () => void,
  ) {}

  private progress(): Progress {
    return progressFrom(this.cfg, this.store.matches.list());
  }

  showList(note = ''): void {
    const chars = this.store.characters.list();
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
      h('p', { class: 'dim' }, 'Your friends, recreated. A match drafts 4 different characters from this pool. Stats show here and in the draft, never during play.'),
      note ? h('p', { class: 'ok' }, note) : null,
      chars.length
        ? h(
            'div',
            { class: 'grid' },
            ...chars.map((c) =>
              characterCard(c, prog.characterLevel(c.id).level, [
                h('div', { class: 'row' }, h('button', { onclick: () => this.showProfile(c.id) }, 'Profile'), h('button', { onclick: () => this.edit(structuredClone(c)) }, 'Edit')),
              ]),
            ),
          )
        : h('div', { class: 'box' }, h('p', {}, 'No characters yet. Create your first one with “New character”.')),
    );
    this.overlay.show(panel);
  }

  /** Career stats, level, rewards, and choosing which unlocked cosmetics to wear. */
  showProfile(id: string, note = ''): void {
    const c = this.store.characters.get(id);
    if (!c) return this.showList();
    const prog = this.progress();
    const lvl = prog.characterLevel(id);
    const career = prog.characterCareer(id);
    const save = (msg: string) => {
      c.updatedAt = new Date().toISOString();
      this.store.characters.save(c);
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
        h('div', { class: 'row spread' }, h('h1', {}, `${c.name}`), h('div', { class: 'row' }, h('button', { onclick: () => this.edit(structuredClone(c)) }, 'Edit'), h('button', { onclick: () => this.showList() }, 'All characters'))),
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
            h('p', { class: 'dim' }, 'Levels come from playing (games, wins, sinks, saves, aces, perfect hits) and unlock cosmetics only. Stats never change.'),
            statBars(c.stats),
          ),
        ),
        note ? h('p', { class: 'ok' }, note) : null,
        h('h2', {}, 'Career'),
        careerTable(career),
        h('h2', {}, 'Rewards'),
        equip,
      ),
    );
  }

  edit(c: Character): void {
    new CharacterEditor(this.overlay, c, {
      save: (done) => {
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

class CharacterEditor {
  private mode: SpriteMode;
  private brush = '#1a1410';
  private recent: string[] = ['#1a1410', '#f2f2f2', '#00693e', '#b5332e', '#e8a33d', '#3a8ec9'];
  private confirmingDelete = false;
  private errors: string[] = [];

  constructor(
    private overlay: Overlay,
    private c: Character,
    private actions: { save: (c: Character) => void; cancel: () => void; remove: (() => void) | null },
  ) {
    this.mode = c.sprite.pixels ? 'draw' : 'parts';
  }

  render(): void {
    const c = this.c;
    const preview = h('div', { class: 'box', style: 'display:flex;justify-content:center' }, spriteImage(characterSprite(c.sprite), 8));
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
      h(
        'div',
        { class: 'cols' },
        h('div', { style: 'display:flex;flex-direction:column;gap:12px;min-width:0' }, h('h2', {}, 'Sprite'), preview, modeTabs, spriteTools),
        h('div', { style: 'display:flex;flex-direction:column;gap:14px;min-width:0' }, this.identityPanel(), this.statsPanel(), this.stylesPanel(), this.footer()),
      ),
    );
    this.overlay.show(panel);
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

  private partsPanel(): HTMLElement {
    const parts = this.c.sprite.parts;
    const overridden = this.c.sprite.pixels !== null;
    return h(
      'div',
      { class: 'box', style: 'display:flex;flex-direction:column;gap:10px' },
      overridden
        ? h('div', { class: 'row' }, h('span', { class: 'dim' }, 'A custom drawing is showing instead of these parts.'), h('button', { onclick: () => ((this.c.sprite.pixels = null), this.render()) }, 'Use parts'))
        : null,
      ...(Object.keys(PART_OPTIONS) as PartKey[]).map((key) => {
        const opts = PART_OPTIONS[key] as readonly string[];
        const set = (i: number) => {
          parts[key] = i;
          this.c.sprite.pixels = null;
          this.render();
        };
        const control = COLOR_PARTS.includes(key)
          ? h(
              'div',
              { class: 'chips' },
              ...opts.map((col, i) => {
                const b = h('button', { class: parts[key] === i ? 'swatch on' : 'swatch', title: col, 'aria-label': `${PART_LABELS[key]} ${i + 1}`, onclick: () => set(i) });
                b.style.background = col;
                return b;
              }),
            )
          : h(
              'div',
              { class: 'row' },
              h('button', { 'aria-label': `Previous ${PART_LABELS[key]}`, onclick: () => set((parts[key] - 1 + opts.length) % opts.length) }, '◀'),
              h('span', { style: 'min-width:80px;text-align:center' }, opts[parts[key] % opts.length]),
              h('button', { 'aria-label': `Next ${PART_LABELS[key]}`, onclick: () => set((parts[key] + 1) % opts.length) }, '▶'),
            );
        return h('div', { style: 'display:flex;flex-direction:column;gap:4px' }, h('span', { class: 'dim' }, PART_LABELS[key]), control);
      }),
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
