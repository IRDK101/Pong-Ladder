import { makeConfig } from '../src/config';
import { newMatchRecord, type MatchRecord } from '../src/data/storage';
import { ACHIEVEMENTS, earned, newlyEarned } from '../src/progress/achievements';
import { careerRates, deriveCareers, emptyCareer } from '../src/progress/careers';
import { computeRatings, expectedScore } from '../src/progress/elo';
import { levelFor, xpFor, xpToReach } from '../src/progress/levels';
import { isUnlocked, newRewards, REWARDS, unlockedAt } from '../src/progress/rewards';
import { characterSprite, composeSprite, SPRITE_ITEMS, withItem } from '../src/core/sprite';
import { DEFAULT_PARTS } from '../src/core/character';
import { summarizeMatch } from '../src/progress/summary';
import { AL, AR, BL, BR, LOW, Script } from './helpers';

const cfg = makeConfig();

function recordFor(s: Script, id: string, winner: 'A' | 'B' | null, profiles = { A: 'pA', B: 'pB' }, at = '2026-10-30T12:00:00Z'): MatchRecord {
  const rec = newMatchRecord(s.cfg, new Date(at), id);
  rec.roster['A-left'] = { characterId: 'cAL', profileId: profiles.A };
  rec.roster['A-right'] = { characterId: 'cAR', profileId: profiles.A };
  rec.roster['B-left'] = { characterId: 'cBL', profileId: profiles.B };
  rec.roster['B-right'] = { characterId: 'cBR', profileId: profiles.B };
  rec.games.push({ winner: s.s.winner, log: s.eng.log });
  rec.winner = winner;
  rec.finishedAt = winner ? at : null;
  return rec;
}

/** A shrub game with known events; A wins with A-R sinking 7 in a row. */
function scriptedGame(): Script {
  const s = new Script(AL, { formation: 'shrub' });
  s.tableMiss(); // A-L table miss
  // Rally: A-R hits a B cup, B-L saves, then B-R hits low.
  s.goodServe();
  s.rallyHit(BR);
  s.hit(AR);
  s.cup('B', 'r2c0');
  s.rallyHit(BL); // save
  s.rallyHit(AL);
  s.hit(BR, LOW); // low → B-R serves
  // B-R serves; A-L's ball hits r2c0 and B fails to save it.
  s.goodServe();
  s.hit(AL);
  s.cup('B', 'r2c0');
  s.bounce('B');
  s.bounce('B'); // save failed: cup down to half, B-L serves
  // A-R sinks everything off B-L's serves.
  for (const id of ['r0c0', 'r0c1', 'r0c2', 'r1c0', 'r1c1', 'trunk', 'r2c0']) {
    s.goodServe();
    s.hit(AR);
    s.sink('B', id);
  }
  expect(s.s.winner).toBe('A');
  return s;
}

