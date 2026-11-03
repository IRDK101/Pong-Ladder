import { makeConfig } from '../src/config';
import { newCharacter, validateCharacter } from '../src/core/character';
import { available, firstPicker, isDone, newDraft, onTheClock, pick, snakeOrder, teamPicks, type Draft } from '../src/core/draft';
import { BallPhysics, NO_EFFECTS, type PhysicsEvent } from '../src/core/physics';
import { RulesEngine } from '../src/core/rules';
import { composeBase, composeSprite, normalizeParts, PART_OPTIONS, randomParts, SPRITE_H, SPRITE_W, spriteFromRgba } from '../src/core/sprite';
import { effectiveStats, effect, NEUTRAL_STATS, STAT_KEYS, statEffect, type Stats } from '../src/core/stats';
import { getStyle, registerStyle, STYLES } from '../src/core/styles';
import { solveArc, solveServe } from '../src/core/trajectory';
import { computeHit, spinEffects, timingWindow } from '../src/game/shot';
import { AL, BR, Script } from './helpers';

const cfg = makeConfig();
const g = cfg.physics.gravity;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const stats = (o: Partial<Stats> = {}): Stats => ({ ...NEUTRAL_STATS, ...o });

function flight(from: { x: number; y: number; z: number }, vel: { x: number; y: number; z: number }, fx = NO_EFFECTS) {
  const b = new BallPhysics(cfg);
  b.launch(from, vel, fx);
  const bounces: { x: number; y: number }[] = [];
  const peaks: number[] = [];
  let speedAfterBounce = 0;
  let rising = vel.z > 0;
  for (let i = 0; i < 2000 && b.status === 'flying' && bounces.length < 2; i++) {
    for (const e of b.step(1 / 240, []) as PhysicsEvent[])
      if (e.type === 'bounce') {
        bounces.push({ x: e.x, y: e.y });
        if (bounces.length === 1) speedAfterBounce = Math.hypot(b.vel.x, b.vel.y);
      }
    if (rising && b.vel.z <= 0) peaks.push(b.pos.z);
    rising = b.vel.z > 0;
  }
  return { bounces, peaks, speedAfterBounce, ball: b };
}

describe('stats pipeline', () => {
  it('neutral stats (5.5) change nothing', () => {
    for (const k of Object.keys(cfg.statEffects) as (keyof typeof cfg.statEffects)[]) expect(statEffect(cfg, k, 5.5)).toBeCloseTo(1, 9);
  });

  it('effect ranges interpolate from stat 1 to stat 10 and clamp outside', () => {
    expect(effect([2, 4], 1)).toBe(2);
    expect(effect([2, 4], 10)).toBe(4);
    expect(effect([2, 4], 0)).toBe(2);
    expect(effect([2, 4], 99)).toBe(4);
  });

  it('effective stats run base stats through modifiers and clamp to 1–10', () => {
    const base = { accuracy: 9, power: 2, spin: 5, serve: 5, saves: 5 };
    expect(effectiveStats(base)).toEqual(base);
    const momentum = (s: Stats) => ({ ...s, accuracy: s.accuracy + 3, power: s.power - 5 });
    expect(effectiveStats(base, [momentum])).toMatchObject({ accuracy: 10, power: 1 });
    expect(base.accuracy).toBe(9); // base untouched
  });

  it('every stat moves its effect in the documented direction', () => {
    const lo = 1;
    const hi = 10;
    expect(statEffect(cfg, 'accuracyScatter', hi)).toBeLessThan(statEffect(cfg, 'accuracyScatter', lo));
    expect(statEffect(cfg, 'powerPeak', hi)).toBeLessThan(statEffect(cfg, 'powerPeak', lo)); // flatter, faster
    expect(statEffect(cfg, 'powerScatter', hi)).toBeGreaterThan(statEffect(cfg, 'powerScatter', lo)); // slightly harder to control
    expect(statEffect(cfg, 'powerIncomingWindow', hi)).toBeLessThan(statEffect(cfg, 'powerIncomingWindow', lo)); // harder to return
    expect(statEffect(cfg, 'spinAmount', hi)).toBeGreaterThan(statEffect(cfg, 'spinAmount', lo));
    expect(statEffect(cfg, 'serveScatter', hi)).toBeLessThan(statEffect(cfg, 'serveScatter', lo));
    expect(statEffect(cfg, 'saveWindow', hi)).toBeGreaterThan(statEffect(cfg, 'saveWindow', lo));
  });

  it('SKILL BEATS STATS: a perfect hit by Accuracy 2 lands closer than a badly timed hit by Accuracy 10', () => {
    const rng = mulberry32(42);
    const from = { x: -0.2, y: 0.6, z: 0.2 };
    const aim = { x: 1.8, y: 0.6, forward: 1 as const };
    const meanErr = (acc: number, q: number) => {
      let sum = 0;
      for (let i = 0; i < 400; i++) {
        const s = computeHit(cfg, getStyle('standardHit'), from, aim, q, rng, stats({ accuracy: acc }));
        sum += Math.hypot(s.target.x - aim.x, s.target.y - aim.y);
      }
      return sum / 400;
    };
    const perfectBadStat = meanErr(2, 1);
    const sloppyGoodStat = meanErr(10, 0.4);
    expect(perfectBadStat).toBeLessThan(sloppyGoodStat / 2);
  });

  it('save window grows with the Saves stat; incoming power shrinks the return window', () => {
    const hit = getStyle('standardHit');
    expect(timingWindow(cfg, hit, { stats: stats({ saves: 10 }), save: true })).toBeGreaterThan(timingWindow(cfg, hit, { stats: stats({ saves: 1 }), save: true }));
    expect(timingWindow(cfg, hit, { stats: NEUTRAL_STATS, incomingPower: 10 })).toBeLessThan(timingWindow(cfg, hit, { stats: NEUTRAL_STATS, incomingPower: 1 }));
    // Saves do not affect normal hits.
    expect(timingWindow(cfg, hit, { stats: stats({ saves: 10 }) })).toBeCloseTo(cfg.hitting.timingWindow);
  });

  it('the serve stat widens the serve window and tightens serve scatter', () => {
    const serve = getStyle('standardServe');
    expect(timingWindow(cfg, serve, { stats: stats({ serve: 10 }) })).toBeGreaterThan(timingWindow(cfg, serve, { stats: stats({ serve: 1 }) }));
  });
});

