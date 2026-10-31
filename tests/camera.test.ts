import { makeConfig } from '../src/config';
import { cameraFrame, lookAt, project, projectPolygon, teamCamera } from '../src/render/camera';

const cfg = makeConfig();
const { length: L, width: W } = cfg.table;

describe('camera', () => {
  const camA = teamCamera(cfg, 'A', 400, 240);
  const camB = teamCamera(cfg, 'B', 400, 240);

  it('behind Team A: the far end is higher on screen than the near end, and A-left is on the left', () => {
    const near = project(camA, { x: 0, y: W / 2, z: 0 })!;
    const far = project(camA, { x: L, y: W / 2, z: 0 })!;
    expect(far.y).toBeLessThan(near.y);
    expect(far.depth).toBeGreaterThan(near.depth);
    const left = project(camA, { x: 0.3, y: W * 0.25, z: 0 })!; // A-left's lane
    const right = project(camA, { x: 0.3, y: W * 0.75, z: 0 })!;
    expect(left.x).toBeLessThan(right.x);
  });

  it('behind Team B shows the table turned around', () => {
    const left = project(camB, { x: L - 0.3, y: W * 0.25, z: 0 })!;
    const right = project(camB, { x: L - 0.3, y: W * 0.75, z: 0 })!;
    expect(left.x).toBeGreaterThan(right.x);
    expect(project(camB, { x: 0, y: W / 2, z: 0 })!.y).toBeLessThan(project(camB, { x: L, y: W / 2, z: 0 })!.y);
  });

  it('the whole table is in view', () => {
    for (const cam of [camA, camB])
      for (const [x, y] of [
        [0, 0],
        [0, W],
        [L, 0],
        [L, W],
      ]) {
        const p = project(cam, { x, y, z: 0 })!;
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(400);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(240);
      }
  });

  it('a higher ball appears higher on screen; nearer things appear bigger', () => {
    const low = project(camA, { x: 1.2, y: W / 2, z: 0.1 })!;
    const high = project(camA, { x: 1.2, y: W / 2, z: 0.8 })!;
    expect(high.y).toBeLessThan(low.y);
    expect(project(camA, { x: 0.3, y: W / 2, z: 0 })!.scale).toBeGreaterThan(project(camA, { x: 2.2, y: W / 2, z: 0 })!.scale);
  });

  it('points behind the camera do not project; polygons are clipped at the near plane', () => {
    const cam = lookAt({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 60, 100, 100);
    expect(project(cam, { x: -1, y: 0, z: 0 })).toBeNull();
    const poly = projectPolygon(cam, [
      { x: -1, y: -1, z: -1 },
      { x: 2, y: -1, z: -1 },
      { x: 2, y: 1, z: -1 },
      { x: -1, y: 1, z: -1 },
    ]);
    expect(poly.length).toBe(4);
    for (const p of poly) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(projectPolygon(cam, [{ x: -2, y: 0, z: 0 }, { x: -1, y: 1, z: 0 }, { x: -1, y: -1, z: 0 }])).toEqual([]);
  });

  it('aim keys follow the view: behind A, up = toward B (+x), right = +y; behind B, both flip', () => {
    expect(cameraFrame(camA)).toEqual({ up: [1, 0], right: [0, 1] });
    expect(cameraFrame(camB)).toEqual({ up: [-1, 0], right: [0, -1] });
  });
});
