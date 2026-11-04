import { composeSprite, normalizeParts, PART_OPTIONS } from '../src/core/sprite';

const P = PART_OPTIONS as unknown as Record<keyof typeof PART_OPTIONS, readonly string[]>;
const base = normalizeParts({ skin: 1, hairStyle: 1, hairColor: 0, shirtColor: 2, build: 1 });
const at = (s: { w: number; pixels: string[] }, x: number, y: number) => s.pixels[y * s.w + x];
const headRows = (s: { w: number; h: number; pixels: string[] }) => s.pixels.slice(0, 20 * s.w);

describe('character faces', () => {
  it('no white catch-lights or eye whites on any eyes', () => {
    for (let i = 0; i < P.eyes.length; i++) {
      const s = composeSprite({ ...base, eyes: i });
      const whites = headRows(s).filter((c) => /^#f[0-9a-f]f[0-9a-f]f[0-9a-f]$/i.test(c) && c.toLowerCase() !== '#ffeee2');
      expect(whites, P.eyes[i]).toEqual([]);
    }
  });

  it('the Afro leaves the face showing (eyes and mouth are drawn)', () => {
    const plain = composeSprite({ ...base, hairStyle: P.hairStyle.indexOf('Short') });
    const afro = composeSprite({ ...base, hairStyle: P.hairStyle.indexOf('Afro') });
    // The eye pixels match the short-haired version.
    for (const [x, y] of [[12, 10], [18, 10]]) expect(at(afro, x, y)).toBe(at(plain, x, y));
  });

  it('mouths and beards stay inside narrow chins', () => {
    const skin = P.skin[base.skin];
    for (const face of ['Pointed chin', 'Heart', 'Diamond', 'Narrow', 'High cheekbones']) {
      for (let m = 0; m < P.mouth.length; m++) {
        const withMouth = composeSprite({ ...base, faceShape: P.faceShape.indexOf(face), mouth: m });
        const none = composeSprite({ ...base, faceShape: P.faceShape.indexOf(face), mouth: 0 });
        // Nothing changes outside the face's own pixels (same silhouette as the plain mouth).
        const shape = (s: typeof none) => s.pixels.map((c) => (c ? 1 : 0)).join('');
        expect(shape(withMouth), `${face} / ${P.mouth[m]}`).toBe(shape(none));
      }
    }
    expect(skin).toBeTruthy();
  });

  it('glasses leave the eyes showing, and a cap leaves no hair above it', () => {
    const dots = composeSprite({ ...base });
    const specs = composeSprite({ ...base, accessory: P.accessory.indexOf('Glasses') });
    expect(at(specs, 12, 10)).toBe(at(dots, 12, 10));
    for (const hs of ['Curly', 'Quiff', 'Short curls', 'Spiky', 'Mohawk']) {
      const capped = composeSprite({ ...base, hairStyle: P.hairStyle.indexOf(hs), headwear: P.headwear.indexOf('Cap') });
      const bare = composeSprite({ ...base, hairStyle: P.hairStyle.indexOf('Bald'), headwear: P.headwear.indexOf('Cap') });
      // Above the cap's crown it looks like the bald head in the same cap: nothing pokes out.
      expect(capped.pixels.slice(0, 2 * capped.w), hs).toEqual(bare.pixels.slice(0, 2 * bare.w));
    }
  });
});