describe('spin physics', () => {
  // Short enough that the second bounce is still on the table.
  const from = { x: 0.2, y: 0.4, z: 0.2 };
  const to = { x: 1.35, y: 0.4 };

  it('topspin bounces lower and kicks forward; backspin bounces higher and checks up', () => {
    const vel = solveArc(from, to, 0.5, g);
    const plain = flight(from, vel);
    const top = flight(from, vel, { ...NO_EFFECTS, topspin: 1 });
    const back = flight(from, vel, { ...NO_EFFECTS, topspin: -1 });
    expect(top.bounces[0].x).toBeCloseTo(plain.bounces[0].x, 3); // spin does not move the first landing
    expect(top.peaks[1]).toBeLessThan(plain.peaks[1]);
    expect(back.peaks[1]).toBeGreaterThan(plain.peaks[1]);
    expect(top.speedAfterBounce).toBeGreaterThan(plain.speedAfterBounce);
    expect(back.speedAfterBounce).toBeLessThan(plain.speedAfterBounce);
  });

  it('sidespin curves in flight but the solver compensates: it still lands on target, then kicks sideways', () => {
    const fx = { ...NO_EFFECTS, curve: 1.6, sideKick: 0.45 };
    const vel = solveArc(from, to, 0.5, g, fx.curve);
    const { bounces } = flight(from, vel, fx);
    expect(bounces[0].x).toBeCloseTo(to.x, 2);
    expect(bounces[0].y).toBeCloseTo(to.y, 2);
    expect(bounces[1].y).toBeGreaterThan(bounces[0].y + 0.05);
  });

  it('serves with spin still bounce on the own side and land on target', () => {
    for (const fx of [
      { ...NO_EFFECTS, topspin: 0.8 },
      { ...NO_EFFECTS, topspin: -0.8, restitutionScale: 1.05 },
      { ...NO_EFFECTS, curve: 1.2, sideKick: 0.3 },
    ]) {
      const sFrom = { x: -0.25, y: 0.3, z: 0.39 };
      const sTo = { x: 1.83, y: 0.92 };
      const { vel, firstBounce } = solveServe(cfg, sFrom, sTo, 0.35, fx);
      const { bounces } = flight(sFrom, vel, fx);
      expect(bounces[0].x).toBeCloseTo(firstBounce.x, 2);
      expect(bounces[0].x).toBeLessThan(cfg.table.length / 2);
      expect(bounces[1].x).toBeCloseTo(sTo.x, 2);
      expect(bounces[1].y).toBeCloseTo(sTo.y, 2);
    }
  });

  it('the Spin stat scales a style’s spin', () => {
    const flat = getStyle('flatFast');
    expect(spinEffects(cfg, flat, stats({ spin: 10 })).topspin).toBeGreaterThan(spinEffects(cfg, flat, stats({ spin: 1 })).topspin);
    expect(spinEffects(cfg, getStyle('lob'), NEUTRAL_STATS).topspin).toBeLessThan(0);
    expect(spinEffects(cfg, getStyle('standardHit'), stats({ spin: 10 }))).toEqual({ ...NO_EFFECTS });
  });
});

