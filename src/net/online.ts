// Online 1v1 between two devices, over the page's live room (no server).
//
// - Lobby: everyone with "Online match" open shares a little presence card
//   (name, level, character, status). A challenge and its answer are fields
//   on those cards, addressed to the other page's `peer` label.
// - Match: both pages join a named room. The challenger HOSTS: it runs the
//   real game and keeps its presence set to the game state (~15 times a
//   second). The other page mirrors that state, steers its own crosshair
//   locally, and sends its keys, crosshair and hits (with the timing it saw
//   on its own screen) in its presence.
// Presence is state, not messages: the newest value wins, so a dropped
// update just means the next one carries everything. Hits and penalty-cup
// steps travel as a short numbered list so none are lost.

import type { Character, Sprite } from '../core/character';
import type { NetState, TeamInput } from '../game/game';
import { cleanNameStyle, type NameStyle } from '../progress/nameStyles';

export interface RoomPeer {
  peer: string;
  by: string | null;
  isMe: boolean;
  sameTab: boolean;
  presence: Readonly<Record<string, unknown>>;
}
interface PeersChange {
  peers: readonly RoomPeer[];
  left: readonly RoomPeer[];
}
interface RoomLike {
  presence(patch: Record<string, unknown>): Promise<void>;
  peers(): readonly RoomPeer[];
  onPeers(handler: (c: PeersChange) => void, onError?: (e: { code: string }) => void): () => void;
  connected(): boolean;
}
export interface NamedRoom extends RoomLike {
  readonly name: string;
  leave(): Promise<void>;
}
export interface RoomApi extends RoomLike {
  join(name: string): Promise<NamedRoom>;
}

/** Match settings the challenger picks (the challenged player sees them before accepting). */
export interface MatchSettings {
  design: string;
  venue: string;
  formation: 'tree' | 'shrub';
  speed: number;
  ski: boolean;
}

/** A lobby card. */
export interface LobbyCard {
  pz: 1;
  name: string;
  level: number;
  /** How the name looks (profile name style). */
  style: NameStyle;
  status: 'lobby' | 'playing';
  char: PackedChar | null;
  invite: { to: string; id: string; settings: MatchSettings } | null;
  answer: { to: string; id: string; ok: boolean } | null;
}

export interface LobbyPeer {
  peer: string;
  by: string | null;
  isMe: boolean;
  card: LobbyCard;
}

/** The guest's keys, crosshair and recent events. */
export interface GuestInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  style: 0 | 1 | 2;
  aim: { x: number; y: number };
  /** Hits (with the timing seen on the guest's screen) and penalty-cup steps, numbered. */
  ev: { n: number; k: 'hit' | 'nav'; q?: number | null; off?: number; d?: -1 | 1 }[];
}

/** A character packed small enough for a presence card (hand-drawn pixels as a palette and one letter per pixel). */
export interface PackedChar {
  c: Omit<Character, 'sprite'> & { sprite: { parts: Character['sprite']['parts']; pixels: null } };
  px?: { w: number; h: number; pal: string[]; d: string };
}

const LETTERS = '.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function packChar(ch: Character): PackedChar {
  const { sprite, ...rest } = ch;
  const out: PackedChar = { c: { ...structuredClone(rest), cosmetics: { nameColor: rest.cosmetics?.nameColor ?? null, badges: [], spriteItem: rest.cosmetics?.spriteItem ?? null, celebration: rest.cosmetics?.celebration ?? null }, sprite: { parts: { ...sprite.parts }, pixels: null } } };
  const px: Sprite | null = sprite.pixels;
  if (px) {
    const pal: string[] = [];
    let d = '';
    for (const col of px.pixels) {
      if (!col) {
        d += '.';
        continue;
      }
      let i = pal.indexOf(col);
      if (i < 0 && pal.length < LETTERS.length - 1) i = pal.push(col) - 1;
      d += LETTERS[(i < 0 ? 0 : i) + 1];
    }
    out.px = { w: px.w, h: px.h, pal, d };
  }
  return out;
}

export function unpackChar(p: PackedChar | null | undefined): Character | null {
  if (!p || !p.c || typeof p.c.id !== 'string') return null;
  const c = structuredClone(p.c) as unknown as Character;
  if (p.px && typeof p.px.d === 'string' && Array.isArray(p.px.pal)) {
    const pixels = [...p.px.d].map((ch) => (ch === '.' ? '' : (p.px!.pal[LETTERS.indexOf(ch) - 1] ?? '')));
    c.sprite = { parts: c.sprite.parts, pixels: { w: p.px.w, h: p.px.h, pixels } };
  }
  return c;
}

export function cardOf(p: Pick<RoomPeer, "presence">): LobbyCard | null {
  const pr = p.presence as Partial<LobbyCard>;
  if (pr?.pz !== 1 || typeof pr.name !== 'string') return null;
  return {
    pz: 1,
    name: pr.name.slice(0, 24),
    level: typeof pr.level === 'number' ? pr.level : 1,
    style: cleanNameStyle(pr.style),
    status: pr.status === 'playing' ? 'playing' : 'lobby',
    char: (pr.char as PackedChar) ?? null,
    invite: pr.invite && typeof pr.invite.to === 'string' && typeof pr.invite.id === 'string' ? pr.invite : null,
    answer: pr.answer && typeof pr.answer.to === 'string' && typeof pr.answer.id === 'string' ? pr.answer : null,
  };
}

