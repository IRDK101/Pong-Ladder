// "Online match": see who else has it open, challenge them to a 1v1, or
// accept a challenge. The match itself runs from main.ts.

import type { Character } from '../core/character';
import { characterSprite } from '../core/sprite';
import { Lobby, matchRoomName, newMatchId, packChar, unpackChar, type LobbyPeer, type MatchSettings, type RoomApi, type RoomLike } from '../net/online';
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
    lb.update({ status: 'lobby', invite: null, answer: null, char: ch ? packChar(ch) : null });
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
      if (ans.ok) return void this.begin('host', ans.from, inv.id, inv.settings);
      this.note = `${ans.from.card.name} said no this time.`;
      lb.update({ invite: null });
    }
    // Both asked each other at once (two rematch presses): one of the two accepts.
    const mine = lb.me?.invite;
    const me = lb.myPeer;
    const crossed = mine && me ? lb.incoming().find((p) => p.peer === mine.to) : undefined;
    if (crossed && me! < crossed.peer) return void this.begin('guest', crossed, crossed.card.invite!.id, crossed.card.invite!.settings);
    // The challenge being looked at was taken back.
    const st = this.setup;
    if (st?.mode === 'accept' && !lb.incoming().some((x) => x.peer === st.peer && x.card.invite?.id === st.id)) {
      this.setup = null;
      this.note = `${st.name} took the challenge back.`;
    }
    // During matches the room updates many times a second: redraw only when the lobby itself changed,
    // so buttons aren't replaced under the player's pointer.
    if (this.isShowing() && this.signature() !== this.lastSig) this.render();
  }

  private lastSig = '';
  private signature(): string {
    const lb = this.lobby;
    if (!lb) return '';
    return JSON.stringify([this.note, lb.error, lb.me, this.setup?.mode ?? null, this.setup?.peer ?? null, lb.peers().map((p) => [p.peer, p.isMe, p.card])]);
  }

  private async begin(role: 'host' | 'guest', other: LobbyPeer, id: string, settings: MatchSettings): Promise<void> {
    // Only once per match: on the game's own site the room join below waits, and lobby updates keep coming meanwhile.
    if (this.starting) return;
    const mine = this.myPick();
    const theirs = unpackChar(other.card.char) ?? this.known.get(other.peer) ?? null;
    if (!mine || !theirs) {
      this.note = 'Both players need a character to play online.';
      return this.render();
    }
    this.playing = true;
    this.starting = true;
    this.setup = null;
    const lb = this.lobby!;
    // On the game's own site each match has its own room (only its two players download it); on
    // claude.ai named rooms may not be offered, so the match shares the lobby room there.
    const own = (lb.room as { matchRooms?: boolean }).matchRooms === true;
    const room: RoomLike = own ? await lb.room.join(matchRoomName(id)).catch(() => lb.room) : lb.room;
    // The guest's answer carries its character (the host reads it from the card). The host's card drops its
    // character while playing on claude.ai, to leave room in its presence for the game state.
    lb.update({ status: 'playing', invite: null, ...(role === 'guest' ? { answer: { to: other.peer, id, ok: true }, char: packChar(mine) } : { answer: null, ...(own ? {} : { char: null }) }) });
    this.chosen = mine;
    this.starting = false;
    this.deps.start({ role, room, mid: id, otherPeer: other.peer, mine, theirs, settings, otherName: other.card.name });
  }

  // ------------------------------------------------------------ the challenge screens

  /**
   * The challenge screen: `send` while the challenger sets the terms (table,
   * spot, cups, speed, ski) and picks a character before sending; `accept` while
   * the challenged player looks the terms over and picks their own character.
   */
  private setup: { mode: 'send' | 'accept'; peer: string; name: string; id: string; terms: MatchSettings } | null = null;
  /** The character this player picked for their last match (kept for rematches). */
  private chosen: Character | null = null;
  /** A match is starting (begin() is waiting for its room): never start it twice. */
  private starting = false;

  /** This player's pick, or their usual character. */
  private myPick(): Character | null {
    return this.chosen && this.deps.characters().some((c) => c.id === this.chosen!.id) ? this.chosen : this.deps.me().char;
  }

  /** Challenge: first set the terms and pick a character. */
  private challenge(p: LobbyPeer): void {
    if (!this.lobby) return;
    this.chosen = this.myPick();
    this.note = '';
    this.setup = { mode: 'send', peer: p.peer, name: p.card.name, id: newMatchId(), terms: this.deps.settings() };
    this.render();
  }

  /** Send the challenge on these terms, with this character. */
  private sendChallenge(): void {
    const st = this.setup;
    const lb = this.lobby;
    if (!st || st.mode !== 'send' || !lb || !this.chosen) return;
    const there = lb.peers().find((x) => x.peer === st.peer);
    if (!there || there.card.status === 'playing') {
      this.setup = null;
      this.note = there ? `${st.name} just started another match.` : `${st.name} left the lobby.`;
      return this.render();
    }
    lb.update({ invite: { to: st.peer, id: st.id, settings: st.terms }, answer: null, char: packChar(this.chosen) });
    this.setup = null;
    this.note = `Challenge sent to ${st.name}. Waiting for an answer…`;
    this.render();
  }

  /** A challenge came in: look the terms over and pick a character. */
  private openAccept(p: LobbyPeer): void {
    const inv = p.card.invite;
    if (!inv) return;
    this.chosen = this.myPick();
    this.note = '';
    this.setup = { mode: 'accept', peer: p.peer, name: p.card.name, id: inv.id, terms: inv.settings };
    this.render();
  }

  /** Accept with the picked character: the match starts. */
  private acceptChallenge(): void {
    const st = this.setup;
    const lb = this.lobby;
    if (!st || st.mode !== 'accept' || !lb) return;
    const p = lb.incoming().find((x) => x.peer === st.peer && x.card.invite?.id === st.id);
    if (!p) {
      this.setup = null;
      this.note = `${st.name} took the challenge back.`;
      return this.render();
    }
    this.setup = null;
    void this.begin('guest', p, st.id, st.terms);
  }

  private decline(peer: string, id: string): void {
    this.setup = null;
    this.lobby?.update({ answer: { to: peer, id, ok: false } });
    this.render();
  }

  private renderSetup(): void {
    const st = this.setup!;
    const lb = this.lobby!;
    const send = st.mode === 'send';
    const other = lb.peers().find((x) => x.peer === st.peer);
    const t = st.terms;
    const me = this.deps.me();
    const theirChar = other ? unpackChar(other.card.char) : null;
    const step = SPEED_STEPS.indexOf(speedStepOf(t.speed));
    const speedName = (k: number) => `${SPEED_STEPS[k].label}${k === SPEED_MID ? ' (realistic)' : ''}`;
    const setTerms = (patch: Partial<MatchSettings>) => {
      st.terms = { ...st.terms, ...patch };
      this.render();
    };
    const portrait = (c: Character | null) => (c ? spriteImage(characterSprite(c.sprite, c.cosmetics.spriteItem ?? null), 3) : h('div', { class: 'slot-random big' }, '?'));
    // The terms: the challenger edits them; the challenged player reads them.
    const term = (label: string, control: HTMLElement | string) => h('div', { class: 'kv setup-term' }, h('span', { class: 'dim' }, label), typeof control === 'string' ? h('b', {}, control) : control);
    const select = (label: string, value: string, options: [string, string, boolean?][], on: (v: string) => void) =>
      h('select', { 'aria-label': label, onchange: (e: Event) => on((e.target as HTMLSelectElement).value) }, ...options.map(([v, name, off]) => h('option', { value: v, selected: v === value, disabled: !!off }, name)));
    const speedLabel = h('b', { class: 'speed-label' }, speedName(step));
    const speed = send
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
            oninput: (e: Event) => {
              const k = +(e.target as HTMLInputElement).value;
              speedLabel.textContent = speedName(k);
              st.terms = { ...st.terms, speed: SPEED_STEPS[k].timeScale };
            },
          }),
          h('div', { class: 'row spread dim', style: 'font-size:11px' }, h('span', {}, 'Relaxed'), h('span', {}, 'Normal'), h('span', {}, 'Masters')),
        )
      : speedName(step);
    const tableName = DESIGNS[t.design as TableDesign]?.name ?? t.design;
    const cups = (f: string) => (f === 'tree' ? 'Tree · 11 cups' : 'Shrub · 7 cups');
    const terms = h(
      'div',
      { class: 'box setup-terms' },
      h('div', { class: 'row spread' }, h('h2', {}, 'The terms'), h('span', { class: 'dim', style: 'font-size:12px' }, send ? 'You set these as the challenger' : `Set by ${st.name}`)),
      h(
        'div',
        { class: 'setup-table' },
        h('img', { class: 'table-shot', src: this.deps.tableArt(t.design), alt: tableName }),
        h(
          'div',
          { class: 'col', style: 'gap:6px;flex:1;min-width:0' },
          term('Table', send ? select('Table', t.design, DESIGN_ORDER.map((d) => [d, DESIGNS[d].name, this.deps.tableLocked(d)]), (v) => setTerms({ design: v })) : tableName),
          term('Spot', send ? select('Spot', t.venue, VENUE_ORDER.map((v) => [v, VENUES[v].spot]), (v) => setTerms({ venue: v })) : (VENUES[t.venue as Venue]?.spot ?? t.venue)),
          term('Cups', send ? select('Cups', t.formation, [['tree', cups('tree')], ['shrub', cups('shrub')]], (v) => setTerms({ formation: v as 'tree' | 'shrub' })) : cups(t.formation)),
          term('Ski collision', send ? select('Ski collision', t.ski ? 'on' : 'off', [['off', 'Off'], ['on', 'On']], (v) => setTerms({ ski: v === 'on' })) : t.ski ? 'On' : 'Off'),
          term('Speed', speed),
        ),
      ),
      h('p', { class: 'dim', style: 'font-size:12px' }, '1v1, single game. The challenger serves first as Team A.'),
    );
    const chars = this.deps.characters();
    const picker = h(
      'div',
      { class: 'pickgrid chars setup-chars' },
      ...chars.map((c, i) =>
        h('button', { class: `pickcard${this.chosen?.id === c.id ? ' on' : ''}`, style: `--i:${i}`, onclick: () => ((this.chosen = c), this.render()) }, spriteImage(characterSprite(c.sprite, c.cosmetics.spriteItem ?? null), 2), h('span', { class: 'pickname' }, c.name)),
      ),
    );
    const side = (mine: boolean) => {
      const team = mine === send ? 'A' : 'B';
      const c = mine ? this.chosen : send ? null : theirChar;
      return h(
        'div',
        { class: `team-col team${team}${mine ? ' mine' : ''}` },
        h('div', { class: 'team-head' }, h('span', {}, `Team ${team} · ${mine ? 'You' : st.name}`), h('span', { class: 'dim' }, mine ? 'your pick' : send ? 'picks when accepting' : 'their pick')),
        h('div', { class: 'setup-champ' }, portrait(c), h('div', {}, mine ? styledName(me.name, me.style) : other ? styledName(other.card.name, other.card.style) : h('b', {}, st.name), h('p', { class: 'dim', style: 'font-size:12px' }, c ? `playing as ${c.name}` : mine ? '—' : 'their choice'))),
      );
    };
    const action = send
      ? h('div', { class: 'setup-ready' }, h('p', { class: 'dim' }, `Set the terms and pick your character, then send. ${st.name} sees the terms and picks their character to accept.`), h('div', { class: 'row' }, h('button', { onclick: () => ((this.setup = null), this.render()) }, 'Back'), h('button', { class: 'primary big', disabled: !this.chosen, onclick: () => this.sendChallenge() }, 'Send challenge')))
      : h('div', { class: 'setup-ready go' }, h('p', { class: 'dim' }, 'Pick your character, then accept: the match starts straight away.'), h('div', { class: 'row' }, h('button', { onclick: () => this.decline(st.peer, st.id) }, 'Decline'), h('button', { class: 'primary big', disabled: !this.chosen, onclick: () => this.acceptChallenge() }, 'Accept and play')));
    this.put(
      h(
        'div',
        { class: 'panel setup' },
        h('div', { class: 'row spread' }, h('h1', {}, send ? `Challenge ${st.name}` : `${st.name} challenges you!`), h('button', { onclick: () => ((this.setup = null), this.render()) }, 'Back to lobby')),
        h('div', { class: 'lineup' }, side(true), h('div', { class: 'vs-badge' }, 'VS'), side(false)),
        terms,
        h('div', { class: 'box' }, h('h2', {}, 'Your character'), picker),
        action,
      ),
    );
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
      h('p', { class: 'dim', style: 'font-size:12px;max-width:420px' }, `Challenge someone to set the terms first (table, spot, cups and speed, starting from your menu settings: ${settingsLine(s)}) and pick your character. They see the terms, pick their character and accept, and the match starts. 1v1, single game.`),
    );
    const invites = incoming.map((p) =>
      h(
        'div',
        { class: 'box invite lobby-row' },
        h('div', {}, h('span', { class: 'row', style: 'gap:6px' }, styledName(p.card.name, p.card.style), h('b', {}, p.card.invite!.re ? 'wants a rematch!' : 'challenges you!')), h('p', { class: 'dim', style: 'font-size:12px' }, settingsLine(p.card.invite!.settings))),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'primary', onclick: () => (p.card.invite!.re ? void this.begin('guest', p, p.card.invite!.id, p.card.invite!.settings) : this.openAccept(p)) }, p.card.invite!.re ? 'Play again' : 'View and accept'),
          h('button', { onclick: () => this.decline(p.peer, p.card.invite!.id) }, 'Decline'),
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
