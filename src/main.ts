// App shell: menu → (draft) → match (one or more games) → win screen. Owns the DOM.

import { makeConfig, type GameConfig, type TableDesign } from './config';
import { tableArt } from './render/basement3d';
import { gameStats, sumStats, type GameStats } from './game/stats';
import { composeBase, composeSprite, PART_OPTIONS, randomParts } from './core/sprite';
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
import { HELP, speedStepOf, Menu, drawEndScreen, drawHelp, drawMenu, menuLayout, rowRect, type MenuAction, type MenuExtras } from './ui/menu';
import { playerLevel } from './progress/unlocks';
import { characterSprite } from './core/sprite';
import { AppStore, memoryStore, newMatchRecord, type KeyValueStore, type MatchRecord } from './data/storage';
import { h, injectStyles, Overlay } from './ui/dom';
import { CharactersScreen } from './ui/characters';
import { PrematchFlow, quickRoster } from './ui/prematch';
import { Account } from './data/shared';
import { CollectionScreen } from './ui/collection';
import { LeaderboardScreen, ModeratorScreen, ProfileScreen } from './ui/profile';
import { OnlineScreen, type OnlineStart } from './ui/online';
import { MatchLink, type MatchSettings } from './net/online';
import { matchXp } from './progress/unlocks';
import { participantFrom } from './ui/prematch';
import { ProfileEditor } from './ui/profileEdit';
import { CharacterPicker, loadSelection, mySlots, otherPinnedFor, otherSlots, pinnedFor, playersLabel, SELECTION_KEY, TablePicker } from './ui/picker';
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
menu.entered();
// The home screen's settings are remembered in this browser.
const MENU_KEY = 'dartmouth-pong/menu/v1';
try {
  menu.restore(JSON.parse(kv.getItem(MENU_KEY) ?? 'null'));
} catch {
  /* start from the defaults */
}
menu.onChange = () => kv.setItem(MENU_KEY, JSON.stringify(menu.snapshot()));
// The player's account: level, loot boxes, unlocks, and the shared character collection.
const account = new Account(store, baseCfg, kv);
menu.tableLocked = (v) => !account.tableUnlocked(v);
// The player's picks (table, characters, team), remembered in this browser.
const selection = loadSelection(kv.getItem(SELECTION_KEY));
const saveSelection = () => {
  kv.setItem(SELECTION_KEY, JSON.stringify(selection));
  menu.mySide = selection.mySide;
  account.saveSelection(selection);
  syncShowcase();
};
/** The character the player plays as: their first Playing as spot (null = random). */
function mainCharacter() {
  const id = selection.chars[0];
  return (id && account.usable().find((c) => c.id === id)) || null;
}
/** Keep the profile card's character (leaderboard, lobby) the one they play as. */
function syncShowcase(): void {
  if (account.myProfile) account.setShowcase(mainCharacter());
}
/** Picks saved with the account win over this browser's, once, when the account first answers. */
let selectionAdopted = false;
function adoptSelection(): void {
  const remote = account.progress.selection;
  if (selectionAdopted || account.mode !== 'online' || !remote) return;
  selectionAdopted = true;
  selection.design = remote.design as typeof selection.design;
  selection.chars = [...remote.chars];
  selection.mySide = remote.mySide;
  if (remote.cpu) selection.cpu = [...remote.cpu];
  kv.setItem(SELECTION_KEY, JSON.stringify(selection));
  menu.restoreDesign(selection.design);
  menu.mySide = selection.mySide;
}
menu.restoreDesign(selection.design);
menu.mySide = selection.mySide;
menu.playingAs = () => playersLabel(menu.config(baseCfg));
menu.leaderboardHint = () => {
  const board = account.leaderboard();
  const i = account.uid ? board.findIndex((r) => r.uid === account.uid) : -1;
  if (i >= 0) return `you're #${i + 1} of ${board.length}`;
  return board.length ? `${board.length} player${board.length === 1 ? '' : 's'} ranked by XP` : 'XP of every approved player';
};
menu.onlineInfo = () => {
  if (onlineScreen.blockedNow()) return { hint: 'approved profiles only', challenges: 0 };
  const s = onlineScreen.status();
  return { hint: s.here ? `${s.here} player${s.here === 1 ? '' : 's'} online now` : 'nobody else online right now', challenges: s.challenges };
};
menu.accountInfo = () => {
  const who = account.me?.name || account.me?.email || '';
  if (account.role === 'moderator') return { label: 'Moderator profile', hint: who ? `${who} · review, edit, approve` : 'review, edit, approve', alert: account.pendingCount() + account.pendingProfiles().length };
  if (account.role === 'player') return { label: 'Your profile', hint: `${account.myProfile?.name ?? who} · earning XP`, alert: 0 };
  if (account.role === 'pending') return { label: 'Your profile', hint: 'waiting for approval · no XP yet', alert: 0 };
  if (account.role === 'unregistered') return { label: 'Your profile', hint: 'make a profile to earn XP', alert: 0 };
  if (account.role === 'viewonly') return { label: 'Your profile', hint: 'view-only access · no XP', alert: 0 };
  if (account.role === 'signedout') return { label: 'Your profile', hint: 'sign in to save progress', alert: 0 };
  return { label: 'Your profile', hint: 'guest · no XP', alert: 0 };
};
account.onChange(() => {
  adoptSelection();
  syncShowcase();
  onlineScreen.refreshMe();
  void onlineScreen.startBackground();
  if (screen !== 'panel') return;
  if (characters.isShowingList()) characters.showList();
  else if (collection.isShowing()) collection.show();
  else if (profileScreen.isShowing()) {
    // Don't wipe a half-typed profile name.
    if (!(document.activeElement instanceof HTMLInputElement && overlay.root.contains(document.activeElement))) profileScreen.show();
  } else if (leaderboard.isShowing()) leaderboard.show();
  else if (moderator.isShowing()) moderator.show();
  else if (profileEditor.isShowing() && !(document.activeElement instanceof HTMLInputElement && overlay.root.contains(document.activeElement))) profileEditor.show();
});
/** On the game's own site (built with a Firebase config) install its sign-in, database and lobby first. */
async function boot(): Promise<void> {
  const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
  const host = env.VITE_FIREBASE_CONFIG;
  if (host && !(window as unknown as { claude?: unknown }).claude) {
    try {
      const { installFirebaseHost } = await import('./net/firebaseHost');
      await installFirebaseHost({ firebase: JSON.parse(host), emulator: env.VITE_FIREBASE_EMULATOR === '1' });
    } catch (e) {
      console.error('Sign-in and online services did not start', e);
    }
  }
  await account.connect();
  onlineScreen.startBackground();
}
void boot();
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
let matchEndAt = 0;
/** The stats of the game that just ended (end screen). */
let lastStats: GameStats | null = null;
/**
 * The team the player at this screen is on, for a win or a defeat screen: their
 * own team online and against the CPU; null when two people share the keyboard
 * (then the winners get the celebration).
 */
