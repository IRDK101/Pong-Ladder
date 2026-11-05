import { makeConfig } from '../src/config';
import { SPEED_STEPS, SPEED_MID } from '../src/ui/menu';
import { CpuController } from '../src/game/ai';
import { Game, genericRoster, idleInput } from '../src/game/game';

/**
 * Like online-jitter.test.ts, at Masters speed and with the delay estimate set the
 * way a real link sets it (half the round trip): a match with a jittery network (60–220 ms each way, updates arriving unevenly),
 * seen from the guest's side: how often does the drawn ball jump, does the
 * guest's clock go backwards, and does the hit window flicker (open, shut, open)?
 */
function run(seed: number, step = SPEED_STEPS[SPEED_STEPS.length - 1], ahead = 0.14) {
  const cfg = makeConfig({ teamSize: 1 });
  cfg.physics.timeScale = step.timeScale;
  cfg.hitting.windowScale = step.window;
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647), s / 2147483647);
  const host = new Game(cfg, r, genericRoster(1));
  host.rewindable = true;
  const guest = new Game(cfg, Math.random, genericRoster(1));
  const a = new CpuController('A', 'hard', r);
  const toGuest: { due: number; n: ReturnType<Game['netState']> }[] = [];
  const toHost: { due: number; inp: ReturnType<typeof idleInput> }[] = [];
  const delay = () => 60 + r() * 160; // ms
  let jumps = 0;
  let big = 0;
  let hostBig = 0;
  let backwards = 0;
  let flickers = 0;
  let frames = 0;
  let prevShown = guest.ballShown();
  let prevVel = { ...guest.ball.vel };
  let prevTime = guest.time;
  let cueWas = false;
  let cueClosedAt = -1;
  let lastDue = 0;
  let tossAt = -1e9;
  // The same check on the host (no network): bounces and hits change direction there too.
  let hostJumps = 0;
  let hostFrames = 0;
  let hPrev = { ...host.ball.pos };
  let hVel = { ...host.ball.vel };
  const backAt: string[] = [];
  for (let f = 0; f < 60 * 400 && host.engine.peek().phase !== 'gameOver'; f++) {
    const now = (f * 1000) / 60;
    // Guest: take updates that have arrived (in order: a later send never overtakes an earlier one).
    const preStatus = guest.ball.status;
    while (toGuest.length && toGuest[0].due <= now) guest.applyNetAhead(toGuest.shift()!.n, 'B', ahead);
    const tm = guest.timingNow('B');
    const st = guest.engine.peek();
    let inp = idleInput();
    if (st.phase === 'awaitServe' && st.server.team === 'B') {
      // Toss once, then wait for the host's toss to show up here (half a second at most) before pressing again.
      if (!guest.tossing && guest.ball.status !== 'flying' && now - tossAt > 500) {
        inp = { ...inp, hit: true };
        tossAt = now;
      }
      else if (tm && Math.abs(tm.off) < 0.01) inp = { ...inp, hit: true, ...tm };
    } else if (tm && guest.canSwing('B') && Math.abs(tm.off) < 0.012) inp = { ...inp, hit: true, ...tm };
    if (st.phase === 'penalty' && st.penalty?.chooser === 'B') inp = { ...inp, hit: true };
    if (inp.hit) {
      toHost.push({ due: now + delay(), inp });
      guest.predictSwing('B', inp);
    }
    guest.netTick(1 / 60, 'B', idleInput());
    // Measure what the guest sees.
    const shown = guest.ballShown();
    const dt = (1 / 60) * cfg.physics.timeScale;
    if (guest.ball.status === 'flying') {
      frames++;
      const ex = { x: prevShown.x + prevVel.x * dt, y: prevShown.y + prevVel.y * dt, z: prevShown.z + prevVel.z * dt };
      const dev = Math.hypot(shown.x - ex.x, shown.y - ex.y, shown.z - ex.z);
      if (dev > 0.06) jumps++;
      // A big jump mid-play (not the ball reappearing in the server's hand for a new point).
      if (dev > 0.2 && preStatus === 'flying') big++;
    }
    if (guest.ball.status === 'flying' && guest.time < prevTime - 1e-6) {
      backwards++;
      backAt.push(`${guest.engine.peek().phase}:${(prevTime - guest.time).toFixed(3)}`);
    }
    const cue = !!guest.timingCue('B');
    if (cueWas && !cue) cueClosedAt = f;
    if (!cueWas && cue && cueClosedAt >= 0 && f - cueClosedAt < 20) flickers++;
    cueWas = cue;
    prevShown = shown;
    prevVel = { ...guest.ball.vel };
    prevTime = guest.time;
    // Host.
    let b = idleInput();
    while (toHost.length && toHost[0].due <= now) b = toHost.shift()!.inp;
    host.update(1 / 60, { A: a.input(host), B: b });
    if (host.ball.status === 'flying') {
      hostFrames++;
      const ex = { x: hPrev.x + hVel.x * dt, y: hPrev.y + hVel.y * dt, z: hPrev.z + hVel.z * dt };
      const hd = Math.hypot(host.ball.pos.x - ex.x, host.ball.pos.y - ex.y, host.ball.pos.z - ex.z);
      if (hd > 0.06) hostJumps++;
      if (hd > 0.2) hostBig++;
    }
    hPrev = { ...host.ball.pos };
    hVel = { ...host.ball.vel };
    if (f % 2 === 0) {
      lastDue = Math.max(lastDue, now + delay());
      toGuest.push({ due: lastDue, n: JSON.parse(JSON.stringify(host.netState())) });
    }
  }
  return { big, hostBig, jumps, backwards, flickers, frames, hostJumps, hostFrames, backAt: backAt.slice(0, 6), over: host.engine.peek().phase === 'gameOver' };
}

describe('online play at Masters speed (the guest’s view)', () => {
  it('the ball glides instead of jumping, even with the delay estimate a real link gives', () => {
    for (const st of [SPEED_STEPS[SPEED_MID], SPEED_STEPS[SPEED_STEPS.length - 1]]) {
      const res = [3, 7, 11].map((sd) => run(sd, st));
      console.log(st.label, JSON.stringify(res.map((r) => ({ over: r.over, big: r.big, hostBig: r.hostBig, frames: r.frames }))));
      for (const x of res) {
        expect(x.over).toBe(true);
        expect(x.backwards).toBe(0);
        expect(x.flickers).toBe(0);
        // Big jumps (over 20 cm in a frame) beyond the host's own (hits and bounces): under 0.6% of frames.
        expect((x.big - x.hostBig) / x.frames).toBeLessThan(0.006);
      }
    }
  });
});
