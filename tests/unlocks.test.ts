import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeConfig } from '../src/config';
import { newCharacter } from '../src/core/character';
import { Account, UNLOCK } from '../src/data/shared';
import { AppStore, memoryStore } from '../src/data/storage';
import { CpuController } from '../src/game/ai';
import { Game, POSITIONS } from '../src/game/game';
import { newMatchRecord } from '../src/data/storage';
import { quickRoster } from '../src/ui/prematch';
import { addXp, boxesWaiting, emptyProgress, ensureStarters, markSeen, matchXp, newRewards, newRewardsFor, newXp, seedSeen, normalizeProgress, openBox, playerLevel, playerXp } from '../src/progress/unlocks';

const cfg = makeConfig();
// These tests check normal unlocking; the temporary everyone-unlocked switch is tested on its own below.
beforeEach(() => void (UNLOCK.allForEveryone = false));
afterEach(() => void (UNLOCK.allForEveryone = true));
const TABLES = ['plain', 'saints', 'spirits'];

describe('player progress and loot boxes', () => {
  it('starts with the plain table and tops up to 4 starting characters', () => {
    const p = emptyProgress();
    expect(p.tables).toEqual(['plain']);
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(ensureStarters(p, ids, Math.random)).toBe(true);
    expect(p.characters).toHaveLength(4);
    expect(ensureStarters(p, ids, Math.random)).toBe(false);
    const small = emptyProgress();
    ensureStarters(small, ['a', 'b'], Math.random);
    expect(small.characters.sort()).toEqual(['a', 'b']);
  });

  it('player XP is the sum of character XP; each level past 1 gives a box', () => {
    const p = emptyProgress();
    expect(boxesWaiting(cfg, p)).toBe(0);
    addXp(p, { a: 100, b: 60 });
    expect(playerXp(p)).toBe(160);
    expect(playerLevel(cfg, p).level).toBe(2);
    expect(boxesWaiting(cfg, p)).toBe(1);
  });

  it('boxes never give duplicates, and wait when there is nothing left', () => {
    const p = emptyProgress();
    addXp(p, { a: 100000 });
    const got = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const item = openBox(cfg, p, TABLES, ['x', 'y'], Math.random);
      if (!item) break;
      const key = `${item.kind}:${item.id}`;
      expect(got.has(key)).toBe(false);
      got.add(key);
    }
    expect(got.size).toBe(4); // 2 tables + 2 characters
    const waiting = boxesWaiting(cfg, p);
    expect(waiting).toBeGreaterThan(0);
    expect(openBox(cfg, p, TABLES, ['x', 'y'], Math.random)).toBeNull();
    expect(boxesWaiting(cfg, p)).toBe(waiting); // still saved
    expect(openBox(cfg, p, TABLES, ['x', 'y', 'z'], Math.random)).toEqual({ kind: 'character', id: 'z' });
  });

  it('counts only new XP as a match grows', () => {
    const counted: Record<string, number> = {};
    expect(newXp({ a: 30 }, counted)).toEqual({ a: 30 });
    expect(newXp({ a: 50, b: 10 }, counted)).toEqual({ a: 20, b: 10 });
    expect(newXp({ a: 50, b: 10 }, counted)).toEqual({});
  });

  it('repairs saved progress', () => {
    const p = normalizeProgress({ charXp: { a: 5, b: 'x' }, tables: ['chain'], characters: ['a', 'a'], opened: [{ kind: 'nope', id: 1 }] });
    expect(p.charXp).toEqual({ a: 5 });
    expect(p.tables.sort()).toEqual(['chain', 'plain']);
    expect(p.characters).toEqual(['a']);
    expect(p.opened).toEqual([]);
  });

  it('offline accounts: own characters are usable, shared ones locked until unlocked', () => {
    const store = new AppStore(memoryStore());
    const mine = newCharacter('Mine');
    store.characters.save(mine);
    const a = new Account(store, cfg, memoryStore(), () => 0);
    const shared = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map((n) => newCharacter(n));
    store.characters.setShared(shared);
    expect(a.canUse(mine.id)).toBe(true);
    expect(shared.filter((c) => a.canUse(c.id))).toHaveLength(0);
    a.progress.characters.push(shared[0].id);
    expect(a.canUse(shared[0].id)).toBe(true);
    expect(a.usable().map((c) => c.name).sort()).toEqual(['Mine', 'S1']);
    expect(a.everyone()).toHaveLength(7);
  });

  it('cosmetics are per player, not per character', () => {
    const store = new AppStore(memoryStore());
    const c = newCharacter('Briggs');
    c.cosmetics.nameColor = 'gold';
    store.characters.setShared([c]);
    const a = new Account(store, cfg, memoryStore());
    expect(store.characters.get(c.id)!.cosmetics.nameColor).toBeNull();
    a.equip(c.id, { nameColor: 'iceBlue', badges: ['rookie'] });
    expect(store.characters.get(c.id)!.cosmetics.nameColor).toBe('iceBlue');
  });
});