function youTeam(g: Game): TeamId | null {
  if (online) return online.role === 'host' ? 'A' : 'B';
  return g.cfg.players.mode === 'coop' ? 'A' : null;
}
/** A local match is paused (Escape, or the window losing focus). Online, the same overlay asks before leaving, and the match runs on. */
let paused = false;
/** The last local match's settings and players, for Restart and Rematch. */
let lastMatch: { cfg: GameConfig; roster: Roster } | null = null;

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
    openEditor: () => openPanel(() => profileEditor.open()),
    menu,
    layout: () => menuLayout(view),
    rowRect: (id: Parameters<typeof rowRect>[0]) => rowRect(id, menuLayout(view).portrait),
    menuOnline: () => menu.onlineInfo(),
    onlineRole: () => online?.role ?? null,
    onlineLink: () => online?.link ?? null,
    art: (d: TableDesign) => tableArt(theme, d).toDataURL(),
    sprite: composeSprite,
    spriteKit: { composeSprite, composeBase, randomParts },
    parts: PART_OPTIONS,
    run: (a: MenuAction) => runMenuAction(a),
    setInputs: (fn: typeof debugInputs) => (debugInputs = fn),
    cpu: (team: TeamId, level: 'easy' | 'medium' | 'hard') => new CpuController(team, level, Math.random),
  };
}

