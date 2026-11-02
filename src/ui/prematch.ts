// Pre-match flow: each human picks a profile → coin flip → snake draft → lineup → start.

import type { GameConfig } from '../config';
import { validateCharacter, type Character } from '../core/character';
import { available, isDone, newDraft, onTheClock, pick, teamPicks, firstPicker, type Draft } from '../core/draft';
import { characterBackSprite, characterSprite } from '../core/sprite';
import type { TeamId } from '../core/types';
import type { AppStore } from '../data/storage';
import { genericRoster, type Participant, type PositionKey, type Roster } from '../game/game';
import { progressFrom, type Progress } from './careerView';
import { characterCard, nameColorOf } from './characters';
import { theme } from '../theme';
import { h, nameTag, spriteImage, type Overlay } from './dom';

export const GUEST = '';

export interface PrematchResult {
  roster: Roster;
}

export function participantFrom(c: Character, profileId: string | null): Participant {
  return {
    name: c.name,
    stats: { ...c.stats },
    hitStyles: [...c.hitStyles],
    serveStyles: [...c.serveStyles],
    master: c.master,
    sprite: characterSprite(c.sprite, c.cosmetics.spriteItem ?? null),
    spriteBack: characterBackSprite(c.sprite, c.cosmetics.spriteItem ?? null),
    nameColor: nameColorOf(c),
    celebration: c.cosmetics.celebration && theme.celebrations[c.cosmetics.celebration] ? c.cosmetics.celebration : null,
    characterId: c.id,
    profileId,
  };
}

/**
 * Build the roster from the draft: each team's lineup is [left, right].
 * `profiles` is one human per team, or (same-team play) one per position of Team A.
 */
export function rosterFrom(
  chars: Map<string, Character>,
  lineup: Record<TeamId, [string, string]>,
  profiles: Record<TeamId, string> | { 'A-left': string; 'A-right': string },
): Roster {
  const pid = (pos: 'A-left' | 'A-right' | 'B-left' | 'B-right') => {
    if ('A-left' in profiles) return pos.startsWith('A') ? profiles[pos as 'A-left' | 'A-right'] || null : null;
    return profiles[pos.charAt(0) as TeamId] || null;
  };
  return {
    'A-left': participantFrom(chars.get(lineup.A[0])!, pid('A-left')),
    'A-right': participantFrom(chars.get(lineup.A[1])!, pid('A-right')),
    'B-left': participantFrom(chars.get(lineup.B[0])!, pid('B-left')),
    'B-right': participantFrom(chars.get(lineup.B[1])!, pid('B-right')),
  };
}

/**
 * A quick match (and the title screen's demo) with characters from the
 * collection: random different ones in every position, with generic players
 * filling in only when there aren't enough characters.
 */
export function quickRoster(chars: Character[], teamSize: 1 | 2, rng: () => number = Math.random): Roster {
  const pool = chars.filter((c) => validateCharacter(c).length === 0);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const roster = genericRoster(teamSize);
  const keys: PositionKey[] = teamSize === 1 ? ['A-left', 'B-left'] : ['A-left', 'A-right', 'B-left', 'B-right'];
  keys.forEach((k, i) => {
    if (pool[i]) roster[k] = participantFrom(pool[i], null);
  });
  if (teamSize === 1) {
    roster['A-right'] = roster['A-left'];
    roster['B-right'] = roster['B-left'];
  }
  return roster;
}

/** The CPU's draft pick: Hard takes the best stat line, Medium one of the better half, Easy any. */
export function cpuPick(available: Character[], difficulty: GameConfig['players']['cpu'], rng: () => number): string {
  const total = (c: Character) => Object.values(c.stats).reduce((a, b) => a + b, 0);
  const ranked = [...available].sort((a, b) => total(b) - total(a));
  const pool = difficulty === 'hard' ? ranked.slice(0, 1) : difficulty === 'medium' ? ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 2))) : ranked;
  return pool[Math.floor(rng() * pool.length)].id;
}

const teamClass = (t: TeamId) => (t === 'A' ? 'teamA' : 'teamB');

export class PrematchFlow {
  private profiles: Record<TeamId, string> = { A: GUEST, B: GUEST };
  /** Same-team play: the two humans on Team A. */
  private coopProfiles = { 'A-left': GUEST, 'A-right': GUEST };
  private draft: Draft | null = null;
  private first: TeamId = 'A';
  private lineup: Record<TeamId, [string, string]> | null = null;
  private chars = new Map<string, Character>();
  private error = '';
  private progress: Progress | null = null;

  constructor(
    private overlay: Overlay,
    private store: AppStore,
    private cfg: GameConfig,
    private rng: () => number,
    private actions: { start: (r: PrematchResult) => void; cancel: () => void; editCharacters: () => void; quickMatch: () => void },
  ) {}

