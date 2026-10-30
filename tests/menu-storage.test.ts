import { makeConfig } from '../src/config';
import { RulesEngine } from '../src/core/rules';
import { MatchStore, memoryStore, newMatchRecord } from '../src/data/storage';
import { Menu } from '../src/ui/menu';
import { AL, Script } from './helpers';

describe('pre-game menu', () => {
  it('defaults to tree / single game / team chooses / ski off', () => {
    const cfg = new Menu().config();
    expect(cfg).toMatchObject({ formation: 'tree', matchFormat: 'single', penaltyCupSelection: 'choose', skiCollision: false });
  });

  it('changes options with left/right and wraps', () => {
    const m = new Menu();
    m.move(0, 1); // formation → shrub
    m.move(1, 0);
    m.move(0, -1); // match → best of 3 (wraps backwards)
    m.move(1, 0);
    m.activate(); // penalty → auto (activate cycles an option row)
    m.move(1, 0);
    m.move(0, 1); // ski → on
    expect(m.config()).toMatchObject({ formation: 'shrub', matchFormat: 'bestOf3', penaltyCupSelection: 'auto', skiCollision: true });
  });

  it('action rows return their action; the cursor wraps', () => {
    const m = new Menu();
    m.move(-1, 0);
    expect(m.activate()).toBe('import');
    m.move(-2, 0);
    expect(m.activate()).toBe('start');
    m.move(3, 0);
    expect(m.cursor).toBe(0);
  });

  it('builds an independent config each time', () => {
    const m = new Menu();
    const a = m.config();
    a.hitting.timingWindow = 99;
    expect(m.config().hitting.timingWindow).not.toBe(99);
  });
});

describe('match storage', () => {
  function playedRecord() {
    const s = new Script(AL);
    s.goodServe();
    s.rallyHit(s.eng.expectedHitter()!);
    s.out();
    const rec = newMatchRecord(s.cfg, new Date('2026-10-30T12:00:00Z'), 'm-1');
    rec.games.push({ winner: null, log: s.eng.log });
    return { rec, s };
  }

  it('saves, lists and replaces records by id', () => {
    const store = new MatchStore(memoryStore());
    const { rec } = playedRecord();
    store.save(rec);
    store.save({ ...rec, winner: 'A' });
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].winner).toBe('A');
    expect(store.list()[0].rules).toMatchObject({ formation: 'tree', serveTableMissLimit: 3 });
    expect(Object.keys(store.list()[0].roster)).toEqual(['A-left', 'A-right', 'B-left', 'B-right']);
  });

  it('a stored log replays to the same final state', () => {
    const store = new MatchStore(memoryStore());
    const { rec, s } = playedRecord();
    store.save(rec);
    const log = store.list()[0].games[0].log;
    expect(RulesEngine.replay(makeConfig(), log).state).toEqual(s.eng.state);
  });

  it('export → import round-trips and merges without duplicates', () => {
    const a = new MatchStore(memoryStore());
    const { rec } = playedRecord();
    a.save(rec);
    const json = a.exportJson();
    const b = new MatchStore(memoryStore());
    b.save({ ...rec, id: 'm-2' });
    expect(b.importJson(json)).toBe(1);
    expect(b.importJson(json)).toBe(0);
    expect(b.list().map((m) => m.id).sort()).toEqual(['m-1', 'm-2']);
    expect(b.list().find((m) => m.id === 'm-1')).toEqual(rec);
  });

  it('rejects files that are not exports', () => {
    const store = new MatchStore(memoryStore());
    expect(() => store.importJson('{"foo":1}')).toThrow();
    expect(() => store.importJson('not json')).toThrow();
    expect(() => store.importJson(JSON.stringify({ app: 'dartmouth-pong', schemaVersion: 99, matches: [] }))).toThrow(/newer/);
    expect(() => store.importJson(JSON.stringify({ app: 'dartmouth-pong', schemaVersion: 1, matches: [{ nope: 1 }] }))).toThrow(/malformed/);
  });

  it('survives corrupted storage', () => {
    const kv = memoryStore();
    kv.setItem('dartmouth-pong/matches/v1', '{broken');
    expect(new MatchStore(kv).list()).toEqual([]);
  });
});
