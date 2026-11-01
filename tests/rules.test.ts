// Rules-engine scenarios. Numbers match docs/phase1-test-plan.md.

import { makeConfig } from '../src/config';
import { Match } from '../src/core/match';
import { RulesEngine, playerName } from '../src/core/rules';
import { diagonalOf } from '../src/core/table';
import type { PlayerId, TeamId } from '../src/core/types';
import { AL, AR, BL, BR, HIGH, LOW, Script } from './helpers';

/** A-L serves to B-R, B-R returns, A-R hits toward B. B-L is due next. */
function toBCups(s: Script) {
  s.goodServe();
  s.rallyHit(BR);
  s.hit(AR);
}

/** Team B's server misses until Team B has a HALF r3c0 (choose mode). */
function halfBPoint(s: Script) {
  for (let i = 0; i < LIMIT; i++) s.tableMiss();
  s.choose('B', 'r3c0');
}

/** Table misses before the serving team loses half a cup (default rules). */
const LIMIT = makeConfig().serveTableMissLimit;

describe('1. setup and first serve', () => {
  it('1.1 starts with every cup full: tree 11, shrub 7', () => {
    const tree = new Script(AL).s;
    const shrub = new Script(AL, { formation: 'shrub' }).s;
    expect(tree.cups.A).toHaveLength(11);
    expect(tree.cups.B).toHaveLength(11);
    expect(shrub.cups.A).toHaveLength(7);
    expect(shrub.cups.B).toHaveLength(7);
    expect([...tree.cups.A, ...tree.cups.B].every((c) => c.state === 'full')).toBe(true);
    expect(tree.phase).toBe('awaitServe');
  });

  it('1.2 draws the first server from all four players via the injected RNG', () => {
    const cfg = makeConfig();
    const pick = (v: number) => new RulesEngine(cfg, { rng: () => v }).state.server;
    expect(pick(0)).toEqual(AL);
    expect(pick(0.3)).toEqual(AR);
    expect(pick(0.6)).toEqual(BL);
    expect(pick(0.999)).toEqual(BR);
  });

  it('1.3 the receiver is the server’s diagonal', () => {
    for (const p of [AL, AR, BL, BR]) {
      const s = new Script(p);
      s.goodServe();
      expect(s.eng.expectedHitter()).toEqual(diagonalOf(p));
    }
  });

  it('1.4 receiver hits first, then the server’s partner', () => {
    const s = new Script(AL);
    expect(s.eng.expectedHitter()).toEqual(AL);
    s.goodServe();
    expect(s.last?.kind).toBe('goodServe');
    expect(s.eng.expectedHitter()).toEqual(BR);
    s.rallyHit(BR);
    expect(s.eng.expectedHitter()).toEqual(AR);
  });
});

describe('2. serving: re-serves', () => {
  it('2.1 no bounce on own side → re-serve, counter unchanged', () => {
    const s = new Script(AL);
    s.hit(AL);
    s.bounce('B', 'high');
    expect(s.last).toMatchObject({ kind: 'reServe', nextServer: AL });
    expect(s.s.missCount).toBe(0);
    expect(s.s.phase).toBe('awaitServe');
  });

  it('2.2 wrong opponent quarter → re-serve', () => {
    const s = new Script(AL);
    s.serveToBounce();
    s.bounce('B', 'low');
    expect(s.last).toMatchObject({ kind: 'reServe', nextServer: AL });
    expect(s.last!.text).toContain('wrong quarter');
  });

  it('2.3 two bounces on own side, then opponent half → re-serve [Q9]', () => {
    const s = new Script(AL);
    s.hit(AL);
    s.bounce('A', 'low');
    s.bounce('A', 'low');
    s.bounce('B', 'high');
    expect(s.last).toMatchObject({ kind: 'reServe' });
    expect(s.s.missCount).toBe(0);
  });

  it('2.4 unlimited re-serves with no penalty', () => {
    const s = new Script(AL);
    for (let i = 0; i < 20; i++) {
      s.serveToBounce();
      s.bounce('B', 'low');
    }
    expect(s.kinds().every((k) => k === 'reServe')).toBe(true);
    expect(s.calls).toHaveLength(20);
    expect(s.s.cups.A.every((c) => c.state === 'full')).toBe(true);
    expect(s.s.server).toEqual(AL);
  });

  it('2.5 re-serve message names the fault and the server', () => {
    const s = new Script(BR);
    s.hit(BR);
    s.bounce('A', 'low');
    expect(s.last!.text).toBe('Bad serve (no bounce on own side) — B-R re-serves');
  });
});

