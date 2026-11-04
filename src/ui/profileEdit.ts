// "Edit profile": the player's leaderboard name, the character they play as,
// and how their name looks (color, effect, flair). Shows a live preview of
// the three places it appears: the leaderboard, the online lobby and the
// home screen.

import type { GameConfig } from '../config';
import type { Character, Sprite } from '../core/character';
import { characterSprite } from '../core/sprite';
import { PROFILE_NAME_MAX, type Account } from '../data/shared';
import { NAME_COLORS, NAME_EFFECTS, NAME_FLAIRS, styleUnlocked, type NameStyle, type StylePart } from '../progress/nameStyles';
import { characterLevel, playerLevel } from '../progress/unlocks';
import { h, spriteImage, type Overlay } from './dom';
import { drawStyledName, styledName } from './nameStyle';

export interface ProfileEditDeps {
  /** The character id the player plays as (null = random). */
  mainId: () => string | null;
  setMain: (id: string | null) => void;
  back: () => void;
}

const PARTS: { part: StylePart; title: string; blurb: string }[] = [
  { part: 'color', title: 'Name color', blurb: 'Solid colors and gradients.' },
  { part: 'effect', title: 'Effect', blurb: 'How the letters are drawn.' },
  { part: 'flair', title: 'Flair', blurb: 'An icon before your name.' },
];

export class ProfileEditor {
  private panel: HTMLElement | null = null;
  private draftName: string | null = null;
  private note = '';
  private error = '';
  private raf = 0;
  private filter = '';

  constructor(
    private overlay: Overlay,
    private cfg: GameConfig,
    private account: Account,
    private deps: ProfileEditDeps,
  ) {}

  isShowing(): boolean {
    return !!this.panel && this.overlay.isOpen() && this.overlay.root.contains(this.panel);
  }

  /** Open fresh (forgets a half-typed name and notes). */
  open(): void {
    this.draftName = null;
    this.note = '';
    this.error = '';
    this.filter = '';
    this.show();
  }

  show(): void {
    cancelAnimationFrame(this.raf);
    const a = this.account;
    const card = a.myProfile;
    const head = h('div', { class: 'row spread' }, h('h1', {}, 'Edit profile'), h('button', { onclick: () => this.deps.back() }, 'Back'));
    if (!card || a.myApproval?.status === 'revoked') {
      const why = !card ? 'Make a profile first (Your profile → Ask to join). Then you can pick your name style and the character you show as.' : 'Your profile is paused by the moderator, so it can’t be changed right now.';
      return this.put(h('div', { class: 'panel' }, head, h('div', { class: 'box' }, h('p', {}, why))));
    }
    const level = playerLevel(this.cfg, a.progress).level;
    const all = a.owner;
    const style = a.myStyle;
    const main = this.mainChar();

    this.put(
      h(
        'div',
        { class: 'panel' },
        head,
        h('p', { class: 'dim' }, 'Changes save straight away and show everywhere you appear: the leaderboard, your home screen and the online lobby. New styles unlock as your player level goes up.'),
        this.note ? h('p', { class: 'ok' }, this.note) : null,
        this.error ? h('p', { class: 'error' }, this.error) : null,
        this.preview(card.name, style, main, level),
        this.nameBox(card.name),
        this.characterBox(main),
        ...PARTS.map((p) => this.styleBox(p.part, p.title, p.blurb, card.name, style, level, all)),
      ),
    );
    this.animate();
  }

  private mainChar(): Character | null {
    const id = this.deps.mainId();
    return (id && this.account.usable().find((c) => c.id === id)) || null;
  }

  private put(panel: HTMLElement): void {
    this.panel = panel;
    this.overlay.show(panel, true);
  }

  // ------------------------------------------------------------ preview

  private homeCanvas: HTMLCanvasElement | null = null;

