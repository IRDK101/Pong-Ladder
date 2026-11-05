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

## Polish pass: aiming, flow and consistency

- **Faults:** after any fault the ball goes straight back to the server's hand, with no dead-ball pause. Only a sink or a failed save keeps a short pause (0.8 s) so the moment reads. The referee call still shows in the bottom bar.
- **Serves and own cups:** a serve passes over the server's own cups. The rules already ignored them [4.6], and now the physics does too, so a serve can't clip them.
- **Ball always in view:**
  - The camera sits a little further back and higher (2.2 m back, 1.9 m up, 50° field of view, tilted up) so high lobs stay on screen.
  - The bottom bar is slimmer, so the ball in the server's hand isn't covered.
  - If the ball still leaves the view, an arrow at the screen edge shows where it is.
- **One pixel grid:** the separate fine layer is gone (`camera.detail` 1, about 400 rows). The room, table, cups and people now share one pixel size. People are drawn from a 4× Scale2x copy of their sprite, so close-up figures have clean edges. Your own team is shown as their real back-view sprites, slightly see-through and set wider at the table corners.
- **Aim UI:**
  - A marker on the table: a ring with four ticks and a center dot, outlined dark so it reads on the wood, in a light team color.
  - A dotted path previews the shot without spin or scatter. A serve's path includes its bounce on your own side.
  - When the marker locks onto a cup, the cup gets a yellow ring and a marker above it.
  - When the timing rings appear, the marker fills in and its ticks close up to show it's locked.
  - The marker turns red with an X when the aim is off the table.
  - Only human teams' aim is shown. In split screen, each half shows only its own team's aim.
- **Timing cue:** a fixed white ring around the ball, with a colored ring closing in on it. Yellow means early, green the sweet spot, red late.
- **Labels:** one consistent pill style. Whoever is up gets a single yellow tag such as "HIT · name", with spin or a non-default style shown under it. The old floating chip and big arrow are gone.

## Aim and pace update

- **No shot preview and no cup snapping.** The dotted path and the cup lock (ring and marker on the targeted cup) are removed, so sinking cups is up to the player's read.
  - The crosshair moves freely.
  - The shot drops in at rim height only when the crosshair sits over a live cup's mouth (within the cup radius). Anywhere else it aims at the table.
  - `hitting.cupLock` is gone.
- **Locked-in flash:** once the timing rings are up, the aim is locked and the marker flashes white and the team color about 8 times a second.
- **Livelier physics, still forgiving:**
  - Game speed: `timeScale` 0.62 (was 0.55). The menu offers Normal 0.62, Quick 0.78 and Relaxed 0.46.
  - Bouncier table: `restitution` 0.88.
  - Stronger spin: `topspinKick` 0.26, `sideCurve` 2.0, `sideKick` 0.55, chosen spin {top 0.9, back 0.8, side 0.85}.
  - The base timing window is wider to keep it easy to learn: 0.24 s.
  - **Rallies build pace (`rallyPace`):** after 2 hits, each return flies 3.5% lower (and so faster), down to 72% of the style's peak. The peak never drops below 1.15 × shoulder height because of this, so pace alone never causes a low hit.
- **Measured** over 6 medium-vs-medium CPU games, compared with before this update: the ball moves about 19% faster, there are more cup hits from lively bounces, and sinks fall from about 15.5 to 12.3 per game without snapping.

## Basement look from reference photos

The 3D view now follows the photos of the real Zeta Psi basement. Visuals only; no mechanics changed.

- **Floor:** rust-red stained concrete with darker and worn patches, specks, and soft light washes under the tubes.
- **Ceiling:** sooty black with stains and fluorescent tube fixtures. The hanging lamp is gone, and the light pool on the table is a cooler white. The ceiling is lower (2.05 m above the table). The camera tilts up a little (`lookHeight` 0.4, `fovY` 52) to show the top of the room.
- **Walls:**
  - Dark stained wood with raised panels and scratched-in names.
  - A bench ledge along the long walls.
  - A black painted header band with hand-lettered slogans: "BIG BRIGGS", "THE CLASS OF 1962 ROOM", "On the Seventh Cup, He Rested.", "TYRANNOSAURUS REX ON A BOAT", "Brothers should be nicer to other brothers" and "STEP YOUR LEVEL UP".
- **Pillars:** two, beside the middle of the table. Wood below, black above, with a painted slogan on each end-facing side ("SWEAT SAVES BLOOD", "IF I DIE, I DIE.", "GET GOOFY NOW!", "MY MOM SAYS WE'RE A-SIDE"). Painted faces are drawn only when they face the camera.
- **End walls:** each camera sees the opposite end.
  - Behind Team B: the 74 sign, gold ΖΨ, LEFT TURN YIELD ON GREEN, a faded STOP sign, "ITS KCAO A WORLD", tombstones on the bench, and a caution sign.
  - Behind Team A: the bar with KCAO painted on it, "Now Serving Frankenstein Family Ale", a white fridge and a JOHNSON CONTROLS sign.
- **Table:**
  - A painted blue top with a big red, green and gold figure, gold ΖΨ and '16X letters (each team reads the far half), and a chipped cream border. Faint chalk center lines stay because the quarters matter for serves.
  - It sits on a gray trash can, not legs.
  - A real ski lies across the middle with black bands, lettering and a binding, overhanging both sides with an upturned tip. The overhang is visual only: `ski.length` still sets the collision area when ski collision is on.
- **Cups:** clear plastic with water. The water level shows through the side, low in a half cup. There are no team colors on the table cups; the HUD keeps them.
- **Paddles:** homemade wooden ones in the sprites.

## The whole basement, and choosing a table

The second set of reference photos showed the full basement, so the 3D view now draws the whole room around whichever table is being played. Visuals only: every table plays by the same rules and has the same dimensions.

- **Layout (`src/render/basement.ts`, pure data):** a 15 × 11 m room in "basement meters".
  - Three playable tables, each with a position and a facing:
    - **Saints table**: the painted blue figure table in the middle.
    - **Night sky table**: the black table by the bathroom and the exit, set crosswise.
    - **Chain table**: fire and ice with a chain down the middle, by the KCAO bar.
  - `basementToWorld(cfg, venue)` maps the room into the game's world frame for the table in play, so the rules, physics and cameras don't change.
- **Pillars and beams:** eight pillars and four black ceiling beams carry the slogans from the photos, including "Act or be acted upon.", the pizza proverb, "Love loves to love love.", "ROAD HARD AND PUT AWAY WAY ♥", "On the Seventh Cup, He Rested." and "THE CLASS OF 1962 ROOM". Tests check that no beam hangs between a table's camera and the far end of its table, that no pillar stands on a table or where its players stand, and that every camera is inside the room.
- **Walls:**
  - South: the bar with KCAO and HELENIAS, "Now Serving Frankenstein Family Ale", the fridge and a red-orange corner.
  - North: the stage end ("STEP YOUR LEVELS UP", the Supreme Court line, the 74, ΖΨ, JOHNSON CONTROLS, ITS KCAO A WORLD and LED lights), LEFT TURN YIELD ON GREEN, tombstones on the bench, QUARTER MILE RD, the KEEP SHUT windows, a caution sign, and 8 and CLAY DG.
  - West: "Conquer evil with swift & terrible justice…", the exit and bathroom doors, and a chair.
  - East: "DON'T BREAK THE CHAIN", ONE WAY and JAFE.
- **Stage:** a raised black platform in the north-east corner with speakers, a cup stack, a green jug and the Monopoly table.
- **Rendering:**
  - `src/render/basement3d.ts` draws the room.
  - `src/render/prims.ts` now holds the drawing primitives.
  - The other tables are drawn as scenery, with cups and their own skis.
  - Room objects are depth-sorted. The beams are drawn last, because they only ever sit above what is behind them.
  - Long writing on walls is drawn in perspective strips, so it doesn't smear when seen close up at an angle.
- **Menu:** a new "Table" row (`cfg.venue`). The CPU demo behind the title screen plays at the chosen table, and the top-down view uses that table's color.
- **Left out:** profane graffiti from the photos, and characters from the night sky table's real fan art. The spirits on that table are generic.

### Layout corrected: the tables stand in one row

Side-angle photos showed the real arrangement, and the layout now follows it.

