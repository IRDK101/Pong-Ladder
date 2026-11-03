import { afterEach, describe, expect, it } from 'vitest';
import { makeConfig } from '../src/config';
import { newCharacter, validateCharacter } from '../src/core/character';
import { MAX_PASSIVES, PASSIVES, passiveEffect, withPassiveStats } from '../src/core/passives';
import { BallPhysics } from '../src/core/physics';
import { getStyle } from '../src/core/styles';
import { Game, genericRoster } from '../src/game/game';
import { softPeak, timingWindow } from '../src/game/shot';
import { participantFrom } from '../src/ui/prematch';

describe('passive abilities', () => {
  afterEach(() => void PASSIVES.splice(0));

  it('are part of every character, validated, and do nothing until the catalog has them', () => {
    const c = newCharacter('P');
    expect(c.passives).toEqual([]);
    c.passives = ['later-ability'];
    expect(validateCharacter(c)).toEqual([]); // unknown ids are kept (they may be added to the catalog later)
    expect(passiveEffect(c.passives, 'saveWindow')).toBe(1);
    c.passives = ['a', 'a'];
    expect(validateCharacter(c).join()).toMatch(/once/);
    c.passives = Array.from({ length: MAX_PASSIVES + 1 }, (_, i) => `p${i}`);
    expect(validateCharacter(c).join()).toMatch(/at most/);
  });

  it('an ability in the catalog changes stats and timing for its character in a match', () => {
    PASSIVES.push({ id: 'steady', name: 'Steady', icon: '•', description: 'test', stats: { accuracy: 3 }, effects: { hitWindow: 1.2 } });
    const c = newCharacter('Steady one');
    c.passives = ['steady'];
    expect(withPassiveStats(c.stats, c.passives).accuracy).toBe(8);
    expect(withPassiveStats({ ...c.stats, accuracy: 9 }, c.passives).accuracy).toBe(10); // capped at the stat range
    const roster = genericRoster(2);
    roster['A-left'] = participantFrom(c, null);
    const g = new Game(makeConfig(), () => 0.5, roster);
    expect(g.statsOf({ team: 'A', side: 'left' }).accuracy).toBe(8);
    const cfg = makeConfig();
    const style = getStyle('standardHit');
    const stats = { accuracy: 5, power: 5, spin: 5, serve: 5, saves: 5 };
    expect(timingWindow(cfg, style, { stats, passives: ['steady'] })).toBeCloseTo(timingWindow(cfg, style, { stats }) * 1.2);
  });
});

describe('the ball stays on screen', () => {
  it('a smash bounces no higher than the cap; ordinary bounces are untouched', () => {
    const cfg = makeConfig();
    const cap = cfg.physics.maxBounceApex!;
    const apexAfter = (vz: number) => {
      const b = new BallPhysics(cfg);
      b.launch({ x: 1.6, y: 0.6, z: 0.05 }, { x: 0.2, y: 0, z: vz });
      let max = 0;
      let bounced = false;
      for (let i = 0; i < 4000 && b.status === 'flying'; i++) {
        const ev = b.step(1 / 600, []);
        if (ev.some((e) => e.type === 'bounce')) bounced = true;
        if (bounced) max = Math.max(max, b.pos.z);
        if (bounced && b.vel.z < 0 && max > 0.01) break;
      }
      return max;
    };
    expect(apexAfter(-12)).toBeLessThanOrEqual(cap + 0.02);
    const soft = apexAfter(-2.5);
    expect(soft).toBeGreaterThan(0.2);
    expect(soft).toBeLessThan(cap);
  });

  it('only the very highest aimed peaks are eased down', () => {
    const cfg = makeConfig();
    expect(softPeak(cfg, 0.95)).toBe(0.95);
    expect(softPeak(cfg, 1.3)).toBe(1.3);
    expect(softPeak(cfg, 1.73)).toBeLessThan(1.45);
    expect(softPeak(cfg, 1.73)).toBeGreaterThan(1.3);
  });
});
