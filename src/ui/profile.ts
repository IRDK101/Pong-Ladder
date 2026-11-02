// "Your profile": who is signed in, their role, and the progress that's
// saved with their account. "Moderator tools" (the game's owner only):
// review submitted characters (edit them first if needed), and manage
// every character in the shared collection.

import type { GameConfig } from '../config';
import type { Character } from '../core/character';
import { characterSprite } from '../core/sprite';
import { getStyle } from '../core/styles';
import { PROFILE_NAME_MAX, type Account, type PlayerSubmissions, type PublicProfile, type Role } from '../data/shared';
import type { AppStore } from '../data/storage';
import { DESIGN_ORDER } from '../render/designs';
import { characterLevel, playerLevel, playerXp } from '../progress/unlocks';
import { levelBar } from './careerView';
import { characterCard, statBars, type CharactersScreen } from './characters';
import { h, spriteImage, type Overlay } from './dom';
import { styledName } from './nameStyle';
import { cleanNameStyle } from '../progress/nameStyles';
import { unpackChar } from '../net/online';
import type { Sprite } from '../core/character';

const ROLE_INFO: Record<Role, { label: string; blurb: string }> = {
  moderator: { label: 'MODERATOR', blurb: 'This is the game’s owner account. You run the shared collection: what you make is added for everyone straight away, you approve new profiles and submitted characters, and you can edit or remove any character.' },
  player: { label: 'PLAYER', blurb: 'Your profile is approved. Your level, unlocks, loot boxes, character levels, cosmetics, the characters you make and your home-screen picks are saved to this account, and you’re on the leaderboard.' },
  pending: { label: 'WAITING FOR APPROVAL', blurb: 'Your profile is waiting for the moderator. Until it’s approved you can play every mode, but games don’t earn XP yet.' },
  unregistered: { label: 'NO PROFILE YET', blurb: 'You can play straight away. To earn XP, level up, unlock tables and characters, and get on the leaderboard, make a profile; the moderator approves new profiles.' },
  viewonly: { label: 'VIEW-ONLY ACCESS', blurb: 'You’re signed in, but you opened the game by a public link from outside the moderator’s claude.ai organization. claude.ai lets these visitors play but never save anything, so you can’t make a profile, earn XP or play online yet. Ask the moderator to invite your email to the game, then open it from that invite (not the public link) and make your profile.' },
  guest: { label: 'GUEST', blurb: 'Not signed in to claude.ai (or the game was opened outside claude.ai). You can play every offline mode; games don’t earn XP. Sign in to claude.ai and open the game again to make a profile.' },
};

/** For the moderator: how to let friends make profiles and play online. */
function inviteHelp(): HTMLElement {
  return h(
    'div',
    { class: 'box', style: 'display:flex;flex-direction:column;gap:6px' },
    h('h2', {}, 'Letting friends in'),
    h('p', { style: 'font-size:13px' }, 'claude.ai only lets people save data and join live play when they’re invited to this game. Someone who opens the public link from outside your organization can play offline, but can’t make a profile or play online, however they’re signed in.'),
    h('p', { class: 'dim', style: 'font-size:13px' }, 'To let a friend in: open the game’s Share menu, invite their email as an Editor, and turn the public link off (claude.ai only lets invited Editors from outside your organization save while there’s no public link). They open the game from the invite, make a profile, and it appears under Moderator tools → Profiles for you to approve. Editors can also publish new versions of the page, so invite people you trust.'),
  );
}

export class ProfileScreen {
  private panel: HTMLElement | null = null;