function toMenu(note = ''): void {
  overlay.hide();
  menuNote = note;
  if (screen !== 'menu') menu.entered();
  screen = 'menu';
  canvas.focus();
}

function openPanel(show: () => void): void {
  screen = 'panel';
  show();
}

function startMatch(cfg: GameConfig, roster: Roster): void {
  overlay.hide();
  paused = false;
  lastMatch = { cfg: structuredClone(cfg), roster };
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

/** The live online match, if one is on: this device hosts (Team A) or mirrors it (Team B). */
let online: { link: MatchLink; role: 'host' | 'guest'; otherName: string; otherPeer: string; settings: MatchSettings; lastNet: unknown; finalDone: boolean; left: boolean } | null = null;

function onlineConfig(s: OnlineStart['settings'], role: 'host' | 'guest'): GameConfig {
  const cfg = menu.config(baseCfg);
  cfg.teamSize = 1;
  cfg.players.mode = 'versus';
  cfg.players.mySide = role === 'host' ? 'A' : 'B';
  cfg.matchFormat = 'single';
  cfg.view = 'behindA';
  cfg.design = s.design as GameConfig['design'];
  cfg.venue = s.venue as GameConfig['venue'];
  cfg.formation = s.formation;
  cfg.physics.timeScale = s.speed;
  cfg.hitting.windowScale = speedStepOf(s.speed).window;
  cfg.skiCollision = s.ski;
  cfg.penaltyCupSelection = 'choose';
  return cfg;
}

function startOnline(o: OnlineStart): void {
  const host = o.role === 'host';
  const cfg = onlineConfig(o.settings, o.role);
  const pa = participantFrom(host ? o.mine : o.theirs, null);
  const pb = participantFrom(host ? o.theirs : o.mine, null);
  const roster: Roster = { 'A-left': pa, 'A-right': pa, 'B-left': pb, 'B-right': pb };
  // A rematch replaces the match that just ended.
  if (online) void online.link.close();
  const link = new MatchLink(o.room, o.role, o.otherPeer, o.mid);
  online = { link, role: o.role, otherName: o.otherName, otherPeer: o.otherPeer, settings: o.settings, lastNet: null, finalDone: false, left: false };
  if (host) {
    startMatch(cfg, roster);
    const g = game!;
    g.online = true;
    g.remoteAim.B = true;
    g.controlFrames = { A: cameraFrame(teamCamera(cfg, 'A', 16, 9)), B: cameraFrame(teamCamera(cfg, 'B', 16, 9)) };
    g.messages.push({ text: `Online vs ${o.otherName}: you are Team A`, time: g.time });
  } else {
    overlay.hide();
    game = new Game(cfg, Math.random, roster);
    game.online = true;
    game.controlFrames = { A: cameraFrame(teamCamera(cfg, 'A', 16, 9)), B: cameraFrame(teamCamera(cfg, 'B', 16, 9)) };
    game.messages.push({ text: `Online vs ${o.otherName}: you are Team B. Waiting for the host…`, time: 0 });
    record = null;
    cpu = null;
    counted = {};
    xpNote = '';
    screen = 'playing';
    canvas.focus();
  }
}

function endOnline(note = ''): void {
  if (!online) return;
  void online.link.close();
  online = null;
  onlineScreen.close();
  onlineScreen.matchOver();
  if (note) menuNote = note;
}

/** The end screen of an online game: where a rematch stands. */
function rematchLine(): string {
  if (!online) return '';
  if (online.left) return `${online.otherName} left.`;
  const st = onlineScreen.rematchState(online.otherPeer);
  return st === 'offered' ? `${online.otherName} wants a rematch!` : st === 'asked' ? `Rematch asked: waiting for ${online.otherName}…` : st === 'gone' ? `${online.otherName} left.` : '';
}
function rematchPrompt(): string {
  if (!online || online.left || onlineScreen.rematchState(online.otherPeer) === 'gone') return 'Space / Enter: menu';
  return onlineScreen.rematchState(online.otherPeer) === 'offered' ? 'Space / Enter: play again · Esc: menu' : 'Space / Enter: rematch · Esc: menu';
}
function rematchPressed(): void {
  const o = online!;
  if (o.left || onlineScreen.rematchState(o.otherPeer) === 'gone') {
    endOnline();
    return toMenu();
  }
  onlineScreen.rematch(o.otherPeer, o.settings);
}

/** One frame of an online match on the guest's device. */
function guestFrame(g: Game, dt: number): void {
  const o = online!;
  const inp = mergeInputs(keyboard.team('A'), keyboard.team('B'));
  const net = o.link.net;
  if (net && net !== o.lastNet) {
    o.lastNet = net;
    // Move the host's state on by the network delay, so the ball is where it is now on the host.
    g.applyNetAhead(net, 'B', o.link.delay);
  }
  if (screen === 'playing') {
    const st = g.engine.peek();
    if (inp.hit) {
      g.selectedStyle.B = inp.style; // timed with the style it's hit with
      const tm = g.timingNow('B');
      o.link.event('hit', { ...(tm ?? {}), st: inp.style });
      // Show the hit here at once; the host's result follows.
      if (tm) g.predictSwing('B', { ...inp, q: tm.q, off: tm.off });
    }
    if (st.phase === 'penalty' && st.penalty?.chooser === 'B' && inp.nav) o.link.event('nav', { d: inp.nav });
    g.netTick(dt, 'B', inp);
    o.link.sendInput({ up: inp.up, down: inp.down, left: inp.left, right: inp.right, style: inp.style, aim: { ...g.aim.B } }, performance.now(), inp.hit);
    if (st.phase === 'gameOver') {
      gameOverAt = performance.now();
      screen = 'gameEnd';
      xpNote = 'Waiting for the result…';
    }
  }
  if (o.link.final && !o.finalDone) {
    o.finalDone = true;
    const res = account.addMatchXp(o.link.final.xp, counted);
    const gained = Object.values(counted).reduce((a, b) => a + b, 0);
    xpNote = res.counted ? `Your side (Team B): +${gained} XP` : account.role === 'pending' ? 'No XP yet: your profile is waiting for approval' : 'Make a profile (Your profile) to earn XP from games';
  }
}

/** XP this match has already given (so each game adds only what's new). */
let counted: Record<string, number> = {};
/** A line for the end screens about XP and loot boxes. */
let xpNote = '';

/** Persist the finished game (and match, if decided), and give the player their XP. */
function recordGame(): void {
  if (game) lastStats = gameStats(game.cfg, game.engine.log);
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
  const res = account.recordMatch(record, side, counted);
  const gained = Object.values(counted).reduce((a, b) => a + b, 0) - before;
  const boxes = account.boxes();
  xpNote = !res.counted
    ? account.role === 'pending'
      ? 'No XP yet: your profile is waiting for approval'
      : 'Make a profile (Your profile) to earn XP from games'
    : `Your side (Team ${side}): +${gained} XP` + (boxes > res.boxesBefore ? ` · LEVEL UP! ${boxes} loot box${boxes === 1 ? '' : 'es'} in the Collection` : '');
  // Online: the guest's XP comes from the host's record of the game.
  if (online?.role === 'host') online.link.sendFinal(matchXp(baseCfg, record, 'B'), lastStats);
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
    fine: a.fine || b.fine,
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
const collection = new CollectionScreen(overlay, store, baseCfg, account, characters, () => toMenu(), () => moderator.show('review'));
const moderator = new ModeratorScreen(overlay, store, baseCfg, account, characters, () => toMenu());
const leaderboard = new LeaderboardScreen(overlay, account, () => toMenu(), () => profileScreen.show(), () => profileEditor.open());
const onlineScreen = new OnlineScreen(overlay, {
  me: () => {
    const cfg = menu.config(baseCfg);
    const usable = account.usable();
    const pin = pinnedFor({ ...cfg, teamSize: 1, players: { ...cfg.players, mode: 'versus', mySide: 'A' } }, selection, usable)['A-left'];
    const char = mainCharacter() ?? pin ?? usable[0] ?? null;
    return { name: account.displayName, level: playerLevel(baseCfg, account.progress).level, style: account.myStyle, char };
  },
  settings: () => {
    const cfg = menu.config(baseCfg);
    return { design: cfg.design, venue: cfg.venue, formation: cfg.formation, speed: cfg.physics.timeScale, ski: cfg.skiCollision };
  },
  blocked: () => {
    if (account.canProgress) return null;
    if (account.role === 'pending') return 'Your profile is waiting for the moderator. Once it’s approved you can play online, earn XP and get on the leaderboard.';
    if (account.role === 'unregistered') return 'Make a profile first (menu → Your profile → Ask to join). Once the moderator approves it you can play online.';
    if (account.role === 'player') return 'Your profile is paused by the moderator.';
    if (account.role === 'signedout') return 'Sign in (menu → Your profile) and make a profile. Once the moderator approves it you can play online, earn XP and get on the leaderboard.';
    if (account.role === 'viewonly') return 'You opened the game by a public link from outside the moderator’s claude.ai organization, so claude.ai lets you play offline only. Ask the moderator to invite your email, then open the game from that invite and make a profile.';
    return 'Sign in to claude.ai and open the game from your invite, then make a profile for the moderator to approve.';
  },
  characters: () => account.usable(),
  tableArt: (d) => tableArt(theme, d as TableDesign).toDataURL(),
  tableLocked: (d) => menu.tableLocked(d),
  show: () => {
    // A challenge was accepted: the setup screen takes over (a local match in progress is left).
    if (online) return;
    paused = false;
    screen = 'panel';
  },
  start: (o) => startOnline(o),
  back: () => {
    onlineScreen.close();
    toMenu();
  },
});
const profileScreen = new ProfileScreen(overlay, store, baseCfg, account, {
  collection: () => collection.show(),
  characters: () => characters.showList(),
  moderator: () => moderator.show(),
  edit: () => profileEditor.open(),
  back: () => toMenu(),
});
const profileEditor = new ProfileEditor(overlay, baseCfg, account, {
  mainId: () => mainCharacter()?.id ?? null,
  setMain: (id) => {
    const old = selection.chars[0];
    if (id && selection.chars[1] === id) selection.chars[1] = old;
    selection.chars[0] = id;
    saveSelection();
  },
  back: () => profileScreen.show(),
});

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
    pending: account.owner ? account.pendingCount() + account.pendingProfiles().length : 0,
    progressNote: account.canProgress ? '' : account.role === 'pending' ? 'Profile waiting for approval: no XP yet' : account.role === 'unregistered' ? 'Make a profile (Your profile) to earn XP' : account.role === 'signedout' ? 'Sign in (Your profile) to earn XP' : 'Playing as a guest: games don’t earn XP',
    offline: account.mode === 'local',
    allAccess: account.owner,
    openToAll: !account.owner && account.everythingOpen,
    team: mySlots(cfg).map((k) => {
      const c = pins[k];
      if (!c) return null;
      const key = `${c.id}:${c.updatedAt}:${c.cosmetics.spriteItem ?? ''}`;
      let sp = menuSprites.get(key);
      if (!sp) menuSprites.set(key, (sp = characterSprite(c.sprite, c.cosmetics.spriteItem ?? null)));
      return sp;
    }),
    tableArt: tableArt(theme, cfg.design),
    otherTeam: (() => {
      const other = otherPinnedFor(cfg, selection, cfg.players.mode === 'coop' ? account.everyone() : account.usable(), pins);
      return otherSlots(cfg).map((k) => {
        const c = other[k];
        if (!c) return null;
        const key = `${c.id}:${c.updatedAt}:${c.cosmetics.spriteItem ?? ''}`;
        let sp = menuSprites.get(key);
        if (!sp) menuSprites.set(key, (sp = characterSprite(c.sprite, c.cosmetics.spriteItem ?? null)));
        return sp;
      });
    })(),
    myTeamId: cfg.players.mode === 'coop' ? 'A' : (cfg.players.mySide ?? 'A'),
    me: account.myProfile ? { name: account.myProfile.name, style: account.myStyle } : null,
  };
}

