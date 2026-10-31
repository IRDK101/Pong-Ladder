// App shell: menu → (draft) → match (one or more games) → win screen. Owns the DOM.

import { makeConfig, type GameConfig } from './config';
import { theme } from './theme';
import { buildFormation } from './core/formation';
import type { TeamId } from './core/types';
import { Game, genericRoster, idleInput, POSITIONS, type Roster, type TeamInput } from './game/game';
import { Keyboard } from './input/keyboard';
import { cupAt, drawField, makeView, renderGame } from './render/renderer';
import { renderHud } from './render/hud';
import { Menu, drawEndScreen, drawHelp, drawMenu, menuRowRect, type MenuAction } from './ui/menu';
import { AppStore, memoryStore, newMatchRecord, type KeyValueStore, type MatchRecord } from './data/storage';
import { injectStyles, Overlay } from './ui/dom';
import { CharactersScreen } from './ui/characters';
import { ProfilesScreen } from './ui/profiles';
import { PrematchFlow } from './ui/prematch';
import { showBackup } from './ui/backup';
import { hasTrackedPlayers, showSummary } from './ui/summary';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const baseCfg = makeConfig();
const view = makeView(baseCfg, theme);
canvas.width = view.width;
canvas.height = view.height;

const keyboard = new Keyboard(baseCfg);

/** localStorage when the browser allows it; otherwise data lasts only for this visit. */
function browserStore(): KeyValueStore {
  try {
    const ls = window.localStorage;
    const probe = 'dartmouth-pong/probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return {
      getItem: (k) => {
        try {
          return ls.getItem(k);
        } catch {
          return null;
        }
      },
      setItem: (k, v) => {
        try {
          ls.setItem(k, v);
        } catch {
          /* storage full or blocked: keep playing */
        }
      },
    };
  } catch {
    return memoryStore();
  }
}
const store = new AppStore(browserStore());
const menu = new Menu();
injectStyles(theme);
const overlay = new Overlay();

/** 'panel' = an HTML screen (characters, players, draft, backup) is open over the canvas. */
type Screen = 'menu' | 'help' | 'panel' | 'playing' | 'gameEnd' | 'matchEnd';
let screen: Screen = 'menu';
let game: Game | null = null;
let record: MatchRecord | null = null;
let menuNote = '';
let gameOverAt = 0;

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

function toMenu(note = ''): void {
  overlay.hide();
  menuNote = note;
  screen = 'menu';
  canvas.focus();
}

function openPanel(show: () => void): void {
  screen = 'panel';
  show();
}

function startMatch(cfg: GameConfig, roster: Roster): void {
  overlay.hide();
  game = new Game(cfg, Math.random, roster);
  record = newMatchRecord(cfg);
  for (const k of POSITIONS) record.roster[k] = { characterId: roster[k].characterId, profileId: roster[k].profileId };
  game.messages.push({ text: `${game.serverName()} serves first (random draw)`, time: 0 });
  screen = 'playing';
  canvas.focus();
}

/** Persist the finished game (and match, if decided). */
function recordGame(): void {
  if (!game || !record) return;
  record.games.push({ winner: game.engine.peek().winner, log: game.engine.log });
  store.matches.save(record);
}

function anyPressed(codes: (keyof GameConfig['controls']['A'])[]): boolean {
  return (['A', 'B'] as TeamId[]).some((t) => codes.some((k) => keyboard.wasPressed(baseCfg.controls[t][k])));
}

const characters = new CharactersScreen(overlay, store, baseCfg, () => toMenu());
const profiles = new ProfilesScreen(overlay, store, baseCfg, () => toMenu());