describe('3. serving: table misses', () => {
  it('3.1 serve that never touches the opponent half is a table miss', () => {
    const s = new Script(AL);
    s.tableMiss(); // bounced on own side, then off the table
    expect(s.last).toMatchObject({ kind: 'tableMiss', nextServer: AL });
    expect(s.s.missCount).toBe(1);
    s.hit(AL);
    s.out(); // straight off the table, no bounce at all
    expect(s.last).toMatchObject({ kind: 'missPenalty' });
  });

  it('3.2 one miss → no penalty; the default limit is 2', () => {
    expect(LIMIT).toBe(2);
    const s = new Script(AL);
    s.tableMiss();
    expect(s.s.missCount).toBe(1);
    expect(s.s.phase).toBe('awaitServe');
  });

  it('3.3 second miss → serving team chooses a cup to lose half; counter resets; same server', () => {
    const s = new Script(AL);
    for (let i = 0; i < LIMIT; i++) s.tableMiss();
    expect(s.last).toMatchObject({ kind: 'missPenalty', team: 'A' });
    expect(s.s.phase).toBe('penalty');
    expect(s.s.penalty).toEqual({ team: 'A', reason: 'tableMisses', chooser: 'A' });
    s.choose('A', 'r0c1');
    expect(s.cupState('A', 'r0c1')).toBe('half');
    expect(s.s.missCount).toBe(0);
    expect(s.s.phase).toBe('awaitServe');
    expect(s.s.server).toEqual(AL);
    expect(s.last).toMatchObject({ kind: 'penaltyApplied', nextServer: AL });
  });

  it('3.4 penalty on a HALF cup removes it', () => {
    const s = new Script(AL);
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < LIMIT; i++) s.tableMiss();
      s.choose('A', 'trunk');
    }
    expect(s.cupState('A', 'trunk')).toBe('removed');
  });

  it('3.5 penalty choice rejects removed cups, unknown cups and the other team', () => {
    const s = new Script(AL);
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < LIMIT; i++) s.tableMiss();
      s.choose('A', 'trunk');
    }
    for (let i = 0; i < LIMIT; i++) s.tableMiss();
    expect(s.choose('A', 'trunk').accepted).toBe(false);
    expect(s.choose('A', 'nope').accepted).toBe(false);
    expect(s.choose('B', 'r3c0').accepted).toBe(false);
    expect(s.s.phase).toBe('penalty');
    expect(s.choose('A', 'r3c0').accepted).toBe(true);
  });

  it('3.6 auto selection applies the penalty to the front-most live cup with no choice step', () => {
    const s = new Script(AL, { penaltyCupSelection: 'auto' });
    for (let i = 0; i < LIMIT; i++) s.tableMiss();
    expect(s.s.phase).toBe('awaitServe');
    expect(s.cupState('A', 'r3c0')).toBe('half');
    for (let i = 0; i < LIMIT; i++) s.tableMiss();
    expect(s.cupState('A', 'r3c0')).toBe('removed');
    for (let i = 0; i < LIMIT; i++) s.tableMiss();
    expect(s.cupState('A', 'r2c1')).toBe('half');
  });

  it('3.7 a successful serve resets the counter; the next sequence starts at 1', () => {
    const s = new Script(AL);
    s.tableMiss();
    s.goodServe();
    s.rallyHit(BR);
    expect(s.s.missCount).toBe(0);
    s.out(); // A-R lets it go out after one bounce → A-R serves
    expect(s.s.server).toEqual(AR);
    s.tableMiss();
    expect(s.s.missCount).toBe(1);
  });

  it('3.8 a re-serve-type bad serve does not reset the counter', () => {
    const s = new Script(AL);
    s.tableMiss();
    s.serveToBounce();
    s.bounce('B', 'low');
    expect(s.s.missCount).toBe(1);
  });

  it('3.9 respects serveTableMissLimit from config', () => {
    const s = new Script(AL, { serveTableMissLimit: 3 });
    s.tableMiss();
    s.tableMiss();
    expect(s.s.phase).toBe('awaitServe');
    s.tableMiss();
    expect(s.s.phase).toBe('penalty');
  });

  it('3.10 a penalty that removes the last cup ends the game', () => {
    const s = new Script(AL, { formation: 'shrub', penaltyCupSelection: 'auto' });
    for (let i = 0; i < 7 * 2 * LIMIT; i++) s.tableMiss();
    expect(s.s.phase).toBe('gameOver');
    expect(s.s.winner).toBe('B');
  });
});