/** Quick match: the player's picks (or random unlocked characters) on their side; the CPU can use any. */
function quickFor(cfg: GameConfig): Roster {
  const mine = account.usable();
  const pins = pinnedFor(cfg, selection, mine);
  if (cfg.players.mode === 'coop') return quickRoster({ A: mine, B: account.everyone() }, cfg.teamSize, Math.random, { ...pins, ...otherPinnedFor(cfg, selection, account.everyone(), pins) });
  return quickRoster(mine, cfg.teamSize, Math.random, { ...pins, ...otherPinnedFor(cfg, selection, mine, pins) });
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
    case 'account':
      return openPanel(() => profileScreen.show());
    case 'leaderboard':
      return openPanel(() => leaderboard.show());
    case 'online':
      return openPanel(() => void onlineScreen.open());
    case 'pickTable':
      return openPanel(() => tablePicker.show(cfg.design));
    case 'pickCharacters':
      return openPanel(() => characterPicker.show());
    case 'characters':
      return openPanel(() => characters.showList());
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
  online?.link.read();
  // On the end screen the match is over: if they leave, say so there and let the player go back when ready.
  if (online?.link.gone && screen === 'gameEnd') online.left = true;
  else if (online?.link.gone && screen !== 'matchEnd') {
    endOnline(online.link.seen ? `${online.otherName} left the match.` : `Couldn’t connect to ${online.otherName}${online.link.error ? ` (${online.link.error})` : ''}. Try challenging again.`);
    return toMenu(menuNote);
  }
  if (online?.role === 'guest') {
    guestFrame(g, dt);
    renderGame3D(ctx, theme, view, g, 'behindB');
    renderHud(ctx, theme, view, g);
    if (screen === 'gameEnd') {
      const st = g.engine.peek();
      const ready = performance.now() - gameOverAt > 800;
      const won = st.winner === 'B';
      drawEndScreen(ctx, theme, view, {
        title: won ? 'Victory!' : 'Defeat',
        mood: won ? 'win' : 'lose',
        team: st.winner ?? 'A',
        subtitle: won ? `You beat ${online.otherName}` : `${online.otherName} wins`,
        lines: [g.cupsLeftLine(), xpNote, rematchLine()].filter(Boolean),
        prompt: ready ? rematchPrompt() : '',
        stats: online.link.final?.st ?? null,
        names: { A: online.otherName, B: 'You' },
        t: (performance.now() - gameOverAt) / 1000,
      });
      if (ready && anyPressed(['hit'])) rematchPressed();
    }
    return;
  }
  if (screen === 'playing' && paused && !online) {
    // Paused: the scene holds still under the pause card (an HTML panel, see showPause).
    renderGame3D(ctx, theme, view, g, layoutFor(g.cfg));
    renderHud(ctx, theme, view, g);
    return;
  }
  if (screen === 'playing') {
    if (online?.role === 'host') {
      const local = mergeInputs(keyboard.team('A'), keyboard.team('B'));
      const remote = online.link.hostInput(idleInput());
      if (online.link.input) g.aim.B = { ...online.link.input.aim };
      g.rewindable = true;
      g.update(dt, { A: local, B: remote });
      const ph = g.engine.peek().phase;
      online.link.sendState(g.netState(), performance.now(), remote.hit || local.hit, ph === 'rally' || ph === 'serveInFlight' || g.tossing);
    } else g.update(dt, debugInputs ? debugInputs(g) : liveInputs(g));
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
    if (online) {
      const r = rematchLine();
      if (r) lines.push(r);
    }
    lines.shift(); // the winners' names go in the subtitle
    const you = youTeam(g);
    const won = you === null || st.winner === you;
    const title = online
      ? won ? 'Victory!' : 'Defeat'
      : !matchWinner
        ? `Team ${st.winner} takes game ${g.match.games.length}`
        : you === null ? `Team ${st.winner} wins!` : won ? 'Victory!' : 'Defeat';
    drawEndScreen(ctx, theme, view, {
      title,
      mood: won ? 'win' : 'lose',
      team: st.winner!,
      subtitle: online ? (won ? `You beat ${online.otherName}` : `${online.otherName} wins`) : won ? g.teamLine(st.winner!) : `${g.teamLine(st.winner!)} win${g.solo ? 's' : ''}`,
      lines,
      prompt: ready ? (online ? rematchPrompt() : 'Press Space / Enter') : '',
      stats: lastStats,
      names: online ? { A: 'You', B: online.otherName } : { A: g.teamLine('A'), B: g.teamLine('B') },
      t: (performance.now() - gameOverAt) / 1000,
    });
    if (online?.role === 'host') online.link.sendState(g.netState(), performance.now());
    if (ready && anyPressed(['hit']) && online) {
      rematchPressed();
      return;
    }
    if (ready && anyPressed(['hit'])) {
      const w = g.continueMatch();
      if (w) {
        record!.winner = w;
        record!.finishedAt = new Date().toISOString();
        store.matches.save(record!);
        screen = 'matchEnd';
        matchEndAt = performance.now();
      } else screen = 'playing';
    }
  } else if (screen === 'matchEnd') {
    const you = youTeam(g);
    const won = you === null || g.match.winner === you;
    drawEndScreen(ctx, theme, view, {
      title: you === null ? `Team ${g.match.winner} wins the match!` : won ? 'Match won!' : 'Match lost',
      mood: won ? 'win' : 'lose',
      team: g.match.winner!,
      subtitle: `${g.teamLine(g.match.winner!)} · games ${g.match.wins.A} – ${g.match.wins.B}`,
      lines: [xpNote || 'Match log saved', 'R: rematch with the same players'],
      prompt: 'Press Space / Enter for the menu',
      stats: record ? sumStats(record.games.map((x) => gameStats(g.cfg, x.log))) : lastStats,
      names: { A: g.teamLine('A'), B: g.teamLine('B') },
      t: (performance.now() - matchEndAt) / 1000,
    });
    if (anyPressed(['hit'])) {
      if (record && hasTrackedPlayers(record)) {
        const rec = record;
        openPanel(() => showSummary(overlay, store, baseCfg, rec, () => toMenu()));
      } else toMenu();
    }
  }
}