  constructor(
    private overlay: Overlay,
    private store: AppStore,
    private cfg: GameConfig,
    private account: Account,
    private go: { collection: () => void; characters: () => void; moderator: () => void; edit: () => void; back: () => void },
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
          h('div', { class: 'row' }, h('span', { class: `role-badge role-${a.role}` }, role.label), a.myProfile ? h('span', { style: 'font-size:18px' }, styledName(a.myProfile.name, a.myStyle)) : a.me ? h('span', { class: 'name', style: 'font-size:18px' }, a.me.name || 'Signed in') : h('span', { class: 'name' }, 'Not signed in')),
          a.role !== 'guest' && a.role !== 'viewonly' ? h('span', { class: 'dim' }, a.me?.email ? `Saved to ${a.me.email}` : 'Saved to your claude.ai account (the email you sign in with)') : null,
          h('p', { class: 'dim', style: 'font-size:13px' }, role.blurb),
        ),
        h(
          'div',
          { style: 'display:flex;flex-direction:column;gap:8px' },
          a.myProfile && a.myApproval?.status !== 'revoked' ? h('button', { class: 'primary', onclick: () => this.go.edit() }, 'Edit profile') : null,
          a.role === 'moderator' ? h('button', { class: a.myProfile ? '' : 'primary', onclick: () => this.go.moderator() }, a.pendingCount() + a.pendingProfiles().length ? `Moderator tools · ${a.pendingCount() + a.pendingProfiles().length} to review` : 'Moderator tools') : null,
        ),
      ),
      a.problem ? h('p', { class: 'error' }, a.problem) : null,
      a.profileState === 'refused' ? h('p', { class: 'error' }, 'claude.ai didn’t let this visit save your profile request, so it was not sent. See above for how to get access.') : null,
      a.role === 'moderator' ? inviteHelp() : null,
      this.profileForm(),
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
        h('p', { class: 'dim', style: 'font-size:13px' }, a.role === 'guest' || a.role === 'viewonly' ? 'Everything is in this browser only, and games don’t earn XP.' : 'With your account (any device): level and XP, loot boxes and unlocks, each character’s level and cosmetics, the characters you made, your home-screen picks. XP only counts once your profile is approved.'),
        h('p', { class: 'dim', style: 'font-size:13px' }, 'In this browser only: the match history behind career stats. Back up / restore moves it.'),
      ),
    );
    this.panel = panel;
    this.overlay.show(panel, true);
  }

  private error = '';
  private draftName = '';

  /** Make a profile (or see where it stands). */
  private profileForm(): HTMLElement | null {
    const a = this.account;
    if (a.role === 'moderator' || a.role === 'player' || a.role === 'guest' || a.role === 'viewonly') {
      if ((a.role !== 'player' && a.role !== 'moderator') || !a.myProfile) return null;
      return h('div', { class: 'box row spread' }, h('span', { class: 'row' }, 'Leaderboard name: ', styledName(a.myProfile.name, a.myStyle)), h('button', { onclick: () => this.go.edit() }, 'Change name, character or style'));
    }
    const card = a.myProfile;
    const decision = a.myApproval;
    const input = h('input', { type: 'text', maxlength: String(PROFILE_NAME_MAX), placeholder: 'Name for the leaderboard', value: this.draftName || card?.name || '', 'aria-label': 'Profile name' }) as HTMLInputElement;
    input.addEventListener('input', () => (this.draftName = input.value));
    const send = () => {
      this.error = a.createProfile(input.value) ?? '';
      if (!this.error) this.draftName = '';
      this.show();
    };
    input.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && send());
    const status = !card
      ? null
      : decision?.status === 'rejected'
        ? h('p', { class: 'error' }, `Turned down${decision.note ? `: ${decision.note}` : '.'} You can change the name and ask again.`)
        : decision?.status === 'revoked'
          ? h('p', { class: 'error' }, `The moderator paused your profile${decision.note ? `: ${decision.note}` : '.'}`)
          : a.profileState === 'sending'
            ? h('p', { class: 'dim' }, `Sending “${card.name}” to the moderator…`)
            : h('p', { class: 'ok' }, `Sent to the moderator as “${card.name}”. You’ll start earning XP as soon as they approve it. You can keep playing meanwhile.`);
    return h(
      'div',
      { class: 'box', style: 'display:flex;flex-direction:column;gap:8px;border-color:var(--gold, #e6c45a)' },
      h('h2', {}, card ? 'Your profile request' : 'Make a profile'),
      status,
      decision?.status === 'revoked' ? null : h('div', { class: 'row' }, input, h('button', { class: 'primary', onclick: send }, card ? 'Update request' : 'Ask to join')),
      this.error ? h('p', { class: 'error' }, this.error) : null,
    );
  }
}

/** Everyone with an approved profile, by XP. */
export class LeaderboardScreen {
  private panel: HTMLElement | null = null;