function runMenuAction(action: MenuAction): void {
  const cfg = menu.config(baseCfg);
  switch (action) {
    case 'quick':
      return startMatch(cfg, genericRoster());
    case 'draft':
      return openPanel(() =>
        new PrematchFlow(overlay, store, cfg, Math.random, {
          start: ({ roster }) => startMatch(cfg, roster),
          cancel: () => toMenu(),
          editCharacters: () => characters.showList(),
          quickMatch: () => startMatch(cfg, genericRoster()),
        }).begin(),
      );
    case 'characters':
      return openPanel(() => characters.showList());
    case 'profiles':
      return openPanel(() => profiles.show());
    case 'backup':
      return openPanel(() => showBackup(overlay, store, () => toMenu()));
    case 'help':
      screen = 'help';
      return;
  }
}

function drawBackdrop(): void {
  const cfg = menu.config(baseCfg);
  drawField(ctx, cfg, theme, view, [...buildFormation(cfg, 'A'), ...buildFormation(cfg, 'B')]);
}

function frame(dt: number): void {
  if (screen === 'panel') {
    drawBackdrop();
    return;
  }
  if (screen === 'help') {
    if (keyboard.presses().length) screen = 'menu';
    drawBackdrop();
    drawHelp(ctx, theme, view);
    return;
  }
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
    if (screen !== 'menu') return;
    drawBackdrop();
    drawMenu(ctx, theme, view, menu, document.hasFocus() ? menuNote : 'Click the game first so it can hear your keyboard.');
    return;
  }

  const g = game!;
  if (screen === 'playing') {
    g.update(dt, debugInputs ? debugInputs(g) : { A: keyboard.team('A'), B: keyboard.team('B') });
    if (g.engine.peek().phase === 'gameOver') {
      recordGame();
      gameOverAt = performance.now();
      screen = 'gameEnd';
    }
  } else {
    g.update(dt, { A: idleInput(), B: idleInput() });
  }

  renderGame(ctx, theme, view, g);
  renderHud(ctx, theme, view, g);

  // Short pause so the final call is readable before the overlay accepts input.
  const ready = performance.now() - gameOverAt > 800;
  if (screen === 'gameEnd') {
    const st = g.engine.peek();
    const matchWinner = g.match.wins[st.winner!] + 1 >= g.match.gamesToWin;
    const lines = [g.teamLine(st.winner!), g.cupsLeftLine()];
    if (g.cfg.matchFormat === 'bestOf3') lines.push(`Games: A ${g.match.wins.A + (st.winner === 'A' ? 1 : 0)} – ${g.match.wins.B + (st.winner === 'B' ? 1 : 0)} B`);
    drawEndScreen(ctx, theme, view, matchWinner ? `TEAM ${st.winner} WINS!` : `Team ${st.winner} takes game ${g.match.games.length}`, lines, ready ? 'Press Space / Enter' : '');
    if (ready && anyPressed(['hit'])) {
      const w = g.continueMatch();
      if (w) {
        record!.winner = w;
        record!.finishedAt = new Date().toISOString();
        store.matches.save(record!);
        screen = 'matchEnd';
      } else screen = 'playing';
    }
  } else if (screen === 'matchEnd') {
    drawEndScreen(ctx, theme, view, `TEAM ${g.match.winner} WINS THE MATCH`, [g.teamLine(g.match.winner!), `Games: A ${g.match.wins.A} – ${g.match.wins.B} B`, 'Match log saved'], 'Press Space / Enter for the menu');
    if (anyPressed(['hit'])) {
      if (record && hasTrackedPlayers(record)) {
        const rec = record;
        openPanel(() => showSummary(overlay, store, baseCfg, rec, () => toMenu()));
      } else toMenu();
    }
  }
}

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  if (screen === 'playing' || screen === 'gameEnd' || screen === 'matchEnd') toMenu('Match abandoned.');
  else if (screen === 'panel' || screen === 'help') toMenu();
});

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = ((e.clientX - rect.left) * canvas.width) / rect.width;
  const sy = ((e.clientY - rect.top) * canvas.height) / rect.height;
  if (screen === 'help') {
    screen = 'menu';
    return;
  }
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
