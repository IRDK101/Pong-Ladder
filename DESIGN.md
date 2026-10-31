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
- **Aim (revised after playtest):** sticky crosshair. Holding a direction key slides it in screen space (up/down = across the table, left/right = deeper/shorter) and it stays where it is left, so aiming is separate from timing. Not yet implemented: hold/release for power and arc.
- **Timing cue (added after playtest):** a ring closes in on the ball and turns green at the ideal moment. There is also a How to play screen.
- **Game speed (revised after playtest):** the default is 0.55× real time (it was 0.8×). The menu offers Relaxed / Normal / Quick.
- **Control switching:** the keyboard always drives the teammate who is due to hit. During a save (either teammate may hit), it drives the teammate on the side the ball is on. A human therefore cannot commit a wrong-teammate fault in local play; the rules engine still enforces it for future AI/online input.
- **Event log tagging:** each match record stores a roster (player position → character id + human profile id; empty until Phase 2), and every logged event names the player position. So every event resolves to the character and the human involved.

## Phase 2 decisions

- **Stats → effects:** each stat scales its effects through ranges in `config.statEffects`, given as the multiplier at stat 1 and at stat 10. Stat 5.5 is exactly neutral, which is what the generic quick-match players use. A test enforces the skill-beats-stats target: a perfectly timed hit by an Accuracy-2 character lands under half as far off target, on average, as a badly timed hit by an Accuracy-10 one.
  - Accuracy: landing scatter on rally hits.
  - Power: lower and faster arcs, slightly more scatter, and a smaller timing window for whoever returns that ball.
  - Spin: scales the style's spin amount.
  - Serve: serve scatter and a wider serve timing window.
  - Saves: a wider timing window on saves. There's no player movement, so "reach" is folded into this window.
- **Effective stats pipeline:** `effectiveStats(base, modifiers)` is the only way gameplay reads stats. It has no modifiers yet.
- **Spin physics:** topspin bounces lower and kicks forward; backspin bounces higher and checks up. Sidespin curves the ball in flight and kicks it sideways at the bounce. Spin is used up at the first bounce. The solvers compensate for the curve, so a shot still lands where it was aimed and the surprise comes after the bounce.
- **Placeholder styles:** Standard hit, Lob (high, forgiving timing, backspin), Flat fast hit (just above shoulder height, tight and punishing timing, topspin), Standard serve. A style is data (`STYLES`, or `registerStyle()` for imported JSON).
- **Style selection keys:** the plain hit key uses a character's 1st style. Holding the style-2 or style-3 key while pressing hit uses the 2nd or 3rd style: Q / E for Team A, `.` / `/` for Team B. These are in `config.controls`. A character with only 2 styles uses its 2nd style for the style-3 key too.
- **Sprites:** 16×24 pixel figures built from parts (skin, hair, hair color, shirt, shirt color, pants, build, accessory). The pixel editor and image upload both store a full pixel grid that replaces the parts drawing. "Discard drawing" goes back to the parts. Uploads are fit into 16×24 and reduced to a 4-bit-per-channel palette.
- **Draft:** snake order A B B A or B A A B. `config.draftFirstPick` defaults to a coin flip. The team's first pick plays left and its second plays right; each team can swap them on the lineup screen before starting. A draft needs at least 4 valid characters; otherwise the game offers to create characters or play a quick match with generic players.
- **Match record roster:** each position stores the character id and the human profile id (null for Guest).
- **Backups:** one JSON file holds characters, players and matches (schema v2; v1 matches-only files still restore). Copy and paste works everywhere, including the hosted page where downloads are blocked. Restoring merges by id and skips invalid characters with a reason.
- **Career stats on profile screens:** Phase 2 shows matches played and won, read from saved matches. The full list of career stats, levels and Elo is Phase 3.

## Phase 3 decisions

- **Everything is derived from match logs; nothing is stored.** `deriveCareers` replays each saved game's log through a fresh rules engine and credits each call to the character and the human in that position. Levels, XP, Elo and achievements are all computed from the result. Adding a stat later applies it to every past game.
- **Who gets credit:**
  - Faults go to the player the referee names.
  - A failed save goes to the defender whose turn it was (Q10), or to the saver if their return went out (Q11).
  - "Cups downed" goes to the hitter whose ball touched the cup.
  - The longest rally goes to all four players.
  - A human playing both positions on a team counts once per game and once per match.
- **Extra stats beyond the spec:**
  - Cup hits.
  - Last-cup saves: saves made while your team had one cup left.
  - Aces: serves the receiver never returned.
  - Good-serve rate.
  - Perfect hits (timing quality of 0.85 or better) and average timing quality.
  - Biggest comeback: the largest cup deficit overcome in a game you won.
  - Favorite style (most-used).
  - Match and game win rates, and save rate.