/** The lobby: who's around, and challenges between them. */
export class Lobby {
  private unsub: (() => void) | null = null;
  me: LobbyCard | null = null;

  constructor(
    readonly room: RoomApi,
    private onChange: () => void,
  ) {}

  /** This page's `peer` label, as everyone sees it. */
  get myPeer(): string | null {
    return this.room.peers().find((p) => p.isMe && p.sameTab)?.peer ?? null;
  }

  peers(): LobbyPeer[] {
    return this.room
      .peers()
      .map((p) => ({ peer: p.peer, by: p.by, isMe: p.isMe && p.sameTab, card: cardOf(p) }))
      .filter((p): p is LobbyPeer => !!p.card);
  }

  open(card: Omit<LobbyCard, 'pz' | 'invite' | 'answer' | 'status'>): void {
    this.me = { pz: 1, status: 'lobby', invite: null, answer: null, ...card };
    void this.room.presence({ ...this.me }).catch(() => {});
    this.unsub?.();
    this.unsub = this.room.onPeers(() => this.onChange());
  }

  update(patch: Partial<LobbyCard>): void {
    if (!this.me) return;
    this.me = { ...this.me, ...patch };
    void this.room.presence({ ...this.me }).catch(() => {});
    this.onChange();
  }

  /** Leave the lobby (clears this page's card). */
  close(): void {
    this.unsub?.();
    this.unsub = null;
    this.me = null;
    void this.room.presence({ pz: null, name: null, level: null, style: null, status: null, char: null, invite: null, answer: null }).catch(() => {});
  }

  /** Challenges addressed to this page. */
  incoming(): LobbyPeer[] {
    const me = this.myPeer;
    return me ? this.peers().filter((p) => !p.isMe && p.card.invite?.to === me) : [];
  }

  /** The answer to this page's own challenge, if it came. */
  answer(): { from: LobbyPeer; ok: boolean } | null {
    const me = this.myPeer;
    const inv = this.me?.invite;
    if (!me || !inv) return null;
    const p = this.peers().find((x) => x.peer === inv.to && x.card.answer?.to === me && x.card.answer.id === inv.id);
    return p ? { from: p, ok: p.card.answer!.ok } : null;
  }
}

export const matchRoomName = (id: string) => `pz-${id}`.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 48);
export const newMatchId = () => Math.random().toString(36).slice(2, 10);

/** One side of a live match. */
export class MatchLink {
  private unsub: (() => void) | null = null;
  /** Newest state from the host (guest side), and the guest's newest input (host side). */
  net: NetState | null = null;
  input: GuestInput | null = null;
  /** The host's final word: XP for the guest's character. */
  final: { xp: Record<string, number> } | null = null;
  gone = false;
  private lastEvent = 0;
  private sentAt = 0;
  private evs: GuestInput['ev'] = [];
  private evN = 0;

  constructor(
    readonly room: NamedRoom,
    readonly role: 'host' | 'guest',
    private otherPeer: string,
  ) {
    const read = () => {
      const other = room.peers().find((p) => p.peer === this.otherPeer);
      if (!other) return;
      const pr = other.presence as { net?: NetState; inp?: GuestInput; final?: { xp: Record<string, number> } };
      if (role === 'guest' && pr.net) this.net = pr.net;
      if (role === 'guest' && pr.final) this.final = pr.final;
      if (role === 'host' && pr.inp) this.input = pr.inp;
    };
    this.unsub = room.onPeers((c) => {
      if (c.left.some((p) => p.peer === this.otherPeer)) this.gone = true;
      read();
    });
    read();
  }

  /** Host: publish the game state, at most ~15 times a second. */
  sendState(n: NetState, now: number, force = false): void {
    if (!force && now - this.sentAt < 66) return;
    this.sentAt = now;
    void this.room.presence({ net: n }).catch(() => {});
  }

  sendFinal(xp: Record<string, number>): void {
    void this.room.presence({ final: { xp } }).catch(() => {});
  }

  /** Guest: queue a hit (with the timing seen here) or a penalty-cup step. */
  event(k: 'hit' | 'nav', extra: { q?: number | null; off?: number; d?: -1 | 1 } = {}): void {
    this.evs = [...this.evs, { n: ++this.evN, k, ...extra }].slice(-6);
  }

  /** Guest: publish keys, crosshair and recent events, at most ~20 times a second. */
  sendInput(inp: Omit<GuestInput, 'ev'>, now: number, force = false): void {
    if (!force && now - this.sentAt < 50) return;
    this.sentAt = now;
    void this.room.presence({ inp: { ...inp, ev: this.evs } }).catch(() => {});
  }

  /** Host: the guest's TeamInput for this frame (new hits and steps fire once). */
  hostInput(idle: TeamInput): TeamInput {
    const g = this.input;
    if (!g) return idle;
    const inp: TeamInput = { ...idle, up: g.up, down: g.down, left: g.left, right: g.right, style: g.style };
    const fresh = (g.ev ?? []).filter((e) => e.n > this.lastEvent);
    if (fresh.length) {
      const e = fresh[0]; // one per frame
      this.lastEvent = e.n;
      if (e.k === 'hit') {
        inp.hit = true;
        if (e.q !== undefined) inp.q = e.q;
        if (typeof e.off === 'number') inp.off = e.off;
      } else if (e.k === 'nav' && (e.d === 1 || e.d === -1)) inp.nav = e.d;
    }
    return inp;
  }

  async close(): Promise<void> {
    this.unsub?.();
    this.unsub = null;
    await this.room.leave().catch(() => {});
  }
}
