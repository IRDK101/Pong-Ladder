// "Online match": see who else has it open, challenge them to a 1v1, or
// accept a challenge. The match itself runs from main.ts.

import type { Character } from '../core/character';
import { characterSprite } from '../core/sprite';
import { Lobby, matchRoomName, newMatchId, packChar, unpackChar, type LobbyPeer, type MatchSettings, type RoomApi, type RoomLike } from '../net/online';
import { DESIGNS } from '../render/designs';
import { VENUES } from '../render/basement';
import type { TableDesign, Venue } from '../config';
import { h, spriteImage, type Overlay } from './dom';
import { levelOf } from './menu';
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
    lb.update({ status: 'lobby', invite: null, answer: null, char: me.char ? packChar(me.char) : null });
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
    if (lb.me?.invite?.to !== peer) lb.update({ invite: { to: peer, id: newMatchId(), settings }, answer: null });
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
      if (ans.ok) return void this.begin('host', ans.from, inv.id, inv.settings);
      this.note = `${ans.from.card.name} said no this time.`;
      lb.update({ invite: null });
    }
    // Both asked each other at once (two rematch presses): one of the two accepts.
    const mine = lb.me?.invite;
    const me = lb.myPeer;
    const crossed = mine && me ? lb.incoming().find((p) => p.peer === mine.to) : undefined;
    if (crossed && me! < crossed.peer) return void this.begin('guest', crossed, crossed.card.invite!.id, crossed.card.invite!.settings);
    // During matches the room updates many times a second: redraw only when the lobby itself changed,
    // so buttons aren't replaced under the player's pointer.
    if (this.isShowing() && this.signature() !== this.lastSig) this.render();
  }

  private lastSig = '';
  private signature(): string {
    const lb = this.lobby;
    if (!lb) return '';
    return JSON.stringify([this.note, lb.error, lb.me, lb.peers().map((p) => [p.peer, p.isMe, p.card])]);
  }

  private async begin(role: 'host' | 'guest', other: LobbyPeer, id: string, settings: MatchSettings): Promise<void> {
    const mine = this.deps.me().char;
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
    lb.update({ status: 'playing', invite: null, ...(role === 'guest' ? { answer: { to: other.peer, id, ok: true } } : { answer: null, ...(own ? {} : { char: null }) }) });
    this.deps.start({ role, room, mid: id, otherPeer: other.peer, mine, theirs, settings, otherName: other.card.name });
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
    const me = this.deps.me();
    const myInv = lb.me?.invite ?? null;
    const others = lb.peers().filter((p) => !p.isMe);
    const incoming = lb.incoming();
    const s = this.deps.settings();
    const meCard = h(
      'div',
      { class: 'box lobby-row' },
      h('div', { class: 'row' }, me.char ? spriteImage(characterSprite(me.char.sprite, me.char.cosmetics.spriteItem ?? null), 2) : null, h('div', {}, styledName(me.name, me.style), h('p', { class: 'dim', style: 'font-size:12px' }, `Level ${me.level} · playing as ${me.char?.name ?? '—'} (change it in Edit profile or Playing as)`))),
      h('p', { class: 'dim', style: 'font-size:12px;max-width:420px' }, `Your challenges use your menu settings: ${settingsLine(s)}. 1v1, single game. You serve first from Team A; they play Team B on their device.`),
    );
    const invites = incoming.map((p) =>
      h(
        'div',
        { class: 'box invite lobby-row' },
        h('div', {}, h('span', { class: 'row', style: 'gap:6px' }, styledName(p.card.name, p.card.style), h('b', {}, 'challenges you!')), h('p', { class: 'dim', style: 'font-size:12px' }, settingsLine(p.card.invite!.settings))),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'primary', onclick: () => void this.begin('guest', p, p.card.invite!.id, p.card.invite!.settings) }, 'Accept'),
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