describe('style library', () => {
  it('ships the placeholder styles: standard hit, lob, flat fast hit, standard serve', () => {
    expect(Object.keys(STYLES).sort()).toEqual(['flatFast', 'lob', 'standardHit', 'standardServe']);
    expect(getStyle('lob').peak).toBeGreaterThan(getStyle('standardHit').peak);
    expect(getStyle('flatFast').peak).toBeLessThan(getStyle('standardHit').peak);
    expect(getStyle('flatFast').peak).toBeGreaterThan(cfg.shoulderHeight); // legal when timed well
  });

  it('a flat fast hit is riskier than a lob: more low hits with the same timing', () => {
    const rng = mulberry32(3);
    const lows = (id: string) => {
      let n = 0;
      for (let i = 0; i < 300; i++) if (computeHit(cfg, getStyle(id), { x: -0.2, y: 0.6, z: 0.2 }, { x: 1.8, y: 0.6, forward: 1 }, 0.6, rng).peak < cfg.shoulderHeight) n++;
      return n;
    };
    expect(lows('flatFast')).toBeGreaterThan(lows('lob'));
    expect(lows('lob')).toBe(0);
  });

  it('new styles are a data change: register one and characters can use it', () => {
    registerStyle({ ...getStyle('standardHit'), id: 'testSlice', name: 'Slice', spin: { type: 'side', amount: 0.5 } });
    const c = newCharacter('Tester');
    c.hitStyles = ['standardHit', 'testSlice'];
    expect(validateCharacter(c)).toEqual([]);
    delete STYLES.testSlice;
    expect(() => registerStyle({ ...getStyle('standardHit'), id: '', name: 'x' })).toThrow();
  });
});

describe('characters', () => {
  it('a new character is valid, with default stats and 2–3 hit styles', () => {
    const c = newCharacter('Ari');
    expect(validateCharacter(c)).toEqual([]);
    expect(c.hitStyles.length).toBeGreaterThanOrEqual(2);
    expect(c.hitStyles.length).toBeLessThanOrEqual(3);
    expect(c.master).toBe(false);
  });

  it('validation explains what is wrong', () => {
    const c = newCharacter('');
    c.stats.power = 11;
    c.hitStyles = ['standardHit'];
    c.serveStyles = [];
    const errs = validateCharacter(c);
    expect(errs.some((e) => /name/i.test(e))).toBe(true);
    expect(errs.some((e) => /power/.test(e))).toBe(true);
    expect(errs.some((e) => /2–3 hit styles/.test(e))).toBe(true);
    expect(errs.some((e) => /serve style/.test(e))).toBe(true);
    const d = newCharacter('X');
    d.hitStyles = ['standardHit', 'standardServe'];
    expect(validateCharacter(d).some((e) => /Unknown hit style/.test(e))).toBe(true);
  });

  it('master is a title only: it does not change any gameplay number', () => {
    const c = newCharacter('M');
    c.master = true;
    expect(effectiveStats(c.stats)).toEqual(effectiveStats(newCharacter('N').stats));
    expect(STAT_KEYS.length).toBe(5);
  });
});

