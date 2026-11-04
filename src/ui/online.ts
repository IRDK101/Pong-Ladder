// "Online match": see who else has it open, challenge them to a 1v1, or
// accept a challenge. The match itself runs from main.ts.

import type { Character } from '../core/character';
import { characterSprite } from '../core/sprite';
import { Lobby, matchRoomName, newMatchId, packChar, setupSig, unpackChar, type LobbyPeer, type MatchSettings, type RoomApi, type RoomLike } from '../net/online';
import { DESIGN_ORDER, DESIGNS } from '../render/designs';
import { VENUE_ORDER, VENUES } from '../render/basement';
import type { TableDesign, Venue } from '../config';
import { h, spriteImage, type Overlay } from './dom';
import { levelOf, SPEED_MID, SPEED_STEPS, speedStepOf } from './menu';
import { styledName } from './nameStyle';
import type { NameStyle } from '../progress/nameStyles';

export interface OnlineStart {
  role: 'host' | 'guest';
  /** The lobby room: the match travels there too (see MatchLink). */
  room: RoomLike;
  mid: string;
  otherPeer: string;
  mine: Character;
  theirs: Character;
  settings: MatchSettings;
  otherName: string;
}

export function settingsLine(s: MatchSettings): string {
  const t = DESIGNS[s.design as TableDesign]?.name ?? 'Table';
  const v = VENUES[s.venue as Venue]?.spot ?? '';
  const speed = `${levelOf(s.speed)} speed`;
  return `${t} · ${v} · ${s.formation === 'tree' ? 'tree (11 cups)' : 'shrub (7 cups)'} · ${speed}${s.ski ? ' · ski collision' : ''}`;
}

export class OnlineScreen {
  private lobby: Lobby | null = null;
  private room: RoomApi | null | undefined = undefined; // undefined: not asked yet
  private panel: HTMLElement | null = null;
  private note = '';

  constructor(
    private overlay: Overlay,
    private deps: {
      /** Who this player is and who they play as. */
      me: () => { name: string; level: number; style: NameStyle; char: Character | null };
      settings: () => MatchSettings;
      /** Characters this player may pick (for the setup screen). */
      characters: () => Character[];
      /** A table's art, as an image URL (setup screen previews). */
      tableArt: (design: string) => string;
      /** Tables this player hasn't unlocked (the challenger can't pick them). */
      tableLocked: (design: string) => boolean;
      /** Show the online screen now (a challenge was accepted while this player was elsewhere). */
      show: () => void;
      /** Why this player can't play online yet (no approved profile), or null. */
      blocked: () => string | null;
      start: (s: OnlineStart) => void;
      back: () => void;
    },
  ) {}

  isShowing(): boolean {
    return !!this.panel && this.overlay.isOpen() && this.overlay.root.contains(this.panel);
  }

  private async ensureRoom(): Promise<RoomApi | null> {
    if (this.room === undefined) {
      const claude = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude;
      this.room = claude?.use ? (((await claude.use('room').catch(() => null)) as RoomApi | null) ?? null) : null;
    }
    return this.room;
  }

  /** Put this player's card in the lobby (once their profile is approved), so challenges reach them from anywhere. */
  async startBackground(): Promise<void> {
    if (this.deps.blocked()) {
      if (this.lobby?.me && !this.playing) this.lobby.close();
      return;
    }
    if (this.lobby?.me) return;
    const room = await this.ensureRoom();
    if (!room || this.deps.blocked()) return;
    if (!this.lobby) this.lobby = new Lobby(room, () => this.onLobby());
    if (this.lobby.me) return;
    const me = this.deps.me();
    this.lastSig = '';
    this.lobby.open({ name: me.name, level: me.level, style: me.style, char: me.char ? packChar(me.char) : null });
  }

  async open(): Promise<void> {
    this.note = '';
    if (this.room === undefined) this.render();
    await this.ensureRoom();
    await this.startBackground();
    this.render();
  }

  /** The player's name, style or character changed: update their lobby card. */
  refreshMe(): void {
    if (!this.lobby?.me || this.playing) return;
    const me = this.deps.me();
    const char = me.char ? packChar(me.char) : null;
    const cur = this.lobby.me;
    if (cur.name === me.name && cur.level === me.level && JSON.stringify(cur.style) === JSON.stringify(me.style) && JSON.stringify(cur.char) === JSON.stringify(char)) return;
    this.lobby.update({ name: me.name, level: me.level, style: me.style, char });
  }