/**
 * The pause card: real buttons, so a click (or Space / Enter on the focused
 * button) always works, even if the page around the game took the keyboard.
 * A local match stops while it's up. Online the match can't stop for the
 * other player, so it asks before leaving and the match runs on underneath.
 */
function showPause(): void {
  if (screen !== 'playing') return;
  paused = true;
  const resume = () => {
    paused = false;
    overlay.hide();
    canvas.focus();
  };
  const quit = () => {
    paused = false;
    endOnline();
    toMenu('Match abandoned.');
  };
  const buttons = online
    ? [h('button', { class: 'primary', onclick: resume }, 'Keep playing'), h('button', { class: 'danger', onclick: quit }, 'Leave the match')]
    : [
        h('button', { class: 'primary', onclick: resume }, 'Resume'),
        h('button', { onclick: () => lastMatch && startMatch(structuredClone(lastMatch.cfg), lastMatch.roster) }, 'Restart this match'),
        h('button', { class: 'danger', onclick: quit }, 'Quit to the menu'),
      ];
  overlay.show(
    h(
      'div',
      { class: 'panel pause-card' },
      h('h1', {}, online ? 'Leave the match?' : 'Paused'),
      h('p', { class: 'dim' }, online ? 'The match is still going for the other player.' : 'Space / Enter: resume · R: restart · Esc: quit to the menu'),
      h('div', { class: 'row', style: 'justify-content:center' }, ...buttons),
    ),
  );
  (overlay.root.querySelector('button.primary') as HTMLButtonElement | null)?.focus();
}

