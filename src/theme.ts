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
  },
  fonts: {
    hud: '14px monospace',
    label: 'bold 12px monospace',
    title: 'bold 20px monospace',
  },
  /** Screen pixels per table meter. */
  pixelsPerMeter: 320,
  /** Padding around the table in screen pixels. */
  tablePadding: 80,
  lineWidth: 2,
  sprites: {},
} as const;

export type Theme = typeof theme;