describe('sprites', () => {
  it('composes a full-size (2x the 16x24 grid) sprite deterministically from parts', () => {
    const parts = { skin: 2, hairStyle: 3, hairColor: 1, shirtStyle: 2, shirtColor: 0, pantsColor: 1, build: 2, accessory: 1 };
    const a = composeSprite(parts);
    expect(a.w).toBe(SPRITE_W * 2);
    expect(a.h).toBe(SPRITE_H * 2);
    expect(a.pixels).toHaveLength(SPRITE_W * SPRITE_H * 4);
    // The pixel editor still starts from the 16x24 grid.
    expect(composeBase(parts).pixels).toHaveLength(SPRITE_W * SPRITE_H);
    expect(composeSprite(parts)).toEqual(a);
    expect(a.pixels.every((p) => p === '' || /^#[0-9a-f]{6}$/.test(p))).toBe(true);
    expect(a.pixels.includes(PART_OPTIONS.skin[2])).toBe(true);
  });

  it('every part option changes the picture', () => {
    const base = { ...normalizeParts({ skin: 0, hairStyle: 1, hairColor: 0, shirtStyle: 0, shirtColor: 1, pantsColor: 0, build: 1, accessory: 0 }), headwear: 1 };
    const ref = composeSprite(base).pixels.join();
    for (const key of Object.keys(PART_OPTIONS) as (keyof typeof PART_OPTIONS)[]) {
      // Every option of every part (front or back view) draws a different picture from the base.
      for (let i = 0; i < PART_OPTIONS[key].length; i++) {
        if (i === base[key]) continue;
        const p = { ...base, [key]: i };
        const changed = composeSprite(p).pixels.join() + composeSprite(p, 'back').pixels.join();
        expect(changed, `${key} = ${PART_OPTIONS[key][i]}`).not.toBe(ref + composeSprite(base, 'back').pixels.join());
      }
    }
  });

  it('older saved characters (only the original eight parts) still draw, as before for those parts', () => {
    const old = { skin: 2, hairStyle: 3, hairColor: 1, shirtStyle: 2, shirtColor: 0, pantsColor: 1, build: 2, accessory: 1 };
    expect(composeSprite(old).pixels).toEqual(composeSprite(normalizeParts(old)).pixels);
    expect(normalizeParts(old).faceShape).toBe(0);
    expect(normalizeParts({ ...old, skin: 99 }).skin).toBe(99 % PART_OPTIONS.skin.length);
  });

  it('random looks are valid parts', () => {
    let seed = 3;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 50; k++) {
      const p = randomParts(rng);
      expect(normalizeParts(p)).toEqual(p);
      expect(composeSprite(p).pixels).toHaveLength(SPRITE_W * SPRITE_H * 4);
    }
  });

  it('quantizes uploaded RGBA pixels, keeping transparency', () => {
    const data = [255, 0, 0, 255, 10, 20, 30, 0, 18, 35, 52, 255];
    expect(spriteFromRgba(data, 3, 1).pixels).toEqual(['#ff0000', '', '#112233']);
  });
});

describe('snake draft', () => {
  const pool = ['c1', 'c2', 'c3', 'c4', 'c5'];

  it('snake order is A B B A (or B A A B)', () => {
    expect(snakeOrder('A')).toEqual(['A', 'B', 'B', 'A']);
    expect(snakeOrder('B')).toEqual(['B', 'A', 'A', 'B']);
  });

  it('coin flip picks either team; a fixed setting always picks that team', () => {
    expect(firstPicker('coinFlip', () => 0.1)).toBe('A');
    expect(firstPicker('coinFlip', () => 0.9)).toBe('B');
    expect(firstPicker('B', () => 0.1)).toBe('B');
  });

  it('runs a full draft with each character used once', () => {
    let d: Draft = newDraft(pool, 'B');
    for (const [team, id] of [['B', 'c3'], ['A', 'c1'], ['A', 'c5'], ['B', 'c2']] as const) {
      expect(onTheClock(d)).toBe(team);
      const next = pick(d, team, id);
      expect(typeof next).not.toBe('string');
      d = next as Draft;
    }
    expect(isDone(d)).toBe(true);
    expect(teamPicks(d, 'A')).toEqual(['c1', 'c5']);
    expect(teamPicks(d, 'B')).toEqual(['c3', 'c2']);
    expect(available(d)).toEqual(['c4']);
  });

  it('rejects out-of-turn, duplicate and unknown picks, and too small a pool', () => {
    let d = newDraft(pool, 'A');
    expect(pick(d, 'B', 'c1')).toMatch(/Team A's pick/);
    d = pick(d, 'A', 'c1') as Draft;
    expect(pick(d, 'B', 'c1')).toMatch(/already been picked/);
    expect(pick(d, 'B', 'nope')).toMatch(/not in the pool/);
    expect(() => newDraft(['c1', 'c2', 'c3'], 'A')).toThrow(/at least 4/);
  });
});

describe('named referee calls', () => {
  it('messages use character names, and replay reproduces them', () => {
    const s = new Script(AL);
    s.eng = new RulesEngine(s.cfg, { firstServer: AL, names: { 'A-left': 'Ari', 'B-right': 'Sam' } });
    s.goodServe();
    s.hit(BR, 0.1);
    expect(s.last!.text).toBe('Low hit by Sam — Sam serves');
    expect(RulesEngine.replay(s.cfg, s.eng.log).log).toEqual(s.eng.log);
  });
});