  /** Back to the menu from this screen: the player stays in the lobby. */
  close(): void {
    this.panel = null;
  }

  // ------------------------------------------------------------ for the menu and the end screen

  /** Players in the lobby besides this one, and challenges waiting for this one. */
  status(): { here: number; challenges: number; challenger: string | null } {
    const lb = this.lobby;
    if (!lb?.me) return { here: 0, challenges: 0, challenger: null };
    const inc = lb.incoming();
    return { here: lb.peers().filter((p) => !p.isMe).length, challenges: inc.length, challenger: inc[0]?.card.name ?? null };
  }

  blockedNow(): boolean {
    return !!this.deps.blocked();
  }

  /** A match is on (between begin and matchOver). */
  private playing = false;
  /** Opponents' characters, remembered (a host's card drops its character while it plays). */
  private known = new Map<string, Character>();

  /** The match ended and the player left its end screen. */
  matchOver(): void {
    this.playing = false;
    const lb = this.lobby;
    if (!lb?.me) return;
    const me = this.deps.me();
    const ch = this.chosen ?? me.char;
    lb.update({ status: 'lobby', invite: null, answer: null, setup: null, char: ch ? packChar(ch) : null });
  }

  /** Rematch from the end screen: accept their rematch if they asked, else ask them. */
  rematch(peer: string, settings: MatchSettings): 'accepted' | 'asked' | 'gone' {
    const lb = this.lobby;
    const p = lb?.peers().find((x) => x.peer === peer);
    if (!lb || !p) return 'gone';
    const inv = lb.incoming().find((x) => x.peer === peer);
    if (inv) {
      void this.begin('guest', inv, inv.card.invite!.id, inv.card.invite!.settings);
      return 'accepted';
    }
    if (lb.me?.invite?.to !== peer) lb.update({ invite: { to: peer, id: newMatchId(), settings, re: true }, answer: null });
    return 'asked';
  }

  /** Where a rematch with this opponent stands, for the end screen. */
  rematchState(peer: string): 'none' | 'asked' | 'offered' | 'gone' {
    const lb = this.lobby;
    if (!lb || !lb.peers().some((x) => x.peer === peer)) return 'gone';
    if (lb.incoming().some((x) => x.peer === peer)) return 'offered';
    return lb.me?.invite?.to === peer ? 'asked' : 'none';
  }

  private onLobby(): void {
    const lb = this.lobby;
    if (!lb) return;
    for (const p of lb.peers()) {
      const c = !p.isMe && unpackChar(p.card.char);
      if (c) this.known.set(p.peer, c);
    }
    // Our challenge (or rematch) was answered.
    const ans = lb.answer();
    if (ans) {
      const inv = lb.me!.invite!;
      if (ans.ok && inv.re) return void this.begin('host', ans.from, inv.id, inv.settings);
      if (ans.ok && !this.setup) return this.enterSetup('host', ans.from, inv.id, inv.settings);
      this.note = `${ans.from.card.name} said no this time.`;
      lb.update({ invite: null });
    }
    // Both asked each other at once (two rematch presses): one of the two accepts.
    const mine = lb.me?.invite;
    const me = lb.myPeer;
    const crossed = mine && me ? lb.incoming().find((p) => p.peer === mine.to) : undefined;
    if (crossed && me! < crossed.peer) return void this.begin('guest', crossed, crossed.card.invite!.id, crossed.card.invite!.settings);
    if (this.setup) this.checkSetup();
    // During matches the room updates many times a second: redraw only when the lobby itself changed,
    // so buttons aren't replaced under the player's pointer.
    if (this.isShowing() && this.signature() !== this.lastSig) this.render();
  }

  private lastSig = '';
  private signature(): string {
    const lb = this.lobby;
    if (!lb) return '';
    return JSON.stringify([this.note, lb.error, lb.me, this.setup, this.chosen?.id ?? null, lb.peers().map((p) => [p.peer, p.isMe, p.card])]);
  }

