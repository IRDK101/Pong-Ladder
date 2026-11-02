// App shell: menu → (draft) → match (one or more games) → win screen. Owns the DOM.

import { makeConfig, type GameConfig, type TableDesign } from './config';
import { tableArt } from './render/basement3d';
import { composeSprite, PART_OPTIONS } from './core/sprite';
import { theme } from './theme';
import type { TeamId } from './core/types';
import { Game, idleInput, POSITIONS, type Roster, type TeamInput } from './game/game';
import { CpuController } from './game/ai';
import { coopInput } from './game/controllers';
import { cameraFrame, teamCamera } from './render/camera';
import { pickCup3D, renderGame3D } from './render/renderer3d';
import { isTyping, Keyboard } from './input/keyboard';
import { makeView } from './render/renderer';
import { renderHud } from './render/hud';
import { HELP, Menu, drawEndScreen, drawHelp, drawMenu, menuLayout, rowRect, type MenuAction, type MenuExtras } from './ui/menu';
import { playerLevel } from './progress/unlocks';
import { characterSprite } from './core/sprite';
import { AppStore, memoryStore, newMatchRecord, type KeyValueStore, type MatchRecord } from './data/storage';
import { h, injectStyles, Overlay } from './ui/dom';
import { CharactersScreen } from './ui/characters';
import { ProfilesScreen } from './ui/profiles';
import { PrematchFlow, quickRoster } from './ui/prematch';
import { Account } from './data/shared';
import { CollectionScreen } from './ui/collection';
import { CharacterPicker, loadSelection, mySlots, pinnedFor, playingAsLabel, SELECTION_KEY, TablePicker } from './ui/picker';
import { showBackup } from './ui/backup';
import { hasTrackedPlayers, showSummary } from './ui/summary';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const baseCfg = makeConfig();
// The game fills the window. Drawing happens in CSS pixels; the canvas backing
// store is scaled by the device pixel ratio so text stays sharp.
let view = makeView(baseCfg, theme, window.innerWidth, window.innerHeight);
let dpr = 1;
function resize(): void {
  const w = Math.max(320, window.innerWidth);
  const h = Math.max(240, window.innerHeight);
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  view = makeView(baseCfg, theme, w, h);
}
resize();
window.addEventListener('resize', resize);

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
const kv = browserStore();
const store = new AppStore(kv);
const menu = new Menu();
// The player's account: level, loot boxes, unlocks, and the shared character collection.
const account = new Account(store, baseCfg, kv);
menu.tableLocked = (v) => !account.tableUnlocked(v);
// The player's picks (table, characters, team), remembered in this browser.
const selection = loadSelection(kv.getItem(SELECTION_KEY));
const saveSelection = () => {
  kv.setItem(SELECTION_KEY, JSON.stringify(selection));
  menu.mySide = selection.mySide;
};
menu.restoreDesign(selection.design);
menu.mySide = selection.mySide;
menu.playingAs = () => playingAsLabel(menu.config(baseCfg), selection, account.usable());
account.onChange(() => {
  if (screen !== 'panel') return;
  if (characters.isShowingList()) characters.showList();
  else if (collection.isShowing()) collection.show();
});
void account.connect();
injectStyles(theme);
const overlay = new Overlay();