describe('4. serving: serve hits an opponent cup', () => {
  it('4.1 opponent cup undamaged; serving team loses half a cup; same server re-serves', () => {
    const s = new Script(AL);
    s.serveToBounce();
    s.cup('B', 'r3c0');
    expect(s.last).toMatchObject({ kind: 'serveCupPenalty', team: 'A', nextServer: AL });
    expect(s.cupState('B', 'r3c0')).toBe('full');
    // Team B, whose cup was hit, picks which Team A cup loses half.
    expect(s.s.penalty).toEqual({ team: 'A', reason: 'serveHitCup', chooser: 'B' });
    s.choose('A', 'trunk');
    expect(s.cupState('A', 'trunk')).toBe('half');
    expect(s.s.phase).toBe('awaitServe');
    expect(s.s.server).toEqual(AL);
  });

  it('4.2 a HALF opponent cup stays HALF', () => {
    const s = new Script(BL);
    halfBPoint(s);
    s.goodServe(); // B-L → A-R
    s.hit(AR);
    s.out(); // A-R misses the table → A-R serves
    expect(s.s.server).toEqual(AR);
    s.serveToBounce();
    s.cup('B', 'r3c0');
    expect(s.last?.kind).toBe('serveCupPenalty');
    expect(s.cupState('B', 'r3c0')).toBe('half');
  });

  it('4.3 serve-cup penalty leaves the miss counter alone [Q3]', () => {
    const s = new Script(AL);
    s.tableMiss();
    s.serveToBounce();
    s.cup('B', 'r3c0');
    s.choose('A', 'trunk');
    expect(s.s.missCount).toBe(1);
    s.tableMiss();
    expect(s.last).toMatchObject({ kind: 'missPenalty' }); // the earlier miss still counts
  });

  it('4.4 legal landing then a cup before the receiver hits → serve-cup penalty [Q2]', () => {
    const s = new Script(AL);
    s.tableMiss();
    s.goodServe();
    s.cup('B', 'r3c0');
    expect(s.last?.kind).toBe('serveCupPenalty');
    expect(s.cupState('B', 'r3c0')).toBe('full');
    s.choose('A', 'trunk');
    expect(s.s.missCount).toBe(1);
  });

  it('4.5 a serve that sinks is a serve-cup penalty, not a sink [Q2]', () => {
    for (const landed of [false, true]) {
      const s = new Script(AL);
      if (landed) s.goodServe();
      else s.serveToBounce();
      s.sink('B', 'r3c0');
      expect(s.last?.kind).toBe('serveCupPenalty');
      expect(s.cupState('B', 'r3c0')).toBe('full');
    }
  });

  it('4.6 touching the server’s own cups has no effect', () => {
    const s = new Script(AL);
    s.serveToBounce();
    s.cup('A', 'r3c0');
    expect(s.calls).toHaveLength(0);
    s.bounce('B', 'high');
    expect(s.last?.kind).toBe('goodServe');
    expect(s.cupState('A', 'r3c0')).toBe('full');
  });
});

