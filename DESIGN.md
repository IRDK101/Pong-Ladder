# Dartmouth Pong — Design Spec

A browser game that faithfully recreates Dartmouth-style paddle pong as played in the Zeta Psi basement, with friends recreated as playable characters.

This file is the single source of truth for the project. Keep it updated as decisions are made. **If any rule here is ambiguous or seems to conflict with another, STOP AND ASK rather than guessing. Rule accuracy matters more than speed.**

Build in phases. Do not start a phase until the previous one is playable and its tests pass. Items listed as later phases should shape the architecture now, but should not be implemented early.

---

## Tech

- Runs in the browser. TypeScript + Vite + HTML5 Canvas 2D. No game engine unless there is a strong reason; ask first.
- 2D top-down view of the table, with simulated ball HEIGHT (a z value) shown through ball size and a ground shadow. Height drives bounces, cup hits vs. sinks, and the "low hit" rule.
- Unit tests with Vitest.
- Local persistence (characters, profiles, match logs), with JSON import/export for backup and sharing.

## Architecture requirements

- **Rules engine:** a pure rules engine / state machine (no rendering, no DOM), separate from physics, the renderer, and input. It accepts events (hit, bounce, cup contact, sink, ball out) and outputs state changes and referee calls. This is so AI opponents and online multiplayer can be added later without rewriting the rules.
- **Config:** all house-rule values live in one config object: formation (tree/shrub), serve table-miss limit (3), shoulder-height threshold, match format (single game / best of 3), penalty cup selection mode, ski collision on/off, controls, and tuning values.
- **Theme:** all colors, fonts, and sprites live in a single theme file.
- **Event log:** every match is recorded as an event log from Phase 1 onward (see Phase 3).
- **Referee messages:** show an on-screen message for every call, explaining what happened and who serves next (e.g., "Low hit by B2 — B2 serves").

---

# PHASE 1 — Core rules and gameplay

## Players and table

- 2 teams of 2. Team A at one end, Team B at the other. Each team has a LEFT player and a RIGHT player, in fixed positions for the whole game.
- "Diagonal" opponent = the opponent on the opposite side: A-left ↔ B-right, A-right ↔ B-left. Because positions are fixed, each player's diagonal never changes, and there is no tennis-style switching of serving sides.
- The table is divided into quarters: a lengthwise center line and a widthwise center line, both drawn as visible markings.
- There is NO net. A median object (a ski) lies across the center line as a visual marker only. It has no collision by default; make collision a config option.
- Local multiplayer first: 2 humans on one keyboard, each controlling one team. The game automatically switches control to whichever teammate is due to hit.

## Cups

- Formation options, selected before the game:
  - **TREE (11 cups):** 1 "trunk" cup centered against the back edge of the team's end, with a 10-cup pyramid in front of it (rows of 4-3-2-1). The 4-cup row sits next to the trunk; the point of the pyramid faces the opponents.
  - **SHRUB (7 cups):** the same structure with 1 trunk cup and a 6-cup pyramid (rows of 3-2-1).
- Cups are filled with WATER (display and tracking only; there is no drinking mechanic). States:
  - **FULL:** drawn full.
  - **HALF ("down"):** drawn half full.
  - **REMOVED:** gone from the table.
- Damage:
  - Ball hits a FULL cup (not sunk) → HALF, unless saved (see Saves).
  - Ball hits a HALF cup → REMOVED, unless saved.
  - Ball SINKS in any cup (full or half) → REMOVED immediately.
- Hitting your OWN team's cups has no penalty and causes no damage.

## Serving

- The first server of the game is a random player. After that, the server is always determined by the outcome of the previous rally (see "Who serves next").
- A serve is a paddle hit that must bounce ONCE on the server's own side, then land in the opponent's quarter diagonal to the server, like tennis. The diagonal opponent receives.
- Bad serves that DON'T miss the opponent's side of the table (wrong quarter, no bounce on own side, etc.) are re-served, with unlimited tries and no penalty.
- A serve that MISSES THE OPPONENT'S SIDE OF THE TABLE entirely counts as a "table miss":
  - On the 3rd table miss, the serving team loses half a cup.
  - The counter tracks only within one serve sequence. It resets as soon as the server makes a successful serve, and also after the penalty is applied. The same server continues serving.
- If a serve HITS ANY OF THE OPPONENT'S CUPS, the opponent's cup takes no damage. Instead, the SERVING team loses half a cup, and the server re-serves.
- "Lose half a cup" means one cup on the penalized team goes FULL → HALF or HALF → REMOVED. The penalized team chooses which cup (by click or keys). A config option allows automatic selection instead.

## Rally