/** 'panel' = an HTML screen (characters, players, draft, backup) is open over the canvas. */
type Screen = 'menu' | 'help' | 'panel' | 'playing' | 'gameEnd' | 'matchEnd';
let screen: Screen = 'menu';
let game: Game | null = null;
let cpu: CpuController | null = null;
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
    get account() {
      return account;
    },
    openCollection: (tab?: 'tables' | 'characters' | 'submissions') => openPanel(() => collection.show(tab)),
    art: (d: TableDesign) => tableArt(theme, d).toDataURL(),
    sprite: composeSprite,
    parts: PART_OPTIONS,
    run: (a: MenuAction) => runMenuAction(a),
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
  // Aim keys follow the screen each human is looking at.
  const frameFor = (team: 'A' | 'B') => cameraFrame(teamCamera(cfg, team, 16, 9));
  if (cfg.view === 'split' && cfg.players.mode === 'versus') game.controlFrames = { A: frameFor('A'), B: frameFor('B') };
  else game.controlFrames = { A: frameFor('A'), B: frameFor('A') };
  cpu = cfg.players.mode === 'coop' ? new CpuController('B', cfg.players.cpu, Math.random) : null;
  record = newMatchRecord(cfg);
  counted = {};
  xpNote = '';
  for (const k of POSITIONS) record.roster[k] = { characterId: roster[k].characterId, profileId: roster[k].profileId };
  game.messages.push({ text: `${game.serverName()} serves first (random draw)`, time: 0 });
  screen = 'playing';
  canvas.focus();
}

/** XP this match has already given (so each game adds only what's new). */
let counted: Record<string, number> = {};
/** A line for the end screens about XP and loot boxes. */
let xpNote = '';

/** Persist the finished game (and match, if decided), and give the player their XP. */
function recordGame(): void {
  if (!game || !record) return;
  const winner = game.engine.peek().winner;
  record.games.push({ winner, log: game.engine.log });
  // If this game decides the match, record the result now, so the XP shown and given include the win.
  if (winner && game.match.wins[winner] + 1 >= game.match.gamesToWin) {
    record.winner = winner;
    record.finishedAt = new Date().toISOString();
  }
  store.matches.save(record);
  const side = game.cfg.players.mode === 'coop' ? 'A' : (game.cfg.players.mySide ?? 'A');
  const before = Object.values(counted).reduce((a, b) => a + b, 0);
  const { boxesBefore } = account.recordMatch(record, side, counted);
  const gained = Object.values(counted).reduce((a, b) => a + b, 0) - before;
  const boxes = account.boxes();
  xpNote = `Your side (Team ${side}): +${gained} XP` + (boxes > boxesBefore ? ` · LEVEL UP! ${boxes} loot box${boxes === 1 ? '' : 'es'} in the Collection` : '');
}

/** Keyboard (and CPU) input for the current mode. */
function liveInputs(g: Game): Record<TeamId, TeamInput> {
  if (g.cfg.players.mode === 'coop') {
    // 1v1 against the CPU: one human, who can use either set of keys.
    const a = g.solo ? mergeInputs(keyboard.team('A'), keyboard.team('B')) : coopInput(g, 'A', keyboard.team('A'), keyboard.team('B'));
    return { A: a, B: cpu ? cpu.input(g) : idleInput() };
  }
  return { A: keyboard.team('A'), B: keyboard.team('B') };
}

/** Either of two key sets driving one player. */
function mergeInputs(a: TeamInput, b: TeamInput): TeamInput {
  return {
    up: a.up || b.up,
    down: a.down || b.down,
    left: a.left || b.left,
    right: a.right || b.right,
    hit: a.hit || b.hit,
    style: a.style || b.style,
    nav: a.nav || b.nav,
  };
}

function layoutFor(cfg: GameConfig): 'behindA' | 'split' {
  return cfg.view === 'split' && cfg.players.mode === 'versus' ? 'split' : 'behindA';
}

function anyPressed(codes: (keyof GameConfig['controls']['A'])[]): boolean {
  return (['A', 'B'] as TeamId[]).some((t) => codes.some((k) => keyboard.wasPressed(baseCfg.controls[t][k])));
}

const characters = new CharactersScreen(overlay, store, baseCfg, account, () => toMenu());
const collection = new CollectionScreen(overlay, store, baseCfg, account, characters, () => toMenu());