  private async begin(role: 'host' | 'guest', other: LobbyPeer, id: string, settings: MatchSettings): Promise<void> {
    const mine = this.chosen ?? this.deps.me().char;
    const theirs = unpackChar(other.card.char) ?? this.known.get(other.peer) ?? null;
    if (!mine || !theirs) {
      this.note = 'Both players need a character to play online.';
      return this.render();
    }
    this.playing = true;
    const lb = this.lobby!;
    // On the game's own site each match has its own room (only its two players download it); on
    // claude.ai named rooms may not be offered, so the match shares the lobby room there.
    const own = (lb.room as { matchRooms?: boolean }).matchRooms === true;
    const room: RoomLike = own ? await lb.room.join(matchRoomName(id)).catch(() => lb.room) : lb.room;
    // The host's card drops its character while playing, to leave room in its presence for the game state.
    // The host keeps a small setup card saying "go" (the guest starts when it sees it); the terms were agreed already.
    const go = this.setup && role === 'host' ? { setup: { id, with: other.peer, host: true, ready: null, go: true } } : { setup: null };
    this.setup = null;
    lb.update({ status: 'playing', invite: null, ...go, ...(role === 'guest' ? { answer: { to: other.peer, id, ok: true } } : { answer: null, ...(own ? {} : { char: null }) }) });
    this.deps.start({ role, room, mid: id, otherPeer: other.peer, mine, theirs, settings, otherName: other.card.name });
  }

  // ------------------------------------------------------------ the setup screen

  /** The setup this player is in: who with, which match, and the terms as last seen. */
  private setup: { role: 'host' | 'guest'; peer: string; id: string; name: string; terms: MatchSettings; since: number; seen: boolean } | null = null;
  /** The character this player picked on the setup screen (kept for rematches). */
  private chosen: Character | null = null;

  /** A challenge was accepted: both players go to the setup screen. */
  private enterSetup(role: 'host' | 'guest', other: LobbyPeer, id: string, terms: MatchSettings): void {
    const lb = this.lobby;
    if (!lb) return;
    const mine = this.chosen && this.deps.characters().some((c) => c.id === this.chosen!.id) ? this.chosen : this.deps.me().char;
    if (!mine) {
      this.note = 'You need a character to play online.';
      return this.render();
    }
    this.chosen = mine;
    this.note = '';
    this.setup = { role, peer: other.peer, id, name: other.card.name, terms, since: Date.now(), seen: false };
    lb.update({
      invite: null,
      char: packChar(mine),
      setup: { id, with: other.peer, host: role === 'host', ready: null, ...(role === 'host' ? { terms } : {}) },
      ...(role === 'guest' ? { answer: { to: other.peer, id, ok: true } } : { answer: null }),
    });
    this.deps.show();
    this.render();
  }

  /** The other player's card in this setup, if they're in it. */
  private setupOther(): LobbyPeer | undefined {
    const st = this.setup;
    return st ? this.lobby?.peers().find((p) => p.peer === st.peer && p.card.setup?.id === st.id) : undefined;
  }

  /** The signature both Readies must match right now. */
  private currentSig(): string | null {
    const st = this.setup;
    const other = this.setupOther();
    if (!st || !other) return null;
    const mine = this.chosen?.id ?? null;
    const theirs = unpackChar(other.card.char)?.id ?? null;
    return setupSig(st.terms, st.role === 'host' ? mine : theirs, st.role === 'host' ? theirs : mine);
  }

  /** Follow the other player's setup card: their terms (guest), both Readies, and the start. */
  private checkSetup(): void {
    const st = this.setup;
    const lb = this.lobby;
    if (!st || !lb) return; // the match may have just started
    const other = this.setupOther();
    if (!other) {
      // Not arrived yet (a moment after the accept), or gone.
      const gone = !lb.peers().some((p) => p.peer === st.peer);
      if (st.seen || gone || Date.now() - st.since > 15000) this.leaveSetup(`${st.name} left the match setup.`);
      return;
    }
    st.seen = true;
    const theirs = unpackChar(other.card.char);
    if (theirs) this.known.set(other.peer, theirs);
    if (st.role === 'guest') {
      if (other.card.setup!.terms) st.terms = other.card.setup!.terms;
      if (other.card.setup!.go) return void this.begin('guest', other, st.id, st.terms);
    }
    // A Ready that no longer matches the terms and characters is dropped.
    const sig = this.currentSig();
    const mine = lb.me?.setup;
    if (mine?.ready && mine.ready !== sig) lb.update({ setup: { ...mine, ready: null } });
    if (st.role === 'host' && sig && lb.me?.setup?.ready === sig && other.card.setup!.ready === sig) return void this.begin('host', other, st.id, st.terms);
  }

  private leaveSetup(note: string): void {
    this.setup = null;
    this.note = note;
    this.lobby?.update({ setup: null, answer: null, invite: null });
    this.render();
  }

