// The screen: its size in canvas pixels (the 3D views and the HUD fill it).

import type { GameConfig } from '../config';
import type { Theme } from '../theme';

export interface View {
  /** Unused by the 3D views (kept for the HUD's layout math): pixels per table meter. */
  scale: number;
  ox: number;
  oy: number;
  width: number;
  height: number;
}

/** The screen layout for a window of `width` × `height` canvas pixels. */
export function makeView(cfg: GameConfig, theme: Theme, width: number, height: number): View {
  const usableH = Math.max(100, height - theme.hudTop - theme.hudBottom - 80);
  const scale = Math.max(80, Math.min((width - 40) / (cfg.table.length + 1.4), usableH / cfg.table.width));
  return { scale, ox: (width - cfg.table.length * scale) / 2, oy: theme.hudTop + 40, width, height };
}