  private preview(name: string, style: NameStyle, main: Character | null, level: number): HTMLElement {
    const a = this.account;
    const sprite = main ? characterSprite(main.sprite, main.cosmetics.spriteItem ?? null) : null;
    const board = a.leaderboard();
    const rank = a.uid ? board.findIndex((r) => r.uid === a.uid) : -1;
    const xp = a.myProfile?.xp ?? 0;
    const boardRow = h(
      'div',
      { class: 'board-row me' },
      h('span', { class: 'rank' }, rank >= 0 ? (rank < 3 ? ['🥇', '🥈', '🥉'][rank] : String(rank + 1)) : '–'),
      h('span', { class: 'who' }, sprite ? spriteImage(sprite, 1) : null, styledName(name, style)),
      h('span', {}, String(level)),
      h('span', {}, xp.toLocaleString()),
    );
    const lobbyRow = h(
      'div',
      { class: 'box lobby-row' },
      h('div', { class: 'row' }, sprite ? spriteImage(sprite, 2) : null, h('div', {}, styledName(name, style), h('p', { class: 'dim', style: 'font-size:12px' }, `Level ${level}${main ? ` · ${main.name}` : ' · random character'} · in the lobby`))),
      h('button', { class: 'primary', disabled: true }, 'Challenge'),
    );
    this.homeCanvas = h('canvas', { width: 480, height: 54, style: 'width:100%;max-width:480px;height:auto;background:#1b1712;border:2px solid #3a3226' }) as HTMLCanvasElement;
    return h(
      'div',
      { class: 'box preview-stack' },
      h('h2', {}, 'Preview'),
      h('span', { class: 'preview-label' }, rank >= 0 ? 'Leaderboard' : 'Leaderboard (once your profile is approved)'),
      boardRow,
      h('span', { class: 'preview-label' }, 'Online lobby'),
      lobbyRow,
      h('span', { class: 'preview-label' }, 'Home screen'),
      this.homeCanvas,
    );
  }

  /** Redraw the home-screen preview (shine and pulse move). */
  private animate(): void {
    const draw = (t: number) => {
      const cv = this.homeCanvas;
      if (!cv || !this.isShowing() || !cv.isConnected) return;
      const ctx = cv.getContext('2d')!;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.textBaseline = 'middle';
      const a = this.account;
      const level = playerLevel(this.cfg, a.progress).level;
      const w = drawStyledName(ctx, a.displayName, a.myStyle, 14, 28, 'bold 20px monospace', 330, t);
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = '#b8ab92';
      ctx.textAlign = 'left';
      ctx.fillText(`LV ${level}`, 14 + w + 10, 29);
      this.raf = requestAnimationFrame(draw);
    };
    this.raf = requestAnimationFrame(draw);
  }

  // ------------------------------------------------------------ name