// R: restart a paused local match, or rematch after one ends.
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyR' || isTyping(e.target) || online || !lastMatch) return;
  if ((screen === 'playing' && paused) || screen === 'matchEnd') startMatch(structuredClone(lastMatch.cfg), lastMatch.roster);
});
// Leaving the window mid-match pauses a local game.
window.addEventListener('blur', () => {
  if (screen === 'playing' && !online && !paused) showPause();
});

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  // Escape in a text box just leaves the box, so a half-typed name is not thrown away.
  if (isTyping(e.target)) return void (e.target as HTMLElement).blur();
  // The game uses Escape itself: keep the page around it (such as the artifact viewer) from acting on it too.
  e.preventDefault();
  e.stopPropagation();
  // Mid-match, the first Escape pauses (online: asks first, the match keeps going); the second quits.
  if (screen === 'playing' && !paused) {
    showPause();
    return;
  }
  if (screen === 'playing' || screen === 'gameEnd' || screen === 'matchEnd') {
    const finished = screen !== 'playing';
    paused = false;
    endOnline();
    toMenu(finished ? '' : 'Match abandoned.');
  } else if (screen === 'panel' && onlineScreen.isShowing()) {
    onlineScreen.close();
    toMenu();
  }
  else if (screen === 'panel' || screen === 'help') toMenu();
});