- Play is generally like tennis. After a legal serve, the receiver must let the ball bounce once on their side, then hit it.
- Every hit must come after the ball bounces EXACTLY ONCE on the hitter's side: no volleys, no double bounces.
- Teammates ALTERNATE hits within each team:
  - On the serving team, the server hit first, so their partner hits next.
  - On the receiving team, the receiver hits first, then their partner, and so on.
- HEIGHT RULE: every hit must reach "shoulder height" (a configurable z threshold); otherwise it is "low."
  - A low hit ends the rally, and the player who hit low serves next. There is no cup penalty.
  - The low call is made at the moment of the hit, using the trajectory's predicted peak. A low hit therefore ends the rally immediately and cannot damage cups.

## Saves

- When a ball hits (but does not sink in) a cup, the defending team may "save" it by returning the ball to the other side before it bounces twice on their side or hits the ground.
  - Contact with a cup is NOT a bounce. Only table bounces count toward this limit.
- During a save, EITHER teammate may hit the ball. Alternation is suspended for that one hit.
- A successful save means the cup takes NO damage, and the rally continues. After a save, normal alternation resumes: the saving team's next hit goes to the teammate who did NOT make the save.
- If the save fails, the cup damage goes through (FULL → HALF, or HALF → REMOVED), and the rally ends.
- The save hit AND the hit immediately after it (by the other team) are EXEMPT from the height rule.
- A SINK cannot be saved.

## Who serves next (rally endings)

| What happened | Cup effect | Who serves next |
|---|---|---|
| Ball bounces twice on your side | None | The player whose turn it was to hit |
| Your hit misses the table / goes out | None | The hitter |
| You hit before the ball bounced on your side | None | The hitter |
| Wrong teammate hits (outside a save) | None | The teammate who was supposed to hit |
| Low hit | None | The hitter |
| Cup hit and save fails | Cup damaged | The player whose turn it was to hit |
| Cup sunk | Cup removed | The player DIAGONAL to the sinker (the opponent on the other side), serving back to the sinker, which allows sink chains |

## Game end

- A team loses when all of its cups are REMOVED. There is no rebuttal or comeback.
- The default match is one game. A best-of-3 option is selectable before the match.

## Controls (Phase 1 placeholder)

- Hitting is TIMING-BASED. As the ball comes to the active player after its bounce, a timing window opens. Pressing the hit key closer to the ideal moment gives a better shot.
- Directional keys aim (left/right and depth). Holding or releasing can control power and arc.
- Serving uses the same timing and aim system.
- Default keys: Team A = WASD + Space, Team B = Arrow keys + Enter. Make them remappable in config.
- Build the hit system to be modular and data-driven, so hit styles can be added later (see Phase 2).

## Phase 1 build order

1. Project scaffold. Render the table (quarters, center markings, ski) and the cup formations for tree and shrub.
2. Rules engine and state machine, with thorough unit tests that script scenarios for EVERY rule above:
   - serve faults and the 3-miss penalty
   - a serve hitting a cup
   - each rally fault
   - saves succeeding and failing
   - the height exemption after saves
   - sinks and the diagonal-serve rule
   - game end

   **Show me the test list before building further.**
3. Ball physics with height, bounces, and cup contact vs. sink detection.
4. Input, timing-based hitting, and serving.
5. HUD: cup states with water levels, whose turn it is, the server, the miss counter, and referee messages.
6. Pre-game menu (formation, match format, start) and a win screen.
7. Event logging for every match (see Phase 3: Data foundation).

---

# PHASE 2 — Characters, stats, draft

## Characters

- There is no built-in roster. I create characters myself; they are based on real friends.
- Character data: name, pixel sprite, "Master" flag, stats, serve style(s), 2–3 hit styles, level, cosmetics, and career stats.
- "Master" is a title only: a special badge and a distinctive name display (e.g., a styled or glowing name). It has no gameplay effect, and I set it in the editor.
- Characters are deliberately NOT balanced. Some are simply better than others.
- Build an in-game character creator/editor. Sprite creation, in priority order:
  1. Pick parts (hair, skin tone, shirt, build, accessories, etc.) from pixel-art part sets.
  2. Use a simple built-in pixel editor to draw or tweak a sprite.
  3. Upload a custom sprite image.
- Save characters locally, with JSON import/export.

## Stats (1–10 scale, background only)

| Stat | Effect |
|---|---|
| Accuracy | Scatter between the aimed point and the actual landing point |
| Power | Ball speed off the paddle (faster is harder to return, and slightly harder to control) |
| Spin | How much the ball curves in flight and kicks after the bounce |
| Serve | Serve accuracy and reduced chance of table misses |
| Saves | Extra reaction time and reach when saving a cup |