const menuSprites = new Map<string, ReturnType<typeof characterSprite>>();
/** The title screen's progress card and picks. */
function menuExtras(): MenuExtras {
  const cfg = menu.config(baseCfg);
  const lvl = playerLevel(baseCfg, account.progress);
  const pins = pinnedFor(cfg, selection, account.usable());
  return {
    level: lvl.level,
    xpInto: lvl.into,
    xpSpan: lvl.span,
    boxes: account.boxes(),
    nothingLeft: account.allUnlocked(),
    newRewards: account.newRewards(),
    pending: account.owner ? account.pendingCount() : 0,
    offline: account.mode === 'local',
    team: mySlots(cfg).map((k) => {
      const c = pins[k];
      if (!c) return null;
      const key = `${c.id}:${c.updatedAt}:${c.cosmetics.spriteItem ?? ''}`;
      let sp = menuSprites.get(key);
      if (!sp) menuSprites.set(key, (sp = characterSprite(c.sprite, c.cosmetics.spriteItem ?? null)));
      return sp;
    }),
    tableArt: tableArt(theme, cfg.design),
  };
}

/** Quick match: the player's picks (or random unlocked characters) on their side; the CPU can use any. */
function quickFor(cfg: GameConfig): Roster {
  const mine = account.usable();
  const pins = pinnedFor(cfg, selection, mine);
  if (cfg.players.mode === 'coop') return quickRoster({ A: mine, B: account.everyone() }, cfg.teamSize, Math.random, pins);
  return quickRoster(mine, cfg.teamSize, Math.random, pins);
}

/** How to play, as a scrollable screen like the others (readable on any size). */
function showHelp(): void {
  overlay.show(
    h(
      'div',
      { class: 'panel' },
      h('div', { class: 'row spread' }, h('h1', {}, 'How to play'), h('button', { class: 'primary', onclick: () => toMenu() }, 'Back to menu')),
      h('div', { class: 'help' }, ...HELP.flatMap(([k, t]) => [h('h2', {}, k), h('p', {}, t)])),
    ),
  );
}

const tablePicker = new TablePicker(
  overlay,
  account,
  (d) => {
    menu.setDesign(d);
    selection.design = d;
    saveSelection();
    toMenu();
  },
  () => toMenu(),
);
const characterPicker = new CharacterPicker(overlay, () => menu.config(baseCfg), account, selection, saveSelection, () => toMenu());
const profiles = new ProfilesScreen(overlay, store, baseCfg, () => toMenu());

function runMenuAction(action: MenuAction): void {
  const cfg = menu.config(baseCfg);
  switch (action) {
    case 'quick':
      return startMatch(cfg, quickFor(cfg));
    case 'draft':
      return openPanel(() =>
        new PrematchFlow(overlay, store, cfg, Math.random, account, {
          collection: () => collection.show(),
          start: ({ roster }) => startMatch(cfg, roster),
          cancel: () => toMenu(),
          editCharacters: () => characters.showList(),
          quickMatch: () => startMatch(cfg, quickFor(cfg)),
        }).begin(),
      );
    case 'collection':
      return openPanel(() => collection.show());
    case 'pickTable':
      return openPanel(() => tablePicker.show(cfg.design));
    case 'pickCharacters':
      return openPanel(() => characterPicker.show());
    case 'characters':
      return openPanel(() => characters.showList());
    case 'profiles':
      return openPanel(() => profiles.show());
    case 'backup':
      return openPanel(() => showBackup(overlay, store, () => toMenu()));
    case 'help':
      return openPanel(() => showHelp());
  }
}

// A CPU-vs-CPU demo match plays in the basement behind the title screen.
let demo: { game: Game; a: CpuController; b: CpuController } | null = null;
function drawBackdrop(dt: number): void {
  if (!demo || demo.game.engine.peek().phase === 'gameOver') {
    const g = new Game(makeConfig({ formation: 'shrub', penaltyCupSelection: 'auto' }), Math.random, quickRoster(account.everyone(), 2));
    const frame = cameraFrame(teamCamera(g.cfg, 'A', 16, 9));
    g.controlFrames = { A: frame, B: frame };
    demo = { game: g, a: new CpuController('A', 'hard', Math.random), b: new CpuController('B', 'medium', Math.random) };
  }
  const d = demo;
  // The demo plays at whichever table is picked in the menu (the venue is visual only).
  const pick = menu.config(baseCfg);
  d.game.cfg.venue = pick.venue;
  d.game.cfg.design = pick.design;
  d.game.update(dt, { A: d.a.input(d.game), B: d.b.input(d.game) });
  renderGame3D(ctx, theme, view, d.game, 'behindA', false);
}