/** The menu row at a point in menu coordinates, or -1. */
function menuRowAt(mx: number, my: number, portrait: boolean): number {
  return menu.rows().findIndex((row) => {
    const r = rowRect(row.id, portrait);
    return mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
  });
}
/** Pointer position in menu coordinates. */
function menuPoint(e: PointerEvent | MouseEvent) {
  const rect = canvas.getBoundingClientRect();
  const sx = ((e.clientX - rect.left) * view.width) / rect.width;
  const sy = ((e.clientY - rect.top) * view.height) / rect.height;
  const L = menuLayout(view);
  return { mx: (sx - L.ox) / L.s, my: (sy - L.oy) / L.s, portrait: L.portrait };
}
/** Dragging the Speed bar's thumb. */
let speedDrag = false;
// Hover and press effects on the home screen.
canvas.addEventListener('pointermove', (e) => {
  if (screen !== 'menu') {
    menu.hover = null;
    canvas.style.cursor = '';
    return;
  }
  const p = menuPoint(e);
  if (speedDrag) {
    menu.setSpeedStep(menu.speedStepAt(p.mx, p.portrait));
    return;
  }
  const i = menuRowAt(p.mx, p.my, p.portrait);
  menu.hover = i >= 0 ? menu.rows()[i].id : null;
  canvas.style.cursor = i >= 0 ? 'pointer' : '';
});
canvas.addEventListener('pointerleave', () => {
  menu.hover = null;
  canvas.style.cursor = '';
});
canvas.addEventListener('pointerdown', (e) => {
  if (screen !== 'menu') return;
  const p = menuPoint(e);
  const i = menuRowAt(p.mx, p.my, p.portrait);
  if (i < 0) return;
  const id = menu.rows()[i].id;
  menu.pressed(id);
  // Drag along the Speed bar to slide through the spectrum.
  if (id === 'speed') {
    speedDrag = true;
    menu.focus('speed');
    menu.setSpeedStep(menu.speedStepAt(p.mx, p.portrait));
    canvas.setPointerCapture?.(e.pointerId);
  }
});
canvas.addEventListener('pointerup', () => {
  speedDrag = false;
});
canvas.addEventListener('pointercancel', () => {
  speedDrag = false;
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
    const i = menuRowAt(mx, my, L.portrait);
    if (i >= 0) runMenuAction(menu.click(i, mx, L.portrait));
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
