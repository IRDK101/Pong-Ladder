// Pre-match flow: each human picks a profile → coin flip → snake draft → lineup → start.

import type { GameConfig } from '../config';
import { validateCharacter, type Character } from '../core/character';
import { available, isDone, newDraft, onTheClock, pick, teamPicks, firstPicker, type Draft } from '../core/draft';
import { characterSprite } from '../core/sprite';
import type { TeamId } from '../core/types';
import type { AppStore } from '../data/storage';
import type { Participant, Roster } from '../game/game';
import { characterCard } from './characters';
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
    sprite: characterSprite(c.sprite),
    characterId: c.id,
    profileId,
  };
}

/** Build the roster from the draft: each team's lineup is [left, right]. */
export function rosterFrom(chars: Map<string, Character>, lineup: Record<TeamId, [string, string]>, profiles: Record<TeamId, string>): Roster {
  const pid = (t: TeamId) => profiles[t] || null;
  return {
    'A-left': participantFrom(chars.get(lineup.A[0])!, pid('A')),
    'A-right': participantFrom(chars.get(lineup.A[1])!, pid('A')),
    'B-left': participantFrom(chars.get(lineup.B[0])!, pid('B')),
    'B-right': participantFrom(chars.get(lineup.B[1])!, pid('B')),
  };
}

const teamClass = (t: TeamId) => (t === 'A' ? 'teamA' : 'teamB');

export class PrematchFlow {
  private profiles: Record<TeamId, string> = { A: GUEST, B: GUEST };
  private draft: Draft | null = null;
  private first: TeamId = 'A';
  private lineup: Record<TeamId, [string, string]> | null = null;
  private chars = new Map<string, Character>();
  private error = '';

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
    if (usable.length < 4) return this.notEnough(usable.length);
    this.showProfiles();
  }

  private notEnough(n: number): void {
    this.overlay.show(
      h(
        'div',
        { class: 'panel' },
        h('h1', {}, 'Draft needs 4 characters'),
        h('p', {}, n ? `You have ${n} character${n === 1 ? '' : 's'}. Create ${4 - n} more to draft, or play a quick match with generic players.` : 'There are no characters yet. Create at least 4, or play a quick match with generic players.'),
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

  private showProfiles(): void {
    const profiles = this.store.profiles.list();
    const select = (team: TeamId) =>
      h(
        'select',
        { id: `profile-${team}`, onchange: (e: Event) => (this.profiles[team] = (e.target as HTMLSelectElement).value) },
        h('option', { value: GUEST }, 'Guest'),
        ...profiles.map((p) => {
          const o = h('option', { value: p.id }, p.name);
          if (this.profiles[team] === p.id) o.selected = true;
          return o;
        }),
      );
    this.overlay.show(
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'row spread' }, h('h1', {}, 'Who is playing?'), h('button', { onclick: () => this.actions.cancel() }, 'Back to menu')),
        h('p', { class: 'dim' }, 'Each human picks their player profile, then the teams draft characters. Add profiles from the Players screen.'),
        h(
          'div',
          { class: 'grid' },
          ...(['A', 'B'] as TeamId[]).map((t) => h('div', { class: 'box card' }, h('h2', { class: teamClass(t) }, `Team ${t}`), select(t))),
        ),
        this.error ? h('p', { class: 'error' }, this.error) : null,
        h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => this.toDraft() }, 'Flip the coin and draft')),
      ),
    );
  }

  private toDraft(): void {
    if (this.profiles.A && this.profiles.A === this.profiles.B) {
      this.error = 'Both teams picked the same player. Pick a different profile, or Guest.';
      return this.showProfiles();
    }
    this.error = '';
    this.first = firstPicker(this.cfg.draftFirstPick, this.rng);
    this.draft = newDraft([...this.chars.keys()], this.first);
    this.showDraft();
  }

  // ---------------------------------------------------------- 2. draft

  private showDraft(): void {
    const d = this.draft!;
    if (isDone(d)) {
      this.lineup = { A: teamPicks(d, 'A') as [string, string], B: teamPicks(d, 'B') as [string, string] };
      return this.showLineup();
    }
    const team = onTheClock(d)!;
    const free = new Set(available(d));
    const pickedBy = new Map(d.picks.map((p) => [p.characterId, p.team]));
    const cards = [...this.chars.values()].map((c) => {
      const by = pickedBy.get(c.id);
      const extra = by ? [h('span', { class: `badge ${teamClass(by)}` }, `Team ${by}`)] : [];
      const attrs = free.has(c.id)
        ? { class: 'box card pick', tabindex: '0', role: 'button', 'aria-label': `Pick ${c.name}`, onclick: () => this.choose(team, c.id), onkeydown: (e: Event) => (e as KeyboardEvent).key === 'Enter' && this.choose(team, c.id) }
        : { class: 'box card taken' };
      return characterCard(c, extra, attrs as Record<string, string | EventListener>);
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
        h('div', { class: 'row' }, h('span', {}, coin), h('span', { class: teamClass(team), style: 'font-weight:bold' }, `Team ${team}, pick a character.`), h('span', { class: 'dim' }, 'Snake order:'), ...order),
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
      const spot = (label: string, c: Character) => h('div', { class: 'row' }, spriteImage(characterSprite(c.sprite), 3), h('div', {}, h('p', { class: 'dim' }, label), nameTag(c.name, c.master, c.cosmetics.nameColor)));
      return h(
        'div',
        { class: 'box card' },
        h('h2', { class: teamClass(t) }, `Team ${t}`),
        spot('Left', l),
        spot('Right', r),
        h('button', { onclick: () => ((lu[t] = [lu[t][1], lu[t][0]]), this.showLineup()) }, 'Swap left and right'),
      );
    };
    this.overlay.show(
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'row spread' }, h('h1', {}, 'Lineups'), h('button', { onclick: () => this.actions.cancel() }, 'Back to menu')),
        h('p', { class: 'dim' }, 'Positions are fixed for the whole game. Left serves to the opponent on the right, diagonally.'),
        h('div', { class: 'grid' }, side('A'), side('B')),
        h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => this.actions.start({ roster: rosterFrom(this.chars, lu, this.profiles) }) }, 'Start match')),
      ),
    );
  }
}
