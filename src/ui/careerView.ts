// Shared views of derived progress: career stat tables, level bars, rating charts.

import type { GameConfig } from '../config';
import { getStyle, STYLES } from '../core/styles';
import type { MatchRecord } from '../data/storage';
import { careerRates, deriveCareers, emptyCareer, FAULT_KINDS, FAULT_LABELS, type Careers, type CareerStats } from '../progress/careers';
import { computeRatings, type Rating } from '../progress/elo';
import { levelFor, xpFor, type LevelInfo } from '../progress/levels';
import { h } from './dom';

/** Everything derived from the saved matches, computed once per screen. */
export interface Progress {
  careers: Careers;
  ratings: Map<string, Rating>;
  characterLevel(id: string): LevelInfo;
  characterCareer(id: string): CareerStats;
  profileCareer(id: string): CareerStats;
  rating(id: string): Rating;
}

export function progressFrom(cfg: GameConfig, matches: MatchRecord[]): Progress {
  const careers = deriveCareers(matches);
  const ratings = computeRatings(cfg, matches);
  return {
    careers,
    ratings,
    characterCareer: (id) => careers.characters.get(id) ?? emptyCareer(),
    profileCareer: (id) => careers.profiles.get(id) ?? emptyCareer(),
    characterLevel: (id) => levelFor(cfg, xpFor(cfg, careers.characters.get(id) ?? emptyCareer())),
    rating: (id) => ratings.get(id) ?? { rating: cfg.progression.elo.start, history: [] },
  };
}

export function levelBar(info: LevelInfo): HTMLElement {
  const fill = h('i');
  fill.style.width = `${Math.round((info.into / info.span) * 100)}%`;
  return h(
    'div',
    { style: 'display:flex;flex-direction:column;gap:4px;width:100%' },
    h('div', { class: 'row spread' }, h('span', { class: 'name' }, `Level ${info.level}`), h('span', { class: 'dim' }, `${info.into} / ${info.span} XP to level ${info.level + 1}`)),
    h('span', { class: 'bar' }, fill),
  );
}

const pct = (v: number | null) => (v === null ? '—' : `${v}%`);

/** Career stats grouped into labelled sections. */
export function careerTable(s: CareerStats): HTMLElement {
  const r = careerRates(s);
  const groups: [string, [string, string | number][]][] = [
    [
      'Results',
      [
        ['Matches won – lost', `${s.matchesWon} – ${s.matchesLost}`],
        ['Match win rate', pct(r.winPct)],
        ['Games won – lost', `${s.gamesWon} – ${s.gamesLost}`],
        ['Biggest comeback', s.biggestComeback ? `${s.biggestComeback} cups` : '—'],
      ],
    ],
    [
      'Cups',
      [
        ['Cups sunk', s.cupsSunk],
        ['Cups downed', s.cupsDowned],
        ['Cup hits', s.cupHits],
        ['Longest sink chain', s.longestSinkChain],
      ],
    ],
    [
      'Saves',
      [
        ['Saves made', s.savesMade],
        ['Saves failed', s.savesFailed],
        ['Save rate', pct(r.savePct)],
        ['Last-cup saves', s.clutchSaves],
      ],
    ],
    [
      'Serving',
      [
        ['Serves', s.serves],
        ['Good serve rate', pct(r.goodServePct)],
        ['Aces', s.aces],
        ['Table misses', s.serveTableMisses],
        ['Serve cup penalties', s.serveCupPenalties],
      ],
    ],
    [
      'Hitting',
      [
        ['Hits', s.hits],
        ['Perfect hits', s.perfectHits],
        ['Average timing', r.avgTiming === null ? '—' : `${r.avgTiming} / 100`],
        ['Longest rally', s.longestRally ? `${s.longestRally} hits` : '—'],
        ['Favorite style', r.favoriteStyle && STYLES[r.favoriteStyle] ? getStyle(r.favoriteStyle).name : '—'],
      ],
    ],
    ['Faults', FAULT_KINDS.map((k): [string, number] => [FAULT_LABELS[k], s.faults[k]])],
  ];
  return h(
    'div',
    { class: 'grid' },
    ...groups.map(([title, rows]) =>
      h(
        'div',
        { class: 'box', style: 'display:flex;flex-direction:column;gap:4px' },
        h('h2', {}, title),
        ...rows.map(([label, value]) => h('div', { class: 'kv' }, h('span', { class: 'dim' }, label), h('span', {}, String(value)))),
      ),
    ),
  );
}

/** Rating history as an inline SVG line (rating after each rated match). */
export function ratingChart(r: Rating, start: number, color: string, gridColor: string): HTMLElement {
  if (!r.history.length) return h('p', { class: 'dim' }, 'No rated matches yet. Matches between two named players (not Guest) count.');
  const pts = [start, ...r.history.map((p) => p.rating)];
  const W = 520;
  const H = 140;
  const pad = 28;
  const lo = Math.min(...pts) - 10;
  const hi = Math.max(...pts) + 10;
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(1, pts.length - 1);
  const y = (v: number) => H - pad + ((v - lo) * -(H - pad * 2)) / (hi - lo);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Rating history from ${start} to ${r.rating}`);
  svg.style.width = '100%';
  svg.style.maxWidth = `${W}px`;
  const el = (tag: string, attrs: Record<string, string | number>) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    svg.append(e);
    return e;
  };
  el('line', { x1: pad, x2: W - pad, y1: y(start), y2: y(start), stroke: gridColor, 'stroke-dasharray': '4 4' });
  const label = (text: string, xx: number, yy: number, anchor: string) => {
    const t = el('text', { x: xx, y: yy, fill: gridColor, 'font-size': 11, 'text-anchor': anchor, 'font-family': 'monospace' });
    t.textContent = text;
  };
  label(String(start), pad - 4, y(start) + 4, 'end');
  el('polyline', { points: pts.map((v, i) => `${x(i)},${y(v)}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round' });
  el('circle', { cx: x(pts.length - 1), cy: y(r.rating), r: 4, fill: color });
  label(String(r.rating), x(pts.length - 1), y(r.rating) - 8, 'middle');
  label(`${r.history.length} rated match${r.history.length === 1 ? '' : 'es'}`, W - pad, H - 6, 'end');
  return h('div', {}, svg);
}