  private nameBox(current: string): HTMLElement {
    const a = this.account;
    const approved = a.myApproval?.status === 'approved';
    const input = h('input', { type: 'text', maxlength: String(PROFILE_NAME_MAX), value: this.draftName ?? current, 'aria-label': 'Username', placeholder: 'Your name' }) as HTMLInputElement;
    input.addEventListener('input', () => (this.draftName = input.value));
    const save = () => {
      const was = a.myProfile?.name;
      this.error = a.createProfile(input.value) ?? '';
      this.note = this.error ? '' : a.myProfile?.name === was ? 'That’s already your name.' : `Name changed to ${a.myProfile?.name}.`;
      if (!this.error) this.draftName = null;
      this.show();
    };
    input.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && save());
    return h(
      'div',
      { class: 'box', style: 'display:flex;flex-direction:column;gap:8px' },
      h('h2', {}, 'Username'),
      h('div', { class: 'row' }, input, h('button', { class: 'primary', onclick: save }, 'Save name')),
      h('p', { class: 'dim', style: 'font-size:12px' }, a.owner ? `Up to ${PROFILE_NAME_MAX} characters.` : approved ? `Up to ${PROFILE_NAME_MAX} characters, and no one else can have it. It changes straight away; the moderator can see your old name and change it back.` : 'This updates your profile request.'),
    );
  }

  // ------------------------------------------------------------ character

  private sprites = new Map<string, Sprite>();
  private spriteOf(c: Character): Sprite {
    const key = `${c.id}:${c.updatedAt}:${c.cosmetics.spriteItem ?? ''}`;
    let s = this.sprites.get(key);
    if (!s) this.sprites.set(key, (s = characterSprite(c.sprite, c.cosmetics.spriteItem ?? null)));
    return s;
  }

  private characterBox(main: Character | null): HTMLElement {
    const a = this.account;
    const usable = a.usable();
    const q = this.filter.trim().toLowerCase();
    const shown = q ? usable.filter((c) => c.name.toLowerCase().includes(q)) : usable;
    const pick = (id: string | null) => {
      this.deps.setMain(id);
      const c = id ? usable.find((x) => x.id === id) : null;
      this.note = c ? `You now play as ${c.name}.` : 'You now play as a random character.';
      this.error = '';
      this.show();
    };
    const grid = h(
      'div',
      { class: 'pickgrid chars' },
      h('button', { class: `pickcard${main ? '' : ' on'}`, onclick: () => pick(null) }, h('span', { style: 'font-size:28px;line-height:54px' }, '?'), h('span', { class: 'pickname' }, 'Random')),
      ...shown.map((c) =>
        h(
          'button',
          { class: `pickcard${main?.id === c.id ? ' on' : ''}`, title: c.name, onclick: () => pick(c.id) },
          spriteImage(this.spriteOf(c), 2),
          h('span', { class: 'pickname' }, c.name),
          h('span', { class: 'dim', style: 'font-size:11px' }, `Lv ${characterLevel(this.cfg, a.progress, c.id).level}`),
        ),
      ),
    );
    const search = usable.length > 12 ? (h('input', { type: 'search', placeholder: 'Search characters', value: this.filter, 'aria-label': 'Search characters' }) as HTMLInputElement) : null;
    search?.addEventListener('input', () => {
      this.filter = search.value;
      const pos = search.selectionStart;
      this.show();
      const again = this.panel?.querySelector<HTMLInputElement>('input[type=search]');
      again?.focus();
      if (again && pos !== null) again.setSelectionRange(pos, pos);
    });
    return h(
      'div',
      { class: 'box', style: 'display:flex;flex-direction:column;gap:8px' },
      h('div', { class: 'row spread' }, h('h2', {}, 'Playing as'), h('span', { class: 'dim', style: 'font-size:12px' }, main ? main.name : 'Random')),
      h('p', { class: 'dim', style: 'font-size:12px' }, 'Your character in quick and online matches, shown next to your name. (In 2v2 this is your first spot; the home screen’s Players row sets both.)'),
      search,
      grid,
    );
  }

  // ------------------------------------------------------------ style

  private styleBox(part: StylePart, title: string, blurb: string, name: string, style: NameStyle, level: number, all: boolean): HTMLElement {
    const opts = part === 'color' ? NAME_COLORS : part === 'effect' ? NAME_EFFECTS : NAME_FLAIRS;
    const have = opts.filter((o) => styleUnlocked(part, o.id, level, all)).length;
    const sample = name.length > 12 ? `${name.slice(0, 11)}…` : name;
    const grid = h(
      'div',
      { class: 'style-grid' },
      ...opts.map((o) => {
        const open = styleUnlocked(part, o.id, level, all);
        const next = { ...style, [part]: o.id } as NameStyle;
        const colors = part === 'color' ? (o as (typeof NAME_COLORS)[number]).colors : null;
        return h(
          'button',
          {
            class: `style-opt${style[part] === o.id ? ' on' : ''}`,
            disabled: !open,
            title: open ? o.label : `Unlocks at player level ${o.level}`,
            onclick: () => {
              this.error = this.account.setNameStyle(next) ?? '';
              this.note = this.error ? '' : `${title}: ${o.label}.`;
              this.show();
            },
          },
          colors ? h('span', { class: 'style-bar', style: `background:${colors.length > 1 ? `linear-gradient(90deg, ${colors.join(', ')})` : colors[0]}` }) : null,
          styledName(sample, next),
          h('small', {}, open ? o.label : `🔒 ${o.label} · Lv ${o.level}`),
        );
      }),
    );
    return h('div', { class: 'box', style: 'display:flex;flex-direction:column;gap:8px' }, h('div', { class: 'row spread' }, h('h2', {}, title), h('span', { class: 'dim', style: 'font-size:12px' }, `${blurb} ${have} / ${opts.length} unlocked`)), grid);
  }
}