describe('5. rally faults', () => {
  it('5.1 double bounce on the receiver’s side → receiver serves', () => {
    const s = new Script(AL);
    s.goodServe();
    s.bounce('B', 'high');
    expect(s.last).toMatchObject({ kind: 'doubleBounce', nextServer: BR });
    expect(s.s.server).toEqual(BR);
  });

  it('5.2 mid-rally double bounce → the player whose turn it was serves', () => {
    const s = new Script(AL);
    s.goodServe();
    s.rallyHit(BR);
    s.rallyHit(AR);
    s.rallyHit(BL);
    s.bounce('A');
    expect(s.last).toMatchObject({ kind: 'doubleBounce', nextServer: AL });
  });

  it('5.3 hit misses the table → hitter serves', () => {
    const s = new Script(AL);
    s.goodServe();
    s.hit(BR);
    s.out();
    expect(s.last).toMatchObject({ kind: 'hitOut', player: BR, nextServer: BR });
  });

  it('5.4 hit before the ball bounced on your side → hitter serves', () => {
    const s = new Script(AL);
    s.goodServe();
    s.hit(BR);
    s.hit(AR);
    expect(s.last).toMatchObject({ kind: 'volley', player: AR, nextServer: AR });
  });

  it('5.5 wrong teammate → the teammate who was supposed to hit serves', () => {
    const s = new Script(AL);
    s.goodServe();
    s.rallyHit(BR);
    s.hit(AL);
    expect(s.last).toMatchObject({ kind: 'wrongTeammate', player: AL, nextServer: AR });
  });

  it('5.6 receiver’s partner returns the serve → receiver serves', () => {
    const s = new Script(AL);
    s.goodServe();
    s.hit(BL);
    expect(s.last).toMatchObject({ kind: 'wrongTeammate', player: BL, nextServer: BR });
  });

  it('5.7 alternation over a long rally', () => {
    const s = new Script(AL);
    s.goodServe();
    const order = [BR, AR, BL, AL, BR, AR, BL, AL, BR];
    for (const p of order) {
      expect(s.eng.expectedHitter()).toEqual(p);
      s.rallyHit(p);
    }
    expect(s.s.phase).toBe('rally');
    expect(s.calls.map((c) => c.kind)).toEqual(['goodServe']);
  });

  it('5.8 ball leaves the table after one bounce, unhit → player whose turn it was serves [Q5]', () => {
    const s = new Script(AL);
    s.goodServe();
    s.rallyHit(BR);
    s.out();
    expect(s.last).toMatchObject({ kind: 'missedReturn', nextServer: AR });
  });

  it('5.9 rally hit bounces on the hitter’s own side → hitter serves [Q6a]', () => {
    const s = new Script(AL);
    s.goodServe();
    s.hit(BR);
    s.bounce('B');
    expect(s.last).toMatchObject({ kind: 'ownSideBounce', nextServer: BR });
  });

  it('5.10 one call per hit, precedence wrong teammate → volley → low [Q8]', () => {
    const a = new Script(AL);
    a.goodServe();
    a.hit(BR);
    a.hit(AL, LOW); // wrong teammate + volley + low
    expect(a.calls.slice(1).map((c) => c.kind)).toEqual(['wrongTeammate']);
    expect(a.last!.nextServer).toEqual(AR);

    const b = new Script(AL);
    b.goodServe();
    b.hit(BR);
    b.hit(AR, LOW); // volley + low
    expect(b.last?.kind).toBe('volley');

    const c = new Script(AL);
    c.serveToBounce();
    c.hit(BL); // receiver's partner hits the serve in the air
    expect(c.last).toMatchObject({ kind: 'wrongTeammate', nextServer: BR });

    const d = new Script(AL);
    d.serveToBounce();
    d.hit(BR); // receiver hits the serve in the air
    expect(d.last).toMatchObject({ kind: 'volley', nextServer: BR });
  });
});

describe('6. height rule', () => {
  it('6.1 low hit ends the rally at the hit; hitter serves; no cup effect', () => {
    const s = new Script(AL);
    s.goodServe();
    s.hit(BR, LOW);
    expect(s.last).toMatchObject({ kind: 'lowHit', nextServer: BR });
    expect(s.s.phase).toBe('awaitServe');
  });

  it('6.2 peak exactly at shoulder height is legal', () => {
    const s = new Script(AL);
    s.goodServe();
    s.hit(BR, s.cfg.shoulderHeight);
    expect(s.s.phase).toBe('rally');
  });

  it('6.3 a low ball cannot damage cups afterwards', () => {
    const s = new Script(AL);
    s.goodServe();
    s.hit(BR, LOW);
    s.cup('A', 'r3c0');
    s.sink('A', 'r2c0');
    s.bounce('A');
    s.out();
    expect(s.calls.map((c) => c.kind)).toEqual(['goodServe', 'lowHit']);
    expect(s.s.cups.A.every((c) => c.state === 'full')).toBe(true);
  });

  it('6.4 serves are exempt from the height rule [Q7]', () => {
    const s = new Script(AL);
    s.hit(AL, LOW);
    s.bounce('A', 'low');
    s.bounce('B', 'high');
    expect(s.last?.kind).toBe('goodServe');
  });

  it('6.5 respects shoulderHeight from config', () => {
    const s = new Script(AL, { shoulderHeight: 2 });
    s.goodServe();
    s.hit(BR, 1.9);
    expect(s.last?.kind).toBe('lowHit');
  });
});