  constructor(
    private overlay: Overlay,
    private account: Account,
    private back: () => void,
    private openProfile: () => void,
    private openEdit: () => void = openProfile,
  ) {}

  private faces = new Map<string, Sprite | null>();
  /** The character a player shows as, small. */
  private face(uid: string, card: PublicProfile): HTMLElement | null {
    const key = `${uid}:${card.updatedAt}`;
    if (!this.faces.has(key)) {
      const c = unpackChar(card.char);
      this.faces.set(key, c ? characterSprite(c.sprite, c.cosmetics.spriteItem ?? null) : null);
    }
    const sp = this.faces.get(key);
    return sp ? spriteImage(sp, 1) : h('span', { style: 'display:inline-block;width:16px;flex:none' });
  }

  isShowing(): boolean {
    return !!this.panel && this.overlay.isOpen() && this.overlay.root.contains(this.panel);
  }

  show(): void {
    const a = this.account;
    const rows = a.leaderboard();
    const me = a.uid;
    const table = rows.length
      ? h(
          'div',
          { class: 'board' },
          h('div', { class: 'board-row head' }, h('span', {}, '#'), h('span', {}, 'Player'), h('span', {}, 'Level'), h('span', {}, 'XP')),
          ...rows.map(({ uid, card }, i) =>
            h(
              'div',
              { class: `board-row${uid === me ? ' me' : ''}${i < 3 ? ` top${i + 1}` : ''}` },
              h('span', { class: 'rank' }, i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1)),
              h('span', { class: 'who' }, this.face(uid, card), styledName(card.name, cleanNameStyle(card.style)), card.moderator ? h('span', { class: 'role-badge role-moderator', style: 'font-size:10px;padding:1px 5px;flex:none' }, 'MOD') : null, uid === me ? h('span', { class: 'dim', style: 'font-size:12px;flex:none' }, 'you') : null),
              h('span', {}, String(card.level)),
              h('span', {}, card.xp.toLocaleString()),
            ),
          ),
        )
      : h('div', { class: 'box' }, h('p', {}, a.mode === 'online' || a.profiles.size ? 'No approved profiles yet.' : 'The leaderboard is online: open the game signed in to claude.ai to see it.'));
    const note =
      a.role === 'player' || a.role === 'moderator'
        ? null
        : h('div', { class: 'box row spread' }, h('span', { class: 'dim' }, a.role === 'pending' ? 'Your profile is waiting for approval: you’ll show up here once it’s approved.' : 'Make a profile to earn XP and get on the board.'), a.role === 'unregistered' || a.role === 'pending' ? h('button', { class: 'primary', onclick: () => this.openProfile() }, 'Your profile') : null);
    const edit = a.myProfile && (a.role === 'player' || a.role === 'moderator') ? h('button', { onclick: () => this.openEdit() }, 'Edit how you appear') : null;
    const panel = h('div', { class: 'panel' }, h('div', { class: 'row spread' }, h('h1', {}, 'Leaderboard'), h('div', { class: 'row' }, edit, h('button', { onclick: () => this.back() }, 'Back to menu'))), h('p', { class: 'dim' }, 'Total XP from every character each player has played. Updates live.'), note, table);
    this.panel = panel;
    this.overlay.show(panel, true);
  }
}

type ModTab = 'profiles' | 'review' | 'collection' | 'powers';