- **The row:** the three tables stand in a single row down the room (x), each with its long axis across the room (y) and players at the ends:
  - bar end wall;
  - **Chain table**;
  - first pillar pair and beam;
  - **Saints table**, in the middle;
  - second pillar pair and beam;
  - **Night sky table**;
  - the wall with the bathroom and exit doors.
- **What each end sees:** one end of every table faces the long bench wall (tombstones, LEFT TURN YIELD ON GREEN, the KEEP SHUT windows, QUARTER MILE RD, 8 / CLAY DG, ONE WAY). The other end faces the stage side (stage, Monopoly table, speakers, JOHNSON CONTROLS, 74, ΖΨ, STOP sign). So the neighboring tables show to either side of every view.
- **Slogans by face:** placed as in the photos.
  - First pair: "GLIZZ" and "SWEAT SAVES BLOOD" toward the bar; "IF I DIE, I DIE." and "EAT ME! / PASSIVE INCOME '24" toward the saints table.
  - Second pair: "YOU CAN'T SPELL / KOWABUNGA '26" and "GET GOOFY NOW!" toward the saints table; "ART THOU FEELING IT NOW?" and "'16 TAILS" toward the night sky table.
  - "LOCO FOR MOLOKO" is a pillar against the door wall, between the bathroom and the exit.
  - Beams: "Act or be acted upon." with the pizza proverb, and "On the Seventh Cup, He Rested." with TYRANNOSAURUS REX ON A BOAT, over the first pair; BIG BRIGGS, THE CLASS OF 1962 ROOM and RONA RUINED MY DAY, with "IT'S FOR THE KIDS" and "Draw without an eraser." on the back, over the second pair.
- **Bar:** across the bar end, in line with the row. The arch over it reads "Now Serving Frankenstein Family Ale", with two fridges behind the counter and red corners on either side.
- **Tests:** a test checks the row order and that a pillar pair stands between each pair of neighboring tables.

## Visual consistency pass

A visual-only pass: no features or gameplay changed.