describe('7. cup hits and saves', () => {
  it('7.1 save on a FULL cup: no damage, rally continues', () => {
    const s = new Script(AL);
    toBCups(s);
    s.cup('B', 'r3c0');
    expect(s.last).toMatchObject({ kind: 'cupHit', player: AR });
    s.rallyHit(BL);
    expect(s.last).toMatchObject({ kind: 'saveMade', player: BL });
    expect(s.cupState('B', 'r3c0')).toBe('full');
    expect(s.s.phase).toBe('rally');
  });

  it('7.2 save on a HALF cup keeps it HALF', () => {
    const s = new Script(BL);
    halfBPoint(s);
    s.goodServe(); // B-L → A-R
    s.hit(AR);
    s.cup('B', 'r3c0');
    s.rallyHit(BR);
    expect(s.last?.kind).toBe('saveMade');
    expect(s.cupState('B', 'r3c0')).toBe('half');
  });

  it('7.3 save with zero table bounces after the cup is legal [Q4a]', () => {
    const s = new Script(AL);
    toBCups(s);
    s.cup('B', 'r3c0');
    s.rallyHit(BL);
    expect(s.last?.kind).toBe('saveMade');
  });

  it('7.4 cup contact is not a bounce: cup, one bounce, save is legal', () => {
    const s = new Script(AL);
    toBCups(s);
    s.cup('B', 'r3c0');
    s.bounce('B');
    s.rallyHit(BL);
    expect(s.last?.kind).toBe('saveMade');
  });

  it('7.5 a bounce before the cup counts toward the limit [Q4b]', () => {
    const s = new Script(AL);
    toBCups(s);
    s.bounce('B');
    s.cup('B', 'r3c0');
    s.bounce('B');
    expect(s.last).toMatchObject({ kind: 'saveFailed' });
    expect(s.cupState('B', 'r3c0')).toBe('half');
  });

  it('7.6 either teammate may save, including the one who just hit', () => {
    const s = new Script(AL);
    toBCups(s); // B-R hit last for B; B-L is due
    s.cup('B', 'r3c0');
    s.rallyHit(BR);
    expect(s.last).toMatchObject({ kind: 'saveMade', player: BR });
  });

  it('7.7 after a save, the saving team’s next hit goes to the non-saver', () => {
    for (const saver of [BL, BR]) {
      const s = new Script(AL);
      toBCups(s);
      s.cup('B', 'r3c0');
      s.rallyHit(saver);
      s.rallyHit(AL); // A alternation is unaffected: A-R hit last, A-L is due
      expect(s.eng.expectedHitter()).toEqual(saver === BL ? BR : BL);
    }
  });

  it('7.8 failed save by double bounce damages the cup; player whose turn it was serves [Q10]', () => {
    const s = new Script(AL);
    toBCups(s);
    s.cup('B', 'r3c0');
    s.bounce('B');
    s.bounce('B');
    expect(s.last).toMatchObject({ kind: 'saveFailed', nextServer: BL, cup: { team: 'B', cupId: 'r3c0' } });
    expect(s.cupState('B', 'r3c0')).toBe('half');
    expect(s.s.phase).toBe('awaitServe');

  });

  it('7.8b a second failed save on a HALF cup removes it', () => {
    const s = new Script(AL);
    for (let k = 0; k < 2; k++) {
      // Each loop: A serves (A-L), rally until A-R hits into B's r3c0, failed save.
      if (k === 1) {
        // B-L serves after the first failure; get back to an A serve.
        s.goodServe(); // B-L → A-R
        s.hit(AR);
        s.out(); // A-R serves
        s.goodServe(); // A-R → B-L
        s.rallyHit(BL);
        s.hit(AL);
      } else toBCups(s);
      s.cup('B', 'r3c0');
      s.bounce('B');
      s.bounce('B');
    }
    expect(s.cupState('B', 'r3c0')).toBe('removed');
  });

  it('7.9 failed save: ball out, or deflected back across', () => {
    const a = new Script(AL);
    toBCups(a);
    a.cup('B', 'r3c0');
    a.out();
    expect(a.last).toMatchObject({ kind: 'saveFailed', nextServer: BL });

    const b = new Script(AL);
    toBCups(b);
    b.cup('B', 'r3c0');
    b.bounce('A'); // kicked off the cup back onto A's side
    expect(b.last).toMatchObject({ kind: 'saveFailed', nextServer: BL });
    expect(b.cupState('B', 'r3c0')).toBe('half');
  });

  it('7.10 save return goes out → cup damaged, the saver serves [Q11]', () => {
    const s = new Script(AL);
    toBCups(s);
    s.cup('B', 'r3c0');
    s.hit(BR); // B-R saves although B-L was due
    s.out();
    expect(s.last).toMatchObject({ kind: 'saveFailed', nextServer: BR });
    expect(s.cupState('B', 'r3c0')).toBe('half');
    expect(s.calls.some((c) => c.kind === 'saveMade')).toBe(false);
  });

  it('7.10b save return bounces on the saver’s own side → save failed', () => {
    const s = new Script(AL);
    toBCups(s);
    s.cup('B', 'r3c0');
    s.hit(BL);
    s.bounce('B');
    expect(s.last).toMatchObject({ kind: 'saveFailed', nextServer: BL });
  });

  it('7.11 the save hit is exempt from the height rule', () => {
    const s = new Script(AL);
    toBCups(s);
    s.cup('B', 'r3c0');
    s.hit(BL, LOW);
    s.bounce('A');
    expect(s.last?.kind).toBe('saveMade');
  });

  it('7.12–7.13 the next hit by the other team is exempt; the one after is not', () => {
    const s = new Script(AL);
    toBCups(s);
    s.cup('B', 'r3c0');
    s.hit(BL, LOW);
    s.bounce('A');
    s.hit(AL, LOW); // exempt
    s.bounce('B');
    expect(s.s.phase).toBe('rally');
    s.hit(BR, LOW); // not exempt
    expect(s.last).toMatchObject({ kind: 'lowHit', nextServer: BR });
  });

  it('7.14 hitting your own cups does nothing; the ball stays live [Q6b]', () => {
    const s = new Script(AL);
    toBCups(s);
    s.cup('A', 'trunk');
    s.bounce('B');
    expect(s.calls.map((c) => c.kind)).toEqual(['goodServe']);
    expect(s.cupState('A', 'trunk')).toBe('full');
    s.rallyHit(BL);
    expect(s.s.phase).toBe('rally');
  });

  it('7.15 only the first cup touched is at risk [Q12]', () => {
    const s = new Script(AL);
    toBCups(s);
    s.cup('B', 'r3c0');
    s.cup('B', 'r2c0');
    s.bounce('B');
    s.bounce('B');
    expect(s.cupState('B', 'r3c0')).toBe('half');
    expect(s.cupState('B', 'r2c0')).toBe('full');
  });

  it('7.16 alternation is suspended for the save hit only', () => {
    const s = new Script(AL);
    toBCups(s);
    s.cup('B', 'r3c0');
    s.rallyHit(BR); // save by B-R (B-L was due)
    s.rallyHit(AL);
    s.hit(BR); // B-R again: wrong teammate now
    expect(s.last).toMatchObject({ kind: 'wrongTeammate', nextServer: BL });
  });
});