  /** Host: change the terms (un-readies both). */
  private setTerms(patch: Partial<MatchSettings>): void {
    const st = this.setup;
    const lb = this.lobby;
    if (!st || st.role !== 'host' || !lb?.me?.setup) return;
    st.terms = { ...st.terms, ...patch };
    lb.update({ setup: { ...lb.me.setup, terms: st.terms, ready: null } });
  }

  private pickCharacter(c: Character): void {
    const lb = this.lobby;
    if (!lb?.me?.setup) return;
    this.chosen = c;
    lb.update({ char: packChar(c), setup: { ...lb.me.setup, ready: null } });
  }

  private toggleReady(): void {
    const lb = this.lobby;
    const sig = this.currentSig();
    if (!lb?.me?.setup || !sig) return;
    lb.update({ setup: { ...lb.me.setup, ready: lb.me.setup.ready === sig ? null : sig } });
    this.checkSetup();
  }

  private renderSetup(): void {
    const st = this.setup!;
    const lb = this.lobby!;
    const other = this.setupOther();
    const host = st.role === 'host';
    const t = st.terms;
    const me = this.deps.me();
    const sig = this.currentSig();
    const iReady = !!sig && lb.me?.setup?.ready === sig;
    const theyReady = !!sig && other?.card.setup?.ready === sig;
    const theirChar = other ? unpackChar(other.card.char) : null;
    const step = SPEED_STEPS.indexOf(speedStepOf(t.speed));
    const portrait = (c: Character | null) => (c ? spriteImage(characterSprite(c.sprite, c.cosmetics.spriteItem ?? null), 3) : h('div', { class: 'slot-random big' }, '?'));
    // The terms: the challenger edits them; the other player sees them, read-only, as they change.
    const term = (label: string, control: HTMLElement | string) => h('div', { class: 'kv setup-term' }, h('span', { class: 'dim' }, label), typeof control === 'string' ? h('b', {}, control) : control);
    const select = (value: string, options: [string, string, boolean?][], on: (v: string) => void) =>
      h('select', { onchange: (e: Event) => on((e.target as HTMLSelectElement).value) }, ...options.map(([v, label, off]) => h('option', { value: v, selected: v === value, disabled: !!off }, label)));
    const speedLabel = h('b', { class: 'speed-label' }, `${SPEED_STEPS[step].label}${step === SPEED_MID ? ' (realistic)' : ''}`);
    const speed = host
      ? h(
          'div',
          { class: 'col', style: 'gap:2px;min-width:220px' },
          speedLabel,
          h('input', {
            type: 'range',
            min: 0,
            max: SPEED_STEPS.length - 1,
            step: 1,
            value: step,
            'aria-label': 'Speed',
            // The label follows the slider while dragging; the terms change on release.
            oninput: (e: Event) => {
              const k = +(e.target as HTMLInputElement).value;
              speedLabel.textContent = `${SPEED_STEPS[k].label}${k === SPEED_MID ? ' (realistic)' : ''}`;
            },
            onchange: (e: Event) => this.setTerms({ speed: SPEED_STEPS[+(e.target as HTMLInputElement).value].timeScale }),
          }),
          h('div', { class: 'row spread dim', style: 'font-size:11px' }, h('span', {}, 'Relaxed'), h('span', {}, 'Normal'), h('span', {}, 'Masters')),
        )
      : `${SPEED_STEPS[step].label}${step === SPEED_MID ? ' (realistic)' : ''}`;
    const tableName = DESIGNS[t.design as TableDesign]?.name ?? t.design;
    const terms = h(
      'div',
      { class: 'box setup-terms' },
      h('div', { class: 'row spread' }, h('h2', {}, 'The terms'), h('span', { class: 'dim', style: 'font-size:12px' }, host ? 'You set these as the challenger' : `${st.name} sets these`)),
      h('div', { class: 'setup-table' }, h('img', { class: 'table-shot', src: this.deps.tableArt(t.design), alt: tableName }), h('div', { class: 'col', style: 'gap:6px;flex:1;min-width:0' },
        term('Table', host ? select(t.design, DESIGN_ORDER.map((d) => [d, DESIGNS[d].name, this.deps.tableLocked(d)]), (v) => this.setTerms({ design: v })) : tableName),
        term('Spot', host ? select(t.venue, VENUE_ORDER.map((v) => [v, VENUES[v].spot]), (v) => this.setTerms({ venue: v })) : (VENUES[t.venue as Venue]?.spot ?? t.venue)),
        term('Cups', host ? select(t.formation, [['tree', 'Tree · 11 cups'], ['shrub', 'Shrub · 7 cups']], (v) => this.setTerms({ formation: v as 'tree' | 'shrub' })) : t.formation === 'tree' ? 'Tree · 11 cups' : 'Shrub · 7 cups'),
        term('Ski collision', host ? select(t.ski ? 'on' : 'off', [['off', 'Off'], ['on', 'On']], (v) => this.setTerms({ ski: v === 'on' })) : t.ski ? 'On' : 'Off'),
        term('Speed', speed),
      )),
      h('p', { class: 'dim', style: 'font-size:12px' }, '1v1, single game. The challenger serves first as Team A.'),
    );
    // Characters: each picks their own; the other's pick shows live.
    const chars = this.deps.characters();
    const picker = h(
      'div',
      { class: 'pickgrid chars setup-chars' },
      ...chars.map((c, i) =>
        h('button', { class: `pickcard${this.chosen?.id === c.id ? ' on' : ''}`, style: `--i:${i}`, onclick: () => this.pickCharacter(c) }, spriteImage(characterSprite(c.sprite, c.cosmetics.spriteItem ?? null), 2), h('span', { class: 'pickname' }, c.name)),
      ),
    );
    const side = (mine: boolean) => {
      const team = (mine ? host : !host) ? 'A' : 'B';
      const ready = mine ? iReady : theyReady;
      const c = mine ? this.chosen : theirChar;
      return h(
        'div',
        { class: `team-col team${team}${mine ? ' mine' : ''}${ready ? ' ready' : ''}` },
        h('div', { class: 'team-head' }, h('span', {}, `Team ${team} · ${mine ? 'You' : st.name}`), h('span', { class: ready ? 'ok' : 'dim' }, ready ? '✓ Ready' : other || mine ? 'Not ready' : 'Joining…')),
        h('div', { class: 'setup-champ' }, portrait(c), h('div', {}, mine ? styledName(me.name, me.style) : other ? styledName(other.card.name, other.card.style) : h('b', {}, st.name), h('p', { class: 'dim', style: 'font-size:12px' }, c ? `playing as ${c.name}` : '—'))),
      );
    };
    const status = !other
      ? `Waiting for ${st.name} to join the setup…`
      : iReady && theyReady
        ? 'Both ready: starting…'
        : iReady
          ? `You’re ready. Waiting for ${st.name}…`
          : theyReady
            ? `${st.name} is ready. Check the terms and press Ready.`
            : host
              ? 'Set the terms and pick your character, then press Ready. Any change un-readies both players.'
              : `${st.name} sets the terms. Pick your character, then press Ready.`;
    this.put(
      h(
        'div',
        { class: 'panel setup' },
        h('div', { class: 'row spread' }, h('h1', {}, 'Match setup'), h('button', { onclick: () => this.leaveSetup('You left the match setup.') }, 'Leave')),
        h('div', { class: 'lineup' }, side(true), h('div', { class: 'vs-badge' }, 'VS'), side(false)),
        terms,
        h('div', { class: 'box' }, h('h2', {}, 'Your character'), picker),
        h('div', { class: `setup-ready${iReady && theyReady ? ' go' : ''}` }, h('p', { class: iReady && theyReady ? 'ok' : 'dim' }, status), h('button', { class: `primary big${iReady ? ' on' : ''}`, disabled: !other, onclick: () => this.toggleReady() }, iReady ? 'Not ready' : 'Ready')),
      ),
    );
  }