- **XP:** weights are in `config.progression.xp`: game played 20, game won 15, match won 25, sink 8, cup downed 4, save 5, last-cup save 10, ace 3, perfect hit 1. Level n → n+1 costs 100 × n XP (level 2 at 100 XP, level 3 at 300, level 4 at 600, …).
- **Rewards (cosmetic only):** a data table in `src/progress/rewards.ts`. It holds name colors, badges, sprite items (Big Green cap, gold chain, crown) and sink celebrations (confetti, green flare, fireworks), unlocked at levels 2–20. A character profile lets you equip what's unlocked. Colors live in the theme.
- **Elo:** one human per team, starting at 1000 with K = 32 (`config.progression.elo`). It's recomputed from finished matches in finish order. Matches against a Guest, or with the same human on both sides, aren't rated.
- **Achievements:** a framework only, as the spec asks. An achievement is a rule over career stats plus the attributed event stream. It ships with the spec's two examples ("sink 3 in a row" and "save your last cup") and a `newlyEarned` check. The post-match summary already shows newly earned ones, which is a minimal unlock notification. The full set and the achievements screen come later.
- **Post-match summary:** shows XP gained, level-ups, rewards unlocked, Elo changes and new achievements for this match only (progress with the match compared to progress without it).
- **Theme:** a placeholder basement (concrete slab floor with seams and stains, brick walls, a pool of light over the table) drawn from `theme.basement`. It's meant to be replaced once the Zeta Psi reference photos arrive.

## Visual overhaul and play modes

- **3D-looking view (Canvas 2D, no engine):** the game's 3D coordinates are projected through a perspective camera (`src/render/camera.ts`) onto a low-resolution buffer (`camera.pixelSize` = 3 screen pixels per rendered pixel). The buffer is scaled up with nearest-neighbour sampling, so everything stays pixel art.
  - The room, table, ski and cups are flat-shaded projected polygons.
  - People are pixel sprites standing up as billboards.
  - Names, timing feedback and the HUD are drawn crisp, at full resolution.
- **Camera:** behind and above the team's shoulders, placed by `config.camera`. Your own team is drawn see-through so it never hides the table.
  - People are drawn a little shorter than life (1.45 m) so the table reads.
  - Players are drawn standing off their table corners, a step back from the end (drawing only; play still uses the same spots).
  - The opposing team is drawn before the table, so the table hides them from the waist down and they read as standing behind the far end.
  - Part-built characters have a back view; hand-drawn or uploaded sprites are mirrored.
- **Views (menu → View):**
  - Behind Team A is the default.
  - Split screen gives each team its own camera, in head-to-head only.
  - Classic top-down is the original view.
  - Aim keys follow the screen each human is watching. Behind your team, up/down moves the shot deeper/shorter and left/right moves it across the table. On the far side of a shared screen, the keys move the crosshair the way it looks on screen.
- **Play modes (menu → Players):**
  - **Head-to-head:** one human per team.
  - **Same team vs CPU:** both humans on Team A. WASD + Space plays the left teammate; the arrows + Enter play the right one. A press out of turn is ignored, either human can hit a save, and only the server's human serves.
  - In the draft, the CPU picks for itself: Hard takes the best stat line, Medium one of the better half, Easy anyone. The two humans can have separate profiles. Matches against the CPU are not Elo-rated.
- **CPU opponent:** `src/game/ai.ts`, Easy / Medium / Hard. It drives the game through the same `TeamInput` a keyboard produces:
  - It tosses and serves, and times swings around the apex with a difficulty-based spread (plus an occasional whiff).
  - It slides its crosshair toward a live opponent cup, deeper on harder levels, and mixes in its character's other styles.
  - All rules, stats and timing windows apply to it unchanged.
- **Room:** a generic frat basement, all colors in `theme.room`.
  - Wood-panel walls and a low ceiling with joists, a pipe run, and string lights.
  - A concrete floor with seams and stains.
  - At each end wall: a beat-up couch, the house letters (`theme.houseLetters`, default ΖΨ), a Big Green flag and a paddle rack.
  - Posters on the side walls, and a pool of light over the table.

## Feel update (spin, timing pressure, reach, sinking, misses)

- **Spin from the direction keys:** aim with the crosshair before the ball arrives (or before you toss). Once the timing ring appears, the crosshair freezes, and the direction held at the moment of the hit picks the spin. It's read in the hitter's own view:
  - Toward the opponents = topspin (bounces low and skids on).
  - Back toward yourself = backspin (sits up).
  - Sideways = sidespin that curves and kicks that way.
  - Nothing held = the style's own spin.
  - Amounts are in `hitting.spin` and are scaled by the Spin stat. Serve spin lasts two bounces, so it still kicks on the receiver's side; the serve solver accounts for the first bounce, so serves still land where aimed.
