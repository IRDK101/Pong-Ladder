// Human player profiles: create, rename, delete, and a simple record from saved matches.

import { NAME_MAX, newProfile, type Profile } from '../core/character';
import type { GameConfig } from '../config';
import type { AppStore, MatchRecord } from '../data/storage';
import { theme } from '../theme';
import { careerTable, progressFrom, ratingChart } from './careerView';
import { h, type Overlay } from './dom';

/** Matches played and won by a profile, from saved match records. Fuller career stats arrive in Phase 3. */
export function profileRecord(matches: MatchRecord[], profileId: string): { played: number; won: number } {
  let played = 0;
  let won = 0;
  for (const m of matches) {
    if (!m.winner) continue;
    const team = (Object.entries(m.roster).find(([, slot]) => slot.profileId === profileId)?.[0] ?? '').charAt(0);
    if (team !== 'A' && team !== 'B') continue;
    played++;
    if (m.winner === team) won++;
  }
  return { played, won };
}

export class ProfilesScreen {
  private renaming: string | null = null;
  private confirmDelete: string | null = null;
  private error = '';

  constructor(
    private overlay: Overlay,
    private store: AppStore,
    private cfg: GameConfig,
    private onClose: () => void,
  ) {}

  /** Rating, rating history and career stats for one human player. */
  showProfile(id: string): void {
    const p = this.store.profiles.get(id);
    if (!p) return this.show();
    const prog = progressFrom(this.cfg, this.store.matches.list());
    const r = prog.rating(id);
    const names = new Map(this.store.profiles.list().map((x) => [x.id, x.name]));
    const recent = [...r.history].reverse().slice(0, 8);
    this.overlay.show(
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'row spread' }, h('h1', {}, p.name), h('button', { onclick: () => this.show() }, 'All players')),
        h(
          'div',
          { class: 'box', style: 'display:flex;flex-direction:column;gap:10px' },
          h('div', { class: 'row spread' }, h('h2', {}, 'Rating'), h('span', { class: 'name', style: 'font-size:24px;font-variant-numeric:tabular-nums' }, String(r.rating))),
          ratingChart(r, this.cfg.progression.elo.start, theme.colors.activeRing, theme.colors.textDim),
          recent.length
            ? h(
                'div',
                { style: 'display:flex;flex-direction:column;gap:2px;font-variant-numeric:tabular-nums' },
                ...recent.map((pt) =>
                  h(
                    'div',
                    { class: 'row spread' },
                    h('span', {}, `${pt.won ? 'Beat' : 'Lost to'} ${names.get(pt.opponentId) ?? 'a deleted player'}`),
                    h('span', { class: 'dim' }, pt.at.slice(0, 10)),
                    h('span', { class: pt.delta >= 0 ? 'ok' : 'error' }, `${pt.delta >= 0 ? '+' : ''}${pt.delta} → ${pt.rating}`),
                  ),
                ),
              )
            : null,
        ),
        h('h2', {}, 'Career'),
        careerTable(prog.profileCareer(id)),
      ),
    );
  }

  show(): void {
    const profiles = this.store.profiles.list();
    const matches = this.store.matches.list();
    const prog = progressFrom(this.cfg, matches);
    const nameInput = h('input', { id: 'new-profile', type: 'text', maxlength: NAME_MAX, placeholder: 'Your name' });
    const add = () => {
      const name = nameInput.value.trim();
      if (!name) return this.fail('Type a name first.');
      if (profiles.some((p) => p.name.toLowerCase() === name.toLowerCase())) return this.fail(`There is already a profile called ${name}.`);
      this.store.profiles.save(newProfile(name));
      this.error = '';
      this.show();
    };
    nameInput.addEventListener('keydown', (e) => e.key === 'Enter' && add());

    const panel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'row spread' }, h('h1', {}, 'Players'), h('button', { onclick: () => this.onClose() }, 'Back to menu')),
      h('p', { class: 'dim' }, 'Profiles are the people holding the keyboard, separate from the characters they draft. Ratings (Elo, starting at 1000) and career stats build up from saved matches.'),
      h('div', { class: 'box row' }, nameInput, h('button', { class: 'primary', onclick: add }, 'Add player'), this.error ? h('span', { class: 'error' }, this.error) : null),
      profiles.length
        ? h('div', { class: 'grid' }, ...profiles.map((p) => this.card(p, profileRecord(matches, p.id), prog.rating(p.id).rating)))
        : h('div', { class: 'box' }, h('p', {}, 'No players yet. Add one above, or play as Guest.')),
    );
    this.overlay.show(panel);
    if (!profiles.length) nameInput.focus();
  }

  private fail(msg: string): void {
    this.error = msg;
    this.show();
  }

  private card(p: Profile, rec: { played: number; won: number }, rating: number): HTMLElement {
    if (this.renaming === p.id) {
      const input = h('input', { type: 'text', maxlength: NAME_MAX, value: p.name });
      const save = () => {
        const name = input.value.trim();
        if (!name) return;
        this.store.profiles.save({ ...p, name });
        this.renaming = null;
        this.show();
      };
      input.addEventListener('keydown', (e) => e.key === 'Enter' && save());
      setTimeout(() => input.focus());
      return h('div', { class: 'box card' }, input, h('div', { class: 'row' }, h('button', { class: 'primary', onclick: save }, 'Save'), h('button', { onclick: () => ((this.renaming = null), this.show()) }, 'Cancel')));
    }
    const del =
      this.confirmDelete === p.id
        ? h(
            'div',
            { class: 'row' },
            h('button', { class: 'danger', onclick: () => (this.store.profiles.remove(p.id), (this.confirmDelete = null), this.show()) }, 'Yes, delete'),
            h('button', { onclick: () => ((this.confirmDelete = null), this.show()) }, 'Keep'),
          )
        : h('button', { class: 'danger', onclick: () => ((this.confirmDelete = p.id), this.show()) }, 'Delete');
    return h(
      'div',
      { class: 'box card' },
      h('span', { class: 'name' }, p.name),
      h('p', { class: 'dim' }, rec.played ? `${rec.played} match${rec.played === 1 ? '' : 'es'} · ${rec.won} won` : 'No finished matches yet'),
      h('p', {}, `Rating ${rating}`),
      h('div', { class: 'row' }, h('button', { onclick: () => this.showProfile(p.id) }, 'Profile'), h('button', { onclick: () => ((this.renaming = p.id), this.show()) }, 'Rename'), del),
    );
  }
}
