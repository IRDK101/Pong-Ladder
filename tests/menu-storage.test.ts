import { makeConfig } from '../src/config';
import { RulesEngine } from '../src/core/rules';
import { newCharacter, newProfile } from '../src/core/character';
import { AppStore, memoryStore, newMatchRecord } from '../src/data/storage';
import { Menu } from '../src/ui/menu';
import { AL, Script } from './helpers';

describe('pre-game menu', () => {
  it('defaults to tree / single game / team chooses / ski off', () => {
    const cfg = new Menu().config();
    expect(cfg).toMatchObject({ formation: 'tree', matchFormat: 'single', penaltyCupSelection: 'choose', skiCollision: false });
  });

  it('defaults to head-to-head, medium CPU, behind-Team-A view', () => {
    const cfg = new Menu().config();
    expect(cfg.players).toEqual({ mode: 'versus', cpu: 'medium' });
    expect(cfg.view).toBe('behindA');
    const m = new Menu();
    m.move(0, 1); // same team vs CPU
    m.move(1, 0);
    m.move(0, 1); // hard
    m.move(1, 0);
    m.move(0, 1); // split
    m.move(0, 1); // top-down
    expect(m.config()).toMatchObject({ players: { mode: 'coop', cpu: 'hard' }, view: 'topDown' });
  });

  it('changes options with left/right and wraps', () => {
    const m = new Menu();
    m.move(4, 0); // to Formation, after Players / CPU level / View / Table
    m.move(0, 1); // formation → shrub
    m.move(1, 0);
    m.move(0, -1); // match → best of 3 (wraps backwards)
    m.move(1, 0);
    m.move(0, -1); // speed → relaxed (wraps backwards)
    m.move(1, 0);
    m.activate(); // penalty → auto (activate cycles an option row)
    m.move(1, 0);
    m.move(0, 1); // ski → on
    const cfg = m.config();
    expect(cfg).toMatchObject({ formation: 'shrub', matchFormat: 'bestOf3', penaltyCupSelection: 'auto', skiCollision: true });
    expect(cfg.physics.timeScale).toBeLessThan(makeConfig().physics.timeScale);
  });

  it('game speed: normal is the default, quick is faster', () => {
    const m = new Menu();
    expect(m.config().physics.timeScale).toBe(makeConfig().physics.timeScale);
    m.move(6, 0);
    m.move(0, 1);
    expect(m.config().physics.timeScale).toBeGreaterThan(makeConfig().physics.timeScale);
  });

  it('action rows return their action; the cursor wraps', () => {
    const m = new Menu();
    const actions: string[] = [];
    m.move(9, 0); // first action row, after the 9 option rows
    for (let i = 0; i < 6; i++) {
      actions.push(m.activate()!);
      m.move(1, 0);
    }
    expect(actions).toEqual(['draft', 'quick', 'characters', 'profiles', 'help', 'backup']);
    expect(m.cursor).toBe(0); // wrapped
    m.move(-1, 0);
    expect(m.activate()).toBe('backup');
  });

  it('the Table row picks which basement table to play at', () => {
    const m = new Menu();
    expect(m.config().venue).toBe('saints');
    m.move(3, 0);
    expect(m.rows()[3].label).toBe('Table');
    m.move(0, 1);
    expect(m.config().venue).toBe('spirits');
    m.move(0, 1);
    expect(m.config().venue).toBe('chain');
  });

  it('builds an independent config each time', () => {
    const m = new Menu();
    const a = m.config();
    a.hitting.timingWindow = 99;
    expect(m.config().hitting.timingWindow).not.toBe(99);
  });
});