describe('8. sinks', () => {
  it('8.1 sink in a FULL cup removes it; rally ends', () => {
    const s = new Script(AL);
    toBCups(s);
    s.sink('B', 'r3c0');
    expect(s.cupState('B', 'r3c0')).toBe('removed');
    expect(s.last).toMatchObject({ kind: 'sink', player: AR });
    expect(s.s.phase).toBe('awaitServe');
  });

  it('8.2 sink in a HALF cup removes it', () => {
    const s = new Script(BL);
    halfBPoint(s);
    s.goodServe(); // B-L → A-R
    s.hit(AR);
    s.sink('B', 'r3c0');
    expect(s.cupState('B', 'r3c0')).toBe('removed');
  });

  it('8.3 a sink cannot be saved: later events for that ball are ignored', () => {
    const s = new Script(AL);
    toBCups(s);
    s.sink('B', 'r3c0');
    const n = s.calls.length;
    s.cup('B', 'r2c0');
    s.bounce('B');
    s.out();
    expect(s.calls).toHaveLength(n);
    expect(s.cupState('B', 'r2c0')).toBe('full');
  });

  it('8.4 sinker’s diagonal serves next, to the sinker', () => {
    const s = new Script(AL);
    toBCups(s);
    s.sink('B', 'r3c0');
    expect(s.s.server).toEqual(BL);
    expect(s.last!.text).toBe('SINK by A-R — B-L serves to A-R');
    s.goodServe();
    expect(s.eng.expectedHitter()).toEqual(AR);
  });

  it('8.5 sink chains are counted, and broken by any other rally ending', () => {
    const s = new Script(AL);
    toBCups(s);
    s.sink('B', 'r3c0');
    s.goodServe(); // B-L → A-R
    s.hit(AR);
    s.sink('B', 'r2c0');
    expect(s.s.sinkChain).toEqual({ player: AR, length: 2 });
    expect(s.last!.text).toContain('(x2)');
    s.goodServe();
    s.hit(AR);
    s.out();
    expect(s.s.sinkChain).toBeNull();
  });

  it('8.5b serve faults and penalties between sinks do not break the chain', () => {
    const s = new Script(AL);
    toBCups(s);
    s.sink('B', 'r3c0');
    for (let i = 0; i < LIMIT; i++) s.tableMiss();
    s.choose('B', 'trunk');
    s.goodServe();
    s.hit(AR);
    s.sink('B', 'r2c0');
    expect(s.s.sinkChain?.length).toBe(2);
  });

  it('8.6 a sink after touching another cup: the sink wins [Q12]', () => {
    const s = new Script(AL);
    toBCups(s);
    s.cup('B', 'r3c0');
    s.sink('B', 'r2c0');
    expect(s.cupState('B', 'r2c0')).toBe('removed');
    expect(s.cupState('B', 'r3c0')).toBe('full');
    expect(s.last?.kind).toBe('sink');
  });

  it('8.6b a save return that sinks confirms the save', () => {
    const s = new Script(AL);
    toBCups(s);
    s.cup('B', 'r3c0');
    s.hit(BL);
    s.sink('A', 'r3c0');
    expect(s.kinds().slice(-2)).toEqual(['saveMade', 'sink']);
    expect(s.cupState('B', 'r3c0')).toBe('full');
    expect(s.cupState('A', 'r3c0')).toBe('removed');
  });

  it('8.7 the sink-serve follows all serve rules', () => {
    const s = new Script(AL);
    toBCups(s);
    s.sink('B', 'r3c0');
    for (let i = 0; i < LIMIT; i++) s.tableMiss();
    expect(s.s.penalty).toEqual({ team: 'B', reason: 'tableMisses', chooser: 'B' });
  });

  it('8.8 sinking in your own cup counts as missing the table', () => {
    const s = new Script(AL);
    toBCups(s);
    s.sink('A', 'r3c0');
    expect(s.last).toMatchObject({ kind: 'hitOut', nextServer: AR });
    expect(s.cupState('A', 'r3c0')).toBe('full');
  });
});

