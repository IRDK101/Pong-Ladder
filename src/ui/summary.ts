// Post-match summary: XP and level-ups for each character, rewards unlocked,
// rating changes for each human, and achievements newly earned.

import type { GameConfig } from '../config';
import { characterSprite } from '../core/sprite';
import type { AppStore, MatchRecord } from '../data/storage';
import { summarizeMatch } from '../progress/summary';
import { h, nameTag, spriteImage, type Overlay } from './dom';
import { nameColorOf } from './characters';

export function hasTrackedPlayers(rec: MatchRecord): boolean {
  return Object.values(rec.roster).some((s) => s.characterId || s.profileId);
}

export function showSummary(overlay: Overlay, store: AppStore, cfg: GameConfig, rec: MatchRecord, onDone: () => void): void {
  const sum = summarizeMatch(cfg, store.matches.list(), rec);
  const chars = sum.characters.map((ch) => {
    const c = store.characters.get(ch.characterId);
    const leveled = ch.levelAfter > ch.levelBefore;
    return h(
      'div',
      { class: 'box card' },
      h(
        'div',
        { class: 'row' },
        c ? spriteImage(characterSprite(c.sprite, c.cosmetics.spriteItem ?? null), 3) : null,
        h('div', {}, c ? nameTag(c.name, c.master, nameColorOf(c)) : h('span', { class: 'dim' }, 'Deleted character'), h('p', { class: 'ok' }, `+${ch.xpGained} XP`)),
      ),
      leveled ? h('p', { class: 'name master' }, `Level up! ${ch.levelBefore} → ${ch.levelAfter}`) : h('p', { class: 'dim' }, `Level ${ch.levelAfter}`),
      ...ch.rewards.map((r) => h('p', { class: 'ok' }, `Unlocked: ${r.label}`)),
      ...ch.achievements.map((a) => h('p', { class: 'name master' }, `Achievement: ${a.name}`)),
    );
  });
  const names = new Map(store.profiles.list().map((p) => [p.id, p.name]));
  const people = sum.profiles.map((p) => {
    const d = p.ratingAfter - p.ratingBefore;
    return h(
      'div',
      { class: 'box card' },
      h('span', { class: 'name' }, names.get(p.profileId) ?? 'Deleted player'),
      d === 0 ? h('p', { class: 'dim' }, `Rating ${p.ratingAfter} (not rated: needs two named players)`) : h('p', { class: d > 0 ? 'ok' : 'error' }, `Rating ${p.ratingBefore} → ${p.ratingAfter} (${d > 0 ? '+' : ''}${d})`),
      ...p.achievements.map((a) => h('p', { class: 'name master' }, `Achievement: ${a.name}`)),
    );
  });
  overlay.show(
    h(
      'div',
      { class: 'panel' },
      h('div', { class: 'row spread' }, h('h1', {}, `Team ${rec.winner} wins: match summary`), h('button', { class: 'primary', onclick: onDone }, 'Back to menu')),
      chars.length ? h('h2', {}, 'Characters') : null,
      chars.length ? h('div', { class: 'grid' }, ...chars) : null,
      people.length ? h('h2', {}, 'Players') : null,
      people.length ? h('div', { class: 'grid' }, ...people) : null,
    ),
  );
}