- **One UI palette, black and gold** (after the basement's painted header bands), used everywhere:
  - title menu, How to play, end-of-game panels, HUD bars, and all HTML screens (characters, editor, players, draft, lineups, backup);
  - black translucent panels with a dim-gold 1 px edge (`colors.uiEdge`) and gold accents and headings (`colors.gold`);
  - primary buttons are gold, not green;
  - team red and blue stay for team-specific things;
  - green and red still mean good and bad timing.
- **Title screen:**
  - "PONG" is gold, and the stray square next to it is gone;
  - the subtitle reads "ZETA PSI BASEMENT RULES", because the Greek letters rendered poorly in the monospace font.
- **How to play:**
  - rewritten for the current game: no cup snapping, the marker flashes when locked, the colored ring closes on a white ring, the style keys;
  - laid out in a sized panel, so the "go back" prompt is never cut off.
- **End screens:** use the same panel as the menu, scaled with it.
- **HUD:** darker panels for legibility, and no hint line once the game is over.
- **Wall writing:** skipped when right over the camera or seen almost edge-on, and faded at shallow angles. It used to turn into pixel noise at the edges of the screen.
- **Top-down view:**
  - rust-red concrete floor and dark walls, matching the 3D basement;
  - clear cups with a thin team-colored ring, like the 3D cups;
  - the ski color follows the chosen table.
- **HTML screens:** file inputs and placeholders are styled to match, and page titles get a gold underline.

## 1v1 mode and two serve-rule changes

These rule decisions were confirmed with the user.

- **1v1 (`cfg.teamSize: 1`):** one player per team, who makes every hit.
  - **Serving:** the diagonal-quarter rule stays. The lone server swaps halves after every serve, re-serves and table misses included. The engine flips `server.side` once a serve has been made and the ball is dead again.
  - **Positions:** the player stands in both of the team's positions (the same participant in the left and right roster slots). That keeps the engine, careers and the log format unchanged, and careers already count one human in both slots once.
  - **Where they stand:** at the middle of their end for reach. When serving, they stand at the half they serve from.
  - **Drawing:** each team shows one figure (`Game.shownPlayers()`), and the HUD and labels use the single name.
  - **Menu:** the Players row now offers 2v2 head-to-head, 2v2 same team vs CPU, 1v1 head-to-head and 1v1 vs CPU. In 1v1 vs CPU the human can use either set of keys.
  - **Draft:** one pick each, so it needs only 2 characters. The lineup shows one character per team.
  - **Saved records:** matches store `teamSize` in their rules, so replays and careers reproduce the serve alternation.
- **Table-miss limit:** 2 (was 3). Two serves off the table in one serve sequence cost the serving team half a cup.
- **Serve hits an opponent cup:** the server's team still loses half a cup, but the team whose cup was hit picks which one.
  - The engine has `penalty.chooser`. Table-miss penalties are still chosen by the serving team.
  - The keyboard cursor follows the chooser's keys.
  - Against the CPU, the human can't click to pick for the CPU, and the CPU picks for itself.

## Character system update, and cup hit / sink effects

- **Characters (`core/sprite.ts`):** still 16 × 24 pixels, so hand-drawn and uploaded sprites, and the reward items, keep working. Every category has more options. New options are only appended, so saved characters look the same. New categories:
  - **Body type:** Slim, Average, Broad, plus Stocky (shorter and wider), Heavy (wider legs, softer jaw, rounder middle) and Lanky (long legs).
  - **Face:** face shape (Oval, Round, Square, Long, Pointed chin, Wide jaw); eyes (Dots, Big, Sleepy, Wide-set, Lashes, Squint); mouth (Neutral, Smile, Grin, Smirk, Surprised, Flat); facial hair (None, Stubble, Mustache, Goatee, Full beard, Chin strap, Soul patch).
  - **Hair:** 16 styles (adds Side part, Spiky, Ponytail, Bun, Afro, Mullet, Bob, Swoop, Receding) and 13 colors, including dyed blue, pink and green.
  - **Headwear and hat color:** Cap, Backwards cap, Beanie, Bucket hat, Visor, Bandana.
  - **Clothes:**
    - 11 tops: adds Polo, Flannel, Button-up, Big D sweater, Striped, Open jacket, Vest. White trim turns navy on a white top.
    - 14 top colors.
    - Bottoms: Long, Shorts, Sweats, Rolled cuffs, in 9 colors.
    - 6 shoes, including white sneakers, red high-tops, tan boots and slides.
  - **Extras:** 13, adding Round glasses, Earring, Freckles, Face paint, Wristband, Watch and Neck tattoo.
  - **Back views:** every new hair, hat and top has one. Ponytail, buns, hoods, jersey numbers and cap straps show from behind.
  - **Missing parts:** an older save without the new parts uses option 0 (`normalizeParts`).
- **Editor:**
  - Parts are grouped into Body, Face, Hair, Clothes and Extras, with an "n / total" count on each.
  - Front and back previews, a "Randomize look" button, and skin swatches shown light to dark.
- **Cup hit:**
  - The cup wobbles and white impact streaks burst from its rim.
  - While a save is on, the cup has a pulsing red ring and a "!" over it.
  - The same shows when a serve clips a cup.
- **Sink:**
  - A splash of water drops, rings spreading across the table, and a "SINK!" popping up from the cup.
  - The top-down view has simple versions of both effects.
  - These are cosmetic events in `Game.cupFx`, and they add to any equipped celebration.

## Typing fix, visual parts picker, new title, closer camera, basement touch-ups

- **Typing:** the keyboard handler no longer swallows keys while a text field, text area or select has focus. Before, the game keys (WASD, Q, E, Space, Enter, the arrows, "." and "/") couldn't be typed into a character's name. Escape in a text field now just leaves the field instead of going back to the menu.
- **Character editor:**
  - The Look section is full width, with the front and back preview pinned on the left (sticky).
  - On the right, a tab per group: Body, Face, Hair, Clothes, Extras.
  - Every option is a thumbnail of this character wearing it, cropped to the part that changes (head for hair and face, torso for tops, legs for bottoms, feet for shoes). Colors stay swatches.
  - Hair thumbnails are drawn without the hat so each style shows.
  - Re-rendering after a change keeps the scroll position and focus, where it used to jump back to the top.
  - "Who" and stats, and styles and save, sit in two columns below.
- **Title:** "PONG ZIMULATOR", with the Z a gold Greek capital zeta (Ζ) in a serif face. The page title and backup error text were renamed too; the backup file format id is unchanged.
- **Camera:**
  - Closer and a little lower: behind 2.3 m, height 1.7 m, lookHeight 0.5, fovY 46°.
  - The near end of the table is ~17% wider on screen (429 px vs 366 at 1440 × 810).
  - The ball goes off screen in 1.4% of live play (was 1.2%); the edge arrow covers that.
  - The far walls' header band is now in view below the HUD.
- **Basement:**
  - The bench runs the full length of the bench wall (and round the corner), plus along the stage wall up to the stage.
  - Header writing sits on the lower part of the black band, where the table cameras see it.
  - "Brothers should be nicer to other brothers" sits between the beams behind the saints table.
  - "THE CLASS OF 1962 ROOM" moved from a beam (only ever seen edge-on from the table ends) to the stage wall's header behind the saints table.
  - "STEP YOUR LEVELS UP" sits over the Supreme Court line, behind the night sky table, as in the photo.

## Last half cup safe from penalties; top-down view and penalty toggle removed; menu restyle

- **New rule:** a penalty (table misses, or a serve hitting a cup) never takes a team's last half cup. When the penalized team is down to one half cup, the penalty is waived: a `penaltyWaived` call, no choice step, and the miss counter resets as usual. That cup has to be hit off (or sunk) by the opponents. A last *full* cup can still be halved by a penalty.
- **Removed:**
  - The "Classic top-down" view: the option, the `view: 'topDown'` value, and the 2D table renderer. `render/renderer.ts` now only holds the screen size.
  - The "Penalty cup: Team chooses / Automatic" menu row. Players always choose. `penaltyCupSelection: 'auto'` stays in the config for tests and the CPU demo.
- **Menu:** built from the in-game HUD's pieces.
  - The selected row is the bright yellow "turn tag", with dark text.
  - Option rows and key caps are HUD panels with 2 px borders and an inner shadow; Play rows have gold borders.
  - Help and end screens use the same panel.
  - The live basement behind the menu is less darkened.
  - The HTML screens' boxes, fields and toggles use the same square 2 px style.

## Basement detail pass from the third set of photos

The overall layout was already right: three tables in a row, all pointing at the bench wall, with the bar on your right when you face it. This pass corrects the details from the new photos. Visuals only.

- **Walls:** the black header is now a soffit box (`SOFFIT`, 0.32 m deep) along every wall top, with the slogans painted on its face. The wall maps push anything above `HEADER_Z` onto it.
- **Bench:** two tiers along the whole bench wall and round the door corner (`BENCH`).
  - A low seat with a particle-board and black front, with XENON '19 carved on it.
  - A shelf above it with cups, a paper towel roll, a jug and the caution sign.
  - Tombstones stand on the seat: D. CAMPOS behind the saints table, the RIP group by the second pillars.
  - The stage-wall bench is gone; that wall has none.
- **Pillars:** each has a molded cap on its wood, round light fittings on tan patches, names carved into the wood, and slogans on the faces where the photos show them.
  - First pair, stage side: "Glizz" facing the bar, "If I die, I die." facing the saints table.
  - First pair, bench side: "Sweat Saves Blood" facing the stage side, an "EAT ME!" plate facing the saints table.
  - Second pair, stage side: "You can't spell / KOWABUNGA '26" facing the bar, "MY MOM SAYS WE'RE A-SIDE" facing the stage side.
  - Second pair, bench side: "GET GOOFY NOW!" facing the bar, "'16 TAILS" facing the stage side.
  - LOCO FOR MOLOKO is a narrow corner pillar by the bathroom.
- **Beams:** wider.
  - First beam, bar side: "Act or be acted upon.", the pizza proverb, "Be Better". Door side: "same as it ever was...", "On the Seventh Cup, He Rested.", TYRANNOSAURUS REX ON A BOAT.
  - Second beam, bar side: BIG BRIGGS, THE CLASS OF 1962 ROOM (back on the beam, where the photos show it, and readable from the saints table), RONA RUINED MY DAY. Door side: STINKY BOY, IT'S FOR THE KIDS.
- **Lights:** pairs of tube fixtures over each table, running along it.
- **Bar wall:** an orange bench-side corner with the FARGO '23 door, KCAO, "ZETA PSI. YOU DO YOU.", Bird and BOO!. Then the counter opening under the Frankenstein arch, WE'LL OBSERVE, and the Class of 1981 plaque.
- **Stage wall:**
  - Bar end: red walls and soffit with DON'T BREAK THE CHAIN, the EXIT stairs, a gray trash can, and a door with an orange arrow.
  - The stage beside the saints table, under the LED lights on a 2x4: STEP YOUR LEVELS UP, WHY ARE WE WAITING?!, the Supreme Court line, DAVID '25 ♥ ALYSSA, the 74, ΖΨ, a Maine plate, ITS KCAO A WORLD, a project-manager sign, DUCHESS WAS HERE, a faded STOP sign, and the Monopoly table with cups.
  - Door end: the creed on the soffit, SHUDDUP CHIP, "He's not a herb...", MOXXI DEXTER, a chair and the restroom door.
- **Bench wall:**
  - Behind the chain table: SCRAPPY, "Love loves to love love.", "Do you wanna hear a secret?", ONE WAY, JAFE, ROBICHEAUX / PUCK.
  - Behind the saints table: "Brothers should be nicer to other brothers", BM, LEFT TURN YIELD ON GREEN, the Diabetes Dash poster, TURK '18.
  - Behind the night sky table: the windows, BROFESSOR '21, QUARTER MILE RD.
- **Door wall:** the rest of the creed, a red-framed door, WHILE SHOWERING SHRED, and 8 CLAY DG over the bench corner.
- **Left out:** profanity, and the real "DICK JERK" name sign, which became a plain project-manager sign.

## Shared character collection

- Every character in the collection plays. Drafts pick from it. Quick matches and the title-screen demo use random, different characters from it, and generic players fill a spot only when there aren't enough characters.
- When the game runs as the published page, the characters live in a shared database, one document per character at `characters/<id>`.
  - Everyone who opens the game reads it.
  - Only the owner and editors write to it. Saves and deletes in the character screen go through to it.
  - When the owner opens the page, any characters saved only in their browser are uploaded.
- Viewers who can't write still get every shared character. Anything they make stays in their own browser.
- If both the shared collection and the browser have a copy of a character, the more recently updated copy wins.
- Without a database (a local file, or signed out), characters stay in the browser as before.

## Collection, player levels, loot boxes and approvals

Decided with the owner (asked first):
- **Player:** the signed-in claude.ai account. Progress is kept online at `data/users/<uid>/progress`, private to each player. Offline, or signed out, it stays in this browser.
- **XP:**
  - Each player earns character XP separately, so the same character can be at different levels for different players.
  - Player XP is the sum of all of that player's character XP. Player levels use `progression.playerLevelStep` (150).
  - Cosmetics (name colors, badges, sprite items, celebrations) are equipped per player, and character levels unlock them as before.
- **Your side:** on a shared keyboard, the "Your side" menu row picks which team's XP goes to the signed-in account, and both teams draft from that player's unlocks. Against the CPU it is always Team A.
- **Loot boxes:**
  - One box per player level past 1. A box unlocks a random table or approved character the player doesn't have, so there are no duplicates.
  - When there's nothing left to unlock, boxes are kept until something new is added.
- **Starting set:** the Saints table plus 4 random characters. The starting characters are topped up to 4 whenever the collection grows.
- **Locked items:** only the CPU and the title-screen demo use locked characters. In the Collection they show as silhouettes, and locked tables are skipped in the menu.
- **Approvals:**
  - Other players make characters in their own browser and can play them right away.
  - "Submit for approval" writes the character to `submissions/<uid>`. Only the owner can read those, under Collection → Submissions.
  - Approving copies the character to `characters/<id>` with `creator`. It joins everyone's loot pool, and its creator always has it.
  - The owner can turn a submission down, with an optional note the player sees.
- **Owner's characters:** the owner's own characters go into the pool too, so the owner unlocks them like everyone else.
- **Access rules:**
  - `characters`: everyone reads, only the owner writes.
  - `submissions`: only the owner reads and writes.
  - `submissions/{self}`: each player (Contributor and up) writes their own.

## Table designs

- The table being played on now has its own design (`cfg.design`, painted in render/designs.ts), separate from where it stands (`cfg.venue`, the menu's Spot row). The other tables in the room keep their own designs.
- There are 12 designs: the plain dark wood table (everyone's default), the three original tables, and 8 from the owner's photos:
  - Get Goofy
  - Gummy (26X)
  - Pitch
  - Larks
  - Art deco
  - Retro logo
  - Scribble
  - Pop-art cans
- Every design except the plain one is unlocked from loot boxes. Players who already had the Saints table keep it.
- Left out:
  - The cartoon characters on the orange table: the paint is kept and the figures are left off.
  - The beer brand's name on the cans: the wordmark is drawn as plain slanted bars.
  - The players' names signed on the gummy table.

## Home-screen pickers

- **Table row:** Enter or a click opens a grid of every table design, with locked ones greyed out. Left and right still flip through the unlocked tables.
- **Playing as row** (this replaces the old Your side row):
  - It opens a character picker with one spot per position on the player's side (1 in 1v1, 2 in 2v2), plus Random.
  - Quick matches put those characters on the player's side. Picks that are missing or locked count as Random.
  - In head-to-head, the same screen picks the player's team, which earns their XP.
  - With more than 8 characters, a search box appears.
- **Saving:** the picks are saved in this browser (`dartmouth-pong/selection/v1`).
- **Keyboard:** when focus is on an HTML screen, the game no longer swallows Enter, Space or the arrow keys, so buttons and grids work from the keyboard.

## More character options; the owner always has their own characters

- Every part's option list grew, and new options were only added at the end, so saved characters keep their look. Every category now has at least 8 options.
  - Body type: Athletic, Petite, Tall
  - Skin: 6 more tones
  - Face: Heart, Diamond, Narrow
  - Eyes: Angry, Wink, Closed, Tired, Blue, Green
  - Mouth: Laugh, Tongue out, Frown, Gap tooth, Whistle
  - Facial hair: Handlebar, Mutton chops, Long beard, Pencil mustache
  - Hair: Shaggy, Pigtails, Undercut, Dreads, Top knot, Flat top, Bowl cut, Braids, plus 7 colors
  - Headwear: Cowboy hat, Top hat, Headphones, Beret, Hard hat, Party hat, plus 6 hat colors
  - Tops: Hawaiian, Suit and tie, Pinstripes, Turtleneck, Varsity jacket, Raglan, Overalls, Letters tee (ΖΨ), plus 8 colors
  - Bottoms: Cargo, Ripped, Skirt, Track pants, plus 6 colors
  - Shoes: Blue sneakers, Pink sneakers, Gold high-tops, Socks and sandals, Barefoot
  - Extras: Eye patch, Bandage, Blush, Nose ring, Bow tie, Scarf, Lei, Backpack
- A test checks that every option draws something different, from the front or the back.
- Whoever made a character always has it. That includes the owner, who has every character with no `creator`. The owner's loot boxes therefore only hold tables and characters other players made.

## Title screen, redone

- **Left column, MATCH:** Mode, CPU level (dimmed in head-to-head), Playing as (with portraits of the picked characters), Table (with a preview of its painted top), and Spot.
- **Left column, HOUSE RULES:** a two-column grid of Cups, Match, Speed, Ski collision, and View (dimmed against the CPU).
- **Right column:**
  - The Collection card: player level, XP bar and a loot crate. When boxes are waiting, it shows "LEVEL UP! N loot boxes to open" with a pulsing count, and for the owner, how many submissions are waiting for review.
  - PLAY: Quick match (the cursor starts here) and Draft match.
  - MORE: Characters, Players, How to play, Back up / restore.
- **Arrow keys:** up and down move by position within a column, wrapping. Left and right change an option, or hop to the other column from an action row.
- **New rewards:** character cosmetics unlocked since the player last opened that character's profile are counted (`progress.seen`, seeded so that rewards already unlocked aren't flagged).
  - The menu's Characters row shows the total.
  - That character's Profile button is highlighted.
  - Opening the profile clears its count.
- **Saved table pick:** it is restored even while it reads as locked, because online unlocks arrive after the menu loads.

## QOL and bug pass

- **Fixed: XP from a match's last game.** The account was updated before the match result was recorded, so it missed game, win and match XP (the end screen showed +13 where the summary showed +63). The deciding game now records the match winner first.
- **Fixed: backup download.** It goes through the viewer's save prompt (the `downloads` capability), and falls back to a plain download outside claude.ai.
- **How to play** is now an HTML screen, scrollable and readable at any size (it used to be drawn on the canvas).
- **Portrait title screen (phones):** one column, in the order progress card, Play, Match, House rules, More. The panels are fitted around their rows in both layouts.
- **HUD on narrow screens:** the team panels shrink and their cup dots tighten, the status pill drops below them, and all HUD text is clamped to its panel.
- **Rendering:** the three low-resolution scene layers are flattened before the single upscale to the screen.
- **Checked:** every screen opens at 1280×720 and 390×760 with no console errors, and a full game plays through the end screens and the summary.

## Profiles and the moderator

- **Account:** a profile is the player's claude.ai account, which is their email login. The page can't read email addresses (only the `profile` scope is available), so the profile screen shows the account name and says progress is saved to the account.
- **Saved with the account, private to each player** (under `data/users/<uid>/`):
  - `progress`: level, XP, unlocks, boxes, character levels and cosmetics, the "seen" rewards, and the home-screen picks (`selection`).
  - `characters`: `{items, deleted}`, the characters the player made. Merges keep the newest copy, and tombstones carry deletions to other devices. On the account's first answer, anything missing online is uploaded.
- **Roles:** moderator (the owner), player (signed in) or guest (offline or signed out, browser only).
- **Your profile / Moderator profile** (menu → More): role badge, account name, level, tiles (boxes, tables, characters unlocked, characters made, submissions, new rewards), and what's saved where.
- **Moderator tools** (owner only; Collection's Submissions tab moved here):
  - Review: approve, *edit then approve*, or turn down with a note.
  - Collection: edit or remove any character, with who made it.
  - What you can do: the moderator's and players' powers.
- **Local players** (the old "Players" row) are only names for a shared keyboard.
- **Fixed: shared characters copied into players' storage.** `Collection.save` and `remove` read the merged list, so every save copied the shared collection into the player's browser storage. They now use only the store's own records, and copies that already leaked are dropped for non-owners when the collection loads.

## The moderator has everything

- The owner's account counts every table and character as unlocked. It gets no loot boxes and no starter top-up, and the menu card and the Collection say so.
- Every other account starts with the plain table and 4 random characters from the collection (not their own creations, which they always have), and unlocks the rest from loot boxes.
- Players who started before the plain table became the default keep the Saints table they were given.

## Profiles that need approval, the leaderboard, online 1v1

Decided with the owner: keep the public link (so view-only visitors play as guests), and make online mode 1v1 with one player per device.

- **Anyone can play every offline mode straight away.** XP, levels, loot boxes, the leaderboard and character submissions need an approved profile (or the moderator account).
  - The game checks `user.can('data.write')`. A `false` answer (view-only access, such as a public link from outside the organization) means a guest: nothing is saved online.
  - Roles: moderator, player (approved), pending, unregistered (signed in, no profile), viewonly, guest.
- **Profiles:**
  - A player asks to join with a display name (up to 20 characters, unique), written to `profiles/<uid>` as `{name, xp, level, requestedAt, updatedAt}`. Everyone can read it; the player writes their own; the owner can write any (for renames).
  - The moderator's decision goes to `approvals/<uid>` as `{status: approved|rejected|revoked, note, at}`. Everyone can read it; only the owner writes it, so nobody can approve themselves.
  - The moderator's own profile is created and approved automatically.
  - Approved players publish their total XP and level to their card when they change.
- **Moderator tools → Profiles:** approve, turn down with a note, pause (stops XP), or rename.
- **Leaderboard** (menu → More): approved profiles by total XP, live, with medals for the top 3, MOD on the moderator, and "you" highlighted. The menu row shows your rank.
- **Online match** (menu → Play) uses the page's live `room`, with no server:
  - A presence card in the lobby (name, level, packed character, status), plus `invite` and `answer` fields addressed by `peer`. Everything is presence; there are no event topics.
  - The match runs in a named room `pz-<id>`. The challenger hosts as Team A and runs the real game, sending `Game.netState()` in presence about 15 times a second (well under the 4 KB limit; a test checks this).
  - The guest (Team B) mirrors the state with `applyNet` and runs physics between updates (`netTick`). It steers its own crosshair locally and sends its keys, crosshair and a numbered list of recent hits (with the timing quality and offset seen on its own screen, which the host uses, so lag doesn't make hits late) and penalty-cup steps.
  - Settings are the challenger's menu settings: 1v1, single game. The guest sees the table from Team B's end (the `behindB` layout), and each device shows only its own crosshair.
  - XP: the host records the game. The guest's XP is `matchXp(record, 'B')` from the host's `final` presence field, given only if the guest may progress.
  - If either player leaves, the other returns to the menu.
- **Platform limit:** visitors from a public link outside the organization can't connect to the room or save data. They see an explanation and play offline as guests.

## Edit profile: name, character, name style

- **Edit profile** (from Your profile or the Leaderboard) changes how a player appears in three places: the leaderboard, their home screen (the Collection card shows the styled name and level) and the online lobby. It has a live preview of all three.
- **Username:** approved players can now rename themselves. It applies straight away, with the same rules (up to 20 characters, unique). The card keeps `renamedFrom` (the name before the player's own renames), and Moderator tools → Profiles shows it; a moderator rename clears it. Paused profiles can't be changed.
- **Playing as:** the character a player plays as is their first Playing as spot (`selection.chars[0]`), so the editor and the home-screen picker are the same setting. The profile card carries a packed copy (`char`) so everyone can draw it on the leaderboard; it follows the pick automatically. Online matches use it first.
- **Name style** (`src/progress/nameStyles.ts`): a color (solid or gradient), an effect (shadow, spaced caps, outline, glow, slanted, animated shine and pulse) and a flair icon. Each option unlocks at a player level; the moderator has all. Options are only appended, and unknown ids fall back to the defaults. The style is saved on the profile card (`style`) and in the lobby card. `Account.setNameStyle` refuses options above the player's level.
- Drawn by `styledName` (HTML) and `drawStyledName` (canvas) in `src/ui/nameStyle.ts`. Animations stop under reduced motion.
- **Fixed: progress could be overwritten on a new device.** If the character list loaded before the account's saved progress, the starter top-up saved an empty progress over it. Progress is now never written to the account until the saved copy has been read (a test checks the ordering).

## One of each table, no local players

- **Background tables:** the room's three spots each have their own table (bar: Chain, middle: Saints, doors: Night sky). If the table being played on is one of those, the background table at its usual spot swaps to the table the play spot normally has (`backgroundDesign`), so no table is ever on screen twice. A test checks every spot and design.
- **Local players removed:** the shared-keyboard "Local players" screen and the draft's "Who is playing?" step are gone; signed-in profiles replace them. Draft match goes straight to the coin flip. Old match records keep their (now unused) profile ids; backups still carry any saved local players so nothing is lost.

## Only the moderator edits collection characters

Decided with the owner: players keep making and submitting their own characters, and keep their earned cosmetics.

- A character in the shared collection can only be edited by the moderator. Players (and guests) get no Edit button for it, and the editor refuses to open or save it. That includes a player's own character once it's approved.
- For everyone but the moderator, a shared character always reads exactly as the moderator saved it: `CharacterCollection.sharedWins` ignores any local copy with the same id (an old local edit or a restored backup), however new. In the moderator's browser the newest copy still wins, so their edits upload as before.
- The only per-player differences are the level-up cosmetics a player has earned and equipped (name color, badges, sprite item, sink celebration).

## Signing in, profile requests, and who can save

- **Platform rule:** claude.ai lets a visitor save data and join live play only when they're the owner, a member of the owner's organization, or an outside person invited by email as an Editor while the game has no public link. A signed-in visitor who opens the public link from outside the organization gets no account id and can only read, so they can't make a profile or play online. Inviting outsiders as Contributor doesn't help: they still only read. This can't be worked around from the page.
- Such a visitor (database available, but no id or no write access) is now **view-only** with a clear explanation, instead of being told to sign in when they already are.
- A profile request shows **Sending…** until the server accepts the write, then **Sent to the moderator**. If claude.ai refuses it, the request is dropped, the player switches to view-only, and the screen says it wasn't sent. Accepted requests appear in Moderator tools → Profiles and on the moderator's menu badge.
- The moderator's profile screen has a **Letting friends in** note with these steps, including that Editors can also publish page versions.

## Online play, reworked against the room's real limits

- **Matches run in the lobby room.** Named rooms (`join`) may not be offered to every viewer and a join can time out, which left matches stuck. Both pages are already in the lobby room, so the match now travels there too: each page adds `mid` (the match id) and `net`, `inp` or `final` to its own lobby presence, and reads only its opponent's fields with the same `mid`. Leaving clears them. An opponent who leaves, goes back to the lobby or never arrives within 20 s ends the match with a message.
- **Presence bounds are checked before sending** (`presenceIssue`): plain-identifier keys, at most 64 keys or array entries, 8 levels, 1 KiB per string with no control or invisible characters, finite numbers, 4 KiB merged. A refused card or room error now shows in the lobby instead of failing silently. Tests check a whole match's host presence and lobby cards (including a real collection character) against them.
- The host's card drops its character while it plays, leaving room for the game state (about 3.2 KB at most). The final XP travels as `[id, xp]` pairs, since a character id isn't guaranteed to be a valid key.
- The lobby redraws only when the lobby itself changes, not on every match update, so buttons aren't replaced mid-click.
- **Online play needs an approved profile** (or the moderator). Everyone else sees why and what to do next.
- Who can connect at all is claude.ai's rule: members of the owner's organization and people invited by email (as Editors, with no public link, for outsiders). Public-link visitors from outside can't join the room.

## Self-hosted site (GitHub Pages + Firebase)

Decided with the owner: run the game on its own site, so any approved profile gets XP, unlocks, the leaderboard and online play without claude.ai invites, and only the owner can change the site. Setup steps are in SELF_HOSTING.md.

- **One codebase, two hosts.** A build with `VITE_FIREBASE_CONFIG` loads `src/net/firebaseHost.ts` (a separate chunk) and installs `window.claude.use(name)` services backed by Firebase: `db`, `user`, `room` and an extra `signin`. Everything else (Account, the lobby, matches) runs unchanged. Without the config, as on claude.ai, the chunk is never loaded.
- **Sign-in:** Google, or an emailed sign-in link. The `signedout` role offers both on the profile screen, and signed-in players get a Sign out button.
- **Storage:** Realtime Database. Each document is `{ j: <JSON text>, s?: <status>, by }`. JSON text keeps arrays, empty lists and nulls exact, and `s` lets the rules read an approval. `update` is a transaction with a deep merge.
- **Moderator:** decided by the rules (a verified email set when generating them). The client learns it by trying to read `modcheck`, which only the moderator can, so the email never ships in the site's code.
- **Rules** (`database.rules.template.json`, generated with `npm run rules -- email`, checked by `scripts/rules-check.mjs` against the emulators, 30 checks):
  - Only the moderator writes characters and approvals and reads all submissions.
  - Players write only their own profile, submissions and `data/users/<uid>`.
  - Only approved players (and the moderator) read or write the lobby and match rooms, each writing only their own card, at most 4 KiB.
  - Everything else is closed.
- **Live rooms:** `rooms/lobby/<peer>` and `rooms/m/<match>/<peer>` hold `{ by, p: <presence JSON>, t }`, removed on disconnect. The shim gives the claude.ai room's presence semantics (peers, onPeers with joined/left/updated, connected). On this host each match joins its own room (`matchRooms`), so the lobby stays light and only the two players download a match. On claude.ai matches keep sharing the lobby room.
- **Deploy:** `.github/workflows/pages.yml` tests, builds with `--base ./`, and publishes to GitHub Pages, taking the Firebase config from the `FIREBASE_CONFIG` repository variable.
- **Moving over:** on the moderator's account a backup now includes the whole shared collection, so importing it on the new site as the moderator uploads every character.

## Online play: lobby from anywhere, who's online, rematch

- Approved players join the lobby when the game loads, not just on the Online screen, and stay in it in the menus. A challenge reaches them anywhere: the home screen's Online match row shows "CHALLENGE!", and otherwise "N players online now".
- Leaving the Online screen keeps the player in the lobby. The card returns to "in the lobby" (with their character) when a match ends.
- **Rematch:** on an online end screen, Space/Enter asks the opponent for a rematch with the same settings (the asker hosts). If the opponent already asked, it accepts. If both ask at once, one side accepts automatically. If the opponent has left, the end screen says so and Space/Enter goes to the menu. Esc always goes to the menu.
- Opponents' characters are remembered, since a host's card drops its character while it plays on claude.ai.

## Feel: aim lock, speed levels, saves, accuracy, hit jolt

- **Aim lock:** once a team's timing rings appear, its crosshair stays locked for the rest of that ball, even after a whiff (which ends the rings while the ball is still coming). Held direction keys only pick spin. It unlocks when the team stops aiming (the ball is hit back or the point ends). The marker keeps flashing while locked (`Game.aimLocked`).
- **Speed levels** (`LEVELS` in `ui/menu.ts`): Relaxed, Normal, Quick, Fast, Pro, Masters. Each sets the game speed (`physics.timeScale`) and a timing-window multiplier (`hitting.windowScale`: 1.1, 1, 1, 0.88, 0.76, 0.64), which applies to every hit, serve and save. The CPU's timing scales with the window, so it keeps pace. Online matches carry the level through the challenger's speed.
- **Saves:** `saveWindowScale` went from 0.55 to 0.48 (about 13% less time on every save).
- **Accuracy vs timing:** the scatter curve is now `(1 − q)^1.5 · (1 + 1.5(1 − q))`, capped at 1.6. Near-perfect timing is almost unchanged, while a q of 0.6 spreads about 1.6 times as far as before.
- **Hit jolt:** when a player strikes the ball (hit or serve), their sprite lunges for about a fifth of a second, in proportion to game speed: a quick dip, a slight squash and a lean toward the ball, then back. Hit times travel to the online guest in the host's state (`hz`).

- **Crosshair, revised:** it moves only while its team is aiming: serving (before the toss), or with the ball coming to it (after the other side's hit, before the timing rings). At every other time it stays exactly where it was: after your own shot, through the other side's turn and during penalty picks. It's then still in that spot for your next serve or return. Once the rings appear it locks for the rest of that ball, even after a whiff. Its setting is relative to the area being aimed at (the serve quarter, or the other side of the table), so the same setting can point at a different spot when switching between serving and returning.
- **Spin balance:** sidespin is stronger (`spin.side` 0.85 to 0.95, `sideCurve` 2.0 to 2.3, `sideKick` 0.55 to 0.65: about 29% more curve in the air and 32% more kick off the bounce). Topspin is a little weaker (`spin.top` 0.9 to 0.85).

## Serve lock fix, and paddle spin vs ball spin

Decided with the owner: the serve cursor locks at the toss, and the clash is realistic and noticeable.

- **Serve lock:** before the toss the server always aims freely. A lock left over from the last point could stay on while the same team kept serving; it's now cleared, and the marker never flashes before the toss. The toss locks it until the serve is struck. A 16,500-frame CPU simulation found no locked frames before a toss.
- **Spin clash** (`spinClash` in `game/shot.ts`): each shot's spin is remembered as it's struck (`Game.incomingSpin`), because the ball's own spin is used up on the bounce before the return.
  - **Push:** spin left unanswered pushes the return: topspin long, backspin short, sidespin the way the ball curved. That's `clash.depthPush` 0.2 m and `sidePush` 0.15 m per unit of spin, about one to one and a half cups for heavy spin.
  - **Softening:** good timing softens it (`timingRelief` 0.35 at perfect), and so does a high Spin stat (divided by the square root of the spin stat effect).
  - **Opposite spin** cancels the push in proportion to how much spin you put on.
  - **Same spin** keeps the push, but carries 30% of the incoming spin into yours (`carry`).
  - **Feedback:** hit feedback adds "countered", "topspin pushed it long", "backspin dropped it short" or "sidespin pulled it wide".
  - **CPU:** counters heavy spin some of the time (`counterRate`: Easy 15%, Medium 45%, Hard 75%).

## Update number, spin callout, jolt on both sides

- **Update number:** small and dim in the home screen's bottom-left corner: `v1.00` plus 0.01 per commit (`git rev-list --count HEAD`, filled in at build time by `vite.config.ts`), so every change moves it on with nothing to update by hand. The Pages workflow checks out the full history so its count matches.
- **Spin callout:** when the incoming ball carries spin, a hit's callout reads "<timing> · <ball spin> + <return spin>", e.g. "Good · Backspin + Topspin", with "No spin" when the return has none. Without incoming spin it's just the return's spin, as before.
- **Hit jolt** checked on all four players: the far team, and the near team seen from behind.

## Home screen clicks and animations, Fast by default, unlock-all switch, depth guide

- **Selector clicks:** clicking a setting used to step forward wherever you clicked. Now the left side of its value (with ◀) steps back and the right side (with ▶) steps forward. On the Table row the arrows flip tables and the rest opens the picker. Each draw records where every value sits (`Menu.valueZones`), and `Menu.click(i, x)` decides.
- **Animations** (all on the canvas, eased per frame):
  - **Highlight:** the gold selection glides between rows, with a soft glow and shine.
  - **Hover:** a hovered row warms up, an accent bar slides in on its left and its text nudges right. The pointer becomes a hand over rows.
  - **Press:** a press (click, tap or Enter) dips the row briefly toward its center and springs back over about 160 ms.
  - **Value change:** a changed value slides in from the side it came from, and the pressed arrow nudges outward.
  - **Rows:** drawn flatter, with a hairline edge and a faint top highlight.
- **Speed:** Fast is the default (the menu's `start`). Every level is 2.3% slower than before, so the steps between them are unchanged: Relaxed 0.45, Normal 0.606, Quick 0.762, Fast 0.86, Pro 0.958, Masters 1.055. Window sizes are unchanged. The base config keeps the Normal speed for tests; players always get the menu's level.
- **Unlock all, for now:** `UNLOCK.allForEveryone` in `data/shared.ts` (true) opens every table and character to every player. It's for while profile problems are sorted out; set it to false to go back to levels and loot boxes. XP and levels still count for approved profiles, and the loot boxes they earn wait (none can be opened meanwhile). The Collection card says so. Tests switch it off to keep checking normal unlocking, and test it on its own.
- **Depth for the far-end shot:** in a shared view, the team aiming toward the camera (Team B, in Behind Team A) had its marker drawn under Team A's players in the foreground, right where long shots land, and that end of the table is foreshortened. Now, while the other team aims on a screen, that screen's foreground players fade (from 0.88 to 0.45 opacity). When a marker comes within 0.4 m of the end it's aimed at, for either team, that end's edge lights up in the team color (red once past it), brighter the closer it gets, with a line from the marker to the edge.

## Opponent picks, camera, flashier callouts, better jolt

- **Choosing the CPU team:** against the CPU, the Playing as picker ("Playing as & against") has CPU spots after a VS mark. The CPU can field any character, locked ones included. A character can't be on both teams, so picking it for one side frees it on the other. Picks are saved with the selection (`cpu`, also in the account's progress). Quick matches pin them (`cpuPinnedFor`), and the CPU level row on the home screen shows them as small heads.
- **Camera:** raised and tilted further down the table (`camera`: behind 2.2, height 2.1, lookAt 0.6, lookHeight 0.4, from 2.3, 1.7, 0.55, 0.5). The far half of the table takes about 20% more of the screen, so the far side reads more clearly.
- **End-of-table guide removed** (the lit edge from the last update). The near players still fade while the other team aims.
- **Hit callout:** the timing word pops in with an elastic overshoot, a thick outline, a gradient and a glow, then drifts up and fades over about a second. Perfect is gold and throws sparkles. Good is green. Early and Late are amber. A whiff is red and shakes. The spin pair ("Backspin + Topspin") slides in smaller underneath.
- **Hit animation** (`hitPose`):
  - **Ready:** the active player crouches as their timing rings close in.
  - **Strike:** at contact they snap into a lunge toward the ball, tilting about 6° and stretching tall.
  - **Recover:** a damped spring back that overshoots slightly behind and squashes before settling, all drawn about the feet. It takes about 0.3 game seconds, scaled with the game speed.

## Camera centered, pixel-art callouts above heads, slower levels

- **Camera** (`camera`: behind 2.2, height 2.1, lookAt 0.55, lookHeight 0.15, fovY 44): aimed lower and zoomed in slightly. The table now runs from 40% to 83% of the screen height (it was 49% to 90%), so the space above and below is more even. The far players' heads stay below the top status box.
- **Hit callout, pixel style:** it sits above the hitter's head, and their name tag hides meanwhile. The word is real pixel art (`pixelText`):
  - **Lettering:** small hard-thresholded glyphs with no anti-aliasing, a lighter top and darker bottom, a 1-pixel outline and a drop shadow, scaled up with smoothing off.
  - **Movement:** it pops in steps (small, then past full size, then full size), rises in whole pixels and blinks out.
  - **Effects:** a Perfect throws pixel plus-sparkles, and a whiff shakes.
  - **Spin pair:** drawn smaller underneath in the same style.
- **Speed:** every level about 2.3% slower again (about 4.5% under the original ladder): Relaxed 0.44, Normal 0.592, Quick 0.744, Fast 0.84 (default), Pro 0.936, Masters 1.031.

## Trash cans under the tables, "Players" row

- **Trash cans:** every table rests on two trash cans, one under the middle of each team's half (at a quarter and three quarters of the length), instead of one big can in the center. Each is a ribbed metal can (`trashCan` in `render/prims.ts`): slightly wider at the top, with alternating ribs, two pressed bands, a rolled rim, a darker foot, side handles and a floor shadow. The far can is drawn first. With the current camera the near can on the table being played peeks out under its near edge, so the table visibly stands on something.
- **"Players":** the home screen's "Playing as" row is now "Players", and its picker is titled the same. It picks your characters and, against the CPU, the CPU's. How to Play has a Players entry.
- **Trash cans, fixed:** they're black plastic now (`theme.table.can*`). Their bands, rim line and foot are drawn only on the half facing the camera. As full circles, their back halves showed through the front and made the cans look like bowls.

## Full Players lineup, livelier menus, five speeds, bigger sprites

Decided with the owner: bigger sprites, and Fast stays the default.

- **Players** (`CharacterPicker`): a lineup of every spot at the table, Team A vs Team B, both players of each in 2v2. Each spot is a card with the character's sprite, its role ("You · left · WASD", "CPU · right", "Opponent"...) and name. Pick a spot, then a character. Picking moves on to the next spot, then to the other team.
  - Your team uses your unlocked characters. The CPU can field anyone. Head-to-head, the other team (whoever shares the keyboard) uses the same unlocked ones.
  - "Make this my team" switches which team earns your XP, and every pick stays on its side of the table (`swapTeams` swaps `chars` and `cpu`).
  - `sel.cpu` now means "the other team" in both modes (`otherPinnedFor`, `otherSlots`), and quick matches pin it in head-to-head too.
  - The home screen's Players row shows the whole lineup as heads (Team A, "vs", Team B, with yours underlined) and "You: Team A" or "You vs CPU". The CPU level row no longer shows heads.
- **Menu motion:**
  - **HTML screens:** buttons lift on hover and press in. A screen's contents slide in one after another when it opens (only when a different screen opens, not on every refresh: `Overlay.show` marks the panel `fresh`). Character cards pop in staggered, a newly picked card pulses, and the selected spot has a moving shine and a hop. The VS badge pulses.
  - **Home screen:** on arrival the logo drops in and each panel, then each of its rows, slides in in turn (`Menu.entered`, `enterAmount`), with an accent line drawing across the top of each panel. The selected row's glow breathes, a press sends a ripple out from the row, and a band of light sweeps across the logo every few seconds.
  - Everything respects reduced motion.
- **Five speeds:** Relaxed 0.43, Slow 0.578, Fast 0.821 (default), Extreme 0.914, Masters 1.007. Each is another 2.3% slower, about 6.7% under the original ladder. Window scales are 1.1, 1, 0.88, 0.76, 0.64. Quick is gone, Normal is now Slow and Pro is now Extreme.
- **Bigger sprites:** characters are drawn at 32×48, twice the 16×24 drawing grid, which the pixel editor and sprite items still use (`composeBase`). `composeSprite`:
  1. upscales the flat drawing with EPX, rounding stair-steps into smooth diagonals;
  2. adds detail at the finer size: hair strands and a lit top band, eye whites beside the pupils plus catch-lights, a nose, a chin shadow, a collar line, a trouser seam and knee lights;
  3. shades every shape (a two-pixel shadow right and below, lit left and top) and outlines it in one fine pixel.

  Hand-drawn characters are upscaled the same way. UI sprite scales are in 16-pixel-grid units, so screens keep their sizes, and the 3D view adds one more smoothing pass.

## Far-side perspective, height caps, passive abilities, speeds back to Normal, QOL

- **Far half of the table:** the texture mapping was already exact (each strip is at one depth, so the affine map is right). What made the far half feel off was perspective: a close, wide camera shrank the far half to 58% of the near half's size. The camera now sits further back with a longer lens (`camera`: behind 2.85, height 2.3, lookAt 0.5, lookHeight 0.3, fovY 35). The far half is now 62% of the near half and the far players are bigger, with the same framing. Pulling back further would put Team B's camera outside the room behind the benches (a basement test checks this).
- **Ball height** (non-disruptive): a table bounce can't rise more than `physics.maxBounceApex` (1.3 m), which only hard smashes ever reach. Aimed peaks above `physics.peakSoftCap` (1.3 m) keep only 25% of the excess (`softPeak`), so only the highest lobs are trimmed. Measured over CPU rallies, the median flight (0.39 m) is unchanged and the highest dropped from 2.56 m to under 1.45 m, inside the view. The rest come from contact points after big bounces, which the bounce cap now prevents.
- **Passive abilities** (`core/passives.ts`): every character has `passives` (ids, at most `MAX_PASSIVES` = 2), and the `PASSIVES` catalog is empty for now.
  - An ability has a name, icon and description, flat stat changes, and effect multipliers: hit, serve and save windows, scatter, spin push and peak.
  - They're wired into the game: `statsOf` adds stat changes, `timingWindow` takes window effects through `SwingContext.passives`, and `computeHit` and `computeServe` apply the scatter, spin-push and peak effects.
  - The character editor has a Passive abilities section with two slots, and cards show ability chips.
  - Unknown ids are kept, so an ability removed from the catalog comes back if it's re-added.
- **Speeds, back to Normal:** Normal is the base physics again (timeScale 0.62, window 1) and the default. Around it: Relaxed 0.44 / 1.15, Slow 0.53 / 1.07, Normal 0.62 / 1, Fast 0.72 / 0.92, Extreme 0.84 / 0.8, Masters 0.96 / 0.68.
- **QOL:**
  - **Pause:** Escape in a local match pauses it (Space resumes, R restarts, Esc again quits), and leaving the window pauses too. Online, Escape asks before leaving while the match runs on.
  - **Rematch:** after a local match, R rematches with the same players.
  - **Saved settings:** the home screen's settings are remembered in the browser (`Menu.snapshot` / `restore`).
- **White haze, fixed:** since the camera moved up (2.3 m above the table), it sits above the basement ceiling (2.05 m). The ceiling's tube fixtures and their white glows were drawn from on top, over the whole scene, which washed everything out. When the camera is at or above the ceiling they're left out now. Their light still shows as the glows on the floor, and the beams and the rest of the room are unchanged.
- **Pause card, fixed:** it's an HTML panel with real buttons (Resume, Restart this match, Quit to the menu; online: Keep playing, Leave the match), with Resume focused. A click or Space / Enter always works, and the keys still apply: Esc quits, R restarts. The game now claims the Escape key (`preventDefault`), so the page around it (the artifact viewer) doesn't take keyboard focus away. That used to leave the home screen deaf until you clicked into it again.

## Speed spectrum

Speed is a bar on the home screen instead of a list: 13 notches from Relaxed (far
left) to Masters (far right), with Normal (the realistic base pace) in the middle.
The six named levels keep their exact speeds and timing windows (Relaxed 0, Slow 3,
Normal 6, Fast 8, Extreme 10, Masters 12); the notches between blend their
neighbours evenly, named after the nearer level ("Slow +", "Normal −"). Click or drag
on the bar, or use ◀ ▶; the ends stop instead of wrapping. The row shows the pace
relative to Normal. Saved picks and old saves (named levels) both load.

## Table borders at the far end

At game resolution the far end of a table is squeezed by perspective, and a plain
texture pass (one art pixel per screen pixel) skipped right over the thin painted
frame there and along one side. Table tops are now drawn 3x finer and scaled down
smoothly (`texturedTopFine`, cached per table and camera), and each end's outer
art columns (its frame) are kept at least ~6 pixels thick on screen (`endBand`), so
the far end shows the same border as the near end.

## Version 2.01

**Update tracker.** `src/version.ts` holds `MAJOR` and `UPDATE`; the home screen
shows `v2.01`. Each update adds 1 to `UPDATE` (+0.01), however many commits it
took. (It used to count commits.)

**Smoother online play.**
- Guest: each host update is moved on by the measured network delay (the host
  echoes the guest's send time, so the guest knows the round trip), the drawn
  ball glides over corrections (`Game.drawOffset`), bounces are tracked locally
  so the guest's hit window opens on time, and the guest's own hit is shown at
  once (`predictSwing`) while host updates sent before the host had it are skipped.
- Host: keeps the last 0.6 s of states (`Snap`, including the rules engine's
  checkpoint and log length). A guest hit stamped with the time it was pressed is
  applied at that moment and the game replays forward (`rewindHit`).
- Updates go ~30 times a second while the ball is live, ~10 otherwise.

**Match setup.** After a challenge is accepted, both players go to a setup
screen. The challenger sets table, spot, cups, speed and ski collision; each
player picks a character; the match starts when both press Ready. A Ready holds
a signature of the terms and both characters (`setupSig`), so any change
un-readies both. It travels in the lobby card's `setup` field. Rematches keep
the agreed terms and skip the screen (`invite.re`).

**End screen.** Victory (rays, confetti in the team color, a bouncing pixel
title) or defeat (cold wash, rain, a dropping title), with stats per team: hits,
sinks, cups hit, saves, accuracy (shots that landed on the table), perfect hits,
misses and faults, and the longest rally. They come from replaying the game's
rules log (`src/game/stats.ts`), so they're right after a rewind. The host sends
them to the guest with the XP; a best-of-3 adds its games up.

**Characters.** Faces have no white catch-lights or eye whites. Wide-set eyes
shift half a pixel at full size. Mouths and beards are clipped inside the face.
Glasses are thin rims drawn at full size. Hats flatten the hair under them. New
realistic face shapes, body types and everyday hairstyles go on the end of each
list (parts are stored by index, so existing characters keep their picks). The
editor's thumbnails crop on the 16×24 grid scaled to the real sprite size.

## Version 2.02

**Challenges.** The Challenge button opens the terms first: the challenger sets
table, spot, cups, speed and ski collision and picks a character, then sends.
The challenged player opens it (View and accept), sees the terms and the
challenger's character, picks their own, and the match starts on Accept and
play. (This replaces 2.01's Ready handshake.)

**Online fix.** On the game's own site a match start waits for its room to
open. A second start ran in that gap and cleared the host's start signal, so
the guest never joined and nobody could serve. `begin()` now runs once per
match (`starting`). Checked against the Firebase emulators with real key
presses (serve, rally) for both players.

**Fine aim.** Hold Shift to move the crosshair at `hitting.fineAim` (30%) of
its speed: left Shift for WASD, right Shift for the arrows (either when one
player has both sets, online and against the CPU).

**Aim marker.** Deeper team colors with a thicker dark edge and a light inner
line, so it reads under the clear cups. It stays drawn under them.

## Version 2.03

**Leaderboard freezing the mouse.** Every profile update (other players' XP
changing while they play) rebuilt the whole leaderboard screen, several times a
second with a few people playing, so the element under the pointer kept being
replaced and clicks were lost. The board now redraws only when what it shows
changes, and then swaps just the table in place. The overlay also holds back a
refresh of the current screen while a mouse button or finger is down on it,
and shows it on release, so a click always lands (`Overlay.show`).

## Version 2.04

**Realistic shapes that read.** At the 16×24 grid a head is only six pixels
wide, so the 2.01 face shapes barely differed. They now get their own outline
at full size (`FACE_PROFILE`, `reshapeHead`): Natural tapers to a rounded chin,
Defined jaw is square with a flat chin, High cheekbones narrows in a V, Soft
round is fuller, Long oval is longer and narrower. Only the face's own edge
moves, never into hair. Bodies change their outline too: Toned and Muscular get
shoulder caps (Muscular thicker arms), Curvy an hourglass with hips, Dad bod a
belly over the belt.

**Online, the guest's view.** Over a jittery network (60–220 ms) the guest's
clock went backwards about a thousand times a game, the ball jumped on ~2% of
frames, and hit windows shut and reopened. Now the guest's clock runs on its own
and is only nudged toward the host's (never back by more than a few ms a frame);
each host update is moved on to the guest's own moment; within a flight an
early update can't un-bounce the ball or un-swing the guest; the drawn ball
glides onto a new flight after the other player's hit. `tests/online-jitter`
checks it.

**Gameplay.**
- Timing: a swing up to 3% past the window's edge (`hitting.missGrace`) connects
  as the weakest hit instead of a whiff.
- Serve stat: more spin on serves (`serveSpin`) and a lower, faster serve
  (`servePeak`).
- CPU: an extra 4% chance to miss a save (`saveMiss`).
- Q / E (or . and /) hit with that style on their own; online the style travels
  with the hit.
- "SINK!" is pixel lettering like the hit callouts, with sparkles.
- The passive abilities section is hidden for now (the code stays; see
  `passivesPanel`).

## Version 2.05

- **Characters tab** lists every character you can play (the same list the
  Players picker uses), not only the ones you made, so a new account no longer
  sees an empty screen.
- **Online at fast speeds (guest).** Corrections always glide while the ball is
  in flight (the old 0.8 m limit snapped the ball at Masters, where it covers
  about a metre during the network delay), a toss glides out of the hand, and
  while the other player is about to hit, the drawn ball eases up to one network
  delay behind (`remoteLag`), so their hit leaves from the paddle instead of the
  ball flying past it and jumping back. A predicted hit the host turns down is
  shown for about a round trip of game time, not 900 ms of wall clock.
  `tests/online-masters.test.ts`: at Masters the guest's big jumps are now about
  the host's own (hits and bounces); before, about 100 more per game.
- **Players move instead of jumping.** The player due to hit shuffles toward
  where the ball will reach their end; a lone 1v1 player walks over to the half
  they serve from (drawing only, `updateStances` in renderer3d).
- **Far-end misses.** A ball below table height behind the table's top is drawn
  before the table, so the table hides it; a ball that will come down off the
  table before bouncing on the side it's headed for gets a red trail.
- **Menus.** A 5×7 pixel font (`render/pixelFont.ts`) for headings and the big
  Play buttons; HTML screens get chunky notched buttons with a hard bottom edge,
  framed boxes with hard shadows, and pixel h1/h2 (`pixelHeadings`). Long
  explanations and the logo subtitle are gone.
- **Cups and drinks** (`render/cups.ts`): clear plastic, red and blue party
  cups, a wine glass; water, lager, stout, red wine. Picked under Table and
  cups, saved in the browser, and only change that screen's look.
- **Custom line-up** (Mode: 2v2 / 1v1 custom line-up): each spot is P1 (WASD),
  P2 (arrows) or the CPU (`controllerOf`). A CPU spot plays only on its turn;
  CPU-only sides earn no XP.
- Default aim speed 1.6 → 2.0 (fine aim 0.25 of it).
- Body and face tweaks: the cheek shadow moved to the shaded side (it read as a
  bruise), Muscular has thick arms and a V taper, Curvy rounds out below the
  waist instead of a ledge, Dad bod is a belly over the belt, Wide jaw widens
  gently at full size.
