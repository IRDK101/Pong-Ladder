// App shell: menu → match (one or more games) → win screen. Owns the DOM.

import { makeConfig, type GameConfig } from './config';
import { theme } from './theme';
import { buildFormation } from './core/formation';
import type { TeamId } from './core/types';
import { Game, idleInput, type TeamInput } from './game/game';
import { Keyboard } from './input/keyboard';
import { cupAt, drawField, makeView, renderGame } from './render/renderer';
import { renderHud } from './render/hud';
import { Menu, drawEndScreen, drawMenu, menuRowRect } from './ui/menu';
import { MatchStore, newMatchRecord, type MatchRecord } from './data/storage';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const baseCfg = makeConfig();
const view = makeView(baseCfg, theme);
canvas.width = view.width;
canvas.height = view.height;

const keyboard = new Keyboard(baseCfg);
const store = new MatchStore(window.localStorage);
const menu = new Menu();

type Screen = 'menu' | 'playing' | 'gameEnd' | 'matchEnd';
let screen: Screen = 'menu';
let game: Game | null = null;
let record: MatchRecord | null = null;
let menuNote = '';
let gameOverAt = 0;
let lastInputs: Record<TeamId, TeamInput> = { A: idleInput(), B: idleInput() };

// Debug hook (open the page with #debug): lets scripted bots drive the game for automated checks.
let debugInputs: ((g: Game) => Record<TeamId, TeamInput>) | null = null;
if (location.hash === '#debug') {
  (window as unknown as { __pong: unknown }).__pong = {
    game: () => game,
    screen: () => screen,
    store,
    setInputs: (fn: typeof debugInputs) => (debugInputs = fn),
  };
}

function startMatch(cfg: GameConfig): void {
  game = new Game(cfg);
  record = newMatchRecord(cfg);
  game.messages.push({ text: `${serverName()} serves first (random draw)`, time: 0 });
  screen = 'playing';
}

function serverName(): string {
  const s = game!.engine.peek().server;
  return `${s.team}-${s.side === 'left' ? 'L' : 'R'}`;
}

/** Persist the finished game (and match, if decided). */
function recordGame(): void {
  if (!game || !record) return;
  record.games.push({ winner: game.engine.peek().winner, log: game.engine.log });
  store.save(record);
}

function anyPressed(codes: (keyof GameConfig['controls']['A'])[]): boolean {
  return (['A', 'B'] as TeamId[]).some((t) => codes.some((k) => keyboard.wasPressed(baseCfg.controls[t][k])));
}

function exportLogs(): void {
  const blob = new Blob([store.exportJson()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `dartmouth-pong-matches-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  menuNote = `Exported ${store.list().length} match(es).`;
}

function importLogs(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const added = store.importJson(await file.text());
      menuNote = `Imported ${added} new match(es).`;
    } catch (e) {
      menuNote = `Import failed: ${(e as Error).message}`;
    }
  };
  input.click();
}

function runMenuAction(action: ReturnType<Menu['activate']>): void {
  if (action === 'start') startMatch(menu.config(baseCfg));
  else if (action === 'export') exportLogs();
  else if (action === 'import') importLogs();
}

function frame(dt: number): void {
  if (screen === 'menu') {
    for (const code of keyboard.presses()) {
      if (screen !== 'menu') break;
      const role = (['A', 'B'] as TeamId[])
        .map((t) => (Object.keys(baseCfg.controls[t]) as (keyof GameConfig['controls']['A'])[]).find((k) => baseCfg.controls[t][k] === code))
        .find(Boolean);
      if (role === 'up') menu.move(-1, 0);
      else if (role === 'down') menu.move(1, 0);
      else if (role === 'left') menu.move(0, -1);
      else if (role === 'right') menu.move(0, 1);
      else if (role === 'hit') runMenuAction(menu.activate());
    }
    const cfg = menu.config(baseCfg);
    drawField(ctx, cfg, theme, view, [...buildFormation(cfg, 'A'), ...buildFormation(cfg, 'B')]);
    drawMenu(ctx, theme, view, menu, menuNote);
    return;
  }

  const g = game!;
  if (screen === 'playing') {
    lastInputs = debugInputs ? debugInputs(g) : { A: keyboard.team('A'), B: keyboard.team('B') };
    g.update(dt, lastInputs);
    if (g.engine.peek().phase === 'gameOver') {
      recordGame();
      gameOverAt = performance.now();
      screen = 'gameEnd';
    }
  } else {
    g.update(dt, { A: idleInput(), B: idleInput() });
  }

  renderGame(ctx, theme, view, g, lastInputs);
  renderHud(ctx, theme, view, g);

  // Short pause so the final call is readable before the overlay accepts input.
  const ready = performance.now() - gameOverAt > 800;
  if (screen === 'gameEnd') {
    const st = g.engine.peek();
    const matchWinner = g.match.wins[st.winner!] + 1 >= g.match.gamesToWin;
    const lines = [`${g.cupsLeftLine()}`];
    if (g.cfg.matchFormat === 'bestOf3') lines.push(`Games: A ${g.match.wins.A + (st.winner === 'A' ? 1 : 0)} – ${g.match.wins.B + (st.winner === 'B' ? 1 : 0)} B`);
    drawEndScreen(ctx, theme, view, matchWinner ? `TEAM ${st.winner} WINS!` : `Team ${st.winner} takes game ${g.match.games.length}`, lines, ready ? 'Press Space / Enter' : '');
    if (ready && anyPressed(['hit'])) {
      const w = g.continueMatch();
      if (w) {
        record!.winner = w;
        record!.finishedAt = new Date().toISOString();
        store.save(record!);
        screen = 'matchEnd';
      } else screen = 'playing';
    }
  } else if (screen === 'matchEnd') {
    drawEndScreen(ctx, theme, view, `TEAM ${g.match.winner} WINS THE MATCH`, [`Games: A ${g.match.wins.A} – ${g.match.wins.B} B`, 'Match log saved'], 'Press Space / Enter for the menu');
    if (anyPressed(['hit'])) screen = 'menu';
  }
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && screen !== 'menu') {
    screen = 'menu';
    menuNote = 'Match abandoned.';
  }
});

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = ((e.clientX - rect.left) * canvas.width) / rect.width;
  const sy = ((e.clientY - rect.top) * canvas.height) / rect.height;
  if (screen === 'menu') {
    menu.rows().forEach((_, i) => {
      const r = menuRowRect(view, i);
      if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) {
        menu.cursor = i;
        runMenuAction(menu.activate());
      }
    });
  } else if (screen === 'playing' && game) {
    const cup = cupAt(game.cfg, view, game.penaltyCups(), sx, sy);
    if (cup) game.chooseCup(cup.team, cup.id);
  }
});

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  frame(dt);
  keyboard.endFrame();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