  private challenge(p: LobbyPeer): void {
    if (!this.lobby) return;
    const id = newMatchId();
    this.lobby.update({ invite: { to: p.peer, id, settings: this.deps.settings() }, answer: null });
    this.note = `Challenge sent to ${p.card.name}. Waiting for an answer…`;
    this.render();
  }

  private render(): void {
    const panelHead = h('div', { class: 'row spread' }, h('h1', {}, 'Online match'), h('button', { onclick: () => this.deps.back() }, 'Back to menu'));
    const blocked = this.deps.blocked();
    if (blocked) return this.put(h('div', { class: 'panel' }, panelHead, h('div', { class: 'box', style: 'display:flex;flex-direction:column;gap:6px' }, h('h2', {}, 'Online play needs an approved profile'), h('p', {}, blocked))));
    if (this.room === undefined) return this.put(h('div', { class: 'panel' }, panelHead, h('p', { class: 'dim' }, 'Connecting…')));
    if (!this.room || !this.lobby) {
      return this.put(
        h(
          'div',
          { class: 'panel' },
          panelHead,
          h(
            'div',
            { class: 'box', style: 'display:flex;flex-direction:column;gap:6px' },
            h('h2', {}, 'Online play isn’t available here'),
            h('p', {}, 'Live play needs the game open on claude.ai from an invite. If you opened the public link from outside the moderator’s claude.ai organization, claude.ai doesn’t let this visit connect, even while you’re signed in. Ask the moderator to invite your email, then open the game from that invite. Everything else works offline.'),
          ),
        ),
      );
    }
    const lb = this.lobby;
    this.lastSig = this.signature();
    if (this.setup) return this.renderSetup();
    const me = this.deps.me();
    const myInv = lb.me?.invite ?? null;
    const others = lb.peers().filter((p) => !p.isMe);
    const incoming = lb.incoming();
    const s = this.deps.settings();
    const meCard = h(
      'div',
      { class: 'box lobby-row' },
      h('div', { class: 'row' }, me.char ? spriteImage(characterSprite(me.char.sprite, me.char.cosmetics.spriteItem ?? null), 2) : null, h('div', {}, styledName(me.name, me.style), h('p', { class: 'dim', style: 'font-size:12px' }, `Level ${me.level} · playing as ${me.char?.name ?? '—'} (change it in Edit profile or Players)`))),
      h('p', { class: 'dim', style: 'font-size:12px;max-width:420px' }, `When a challenge is accepted, you both go to a setup screen: the challenger sets the table, spot, cups and speed (starting from their menu settings: ${settingsLine(s)}), each player picks a character, and the match starts when both press Ready. 1v1, single game.`),
    );
    const invites = incoming.map((p) =>
      h(
        'div',
        { class: 'box invite lobby-row' },
        h('div', {}, h('span', { class: 'row', style: 'gap:6px' }, styledName(p.card.name, p.card.style), h('b', {}, p.card.invite!.re ? 'wants a rematch!' : 'challenges you!')), h('p', { class: 'dim', style: 'font-size:12px' }, settingsLine(p.card.invite!.settings))),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'primary', onclick: () => (p.card.invite!.re ? void this.begin('guest', p, p.card.invite!.id, p.card.invite!.settings) : this.enterSetup('guest', p, p.card.invite!.id, p.card.invite!.settings)) }, 'Accept'),
          h('button', { onclick: () => (lb.update({ answer: { to: p.peer, id: p.card.invite!.id, ok: false } }), this.render()) }, 'Decline'),
        ),
      ),
    );
    const list = others.length
      ? others.map((p) => {
          const c = unpackChar(p.card.char);
          const waiting = myInv?.to === p.peer;
          return h(
            'div',
            { class: 'box lobby-row' },
            h('div', { class: 'row' }, c ? spriteImage(characterSprite(c.sprite, c.cosmetics.spriteItem ?? null), 2) : null, h('div', {}, styledName(p.card.name, p.card.style), h('p', { class: 'dim', style: 'font-size:12px' }, `Level ${p.card.level}${c ? ` · ${c.name}` : ''} · ${p.card.status === 'playing' ? 'in a match' : 'in the lobby'}`))),
            waiting
              ? h('div', { class: 'row' }, h('span', { class: 'dim' }, 'Waiting…'), h('button', { onclick: () => (lb.update({ invite: null }), (this.note = 'Challenge cancelled.'), this.render()) }, 'Cancel'))
              : h('button', { class: 'primary', disabled: p.card.status === 'playing' || !!myInv || !me.char, onclick: () => this.challenge(p) }, 'Challenge'),
          );
        })
      : [h('div', { class: 'box' }, h('p', { class: 'dim' }, 'Nobody else has Online match open right now. Keep this screen open: when a friend opens it too, they show up here.'))];
    this.put(
      h(
        'div',
        { class: 'panel' },
        panelHead,
        h('p', { class: 'dim' }, 'Play a friend on another device: you each use your own keyboard. Games earn XP for approved profiles.'),
        this.note ? h('p', { class: 'ok' }, this.note) : null,
        lb.error ? h('p', { class: 'error' }, lb.error) : null,
        !lb.room.connected() ? h('p', { class: 'dim' }, 'Connecting to the live room… (if this stays, reload the page)') : null,
        meCard,
        ...invites,
        h('h2', {}, `Here now (${others.length})`),
        ...list,
      ),
    );
  }

  private put(panel: HTMLElement): void {
    this.panel = panel;
    this.overlay.show(panel, true);
  }
}
