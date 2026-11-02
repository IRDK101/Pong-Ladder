// "Your profile": who is signed in, their role, and the progress that's
// saved with their account. "Moderator tools" (the game's owner only):
// review submitted characters (edit them first if needed), and manage
// every character in the shared collection.

import type { GameConfig } from '../config';
import type { Character } from '../core/character';
import { characterSprite } from '../core/sprite';
import { getStyle } from '../core/styles';
import type { Account, PlayerSubmissions } from '../data/shared';
import type { AppStore } from '../data/storage';
import { DESIGN_ORDER } from '../render/designs';
import { characterLevel, playerLevel, playerXp } from '../progress/unlocks';
import { levelBar } from './careerView';
import { characterCard, statBars, type CharactersScreen } from './characters';
import { h, spriteImage, type Overlay } from './dom';

const ROLE_INFO = {
  moderator: { label: 'MODERATOR', blurb: 'This is the game’s owner account. You run the shared collection: what you make is added for everyone straight away, you approve or turn down what players submit, and you can edit or remove any character.' },
  player: { label: 'PLAYER', blurb: 'Your level, unlocks, loot boxes, character levels, cosmetics, the characters you make and your home-screen picks are saved to this account. Open the game signed in on any device and it is all there.' },
  guest: { label: 'GUEST', blurb: 'Not signed in here (or the game is open outside claude.ai), so everything is kept in this browser only. Open the game’s link while signed in to claude.ai to save your progress to your account.' },
} as const;

export class ProfileScreen {
  private panel: HTMLElement | null = null;

  constructor(
    private overlay: Overlay,
    private store: AppStore,
    private cfg: GameConfig,
    private account: Account,
    private go: { collection: () => void; characters: () => void; moderator: () => void; back: () => void },
  ) {}

  isShowing(): boolean {
    return !!this.panel && this.overlay.isOpen() && this.overlay.root.contains(this.panel);
  }

  show(): void {
    const a = this.account;
    const role = ROLE_INFO[a.role];
    const lvl = playerLevel(this.cfg, a.progress);
    const shared = this.store.characters.sharedList();
    const unlocked = shared.filter((c) => a.canUse(c.id)).length;
    const own = this.store.characters.localList().length;
    const subs = Object.values(a.mySubmissions);
    const stat = (k: string, v: string | number) => h('div', { class: 'box stat-tile' }, h('span', { class: 'dim' }, k), h('b', {}, String(v)));
    const panel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'row spread' }, h('h1', {}, a.role === 'moderator' ? 'Moderator profile' : 'Your profile'), h('button', { onclick: () => this.go.back() }, 'Back to menu')),
      h(
        'div',
        { class: 'box profile-head' },
        h(
          'div',
          { style: 'display:flex;flex-direction:column;gap:6px;flex:1;min-width:220px' },
          h('div', { class: 'row' }, h('span', { class: `role-badge role-${a.role}` }, role.label), a.me ? h('span', { class: 'name', style: 'font-size:18px' }, a.me.name || 'Signed in') : h('span', { class: 'name' }, 'Not signed in')),
          a.role !== 'guest' ? h('span', { class: 'dim' }, a.me?.email ? `Saved to ${a.me.email}` : 'Saved to your claude.ai account (the email you sign in with)') : null,
          h('p', { class: 'dim', style: 'font-size:13px' }, role.blurb),
        ),
        a.role === 'moderator' ? h('button', { class: 'primary', onclick: () => this.go.moderator() }, a.pendingCount() ? `Moderator tools · ${a.pendingCount()} to review` : 'Moderator tools') : null,
      ),
      a.problem ? h('p', { class: 'error' }, a.problem) : null,
      h('div', { class: 'box', style: 'display:flex;flex-direction:column;gap:8px' }, h('h2', {}, 'Player level'), levelBar(lvl), h('p', { class: 'dim', style: 'font-size:12px' }, `${playerXp(a.progress)} XP in total from all your characters.`)),
      h(
        'div',
        { class: 'tiles' },
        stat('Loot boxes to open', a.allUnlocked() ? `${a.boxes()} (saved)` : a.boxes()),
        stat('Tables unlocked', `${DESIGN_ORDER.filter((d) => a.tableUnlocked(d)).length} / ${DESIGN_ORDER.length}`),
        stat('Characters unlocked', shared.length ? `${unlocked} / ${shared.length}` : '—'),
        stat('Characters you made', own),
        a.role === 'player' ? stat('Submitted', subs.length ? `${subs.filter((s) => s.status === 'approved').length} approved · ${subs.filter((s) => s.status === 'pending').length} waiting` : 'none yet') : null,
        stat('New rewards', a.newRewards()),
      ),
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => this.go.collection() }, 'Collection'), h('button', { onclick: () => this.go.characters() }, 'Characters')),
      h(
        'div',
        { class: 'box', style: 'display:flex;flex-direction:column;gap:6px' },
        h('h2', {}, 'What is saved where'),
        h('p', { class: 'dim', style: 'font-size:13px' }, a.role === 'guest' ? 'Everything below is in this browser only.' : 'With your account (any device): level and XP, loot boxes and unlocks, each character’s level and cosmetics, the characters you made, your home-screen picks.'),
        h('p', { class: 'dim', style: 'font-size:13px' }, 'In this browser only: local players for a shared keyboard (Players screen) and the match history behind career stats. Back up / restore moves those.'),
      ),
    );
    this.panel = panel;
    this.overlay.show(panel, true);
  }
}

