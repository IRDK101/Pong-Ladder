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
import { cleanStats, type GameStats } from '../game/stats';

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
export interface RoomLike {
  presence(patch: Record<string, unknown>): Promise<void>;
  peers(): readonly RoomPeer[];
  onPeers(handler: (c: PeersChange) => void, onError?: (e: { code: string; message?: string }) => void): () => void;
  connected(): boolean;
  onConnection?(handler: (connected: boolean) => void, onError?: (e: { code: string }) => void): () => void;
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
  /** A challenge (`re`: a rematch on the same terms, which skips the challenge screens). */
  invite: { to: string; id: string; settings: MatchSettings; re?: boolean } | null;
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
  ev: { n: number; k: 'hit' | 'nav'; q?: number | null; off?: number; at?: number; d?: -1 | 1 }[];
  /** The guest's clock when it sent this (echoed back so it can measure the round trip). */
  ts?: number;
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

  /** The last thing the room refused or reported (shown in the lobby), or ''. */
  error = '';

  constructor(
    readonly room: RoomApi,
    private onChange: () => void,
  ) {}

  private send(patch: Record<string, unknown>): void {
    const issue = presenceIssue({ ...patch });
    if (issue) {
      this.error = `Your lobby card couldn't be sent (${issue}).`;
      return this.onChange();
    }
    this.room.presence(patch).then(
      () => {
        if (this.error.startsWith('Your lobby card')) (this.error = ''), this.onChange();
      },
      (e: { code?: string; message?: string }) => {
        this.error = `Your lobby card couldn't be sent (${e?.code ?? 'error'}${e?.message ? `: ${e.message}` : ''}).`;
        this.onChange();
      },
    );
  }

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
    this.send({ ...this.me });
    this.unsub?.();
    this.unsub = this.room.onPeers(
      () => this.onChange(),
      (e) => {
        this.error = `The live room stopped (${e.code}). Reload the page to reconnect.`;
        this.onChange();
      },
    );
  }

  update(patch: Partial<LobbyCard>): void {
    if (!this.me) return;
    this.me = { ...this.me, ...patch };
    this.send({ ...this.me });
    this.onChange();
  }

  /** Leave the lobby (clears this page's card). */
  close(): void {
    this.unsub?.();
    this.unsub = null;
    this.me = null;
    void this.room.presence({ pz: null, name: null, level: null, style: null, status: null, char: null, invite: null, answer: null, ...MATCH_CLEAR }).catch(() => {});
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

/** Match fields a page keeps in its lobby presence while it plays. */
const MATCH_CLEAR = { mid: null, net: null, inp: null, final: null };

export const matchRoomName = (id: string) => `pz-${id}`.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 48);
export const newMatchId = () => Math.random().toString(36).slice(2, 10);

/**
 * One side of a live match. Both pages already share the lobby room, so the
 * match travels there too, in presence fields tagged with the match id (`mid`):
 * no extra room to join (named rooms may not be offered, and a join can time
 * out), and each page reads only its opponent's fields for this match.
 */
export class MatchLink {
  private unsub: (() => void) | null = null;
  /** Newest state from the host (guest side), and the guest's newest input (host side). */
  net: NetState | null = null;
  input: GuestInput | null = null;
  /** The host's final word: XP for the guest's character, and the game's stats. */
  final: { xp: Record<string, number>; st: GameStats | null } | null = null;
  gone = false;
  /** Last error the room reported for a match update, or ''. */
  error = '';
  private lastEvent = 0;
  private sentAt = 0;
  private evs: GuestInput['ev'] = [];
  private evN = 0;
  seen = false;
  private since = Date.now();
  /** Host: when the guest's latest input arrived (performance.now()). */
  private inputAt = 0;
  private lastEcho = -1;
  /** Guest: the smoothed round trip to the host and back, in ms (null until measured). */
  rtt: number | null = null;
  /** Guest: how far behind the host's updates are when they arrive, in seconds (half the round trip). */
  get delay(): number {
    return this.rtt === null ? 0.06 : this.rtt / 2000;
  }
  /** Re-check the opponent (also catches a timeout when the room is quiet). */
  read: () => void = () => {};

  constructor(
    readonly room: RoomLike,
    readonly role: 'host' | 'guest',
    private otherPeer: string,
    readonly mid: string,
  ) {
    const read = () => {
      const other = room.peers().find((p) => p.peer === this.otherPeer);
      const pr = (other?.presence ?? {}) as { mid?: string; net?: NetState; inp?: GuestInput; final?: { xp: [string, number][] | Record<string, number>; st?: unknown } };
      if (!other || pr.mid !== this.mid) {
        // Once they've been in this match, leaving the room or the match ends it; never arriving times out.
        if (this.seen || Date.now() - this.since > 20000) this.gone = true;
        return;
      }
      this.seen = true;
      if (role === 'guest' && pr.net) this.net = pr.net;
      if (role === 'guest' && pr.final) this.final = { xp: Array.isArray(pr.final.xp) ? Object.fromEntries(pr.final.xp) : pr.final.xp, st: cleanStats(pr.final.st) };
      if (role === 'host' && pr.inp && pr.inp !== this.input) {
        this.input = pr.inp;
        this.inputAt = performance.now();
      }
      if (role === 'guest' && pr.net && typeof pr.net.echo === 'number' && pr.net.echo !== this.lastEcho) {
        // Round trip = now − (when we sent it + how long the host held it). Smoothed, and kept sane.
        this.lastEcho = pr.net.echo;
        const rtt = performance.now() - pr.net.echo;
        if (rtt > 0 && rtt < 2000) this.rtt = this.rtt === null ? rtt : this.rtt * 0.8 + rtt * 0.2;
      }
    };
    this.read = read;
    this.unsub = room.onPeers(
      (c) => {
        if (c.left.some((p) => p.peer === this.otherPeer)) this.gone = true;
        read();
      },
      (e) => {
        this.error = e.code;
        this.gone = true;
      },
    );
    void room.presence({ mid }).catch(() => {});
    read();
  }