function frame(dt: number): void {
  if (screen === 'panel') {
    drawBackdrop(dt);
    return;
  }
  if (screen === 'help') {
    if (keyboard.presses().length) screen = 'menu';
    drawBackdrop(dt);
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
      else if (role === 'left' || role === 'right') {
        menu.move(0, role === 'left' ? -1 : 1);
        const d = menu.config(baseCfg).design;
        if (d !== selection.design) {
          selection.design = d;
          saveSelection();
        }
      }
      else if (role === 'hit') runMenuAction(menu.activate());
    }
    if (screen !== 'menu') return;
    drawBackdrop(dt);
    drawMenu(ctx, theme, view, menu, document.hasFocus() ? menuNote : 'Click the game first so it can hear your keyboard.', menuExtras());
    return;
  }

  const g = game!;
  if (screen === 'playing') {
    g.update(dt, debugInputs ? debugInputs(g) : liveInputs(g));
    if (g.engine.peek().phase === 'gameOver') {
      recordGame();
      gameOverAt = performance.now();
      screen = 'gameEnd';
    }
  } else {
    g.update(dt, { A: idleInput(), B: idleInput() });
  }

  renderGame3D(ctx, theme, view, g, layoutFor(g.cfg));
  renderHud(ctx, theme, view, g);

  // Short pause so the final call is readable before the overlay accepts input.
  const ready = performance.now() - gameOverAt > 800;
  if (screen === 'gameEnd') {
    const st = g.engine.peek();
    const matchWinner = g.match.wins[st.winner!] + 1 >= g.match.gamesToWin;
    const lines = [g.teamLine(st.winner!), g.cupsLeftLine()];
    if (g.cfg.matchFormat === 'bestOf3') lines.push(`Games: A ${g.match.wins.A + (st.winner === 'A' ? 1 : 0)} – ${g.match.wins.B + (st.winner === 'B' ? 1 : 0)} B`);
    if (xpNote) lines.push(xpNote);
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
    drawEndScreen(ctx, theme, view, `TEAM ${g.match.winner} WINS THE MATCH`, [g.teamLine(g.match.winner!), `Games: A ${g.match.wins.A} – ${g.match.wins.B} B`, xpNote || 'Match log saved'], 'Press Space / Enter for the menu');
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
  // Escape in a text box just leaves the box, so a half-typed name is not thrown away.
  if (isTyping(e.target)) return void (e.target as HTMLElement).blur();
  if (screen === 'playing' || screen === 'gameEnd' || screen === 'matchEnd') toMenu('Match abandoned.');
  else if (screen === 'panel' || screen === 'help') toMenu();
});

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = ((e.clientX - rect.left) * view.width) / rect.width;
  const sy = ((e.clientY - rect.top) * view.height) / rect.height;
  if (screen === 'help') {
    screen = 'menu';
    return;
  }
  if (screen === 'menu') {
    const L = menuLayout(view);
    const mx = (sx - L.ox) / L.s;
    const my = (sy - L.oy) / L.s;
    menu.rows().forEach((row, i) => {
      const r = rowRect(row.id, L.portrait);
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        menu.cursor = i;
        runMenuAction(menu.activate());
      }
    });
  } else if (screen === 'playing' && game) {
    // Against the CPU, the human can't make the CPU's penalty choice for it.
    const pen = game.engine.peek().penalty;
    if (game.cfg.players.mode === 'coop' && pen && pen.chooser === 'B') return;
    const cup = pickCup3D(game, game.penaltyCups(), sx, sy);
    if (cup) game.chooseCup(cup.team, cup.id);
  }
});

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  frame(dt);
  keyboard.endFrame();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