describe('XP from a real game', () => {
  it('only the signed-in player\'s side earns XP', () => {
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647), seed / 2147483647);
    const gcfg = makeConfig({ formation: 'shrub', penaltyCupSelection: 'auto' });
    const chars = ['A1', 'A2', 'B1', 'B2'].map((n) => newCharacter(n));
    const roster = quickRoster(chars, 2, r);
    const g = new Game(gcfg, r, roster);
    const a = new CpuController('A', 'medium', r);
    const b = new CpuController('B', 'medium', r);
    for (let t = 0; t < 3000 && g.engine.peek().phase !== 'gameOver'; t += 1 / 60) g.update(1 / 60, { A: a.input(g), B: b.input(g) });
    const rec = newMatchRecord(gcfg);
    for (const k of POSITIONS) rec.roster[k] = { characterId: roster[k].characterId, profileId: null };
    rec.games.push({ winner: g.engine.peek().winner, log: g.engine.log });
    const xpA = matchXp(gcfg, rec, 'A');
    const aIds = [roster['A-left'].characterId, roster['A-right'].characterId];
    expect(Object.keys(xpA).sort()).toEqual([...aIds].sort());
    expect(Object.values(xpA).every((x) => x >= gcfg.progression.xp.gamePlayed)).toBe(true);
    const all = matchXp(gcfg, rec, null);
    expect(Object.keys(all)).toHaveLength(4);
  });
});

describe('new reward alerts', () => {
  it('counts cosmetics unlocked since the player last looked, and clears when seen', () => {
    const p = emptyProgress();
    addXp(p, { a: 120 }); // character level 2 (100 XP)
    expect(seedSeen(cfg, p)).toBe(true); // what's already unlocked isn't new
    expect(newRewards(cfg, p)).toBe(0);
    addXp(p, { a: 400 }); // level 3+
    expect(newRewardsFor(cfg, p, 'a')).toBeGreaterThan(0);
    addXp(p, { b: 120 }); // a new character reaching level 2
    expect(newRewardsFor(cfg, p, 'b')).toBe(1);
    expect(markSeen(cfg, p, 'a')).toBe(true);
    expect(newRewardsFor(cfg, p, 'a')).toBe(0);
    expect(markSeen(cfg, p, 'a')).toBe(false);
    expect(newRewards(cfg, p)).toBe(1);
  });
});

describe('who has what', () => {
  const sharedSix = () => ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map((n) => newCharacter(n));

  it('the moderator has every table and character, and no loot boxes', () => {
    const store = new AppStore(memoryStore());
    const a = new Account(store, cfg, memoryStore(), () => 0.3);
    a.owner = true;
    store.characters.setShared(sharedSix());
    addXp(a.progress, { x: 5000 });
    expect(TABLES.every((t) => a.tableUnlocked(t))).toBe(true);
    expect(a.usable()).toHaveLength(6);
    expect(a.boxes()).toBe(0);
    expect(a.allUnlocked()).toBe(true);
    expect(a.openBox()).toBeNull();
  });

  it('every other player starts with the plain table and 4 random characters', () => {
    const store = new AppStore(memoryStore());
    const a = new Account(store, cfg, memoryStore(), Math.random);
    store.characters.setShared(sharedSix());
    (a as unknown as { topUp(): boolean }).topUp();
    expect(a.progress.tables).toEqual(['plain']);
    expect(a.tableUnlocked('saints')).toBe(false);
    expect(a.usable()).toHaveLength(4);
  });
});

describe('profiles gate progress', () => {
  it('guests and unapproved players earn no XP or boxes; approved ones do', () => {
    const store = new AppStore(memoryStore());
    const a = new Account(store, cfg, memoryStore());
    const counted: Record<string, number> = {};
    expect(a.canProgress).toBe(false);
    expect(a.addMatchXp({ c1: 500 }, counted).counted).toBe(false);
    expect(a.progress.charXp.c1).toBeUndefined();
    expect(a.boxes()).toBe(0);
    // Signed in with a profile the moderator approved.
    a.mode = 'online';
    a.uid = 'u1';
    a.profiles.set('u1', { name: 'Ari', xp: 0, level: 1, requestedAt: '', updatedAt: '' });
    expect(a.role).toBe('pending');
    expect(a.canProgress).toBe(false);
    a.approvals.set('u1', { status: 'approved', at: '' });
    expect(a.role).toBe('player');
    expect(a.addMatchXp({ c1: 500 }, counted).counted).toBe(true);
    expect(a.progress.charXp.c1).toBe(500);
    a.approvals.set('u1', { status: 'revoked', at: '' });
    expect(a.canProgress).toBe(false);
  });

  it('the leaderboard lists approved profiles by XP', () => {
    const a = new Account(new AppStore(memoryStore()), cfg, memoryStore());
    a.profiles.set('x', { name: 'Low', xp: 10, level: 1, requestedAt: '', updatedAt: '' });
    a.profiles.set('y', { name: 'High', xp: 900, level: 4, requestedAt: '', updatedAt: '' });
    a.profiles.set('z', { name: 'Waiting', xp: 5000, level: 9, requestedAt: '', updatedAt: '' });
    a.approvals.set('x', { status: 'approved', at: '' });
    a.approvals.set('y', { status: 'approved', at: '' });
    expect(a.leaderboard().map((r) => r.card.name)).toEqual(['High', 'Low']);
    expect(a.pendingProfiles().map(([id]) => id)).toEqual(['z']);
  });
});

describe('the temporary unlock for everyone', () => {
  it('opens every table and character to every player, with no loot boxes meanwhile', () => {
    UNLOCK.allForEveryone = true;
    const store = new AppStore(memoryStore());
    const a = new Account(store, cfg, memoryStore());
    store.characters.setShared([newCharacter('Locked One'), newCharacter('Locked Two')]);
    expect(store.characters.sharedList().every((c) => a.canUse(c.id))).toBe(true);
    expect(TABLES.every((t) => a.tableUnlocked(t))).toBe(true);
    expect(a.allUnlocked()).toBe(true);
    expect(a.boxes()).toBe(0);
    expect(a.openBox()).toBeNull();
    UNLOCK.allForEveryone = false;
    expect(a.tableUnlocked('saints')).toBe(false);
  });
});