  private put(patch: Record<string, unknown>): void {
    this.room.presence({ mid: this.mid, ...patch }).catch((e: { code?: string; message?: string }) => {
      this.error = `${e?.code ?? 'error'}${e?.message ? `: ${e.message}` : ''}`;
    });
  }

  /**
   * Host: publish the game state: ~30 times a second while the ball is in play,
   * ~10 otherwise (it barely changes then, and this keeps the data use down).
   */
  sendState(n: NetState, now: number, force = false, live = true): void {
    if (!force && now - this.sentAt < (live ? 33 : 100)) return;
    this.sentAt = now;
    const ts = this.input?.ts;
    this.put({ net: typeof ts === 'number' ? { ...n, echo: +(ts + (now - this.inputAt)).toFixed(1) } : n });
  }

  /** Character ids aren't guaranteed to be presence keys, so XP travels as pairs. */
  sendFinal(xp: Record<string, number>, st: GameStats | null = null): void {
    const round = (v: unknown): unknown => (typeof v === 'number' ? +v.toFixed(3) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) : v);
    this.put({ final: { xp: Object.entries(xp).slice(0, 32), ...(st ? { st: round(st) } : {}) } });
  }

  /** Guest: queue a hit (with the timing seen here) or a penalty-cup step. */
  event(k: 'hit' | 'nav', extra: { q?: number | null; off?: number; at?: number; d?: -1 | 1 } = {}): void {
    this.evs = [...this.evs, { n: ++this.evN, k, ...extra }].slice(-6);
  }

  /** Guest: publish keys, crosshair and recent events, ~30 times a second (hits go at once). */
  sendInput(inp: Omit<GuestInput, 'ev' | 'ts'>, now: number, force = false): void {
    if (!force && now - this.sentAt < 33) return;
    this.sentAt = now;
    this.put({ inp: { ...inp, ev: this.evs, ts: +now.toFixed(1) } });
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
        if (typeof e.at === 'number') inp.at = e.at;
      } else if (e.k === 'nav' && (e.d === 1 || e.d === -1)) inp.nav = e.d;
    }
    return inp;
  }

  async close(): Promise<void> {
    this.unsub?.();
    this.unsub = null;
    await this.room.presence({ ...MATCH_CLEAR }).catch(() => {});
    // A match's own room (the self-hosted site) is left; the shared lobby room never is.
    const r = this.room as { leave?: () => Promise<void>; name?: string };
    if (r.leave && r.name && r.name !== 'lobby') await r.leave().catch(() => {});
  }
}

const FORMAT_CHARS = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/;
const KEY = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
const BAD_KEYS = new Set(Object.getOwnPropertyNames(Object.prototype).concat('prototype'));

/**
 * Why the live room would refuse this presence object, or null. The room
 * rejects a presence patch whole (and applies nothing) when the merged object
 * breaks its bounds: plain-identifier keys, at most 64 keys per object and 64
 * entries per array, nesting at most 8 deep, strings at most 1 KiB with no
 * control or invisible characters, only finite numbers, 4 KiB in all.
 */
export function presenceIssue(value: unknown): string | null {
  const walk = (v: unknown, depth: number, path: string): string | null => {
    if (depth > 8) return `${path}: nested too deep`;
    if (v === null || typeof v === 'boolean') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? null : `${path}: not a finite number`;
    if (typeof v === 'string') {
      if (new TextEncoder().encode(v).length > 1024) return `${path}: string over 1 KiB`;
      return FORMAT_CHARS.test(v) ? `${path}: control or invisible character` : null;
    }
    if (Array.isArray(v)) {
      if (v.length > 64) return `${path}: array over 64 entries`;
      for (let i = 0; i < v.length; i++) {
        const e = walk(v[i], depth + 1, `${path}[${i}]`);
        if (e) return e;
      }
      return null;
    }
    if (typeof v === 'object') {
      const keys = Object.keys(v as object);
      if (keys.length > 64) return `${path}: over 64 keys`;
      for (const k of keys) {
        if (!KEY.test(k) || BAD_KEYS.has(k)) return `${path}: key "${k}" is not a plain identifier`;
        const e = walk((v as Record<string, unknown>)[k], depth + 1, `${path}.${k}`);
        if (e) return e;
      }
      return null;
    }
    return `${path}: ${typeof v} is not JSON`;
  };
  const e = walk(value, 1, 'presence');
  if (e) return e;
  return new TextEncoder().encode(JSON.stringify(value)).length > 4096 ? 'presence: over 4 KiB' : null;
}