export class ModeratorScreen {
  private tab: ModTab = 'profiles';
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
    const body = this.tab === 'profiles' ? this.players() : this.tab === 'review' ? this.review() : this.tab === 'collection' ? this.collection() : this.powers();
    const waiting = a.pendingProfiles().length;
    const panel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'row spread' }, h('div', { class: 'row' }, h('h1', {}, 'Moderator tools'), h('span', { class: 'role-badge role-moderator' }, 'MODERATOR')), h('button', { onclick: () => this.back() }, 'Back')),
      a.problem ? h('p', { class: 'error' }, a.problem) : null,
      this.note ? h('p', { class: 'ok' }, this.note) : null,
      h('div', { class: 'tabs' }, tabBtn('profiles', waiting ? `Profiles (${waiting} new)` : 'Profiles'), tabBtn('review', pending ? `Characters to review (${pending})` : 'Characters to review'), tabBtn('collection', `Collection (${this.store.characters.sharedList().length})`), tabBtn('powers', 'What you can do')),
      body,
    );
    this.panel = panel;
    this.overlay.show(panel, true);
  }

  // ---------------------------------------------------------- profiles

  private players(): HTMLElement {
    const a = this.account;
    const all = [...a.profiles].filter(([id]) => id !== a.uid);
    if (!all.length) return h('div', { class: 'box' }, h('p', {}, 'No profiles yet. When someone makes one, it shows up here for you to approve.'));
    const order = (id: string) => (!a.approvals.has(id) ? 0 : a.approvals.get(id)!.status === 'approved' ? 1 : 2);
    all.sort(([x], [y]) => order(x) - order(y));
    const row = ([uid, card]: [string, import('../data/shared').PublicProfile]) => {
      const d = a.approvals.get(uid);
      const note = h('input', { type: 'text', placeholder: 'Note (optional)', maxlength: '200' }) as HTMLInputElement;
      const rename = h('input', { type: 'text', value: card.name, maxlength: String(PROFILE_NAME_MAX), 'aria-label': 'Profile name' }) as HTMLInputElement;
      const status = !d ? h('span', { class: 'badge status-pending' }, 'New: waiting for you') : d.status === 'approved' ? h('span', { class: 'badge status-approved' }, 'Approved') : h('span', { class: 'badge status-rejected' }, d.status === 'revoked' ? 'Paused' : 'Turned down');
      const act = (status: 'approved' | 'rejected' | 'revoked', msg: string) => () => {
        a.decideProfile(uid, status, note.value.trim());
        this.note = msg;
        this.show('profiles');
      };
      return h(
        'div',
        { class: 'box card' },
        h('div', { class: 'row spread', style: 'width:100%' }, styledName(card.name, cleanNameStyle(card.style)), status),
        card.renamedFrom ? h('p', { class: 'ok', style: 'font-size:12px' }, `Renamed themselves (was “${card.renamedFrom}”). Rename them back below if needed.`) : null,
        h('p', { class: 'dim', style: 'font-size:12px' }, `Account: ${a.nameOf(uid)} · level ${card.level} · ${card.xp} XP${card.requestedAt ? ` · asked ${new Date(card.requestedAt).toLocaleDateString()}` : ''}`),
        d?.status === 'approved' ? null : note,
        h(
          'div',
          { class: 'row' },
          d?.status !== 'approved' ? h('button', { class: 'primary', onclick: act('approved', `Approved ${card.name}.`) }, 'Approve') : null,
          !d ? h('button', { class: 'danger', onclick: act('rejected', `Turned down ${card.name}.`) }, 'Turn down') : null,
          d?.status === 'approved' ? h('button', { class: 'danger', onclick: act('revoked', `Paused ${card.name}: their games stop earning XP.`) }, 'Pause profile') : null,
        ),
        d?.status === 'approved'
          ? h('div', { class: 'row' }, rename, h('button', { onclick: () => (a.renameProfile(uid, rename.value), (this.note = `Renamed to ${rename.value.trim()}.`), this.show('profiles')) }, 'Rename'))
          : null,
      );
    };
    return h('div', { style: 'display:flex;flex-direction:column;gap:10px' }, h('p', { class: 'dim' }, 'New profiles need your approval before their games earn XP, unlock anything or show on the leaderboard. Pausing stops that again.'), h('div', { class: 'grid wide' }, ...all.map(row)));
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
        'Approve new profiles (only approved profiles earn XP and show on the leaderboard), pause them, or rename them.',
        'Review submitted characters: approve, edit then approve, or turn down with a note.',
        'Edit or remove any character in the collection, including approved ones.',
        'Your own characters are always unlocked for you.',
        'Only your account can write the shared collection or read the review queue.',
      ]),
      row('Players', [
        'Anyone can play straight away. With an approved profile they earn XP, level up, open loot boxes, unlock tables and characters, and appear on the leaderboard.',
        'Make their own characters (saved to their account) and play them right away.',
        'Submit characters for you to review; they see whether each is waiting, approved or turned down.',
        'They can’t change the shared collection or see other players’ submissions.',
      ]),
    );
  }
}