type ModTab = 'review' | 'collection' | 'powers';

export class ModeratorScreen {
  private tab: ModTab = 'review';
  private note = '';
  private panel: HTMLElement | null = null;

  constructor(
    private overlay: Overlay,
    private store: AppStore,
    private cfg: GameConfig,
    private account: Account,
    private characters: CharactersScreen,
    private back: () => void,
  ) {}

  isShowing(): boolean {
    return !!this.panel && this.overlay.isOpen() && this.overlay.root.contains(this.panel);
  }

  show(tab: ModTab = this.tab): void {
    this.tab = tab;
    const a = this.account;
    if (a.role !== 'moderator') {
      this.overlay.show(h('div', { class: 'panel' }, h('div', { class: 'row spread' }, h('h1', {}, 'Moderator tools'), h('button', { onclick: () => this.back() }, 'Back')), h('div', { class: 'box' }, h('p', {}, 'Only the game’s owner can use the moderator tools.'))));
      return;
    }
    const pending = a.pendingCount();
    const tabBtn = (t: ModTab, label: string) => h('button', { class: this.tab === t ? 'on' : '', onclick: () => ((this.note = ''), this.show(t)) }, label);
    const body = this.tab === 'review' ? this.review() : this.tab === 'collection' ? this.collection() : this.powers();
    const panel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'row spread' }, h('div', { class: 'row' }, h('h1', {}, 'Moderator tools'), h('span', { class: 'role-badge role-moderator' }, 'MODERATOR')), h('button', { onclick: () => this.back() }, 'Back')),
      a.problem ? h('p', { class: 'error' }, a.problem) : null,
      this.note ? h('p', { class: 'ok' }, this.note) : null,
      h('div', { class: 'tabs' }, tabBtn('review', pending ? `Review (${pending})` : 'Review'), tabBtn('collection', `Collection (${this.store.characters.sharedList().length})`), tabBtn('powers', 'What you can do')),
      body,
    );
    this.panel = panel;
    this.overlay.show(panel, true);
  }

  // ------------------------------------------------------------ review

  private review(): HTMLElement {
    const a = this.account;
    if (!a.allSubmissions.length) return h('div', { class: 'box' }, h('p', {}, 'No submissions yet. When players submit characters, they show up here.'));
    const order = { pending: 0, rejected: 1, approved: 2 } as const;
    const group = (s: PlayerSubmissions) => {
      const items = Object.entries(s.items).sort(([, x], [, y]) => order[x.status] - order[y.status]);
      return h(
        'div',
        { style: 'display:flex;flex-direction:column;gap:8px' },
        h('h2', {}, `From ${s.name || 'a player'}`),
        h(
          'div',
          { class: 'grid' },
          ...items.map(([id, sub]) => {
            const c = sub.character;
            const noteInput = h('input', { type: 'text', placeholder: 'Note for the player (optional)', maxlength: '200' }) as HTMLInputElement;
            const approve = (edited?: Character) => {
              a.approve(s.uid, id, edited);
              this.note = `Added ${(edited ?? c).name} to the collection.`;
              this.show('review');
            };
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
                sub.status !== 'approved' ? h('button', { class: 'primary', onclick: () => approve() }, 'Approve') : null,
                sub.status !== 'approved'
                  ? h('button', { title: 'Fix the name, stats or look, then approve', onclick: () => this.characters.editWith(c, (done) => approve(done), () => this.show('review')) }, 'Edit, then approve')
                  : null,
                sub.status === 'pending' ? h('button', { class: 'danger', onclick: () => (a.reject(s.uid, id, noteInput.value.trim()), (this.note = `Turned down ${c.name}.`), this.show('review')) }, 'Turn down') : null,
              ),
            );
          }),
        ),
      );
    };
    return h('div', { style: 'display:flex;flex-direction:column;gap:14px' }, h('p', { class: 'dim' }, 'Approving adds the character to the shared collection: everyone else unlocks it from loot boxes, and the player who made it always has it. Edit first to fix a name, stats or look.'), ...a.allSubmissions.map(group));
  }

  // -------------------------------------------------------- collection

  private collection(): HTMLElement {
    const a = this.account;
    const all = this.store.characters.sharedList();
    if (!all.length) return h('div', { class: 'box' }, h('p', {}, 'The shared collection is empty. Characters you make in Characters are added here.'));
    const card = (c: Character) => {
      const creator = a.creators.get(c.id);
      const byline = creator ? `Made by ${a.nameOf(creator)} · approved` : 'Made by you';
      let confirming = false;
      const del = h('button', { class: 'danger' }, 'Remove') as HTMLButtonElement;
      del.onclick = () => {
        if (!confirming) {
          confirming = true;
          del.textContent = 'Really remove for everyone?';
          return;
        }
        this.store.characters.remove(c.id);
        this.note = `Removed ${c.name} from the collection.`;
        this.show('collection');
      };
      return characterCard(this.store.characters.get(c.id) ?? c, characterLevel(this.cfg, a.progress, c.id).level, [
        h('p', { class: 'dim', style: 'font-size:12px' }, byline),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            {
              onclick: () =>
                this.characters.editWith(
                  this.store.characters.get(c.id) ?? c,
                  (done) => {
                    this.store.characters.save(done);
                    this.note = `Saved ${done.name} for everyone.`;
                    this.show('collection');
                  },
                  () => this.show('collection'),
                ),
            },
            'Edit',
          ),
          del,
        ),
      ]);
    };
    return h(
      'div',
      { style: 'display:flex;flex-direction:column;gap:10px' },
      h('p', { class: 'dim' }, 'Every character in the shared collection. Edits and removals apply for everyone straight away. Removing a player’s character takes it out of the collection; they keep their own copy.'),
      h('div', { class: 'grid' }, ...all.map(card)),
    );
  }

  private powers(): HTMLElement {
    const row = (who: string, what: string[]) => h('div', { class: 'box', style: 'display:flex;flex-direction:column;gap:6px' }, h('h2', {}, who), h('ul', { class: 'powers' }, ...what.map((w) => h('li', {}, w))));
    return h(
      'div',
      { class: 'cols2' },
      row('Moderator (you)', [
        'Characters you make or edit go into the shared collection for everyone, straight away.',
        'Review submissions: approve, edit then approve, or turn down with a note.',
        'Edit or remove any character in the collection, including approved ones.',
        'Your own characters are always unlocked for you.',
        'Only your account can write the shared collection or read the review queue.',
      ]),
      row('Players', [
        'Level up, open loot boxes, and unlock tables and characters, saved to their account.',
        'Make their own characters (saved to their account) and play them right away.',
        'Submit characters for you to review; they see whether each is waiting, approved or turned down.',
        'They can’t change the shared collection or see other players’ submissions.',
      ]),
    );
  }
}