describe('local storage and backups', () => {
  function playedRecord() {
    const s = new Script(AL);
    s.goodServe();
    s.rallyHit(s.eng.expectedHitter()!);
    s.out();
    const rec = newMatchRecord(s.cfg, new Date('2026-10-30T12:00:00Z'), 'm-1');
    rec.games.push({ winner: null, log: s.eng.log });
    return { rec, s };
  }

  it('saves, lists, replaces and removes records by id', () => {
    const store = new AppStore(memoryStore());
    const { rec } = playedRecord();
    store.matches.save(rec);
    store.matches.save({ ...rec, winner: 'A' });
    expect(store.matches.list()).toHaveLength(1);
    expect(store.matches.list()[0].winner).toBe('A');
    expect(store.matches.list()[0].rules).toMatchObject({ formation: 'tree', serveTableMissLimit: 2 });
    expect(Object.keys(store.matches.list()[0].roster)).toEqual(['A-left', 'A-right', 'B-left', 'B-right']);
    store.matches.remove('m-1');
    expect(store.matches.list()).toEqual([]);
  });

  it('a stored log replays to the same final state', () => {
    const store = new AppStore(memoryStore());
    const { rec, s } = playedRecord();
    store.matches.save(rec);
    const log = store.matches.list()[0].games[0].log;
    expect(RulesEngine.replay(makeConfig(), log).state).toEqual(s.eng.state);
  });

  it('backup → restore round-trips matches, characters and profiles, merging without duplicates', () => {
    const a = new AppStore(memoryStore());
    const { rec } = playedRecord();
    a.matches.save(rec);
    const ari = newCharacter('Ari');
    ari.master = true;
    a.characters.save(ari);
    a.profiles.save(newProfile('Ari R.'));
    const json = a.exportJson();
    const b = new AppStore(memoryStore());
    b.matches.save({ ...rec, id: 'm-2' });
    expect(b.importJson(json)).toEqual({ matches: 1, characters: 1, profiles: 1, skipped: [] });
    expect(b.importJson(json)).toMatchObject({ matches: 0, characters: 0, profiles: 0 });
    expect(b.matches.list().map((m) => m.id).sort()).toEqual(['m-1', 'm-2']);
    expect(b.matches.get('m-1')).toEqual(rec);
    expect(b.characters.get(ari.id)).toEqual(ari);
  });

  it('restores an older matches-only (v1) backup', () => {
    const { rec } = playedRecord();
    const v1 = JSON.stringify({ app: 'dartmouth-pong', schemaVersion: 1, exportedAt: '', matches: [rec] });
    const store = new AppStore(memoryStore());
    expect(store.importJson(v1).matches).toBe(1);
  });

  it('skips invalid characters with a reason, keeping the rest', () => {
    const good = newCharacter('Good');
    const bad = { ...newCharacter('Bad'), hitStyles: ['standardHit'] };
    const json = JSON.stringify({ app: 'dartmouth-pong', schemaVersion: 2, matches: [], characters: [good, bad] });
    const store = new AppStore(memoryStore());
    const res = store.importJson(json);
    expect(res.characters).toBe(1);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]).toMatch(/hit styles/);
  });

  it('rejects files that are not backups', () => {
    const store = new AppStore(memoryStore());
    expect(() => store.importJson('{"foo":1}')).toThrow(/not a Pong Zimulator backup/);
    expect(() => store.importJson('not json')).toThrow(/not valid JSON/);
    expect(() => store.importJson(JSON.stringify({ app: 'dartmouth-pong', schemaVersion: 99, matches: [] }))).toThrow(/newer/);
    expect(() => store.importJson(JSON.stringify({ app: 'dartmouth-pong', schemaVersion: 1, matches: [{ nope: 1 }] }))).toThrow(/malformed/);
  });

  it('survives corrupted storage', () => {
    const kv = memoryStore();
    kv.setItem('dartmouth-pong/matches/v1', '{broken');
    kv.setItem('dartmouth-pong/characters/v1', '{"not":"a list"}');
    const store = new AppStore(kv);
    expect(store.matches.list()).toEqual([]);
    expect(store.characters.list()).toEqual([]);
  });
});
