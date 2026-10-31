// All colors, fonts, and sprites live here. Placeholder art until reference photos arrive.

export const theme = {
  colors: {
    background: '#1a1410',
    floor: '#2b211a',
    tableTop: '#6b4a2b',
    tableEdge: '#3d2a18',
    tableLine: '#f2e8d5',
    skiBody: '#c23b22',
    skiStripe: '#f2e8d5',
    cupTeamA: '#d6342c',
    cupTeamB: '#2c62d6',
    cupRim: '#f5f5f5',
    water: '#7fc8f8',
    waterHalf: '#5aa9dc',
    text: '#f2e8d5',
    textDim: '#a89a85',
    teamA: '#ff6a5c',
    teamB: '#6aa0ff',
    ball: '#fffaf0',
    ballOutline: '#c8b89a',
    shadow: 'rgba(0, 0, 0, 0.35)',
    activeRing: '#ffe066',
    penaltyCursor: '#ffe066',
    hudPanel: 'rgba(20, 14, 10, 0.85)',
    good: '#8fe388',
    bad: '#ff7b6b',
    overlay: 'rgba(10, 7, 5, 0.78)',
    button: '#3d2a18',
    buttonActive: '#6b4a2b',
    master: '#ffd76a',
    masterGlow: 'rgba(255, 200, 60, 0.9)',
  },
  /**
   * Basement scenery (placeholder until reference photos of the Zeta Psi
   * basement arrive): concrete floor, brick walls, a hanging light.
   */
  basement: {
    floor: '#2b2420',
    floorSeam: '#241e1a',
    stain: 'rgba(12, 8, 6, 0.28)',
    brick: '#5a2e22',
    brickDark: '#4a251b',
    mortar: '#2e1f19',
    lightGlow: 'rgba(255, 214, 150, 0.16)',
    wallDepth: 26,
  },
  /** Unlockable name colors (cosmetic rewards). */
  nameColors: {
    dartmouthGreen: '#2fb36b',
    basementOrange: '#ff9a3c',
    iceBlue: '#8fd8ff',
    hotPink: '#ff6fb5',
    gold: '#ffd76a',
  } as Record<string, string>,
  /** Celebration particle palettes (cosmetic rewards). */
  celebrations: {
    confetti: ['#ff6a5c', '#6aa0ff', '#ffe066', '#8fe388', '#ff6fb5'],
    greenFlare: ['#00693e', '#2fb36b', '#f2f2f2'],
    fireworks: ['#ffd76a', '#ff9a3c', '#fffaf0', '#ff6a5c'],
  } as Record<string, string[]>,
  fonts: {
    hud: '14px monospace',
    label: 'bold 12px monospace',
    title: 'bold 20px monospace',
  },
  /** Screen pixels per table meter. */
  pixelsPerMeter: 320,
  /** Padding around the table in screen pixels (left/right, top, bottom). */
  tablePadding: 175,
  hudTop: 70,
  hudBottom: 120,
  ballPixelRadius: 6,
  playerPixelRadius: 13,
  /** Screen pixels per sprite pixel for characters on the table. */
  spriteScale: 2,
  lineWidth: 2,
  sprites: {},
} as const;

export type Theme = typeof theme;