- Stats are mostly invisible during play: there are no stat bars in the HUD. Show them on the character select and profile screens only.
- SKILL BEATS STATS. Timing quality is the main factor in shot quality, and stats modify outcomes within limits. As a design target, a perfectly timed hit by an Accuracy-2 character should land more accurately than a badly timed hit by an Accuracy-10 character. Put all tuning values in config.
- Stats are fixed during a game and never change through leveling. Still, compute effective stats through a pipeline (base stats → [future modifiers]), so mid-game effects like momentum can be added later.
- Paddles are NOT a mechanic for now.

## Hit and serve styles

- Build a data-driven LIBRARY of hit styles and serve styles. Each style defines its trajectory profile: arc height, speed, spin type and amount, bounce behavior, and timing window shape.
- Each character is assigned serve style(s) and 2–3 hit styles from the library. Characters should feel noticeably different to play.
- For now, implement only a few generic placeholder styles: standard hit, lob, flat fast hit, and standard serve. I will define the real styles later, so adding a new style must be a data change, not a code rewrite.
- Controls: the hit key plus modifier/direction keys select among the active character's hit styles. Keep this mapping configurable.

## Player profiles and draft

- Keep HUMAN PLAYERS (profiles) separate from CHARACTERS (friends). Before a match, each human selects their profile, then the teams draft.
- Draft: a snake draft from the shared character pool. Each character can appear only once per game. First pick is decided by coin flip (configurable).

---

# PHASE 3 — Progression, stats tracking, theming

## Data foundation (design this in Phase 1)

- Record every match as an EVENT LOG. Log every serve, serve miss, hit (with its style and timing quality), bounce, cup hit, save attempt and result, sink, fault, and low hit, each tagged with the character AND the human player involved.
- Derive all stats, levels, Elo, and future achievements from these logs, so that new stats or achievements can be computed later, retroactively, from past games.

## Career stats

- Track these for each character AND each human player, at minimum:
  - wins and losses
  - cups sunk and cups downed
  - saves made and saves failed
  - serve table misses and serve cup penalties
  - low hits, and faults by type
  - longest rally
  - longest sink chain (consecutive sinks from the diagonal-serve rule)
- Add any other interesting stats you think of, and list them for me.
- Profile screens show career stats for both characters and players.

## Leveling

- Characters gain XP from playing and earn levels.
- Levels are displayed and unlock COSMETIC rewards only (sprite items, name colors, badges, celebrations). There are no stat changes.

## Elo

- Each HUMAN PLAYER has an Elo rating, updated after each match.
- Show the current rating and rating history on the player profile.

## Achievements (later; architect for it now)

- Achievements should be definable as rules evaluated against the event log and career stats (e.g., "sink 3 cups in a row," "save your last cup").
- They need an unlock notification and an achievements screen.

## Theming

- Pixel art. The setting is the Zeta Psi basement at Dartmouth, and it should be clearly recognizable. I will provide reference photos.
- Use placeholder art until then, keeping all art and colors in the theme file.

---

# Out of scope for now (do not block them)

- AI opponents
- online multiplayer
- the real hit-style designs
- paddles as equipment
- mid-game stat changes (momentum, pressure)
- sound
- achievements implementation

---

# Decisions log

Rule clarifications Q1–Q13 and implementation decisions D1–D4 are in [docs/phase1-test-plan.md](docs/phase1-test-plan.md) (all accepted with the proposed defaults). Other Phase 1 choices:

- **Coordinates:** x along the table length (Team A end at x = 0), y across the width, z = height of the ball above the table surface. Players are labelled left/right from one shared viewpoint (as seen from Team A's end), so A-left ↔ B-right is the physical diagonal (Q1).
- **Shoulder height** default: 0.6 m above the table surface (config `shoulderHeight`).
- **Table** placeholder: 8 ft × 4 ft; replace with the real basement table's measurements in config.
- **Hitting:** the timing window is centered on the ball's apex after it bounces on your side. Pressing outside the window is a whiff, with one swing per incoming ball. Timing quality controls landing scatter and peak height (badly timed hits can come out low).
- **Saves** use a tighter timing window (`hitting.saveWindowScale`, default 0.55). Without it, good players saved almost every cup hit and games did not end. Phase 2's Saves stat is the intended way to widen it per character.
- **Serving:** press hit to toss, press again near the top of the toss. A dropped toss is caught with no penalty.
- **Aim:** the direction keys move the target in screen space (up/down = across the table, left/right = deeper/shorter). Not yet implemented: hold/release for power and arc.
- **Control switching:** the keyboard always drives the teammate who is due to hit. During a save (either teammate may hit), it drives the teammate on the side the ball is on. A human therefore cannot commit a wrong-teammate fault in local play; the rules engine still enforces it for future AI/online input.
- **Event log tagging:** each match record stores a roster (player position → character id + human profile id; empty until Phase 2), and every logged event names the player position. So every event resolves to the character and the human involved.
