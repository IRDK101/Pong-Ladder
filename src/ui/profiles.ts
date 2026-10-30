// Human player profiles: create, rename, delete, and a simple record from saved matches.

import { NAME_MAX, newProfile, type Profile } from '../core/character';
import type { AppStore, MatchRecord } from '../data/storage';
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
    private onClose: () => void,
  ) {}

  show(): void {
    const profiles = this.store.profiles.list();
    const matches = this.store.matches.list();
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
      h('p', { class: 'dim' }, 'Profiles are the people holding the keyboard, separate from the characters they draft. Ratings and career stats will build up from saved matches.'),
      h('div', { class: 'box row' }, nameInput, h('button', { class: 'primary', onclick: add }, 'Add player'), this.error ? h('span', { class: 'error' }, this.error) : null),
      profiles.length
        ? h('div', { class: 'grid' }, ...profiles.map((p) => this.card(p, profileRecord(matches, p.id))))
        : h('div', { class: 'box' }, h('p', {}, 'No players yet. Add one above, or play as Guest.')),
    );
    this.overlay.show(panel);
    if (!profiles.length) nameInput.focus();
  }

  private fail(msg: string): void {
    this.error = msg;
    this.show();
  }

  private card(p: Profile, rec: { played: number; won: number }): HTMLElement {
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
      h('div', { class: 'row' }, h('button', { onclick: () => ((this.renaming = p.id), this.show()) }, 'Rename'), del),
    );
  }
}
