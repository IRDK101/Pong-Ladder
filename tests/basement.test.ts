import { makeConfig } from '../src/config';
import { BEAMS, PILLAR_ROWS, PILLARS, ROOM, ROW_Y, VENUE_ORDER, VENUES, basementToWorld, tableToBasement } from '../src/render/basement';
import { teamCamera } from '../src/render/camera';

const cfg = makeConfig();
const { length: L, width: W } = cfg.table;

describe('basement layout', () => {
  it('the three tables stand in one row, bar end to door end: chain, saints, night sky', () => {
    const xs = (['chain', 'saints', 'spirits'] as const).map((v) => VENUES[v].cx);
    expect(xs).toEqual([...xs].sort((a, c) => a - c));
    for (const v of VENUE_ORDER) expect(VENUES[v].cy).toBe(ROW_Y);
    // A pillar pair stands between each pair of neighboring tables.
    expect(PILLAR_ROWS[0]).toBeGreaterThan(VENUES.chain.cx + W / 2);
    expect(PILLAR_ROWS[0]).toBeLessThan(VENUES.saints.cx - W / 2);
    expect(PILLAR_ROWS[1]).toBeGreaterThan(VENUES.saints.cx + W / 2);
    expect(PILLAR_ROWS[1]).toBeLessThan(VENUES.spirits.cx - W / 2);
  });

  it('maps each table into the game frame and back', () => {
    for (const v of VENUE_ORDER) {
      const to = tableToBasement(cfg, v);
      const back = basementToWorld(cfg, v);
      for (const p of [{ x: 0, y: 0, z: 0 }, { x: L, y: W, z: 0.3 }, { x: 0.7, y: 1.1, z: -0.2 }]) {
        const q = back(to(p));
        expect(q.x).toBeCloseTo(p.x);
        expect(q.y).toBeCloseTo(p.y);
        expect(q.z).toBeCloseTo(p.z);
      }
    }
  });

  it('every table, its players and both cameras fit inside the room', () => {
    for (const v of VENUE_ORDER) {
      const to = tableToBasement(cfg, v);
      const pts = [
        { x: -cfg.camera.behind, y: W / 2, z: 0 },
        { x: L + cfg.camera.behind, y: W / 2, z: 0 },
        { x: -0.6, y: -0.7, z: 0 },
        { x: L + 0.6, y: W + 0.7, z: 0 },
      ].map(to);
      for (const p of pts) {
        expect(p.x).toBeGreaterThan(ROOM.x0 + 0.1);
        expect(p.x).toBeLessThan(ROOM.x1 - 0.1);
        expect(p.y).toBeGreaterThan(ROOM.y0 + 0.1);
        expect(p.y).toBeLessThan(ROOM.y1 - 0.1);
      }
    }
  });

  it('no pillar stands on a table or where its players stand', () => {
    for (const v of VENUE_ORDER) {
      const back = basementToWorld(cfg, v);
      for (const pl of PILLARS) {
        const q = back({ x: pl.x, y: pl.y, z: 0 });
        const onTable = q.x > -0.35 && q.x < L + 0.35 && q.y > -0.35 && q.y < W + 0.35;
        const spots = [-0.55, L + 0.55].flatMap((x) => [W * 0.25 - 0.62, W * 0.75 + 0.62].map((y) => ({ x, y })));
        const nearPlayer = spots.some((s) => Math.hypot(s.x - q.x, s.y - q.y) < 0.55);
        expect(onTable || nearPlayer, `${v}: pillar at ${pl.x},${pl.y}`).toBe(false);
      }
    }
  });

  it('no beam hangs between a table camera and the far end of its table', () => {
    for (const v of VENUE_ORDER) {
      const back = basementToWorld(cfg, v);
      for (const team of ['A', 'B'] as const) {
        const cam = teamCamera(cfg, team, 400, 225);
        for (const bm of BEAMS) {
          // Sample along the beam: anything in front of the camera and within the table's width band is in the way.
          for (let t = bm.from; t <= bm.to; t += 0.1) {
            const q = back(bm.axis === 'x' ? { x: t, y: bm.at, z: 0 } : { x: bm.at, y: t, z: 0 });
            const ahead = (q.x - cam.eye.x) * Math.sign(cam.f.x);
            const between = ahead > 0 && ahead < L + cfg.camera.behind && q.y > -0.3 && q.y < W + 0.3;
            expect(between, `${v}/${team}: beam ${bm.axis}=${bm.at} at ${t.toFixed(1)}`).toBe(false);
          }
        }
      }
    }
  });
});

describe('background tables', () => {
  it('never show the table being played on twice', async () => {
    const { backgroundDesign } = await import('../src/render/basement3d');
    const { VENUE_ORDER } = await import('../src/render/basement');
    const { DESIGN_ORDER } = await import('../src/render/designs');
    for (const play of VENUE_ORDER)
      for (const design of DESIGN_ORDER) {
        const shown = [design, ...VENUE_ORDER.filter((v) => v !== play).map((v) => backgroundDesign(v, play, design))];
        expect(new Set(shown).size).toBe(shown.length);
      }
  });
});