  begin(): void {
    const usable = this.store.characters.list().filter((c) => validateCharacter(c).length === 0);
    this.chars = new Map(usable.map((c) => [c.id, c]));
    this.progress = progressFrom(this.cfg, this.store.matches.list());
    if (usable.length < 2 * this.size) return this.notEnough(usable.length);
    this.showProfiles();
  }

  private notEnough(n: number): void {
    const need = 2 * this.size;
    this.overlay.show(
      h(
        'div',
        { class: 'panel' },
        h('h1', {}, `Draft needs ${need} characters`),
        h('p', {}, n ? `You have ${n} character${n === 1 ? '' : 's'}. Create ${need - n} more to draft, or play a quick match with random characters (generic players fill the empty spots).` : `There are no characters yet. Create at least ${need}, or play a quick match with generic players.`),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'primary', onclick: () => this.actions.editCharacters() }, 'Create characters'),
          h('button', { onclick: () => this.actions.quickMatch() }, 'Quick match'),
          h('button', { onclick: () => this.actions.cancel() }, 'Back to menu'),
        ),
      ),
    );
  }

  // ------------------------------------------------------- 1. profiles

  private get coop(): boolean {
    return this.cfg.players.mode === 'coop';
  }

  /** Players per team (1 in 1v1). */
  private get size(): 1 | 2 {
    return this.cfg.teamSize;
  }

  private showProfiles(): void {
    const profiles = this.store.profiles.list();
    const picker = (id: string, value: string, set: (v: string) => void) =>
      h(
        'select',
        { id, onchange: (e: Event) => set((e.target as HTMLSelectElement).value) },
        h('option', { value: GUEST }, 'Guest'),
        ...profiles.map((p) => {
          const o = h('option', { value: p.id }, p.name);
          if (value === p.id) o.selected = true;
          return o;
        }),
      );
    const select = (team: TeamId) => picker(`profile-${team}`, this.profiles[team], (v) => (this.profiles[team] = v));
    if (this.coop && this.size === 2) {
      const seat = (pos: 'A-left' | 'A-right', keys: string) =>
        h('div', { class: 'box card' }, h('h2', { class: 'teamA' }, pos === 'A-left' ? 'Left teammate' : 'Right teammate'), h('p', { class: 'dim' }, keys), picker(`profile-${pos}`, this.coopProfiles[pos], (v) => (this.coopProfiles[pos] = v)));
      this.overlay.show(
        h(
          'div',
          { class: 'panel' },
          h('div', { class: 'row spread' }, h('h1', {}, 'Who is playing?'), h('button', { onclick: () => this.actions.cancel() }, 'Back to menu')),
          h('p', { class: 'dim' }, `You two are Team A against the CPU (${this.cfg.players.cpu}). Each of you plays one teammate; teammates alternate hits, and either of you can make a save.`),
          h('div', { class: 'grid' }, seat('A-left', 'WASD to aim · Space to hit · Q / E styles'), seat('A-right', 'Arrows to aim · Enter to hit · . / / styles')),
          this.error ? h('p', { class: 'error' }, this.error) : null,
          h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => this.toDraft() }, 'Flip the coin and draft')),
        ),
      );
      return;
    }
    this.overlay.show(
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'row spread' }, h('h1', {}, 'Who is playing?'), h('button', { onclick: () => this.actions.cancel() }, 'Back to menu')),
        h(
          'p',
          { class: 'dim' },
          this.coop
            ? `1v1 against the CPU (${this.cfg.players.cpu}): pick your player profile, then you and the CPU draft one character each. Either set of keys plays.`
            : `Each human picks their player profile, then the teams draft ${this.size === 1 ? 'one character each' : 'characters'}. Add profiles from the Players screen.`,
        ),
        h(
          'div',
          { class: 'grid' },
          ...(['A', 'B'] as TeamId[]).map((t) =>
            this.coop && t === 'B'
              ? h('div', { class: 'box card' }, h('h2', { class: teamClass(t) }, 'Team B'), h('p', { class: 'dim' }, `CPU (${this.cfg.players.cpu})`))
              : h('div', { class: 'box card' }, h('h2', { class: teamClass(t) }, this.size === 1 ? `Player ${t}` : `Team ${t}`), select(t)),
          ),
        ),
        this.error ? h('p', { class: 'error' }, this.error) : null,
        h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => this.toDraft() }, 'Flip the coin and draft')),
      ),
    );
  }

  private toDraft(): void {
    const c = this.coopProfiles;
    if (this.coop) this.profiles.B = GUEST; // the CPU's team has no human
    if (this.coop && this.size === 2 && c['A-left'] && c['A-left'] === c['A-right']) {
      this.error = 'Both teammates picked the same player. Pick a different profile, or Guest.';
      return this.showProfiles();
    }
    if (!this.coop && this.profiles.A && this.profiles.A === this.profiles.B) {
      this.error = 'Both teams picked the same player. Pick a different profile, or Guest.';
      return this.showProfiles();
    }
    this.error = '';
    this.first = firstPicker(this.cfg.draftFirstPick, this.rng);
    this.draft = newDraft([...this.chars.keys()], this.first, this.size);
    this.showDraft();
  }

  // ---------------------------------------------------------- 2. draft

  private showDraft(): void {
    const d = this.draft!;
    if (isDone(d)) {
      // 1v1: the one character stands in both positions of its team.
      const two = (t: TeamId) => {
        const p = teamPicks(d, t);
        return (this.size === 1 ? [p[0], p[0]] : p) as [string, string];
      };
      this.lineup = { A: two('A'), B: two('B') };
      return this.showLineup();
    }
    const team = onTheClock(d)!;
    if (this.coop && team === 'B') {
      // The CPU picks for itself.
      const id = cpuPick(available(d).map((x) => this.chars.get(x)!), this.cfg.players.cpu, this.rng);
      this.draft = pick(d, 'B', id) as Draft;
      return this.showDraft();
    }
    const free = new Set(available(d));
    const pickedBy = new Map(d.picks.map((p) => [p.characterId, p.team]));
    const cards = [...this.chars.values()].map((c) => {
      const by = pickedBy.get(c.id);
      const extra = by ? [h('span', { class: `badge ${teamClass(by)}` }, `Team ${by}`)] : [];
      const attrs = free.has(c.id)
        ? { class: 'box card pick', tabindex: '0', role: 'button', 'aria-label': `Pick ${c.name}`, onclick: () => this.choose(team, c.id), onkeydown: (e: Event) => (e as KeyboardEvent).key === 'Enter' && this.choose(team, c.id) }
        : { class: 'box card taken' };
      return characterCard(c, this.progress!.characterLevel(c.id).level, extra, attrs as Record<string, string | EventListener>);
    });
    const coin = d.picks.length === 0 ? `Coin flip: Team ${this.first} picks first. ` : '';
    const order = d.order.map((t, i) => {
      const s = h('span', { class: `badge ${teamClass(t)}` }, `${i + 1}${t}`);
      if (i < d.picks.length) s.style.opacity = '0.35';
      if (i === d.picks.length) s.style.outline = '2px solid currentColor';
      return s;
    });
    this.overlay.show(
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'row spread' }, h('h1', {}, 'Draft'), h('button', { onclick: () => this.actions.cancel() }, 'Back to menu')),
        h(
          'div',
          { class: 'row' },
          h('span', {}, coin.replace('Team B', this.coop ? 'the CPU' : 'Team B')),
          h('span', { class: teamClass(team), style: 'font-weight:bold' }, `Team ${team}, pick a character.`),
          h('span', { class: 'dim' }, 'Snake order:'),
          ...order,
        ),
        this.error ? h('p', { class: 'error' }, this.error) : null,
        h('div', { class: 'grid' }, ...cards),
      ),
    );
  }

  private choose(team: TeamId, id: string): void {
    const next = pick(this.draft!, team, id);
    if (typeof next === 'string') this.error = next;
    else {
      this.error = '';
      this.draft = next;
    }
    this.showDraft();
  }

  // --------------------------------------------------------- 3. lineup

  private showLineup(): void {
    const lu = this.lineup!;
    const side = (t: TeamId) => {
      const [l, r] = lu[t].map((id) => this.chars.get(id)!);
      const spot = (label: string, c: Character) =>
        h('div', { class: 'row' }, spriteImage(characterSprite(c.sprite, c.cosmetics.spriteItem ?? null), 3), h('div', {}, h('p', { class: 'dim' }, label), nameTag(c.name, c.master, nameColorOf(c))));
      return h(
        'div',
        { class: 'box card' },
        h('h2', { class: teamClass(t) }, `Team ${t}`),
        ...(this.size === 1 ? [spot('Plays both halves', l)] : [spot('Left', l), spot('Right', r)]),
        this.coop && t === 'B'
          ? h('p', { class: 'dim' }, `CPU (${this.cfg.players.cpu})`)
          : this.size === 1
            ? null
            : h('button', { onclick: () => ((lu[t] = [lu[t][1], lu[t][0]]), this.showLineup()) }, 'Swap left and right'),
      );
    };
    this.overlay.show(
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'row spread' }, h('h1', {}, 'Lineups'), h('button', { onclick: () => this.actions.cancel() }, 'Back to menu')),
        h(
          'p',
          { class: 'dim' },
          this.size === 1
            ? 'One player a side: you make every hit, and serve from alternating halves into the diagonal quarter.'
            : this.coop
            ? 'The left character is played with WASD + Space, the right one with the arrows + Enter. Positions are fixed for the whole game.'
            : 'Positions are fixed for the whole game. Left serves to the opponent on the right, diagonally.',
        ),
        h('div', { class: 'grid' }, side('A'), side('B')),
        h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => this.actions.start({ roster: rosterFrom(this.chars, lu, this.coop && this.size === 2 ? this.coopProfiles : this.profiles) }) }, 'Start match')),
      ),
    );
  }
}
