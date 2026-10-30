// Phase 1 step 1: render the table and cup formations.
// Dev preview controls: F toggles tree/shrub, click a cup to cycle full -> half -> removed.

import { defaultConfig, makeConfig } from './config';
import { theme } from './theme';
import { buildFormation } from './core/formation';
import type { Cup, CupState, Formation, PlayerId } from './core/types';
import { makeView, render, toTable } from './render/renderer';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

let formation: Formation = defaultConfig.formation;
let cfg = makeConfig({ formation });
const view = makeView(cfg, theme);
canvas.width = view.width;
canvas.height = view.height;

const players: PlayerId[] = [
  { team: 'A', side: 'left' },
  { team: 'A', side: 'right' },
  { team: 'B', side: 'left' },
  { team: 'B', side: 'right' },
];

let cups: Cup[] = [];
function reset(): void {
  cfg = makeConfig({ formation });
  cups = [...buildFormation(cfg, 'A'), ...buildFormation(cfg, 'B')];
}

const NEXT_STATE: Record<CupState, CupState> = { full: 'half', half: 'removed', removed: 'full' };

function draw(): void {
  render(ctx, cfg, theme, view, {
    cups,
    players,
    caption: `${formation.toUpperCase()} (${cups.length / 2} cups)  ·  F: toggle formation  ·  click cup: cycle state  ·  R: reset`,
  });
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyF') {
    formation = formation === 'tree' ? 'shrub' : 'tree';
    reset();
  } else if (e.code === 'KeyR') {
    reset();
  } else return;
  draw();
});

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const [x, y] = toTable(view, e.clientX - rect.left, e.clientY - rect.top);
  const r = cfg.cups.diameter / 2;
  const hit = cups.find((c) => c.state !== 'removed' && Math.hypot(c.x - x, c.y - y) <= r);
  if (hit) {
    hit.state = NEXT_STATE[hit.state];
    draw();
  }
});

reset();
draw();