describe('career stats derived from logs', () => {
  const careers = deriveCareers([recordFor(scriptedGame(), 'm1', 'A')]);
  const c = (id: string) => careers.characters.get(id)!;

  it('attributes sinks, chains and wins to the right character', () => {
    expect(c('cAR')).toMatchObject({ cupsSunk: 7, longestSinkChain: 7, cupHits: 1, cupsDowned: 0, gamesWon: 1, matchesWon: 1 });
    expect(c('cBL')).toMatchObject({ cupsSunk: 0, gamesLost: 1, matchesLost: 1 });
  });

  it('counts serves, table misses, cup hits and cups downed', () => {
    expect(c('cAL')).toMatchObject({ serveTableMisses: 1, goodServes: 1, cupHits: 1, cupsDowned: 1 });
    expect(c('cAL').serves).toBe(2);
  });

  it('counts saves made and failed, low hits and faults by type', () => {
    expect(c('cBL')).toMatchObject({ savesMade: 1, savesFailed: 1 });
    expect(c('cBR')).toMatchObject({ lowHits: 1, goodServes: 1 });
    expect(c('cBR').faults.lowHit).toBe(1);
    expect(c('cBR').faults.doubleBounce).toBe(0);
  });

  it('longest rally is shared by everyone in the game', () => {
    for (const id of ['cAL', 'cAR', 'cBL', 'cBR']) expect(c(id).longestRally).toBe(5);
  });

  it('profiles collect their characters’ stats, counting each match and game once', () => {
    const pA = careers.profiles.get('pA')!;
    expect(pA).toMatchObject({ cupsSunk: 7, cupHits: 2, matchesPlayed: 1, matchesWon: 1, gamesPlayed: 1, gamesWon: 1 });
    expect(careers.profiles.get('pB')).toMatchObject({ savesMade: 1, matchesLost: 1 });
  });

  it('records attributed events for achievements', () => {
    const ev = careers.characterEvents.get('cAR')!;
    expect(ev.filter((e) => e.kind === 'sink').map((e) => e.detail.chain)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(careers.characterEvents.get('cBL')!.some((e) => e.kind === 'saveMade')).toBe(true);
  });

  it('counts aces: a serve the receiver never returns', () => {
    const s = new Script(AL);
    s.goodServe();
    s.bounce('B', 'high'); // receiver double-bounces
    const k = deriveCareers([recordFor(s, 'm-ace', null)]);
    expect(k.characters.get('cAL')!.aces).toBe(1);
    expect(k.characters.get('cBR')!.faults.doubleBounce).toBe(1);
    expect(k.characters.get('cAL')!.matchesPlayed).toBe(0); // unfinished match
  });

  it('tracks the biggest comeback in a won game', () => {
    const s = new Script(BL, { formation: 'shrub', penaltyCupSelection: 'auto' });
    // A falls 3 cups behind on serve penalties (6 half-cups, 2 table misses each), then comes back.
    s.goodServe(); // B-L → A-R
    s.hit(AR);
    s.out(); // A-R serves
    for (let i = 0; i < 12; i++) s.tableMiss();
    expect(s.eng.cupsRemaining('A')).toBe(4);
    // Now A-R serves and A sinks all 7 B cups.
    s.goodServe(); // A-R → B-L
    s.rallyHit(BL);
    s.hit(AL);
    const ids = s.s.cups.B.map((x) => x.id);
    s.sink('B', ids[0]); // B-R serves to A-L
    for (const id of ids.slice(1)) {
      s.goodServe();
      s.hit(AL);
      s.sink('B', id);
    }
    expect(s.s.winner).toBe('A');
    const k = deriveCareers([recordFor(s, 'm-cb', 'A')]);
    expect(k.characters.get('cAL')!.biggestComeback).toBe(3);
    expect(k.characters.get('cBL')!.biggestComeback).toBe(0);
  });

  it('ratios for display', () => {
    const r = careerRates(c('cBL'));
    expect(r.savePct).toBe(50);
    expect(careerRates(emptyCareer())).toMatchObject({ winPct: null, savePct: null, avgTiming: null, favoriteStyle: null });
  });

  it('is retroactive: new stats come from old logs (derivation is pure and repeatable)', () => {
    const rec = recordFor(scriptedGame(), 'm1', 'A');
    expect(deriveCareers([rec])).toEqual(deriveCareers([JSON.parse(JSON.stringify(rec))]));
  });
});

describe('levels and rewards', () => {
  it('level curve: 100 XP for level 2, then 200 more for level 3, …', () => {
    expect(xpToReach(cfg, 1)).toBe(0);
    expect(xpToReach(cfg, 2)).toBe(100);
    expect(xpToReach(cfg, 3)).toBe(300);
    expect(levelFor(cfg, 0)).toEqual({ level: 1, xp: 0, into: 0, span: 100 });
    expect(levelFor(cfg, 250)).toEqual({ level: 2, xp: 250, into: 150, span: 200 });
    expect(levelFor(cfg, 300).level).toBe(3);
  });

  it('XP comes from career stats', () => {
    const s = { ...emptyCareer(), gamesPlayed: 1, gamesWon: 1, matchesWon: 1, cupsSunk: 2 };
    const w = cfg.progression.xp;
    expect(xpFor(cfg, s)).toBe(w.gamePlayed + w.gameWon + w.matchWon + 2 * w.cupSunk);
  });

  it('rewards unlock by level and are cosmetic only', () => {
    expect(unlockedAt(1)).toEqual([]);
    expect(isUnlocked(2, 'nameColor', 'dartmouthGreen')).toBe(true);
    expect(isUnlocked(4, 'spriteItem', 'greenCap')).toBe(false);
    expect(newRewards(3, 5).map((r) => r.id)).toEqual(['confetti', 'greenCap']);
    for (const r of REWARDS) expect(['nameColor', 'badge', 'spriteItem', 'celebration']).toContain(r.kind);
  });

  it('sprite items draw over the sprite without changing the base', () => {
    const base = composeSprite(DEFAULT_PARTS);
    const capped = withItem(base, 'crown');
    expect(capped).not.toEqual(base);
    expect(capped.pixels[1 * 16 + 7]).toBe(SPRITE_ITEMS.crown.filter(([x, y]) => x === 7 && y === 1).pop()![2]); // the jewel, painted last
    expect(withItem(base, null)).toBe(base);
    expect(characterSprite({ parts: DEFAULT_PARTS, pixels: null }, 'goldChain').pixels).not.toEqual(base.pixels);
  });
});

describe('Elo', () => {
  const game = () => {
    const s = new Script(AL);
    s.goodServe();
    return s;
  };

  it('starts at 1000 and moves by K × (result − expected)', () => {
    expect(expectedScore(1000, 1000)).toBe(0.5);
    const r = computeRatings(cfg, [recordFor(game(), 'm1', 'A')]);
    expect(r.get('pA')!.rating).toBe(1016);
    expect(r.get('pB')!.rating).toBe(984);
    expect(r.get('pA')!.history[0]).toMatchObject({ matchId: 'm1', delta: 16, opponentId: 'pB', won: true });
  });

  it('applies matches in finish order and keeps history', () => {
    const r = computeRatings(cfg, [
      recordFor(game(), 'm2', 'B', undefined, '2026-10-30T13:00:00Z'),
      recordFor(game(), 'm1', 'A', undefined, '2026-10-30T12:00:00Z'),
    ]);
    const pA = r.get('pA')!;
    expect(pA.history.map((h) => h.matchId)).toEqual(['m1', 'm2']);
    expect(pA.history[1].delta).toBe(-Math.round(32 * (1 - expectedScore(984, 1016))));
    expect(r.get('pA')!.rating + r.get('pB')!.rating).toBe(2000);
  });

  it('skips unfinished matches, guests, and the same human on both sides', () => {
    const r = computeRatings(cfg, [
      recordFor(game(), 'u', null),
      recordFor(game(), 'g', 'A', { A: 'pA', B: '' }),
      recordFor(game(), 's', 'A', { A: 'pA', B: 'pA' }),
    ]);
    expect(r.size).toBe(0);
  });
});

describe('achievements framework', () => {
  it('evaluates rules against career stats and events', () => {
    const careers = deriveCareers([recordFor(scriptedGame(), 'm1', 'A')]);
    const input = (id: string) => ({ career: careers.characters.get(id)!, events: careers.characterEvents.get(id) ?? [] });
    expect(earned(input('cAR'), 'character').map((a) => a.id)).toContain('hatTrick');
    expect(earned(input('cBL'), 'character').map((a) => a.id)).not.toContain('hatTrick');
  });

  it('“save your last cup” reads the event stream', () => {
    const before = { career: emptyCareer(), events: [] };
    const after = { career: emptyCareer(), events: [{ matchId: 'm', game: 0, kind: 'saveMade' as const, detail: { cupsLeft: 1 } }] };
    expect(newlyEarned(before, after, 'profile').map((a) => a.id)).toEqual(['lastCupStand']);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(2);
  });
});

describe('post-match summary', () => {
  it('reports XP, level-ups with rewards, Elo changes and new achievements for this match only', () => {
    const earlier = recordFor(scriptedGame(), 'm0', 'B', undefined, '2026-10-29T12:00:00Z');
    const now = recordFor(scriptedGame(), 'm1', 'A');
    const sum = summarizeMatch(cfg, [earlier, now], now);
    const ar = sum.characters.find((c) => c.characterId === 'cAR')!;
    const w = cfg.progression.xp;
    expect(ar.xpGained).toBe(w.gamePlayed + w.gameWon + w.matchWon + 7 * w.cupSunk);
    expect(ar.levelAfter).toBeGreaterThanOrEqual(ar.levelBefore);
    expect(ar.rewards).toEqual(newRewards(ar.levelBefore, ar.levelAfter));
    expect(ar.achievements.map((a) => a.id)).toEqual([]); // hat trick already earned in m0's game
    const pA = sum.profiles.find((p) => p.profileId === 'pA')!;
    expect(pA.ratingBefore).toBe(984); // m0 was a loss
    expect(pA.ratingAfter).toBeGreaterThan(pA.ratingBefore);
    const first = summarizeMatch(cfg, [now], now);
    expect(first.characters.find((c) => c.characterId === 'cAR')!.achievements.map((a) => a.id)).toContain('hatTrick');
    expect(first.characters.find((c) => c.characterId === 'cAR')!.levelAfter).toBe(levelFor(cfg, xpFor(cfg, deriveCareers([now]).characters.get('cAR')!)).level);
  });
});