- **Timing pressure:** the hit window shrinks for faster incoming balls (`hitting.windowSpeed`: (2.4 m/s ÷ speed)^0.8, clamped to 0.5–1.15×) and as a rally goes on (`hitting.windowRally`: −3% per hit after the 2nd, down to 55%).
- **Reach:** the window also shrinks with the distance from where the hitter stands to the ball (`hitting.reach`). There's no penalty within 0.75 m, it narrows after that, and past 1.7 m the ball is out of reach ("Out of reach!"). On a save, the teammate nearer the ball takes it, and the Saves stat extends reach on saves (`statEffects.saveReach`).
- **Off the table:** the crosshair can now reach past the table's ends and sides (`aimRangeDepth` 0.75 m, `aimRangeLateral` 0.8 m; serves 0.5 m / 0.42 m). Early swings land short and late ones long, by up to 0.4 m, growing with the square of the error (`timingDepthError`).
- **Sinking:** a rally crosshair within 7 cm of a live opponent cup locks onto it (yellow ring), and the shot is solved to arrive at the cup's mouth, not at table level. A perfectly timed hit sinks any cup, the back row included, which a test checks. Perfect-hit scatter is now 1.8 cm, so landing it still depends on timing and Accuracy.
- **Turn highlight:** the player who's up gets a pulsing double ring, a bouncing arrow, and a yellow tag saying SERVE, HIT or SAVE! along with their name, style and the spin being held. The other players' tags dim.
- **Title screen:** a pixel logo, Match Setup on the left and Play / More on the right, and a key-cap controls legend, all over a live CPU-vs-CPU demo match in the basement.

## Graphics pass (full screen, pixel art)

- **Full screen:** the canvas fills the window, is resized live, and is backed at the device pixel ratio so text stays sharp. The 3D view picks its pixel size so it has about `camera.rows` (250) rendered rows at any resolution, which keeps the pixel art equally chunky. The title and help screens use a 1131×660 design that scales uniformly to fit. The classic top-down view scales the table to fill the screen and keeps room for the players at each end.
- **HUD:** compact pixel panels, so the scene shows between them.
  - Team panels in the top corners (team label, cups left, mini cups, the two names).
  - A status panel top center (it turns yellow on saves and penalties).
  - The last two referee calls bottom center, with a one-line hint and each team's keys in the bottom corners.
- **Characters (part-built, still 16×24):**
  - Form shading, lit from the upper left.
  - Outlines in a dark shade of the neighboring color.
  - Brows, a hair highlight, a belt line and two-tone shoes.
  - A paddle in the right hand: red face from the front, black rubber from behind.
  - Hand-drawn and uploaded sprites are unchanged.
- **Your own team** (seen from behind) is drawn as a see-through dark silhouette with a team-colored rim, instead of a large blurry sprite.
- **Room:**
  - Floor: speckled concrete, with grounding shadows under the table and under each person.
  - Walls: wood planks in three tones, with grooves, a chair rail and baseboards.
  - Ceiling: real 3D joists, pipe runs, and string lights with glows.
  - Decor: a dartboard, posters with simple art, the ΖΨ letters lower on the wall so they clear the HUD, and a mini fridge and trash can in the corners.
  - Lighting: a hanging lamp with a glowing bulb.
- **Table and cups:** the table has plywood grain and knots. Cups are shaded left to right, with a white rim band and two ridges like a party cup. The ball has a highlight pixel.
- **No mechanics changed.**

## Table and cup detail pass

- **Layers:** the 3D view draws in three pixel layers. The room and the people behind the table are on the coarse layer (about 250 rows). The table, cups, ball, crosshair, timing rings and lamp are on a finer layer at `camera.detail` (2×) that resolution, so they get real detail and still read as pixel art. Your own team sits on a coarse layer on top. The vignette is applied over all of them.
- **Table:**
  - The top is a hand-generated pixel texture mapped in perspective (48 strips): six lengthwise plywood boards in slightly different tones, staggered butt joints, wavy grain, knots, faint cup-ring stains and worn edges.
  - Painted lines are real stripes in world units (2 cm border, 1.2 cm center lines), and every top edge has a lit bevel.
  - Shaded legs with stretchers between them.
  - The ski is a capsule with thickness, a shadow, a white center stripe and a highlight.
- **Cups:**
  - A tapered body in six shading bands, including a specular streak, plus two embossed ridges and a foot ring.
  - A rolled rim in the cup color, and the pale inside wall.
  - The water surface sits at its real height (lower in a half cup, which shows more inside wall and darker water) with a shine and an edge line. A strip of water always stays in view so half and full cups read at a glance.
  - Each cup casts a shadow away from the lamp.
- **Ball:** a shaded sphere with an outline and a highlight; the spin streak scales with the ball.
- **No mechanics changed.**