describe('9. penalty flow', () => {
  it('9.1 play events are rejected while a penalty is pending', () => {
    const s = new Script(AL);
    for (let i = 0; i < LIMIT; i++) s.tableMiss();
    expect(s.hit(AL).accepted).toBe(false);
    expect(s.bounce('A').accepted).toBe(false);
    expect(s.s.phase).toBe('penalty');
  });

  it('9.2 only the penalized team may choose', () => {
    const s = new Script(BR);
    for (let i = 0; i < LIMIT; i++) s.tableMiss();
    expect(s.choose('A', 'trunk').accepted).toBe(false);
    expect(s.choose('B', 'trunk').accepted).toBe(true);
  });

  it('9.3 a serve hit by anyone other than the server is rejected', () => {
    const s = new Script(AL);
    expect(s.hit(BR).accepted).toBe(false);
    expect(s.s.phase).toBe('awaitServe');
  });
});

/** Script A sinking every B cup (A-R keeps sinking off B-L's serve). */
function aSinksAll(s: Script) {
  toBCups(s);
  const ids = s.s.cups.B.map((c) => c.id);
  s.sink('B', ids[0]);
  for (const id of ids.slice(1)) {
    s.goodServe();
    s.hit(AR);
    s.sink('B', id);
  }
}

describe('10. game and match end', () => {
  it('10.1 removing the last cup by sink ends the game immediately', () => {
    const s = new Script(AL, { formation: 'shrub' });
    aSinksAll(s);
    expect(s.s.phase).toBe('gameOver');
    expect(s.s.winner).toBe('A');
    expect(s.last).toMatchObject({ kind: 'gameOver', team: 'A' });
  });

  it('10.1b a failed save on the last cup ends the game', () => {
    const s = new Script(AL, { formation: 'shrub' });
    // Reduce B to a single HALF cup with penalties (B serves after the first rally).
    s.goodServe();
    s.hit(BR);
    s.out(); // B-R serves
    for (const id of ['trunk', 'r0c0', 'r0c1', 'r0c2', 'r1c0', 'r1c1']) {
      for (let k = 0; k < 2; k++) {
        for (let i = 0; i < LIMIT; i++) s.tableMiss();
        s.choose('B', id);
      }
    }
    for (let i = 0; i < LIMIT; i++) s.tableMiss();
    s.choose('B', 'r2c0'); // last cup: HALF
    expect(s.eng.cupsRemaining('B')).toBe(1);
    s.goodServe(); // B-R → A-L
    s.hit(AL);
    s.cup('B', 'r2c0');
    s.bounce('B');
    s.bounce('B');
    expect(s.s.winner).toBe('A');
  });

  it('10.2 events after game over are rejected', () => {
    const s = new Script(AL, { formation: 'shrub' });
    aSinksAll(s);
    expect(s.hit(BL).accepted).toBe(false);
    expect(s.bounce('A').accepted).toBe(false);
  });

  /** Make `loser` lose the current game of a match via serve penalties (auto mode). */
  function loseGame(m: Match, loser: TeamId) {
    const eng = m.current;
    const ev = (e: Parameters<RulesEngine['dispatch']>[0]) => eng.dispatch(e);
    const W = m.cfg.table.width;
    const L = m.cfg.table.length;
    const ownBounce = (p: PlayerId) =>
      ev({ type: 'bounce', x: p.team === 'A' ? L * 0.25 : L * 0.75, y: W * 0.5 });
    let server = eng.state.server;
    if (server.team !== loser) {
      // Winner serves legally; the loser's receiver hits it out and takes the serve.
      ev({ type: 'hit', player: server, peak: HIGH });
      ownBounce(server);
      const rec = diagonalOf(server);
      ev({ type: 'bounce', x: rec.team === 'A' ? L * 0.25 : L * 0.75, y: rec.side === 'left' ? W * 0.25 : W * 0.75 });
      ev({ type: 'hit', player: rec, peak: HIGH });
      ev({ type: 'ballOut' });
      server = eng.state.server;
    }
    expect(server.team).toBe(loser);
    while (eng.state.phase !== 'gameOver') {
      ev({ type: 'hit', player: server, peak: HIGH });
      ev({ type: 'ballOut' });
    }
    expect(eng.state.winner).not.toBe(loser);
  }

  const seq = (vals: number[]) => {
    let i = 0;
    return () => vals[i++ % vals.length];
  };

  it('10.3 single game: the first game decides the match', () => {
    const m = new Match(makeConfig({ formation: 'shrub', penaltyCupSelection: 'auto' }), seq([0.1]));
    loseGame(m, 'B');
    expect(m.finishGame()).toBe('A');
    expect(m.games).toHaveLength(1);
  });

  it('10.4 best of 3: first to two; 2–0 skips game 3; each game is fresh with a new draw', () => {
    const cfg = makeConfig({ formation: 'shrub', penaltyCupSelection: 'auto', matchFormat: 'bestOf3' });
    const m = new Match(cfg, seq([0.1, 0.9, 0.6]));
    expect(m.current.state.server).toEqual(AL);
    loseGame(m, 'A');
    expect(m.finishGame()).toBeNull();
    expect(m.games).toHaveLength(2);
    expect(m.current.state.server).toEqual(BR);
    expect(m.current.state.cups.A.every((c) => c.state === 'full')).toBe(true);
    loseGame(m, 'B');
    expect(m.finishGame()).toBeNull();
    expect(m.current.state.server).toEqual(BL);
    loseGame(m, 'B');
    expect(m.finishGame()).toBe('A');
    expect(m.wins).toEqual({ A: 2, B: 1 });

    const sweep = new Match(cfg, seq([0.1]));
    loseGame(sweep, 'B');
    sweep.finishGame();
    loseGame(sweep, 'B');
    expect(sweep.finishGame()).toBe('A');
    expect(sweep.games).toHaveLength(2);
  });
});

