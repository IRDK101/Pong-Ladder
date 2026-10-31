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
    /** Lighter HUD bars over the 3D views, so the room shows through. */
    hudPanel3d: 'rgba(12, 8, 6, 0.5)',
    good: '#8fe388',
    bad: '#ff7b6b',
    overlay: 'rgba(10, 7, 5, 0.78)',
    button: '#3d2a18',
    buttonActive: '#6b4a2b',
    master: '#ffd76a',
    /** Colors of the streak behind a spinning ball. */
    spinTop: '#ff9a3c',
    spinBack: '#5fd0ff',
    spinSide: '#ff6fb5',
    activeText: '#1a1410',
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
  /**
   * The 3D basement room (a generic frat basement: wood paneling, low
   * ceiling with joists and pipes, string lights, a beat-up couch, Greek
   * letters on the wall). Replace with the real room's look when known.
   */
  room: {
    floor: '#463c34',
    floorSeam: '#3a312a',
    stain: 'rgba(18, 10, 6, 0.32)',
    wall: '#5e3d26',
    wallDark: '#4c311f',
    baseboard: '#2b1a10',
    ceiling: '#2a231e',
    joist: '#3b2d22',
    pipe: '#7c766c',
    stringLights: ['#ff5a4f', '#ffd34f', '#5fd36b', '#4fb3ff', '#ff7be0'],
    couch: '#6b2e2e',
    couchDark: '#4b1f1f',
    flag: '#00693e',
    flagMark: '#f2f2f2',
    letters: '#e8c547',
    letterShadow: '#3a2a12',
    posters: ['#2c62d6', '#d6342c', '#e8a33d', '#6b3fa0'],
    posterInk: '#f2e8d5',
    paddle: '#b5332e',
    paddleHandle: '#d9b27c',
    lampShade: '#1f3a2a',
    lampGlow: 'rgba(255, 220, 160, 0.30)',
    vignette: 'rgba(0, 0, 0, 0.55)',
    tableLeg: '#2b1d12',
    tableSide: '#4a3220',
    cupInside: '#8c2420',
    divider: '#0d0a08',
  },
  /** Title screen. */
  menu: {
    logo: '#f2e8d5',
    logoShadow: '#1a1410',
    accent: '#2fb36b',
    accentWarm: '#ffd34f',
    panel: 'rgba(14, 10, 8, 0.78)',
    row: 'rgba(61, 42, 24, 0.85)',
    rowPlay: 'rgba(30, 80, 52, 0.9)',
    rowActive: 'rgba(107, 74, 43, 0.95)',
    shadeLeft: 'rgba(8, 6, 5, 0.82)',
    shadeRight: 'rgba(8, 6, 5, 0.35)',
    key: '#3d2a18',
    keyEdge: '#22160c',
  },
  /** The Greek letters painted on the basement wall. */
  houseLetters: 'ΖΨ',
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
