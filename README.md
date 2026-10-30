# Dartmouth Pong

Browser recreation of Dartmouth-style paddle pong. See [DESIGN.md](DESIGN.md) for the spec.

```sh
npm install
npm run dev     # play at http://localhost:5173
npm test        # unit tests (Vitest)
npm run build
```

Status: **Phase 1 complete** (rules engine, physics, timing-based hitting and serving, HUD, menu, win screens, saved match logs with JSON import/export). Rule decisions: [docs/phase1-test-plan.md](docs/phase1-test-plan.md) and the decisions log at the end of DESIGN.md.

## Controls

| | Team A | Team B |
|---|---|---|
| Aim | W A S D | Arrow keys |
| Hit / toss / confirm | Space | Enter |

Serve: press hit to toss, then hit again at the top of the toss. Rally: hit as the ball peaks after it bounces on your side. Esc returns to the menu.

## Layout

- `src/core/`: pure game logic (rules engine, match, physics, trajectories, formations, table geometry, style library). No DOM.
- `src/game/`: game controller and shot model (timing → trajectory). No DOM.
- `src/render/`, `src/ui/`, `src/input/`, `src/main.ts`: canvas drawing, menu, keyboard, app shell.
- `src/data/`: local match-log storage and JSON import/export.
- `src/config.ts` (all house rules and tuning) and `src/theme.ts` (all colors, fonts, sprites).

Open `/#debug` to expose `window.__pong` for scripted checks.