describe('11. referee messages and event log', () => {
  /** A busy scenario touching most call types. */
  function busy() {
    const s = new Script(AL);
    s.tableMiss();
    s.serveToBounce();
    s.bounce('B', 'low'); // re-serve
    s.goodServe();
    s.hit(BR, LOW); // low → B-R serves
    s.goodServe(); // B-R → A-L
    s.rallyHit(AL);
    s.hit(BL);
    s.cup('A', 'r3c0');
    s.rallyHit(AR); // save
    s.hit(BR);
    s.sink('A', 'r2c0'); // B-R sinks → A-L serves
    s.tableMiss();
    s.tableMiss();
    s.tableMiss();
    s.choose('A', 'trunk');
    return s;
  }

  it('11.1 every call that decides the server says who serves', () => {
    const s = busy();
    expect(s.calls.find((c) => c.kind === 'lowHit')!.text).toBe('Low hit by B-R — B-R serves');
    const deciding = s.calls.filter((c) => c.nextServer);
    expect(deciding.length).toBeGreaterThan(5);
    for (const c of deciding) expect(c.text).toContain(`${playerName(c.nextServer!)} ${c.kind === 'reServe' ? 're-serves' : 'serve'}`);
    for (const c of s.calls) expect(c.text.length).toBeGreaterThan(0);
  });

  it('11.2 the log records start, every accepted input and every call, in order', () => {
    const s = busy();
    s.hit(BR); // rejected: A-L is serving
    const log = s.eng.log;
    expect(log[0]).toMatchObject({ kind: 'start', data: { firstServer: AL } });
    expect(log.map((e) => e.seq)).toEqual(log.map((_, i) => i));
    expect(log.filter((e) => e.kind === 'call')).toHaveLength(s.calls.length);
    const inputs = log.filter((e) => e.kind === 'input');
    expect(inputs.some((e) => (e.data as { player?: PlayerId }).player?.side === 'right' && (e.data as { type: string }).type === 'hit')).toBe(true);
    expect(inputs.at(-1)!.data).toEqual({ type: 'chooseCup', team: 'A', cupId: 'trunk' });
  });

  it('11.3 replaying a log reproduces the final state', () => {
    const s = busy();
    const replayed = RulesEngine.replay(s.cfg, s.eng.log);
    expect(replayed.state).toEqual(s.eng.state);
    expect(replayed.log).toEqual(s.eng.log);
  });
});
