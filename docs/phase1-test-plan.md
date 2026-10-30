# Phase 1, step 2: rules-engine test plan

Status: **approved with the proposed defaults** for Q1–Q13. Implemented in `src/core/rules.ts`, tests in `tests/rules.test.ts`. A few extra scenarios (e.g. 7.10b, 8.6b, 8.8) were added during implementation.

The engine is pure: tests feed it scripted events (`serve`, `bounce(x,y)`, `cupContact(cup)`, `sink(cup)`, `hit(player, predictedPeak)`, `ballOut`, `penaltyCupChosen(cup)`). They then assert on the resulting state (cups, server, expected hitter, miss counter, phase, winner) and on the referee call text. Player names below: A-L, A-R, B-L, B-R. Diagonals: A-L↔B-R, A-R↔B-L.

Tests that depend on an open question are tagged **[Qn]**.

## 1. Setup and first serve
1.1 New game: every cup FULL, tree = 11 per team, shrub = 7 per team.
1.2 First server is drawn from the 4 players by an injected RNG (deterministic with a seed). Every player is reachable.
1.3 The receiver is always the server's diagonal.
1.4 Expected first hitter after the serve is the receiver. The serving team's next hitter is the server's partner.

## 2. Serving: re-serves (no penalty)
2.1 Serve with no bounce on the server's side that lands in the diagonal quarter → re-serve, counter unchanged.
2.2 Serve that bounces on own side, then lands in the wrong opponent quarter (straight across) → re-serve, counter unchanged.
2.3 Serve that bounces twice on own side, then lands on the opponent's half → re-serve. **[Q9]**
2.4 Unlimited re-serves: 20 bad-but-on-table serves in a row → no penalty, same server.
2.5 Referee message for each re-serve names the fault and the same server.

## 3. Serving: table misses and the 3-miss penalty
3.1 Serve that never touches the opponent's half → table miss, counter = 1, same server.
3.2 Two table misses → counter = 2, no penalty.
3.3 Third table miss → serving team enters "choose penalty cup". Choosing a FULL cup makes it HALF. Counter resets to 0, same server.
3.4 Penalty on a HALF cup → REMOVED.
3.5 Penalty selection rejects REMOVED cups and the opponent's cups.
3.6 With `penaltyCupSelection: 'auto'`, the penalty applies with no choice step (selection rule is deterministic and tested).
3.7 Miss, miss, then a legal serve → counter resets to 0. A later miss in a new serve sequence starts at 1.
3.8 Miss, then a re-serve-type bad serve → counter stays at 1 (only a successful serve resets it).
3.9 `serveTableMissLimit` from config is respected (e.g. 2).
3.10 A penalty that removes the team's last cup ends the game (see §10).

## 4. Serving: serve hits an opponent cup
4.1 Serve hits a FULL opponent cup → that cup stays FULL. The serving team enters "choose penalty cup" and loses half a cup. Same server re-serves.
4.2 Same with the hit cup at HALF → it stays HALF.
4.3 Serve-cup penalty does not change the table-miss counter. **[Q3]**
4.4 Serve that bounces legally in the diagonal quarter, then hits a cup → serve-cup penalty (not a rally cup hit). **[Q2]**
4.5 Serve that sinks in an opponent cup → treated as a serve cup hit (cup not removed, server loses half). **[Q2]**
4.6 Serve touching the server's OWN cups: no effect, judged by where it lands.

## 5. Rally: bounce and turn faults (one test per row of "Who serves next")
5.1 Double bounce on receiver's side → rally ends, no cup effect, receiver serves next.
5.2 Mid-rally double bounce → the player whose turn it was serves.
5.3 Hit that misses the table / goes out → hitter serves.
5.4 Hit before the ball bounced on the hitter's side (volley) → hitter serves.
5.5 Wrong teammate hits (outside a save) → the teammate who was supposed to hit serves.
5.6 Receiver's partner hits the serve → wrong-teammate fault, the receiver serves.
5.7 Alternation over a long rally: A-L serve, B-R, A-R, B-L, A-L, B-R, ... with expected hitter checked at each step.
5.8 Legal ball bounces once on a side, then goes off the table unhit → player whose turn it was serves. **[Q5]**
5.9 Rally hit that bounces on the hitter's own side before crossing → fault on hitter. **[Q6]**
5.10 Precedence when one hit commits several faults (e.g. wrong teammate AND volley) → one call only, in the defined order. **[Q8]**

## 6. Height rule
6.1 Hit with predicted peak < `shoulderHeight` → low, rally ends at the hit, hitter serves, no cup effect.
6.2 Peak exactly at threshold → legal.
6.3 Low hit whose trajectory would have hit a cup → no damage (later events for that ball are ignored).
6.4 Serve is not subject to the height rule. **[Q7]**
6.5 `shoulderHeight` from config is respected.

## 7. Cup hits and saves
7.1 Ball hits opponent FULL cup, defender returns with ≤1 table bounce → save. Cup stays FULL, rally continues.
7.2 Save on a HALF cup → stays HALF.
7.3 Save with zero table bounces after cup contact is legal (no volley fault). **[Q4]**
7.4 Cup contact does not count as a bounce: cup hit, 1 bounce, save → legal.
7.5 Bounce before the cup contact counts toward the limit. **[Q4]**
7.6 Either teammate may make the save, including the one who just hit for that team.
7.7 After a save, the saving team's next hit goes to the teammate who did NOT save. Check both cases (saver was / was not the "expected" player).
7.8 Save fails by double bounce → FULL→HALF (or HALF→REMOVED), rally ends, player whose turn it was serves. **[Q10]**
7.9 Save fails because ball goes off the table / hits the ground → damage, rally ends.
7.10 Save return itself goes out → save failed, cup damaged. Server per **[Q11]**.
7.11 Height exemption: the save hit with low peak → not called low.
7.12 Height exemption: the next hit by the other team with low peak → not called low.
7.13 Exemption ends: the hit after that (by the saving team) with low peak → low.
7.14 Hitting your OWN team's cups: no damage, no penalty, ball stays live. **[Q6]**
7.15 Ball contacts two opponent cups in one shot → only one is damaged. **[Q12]**
7.16 Wrong-teammate rule is suspended for the save hit only, then resumes.

## 8. Sinks and the diagonal-serve rule
8.1 Sink in a FULL cup → REMOVED immediately, rally ends.
8.2 Sink in a HALF cup → REMOVED.
8.3 Sink cannot be saved: any further hits/events for that ball are ignored.
8.4 After a sink, next server = the sinker's diagonal, serving to the sinker (who is now the receiver).
8.5 Sink chain: the sinker sinks again off the resulting serve → same diagonal serves again. Chain length is tracked (for later stats).
8.6 Sink that follows a cup contact on a different cup → the sink takes precedence. **[Q12]**
8.7 The sink-serve is a normal serve: fault, miss, and penalty rules all apply.

## 9. Penalty cup selection flow
9.1 While a penalty is pending, all play events are rejected until a cup is chosen.
9.2 The chooser is the penalized team. The other team's input is ignored.

## 10. Game and match end
10.1 Removing a team's last cup (sink, failed save, or penalty) ends the game immediately; the other team wins. No rebuttal.
10.2 Events after game over are rejected.
10.3 Single-game match: first game decides the match.
10.4 Best of 3: first to 2 games. A 2-0 match does not play game 3. Each new game resets cups and draws a new first server. **[Q13]**

## 11. Referee messages and event log
11.1 Every rally-ending call and every serve fault emits a message naming the call and who serves next (e.g. "Low hit by B-L — B-L serves").
11.2 Every engine input and resulting call is appended to the match event log, with a sequence number and the player involved.
11.3 Replaying a recorded log through a fresh engine reproduces the same final state (determinism).

---

## Open questions (each has a proposed default)

**Q1. Left/right orientation.** If "left" and "right" are from each team's own point of view, then A-left and B-right stand on the same physical side of the table, straight across from each other, not diagonal. *Proposed default:* serving is cross-court (true diagonal), as "like tennis" says. A-left↔B-right then holds by labelling left/right from one shared viewpoint, as currently drawn. Alternatively, keep own-POV labels and the diagonal becomes A-left↔B-left. Gameplay is the same either way; only the labels change.

**Q2. Which serves count as "a serve hits a cup"?** Only a serve that hits a cup before touching the opponent's table, or also one that lands legally in the diagonal quarter and then rolls or kicks into a cup before the receiver hits it? And does a serve that sinks count? *Proposed:* any contact with an opponent cup before the receiver's first hit is a serve-cup penalty, sinks included. The cup is untouched and the server loses half a cup.

**Q3. Serve-cup penalty vs. miss counter.** *Proposed:* it neither increments nor resets the table-miss counter.

**Q4. Save bounce counting.** (a) May the defender hit the ball with zero table bounces after the cup contact? (b) If the ball bounced once on the defender's side *before* hitting the cup, does that bounce count toward "twice"? *Proposed:* (a) yes. (b) yes: count every table bounce on the defender's side since the ball crossed, so a bounce-then-cup ball must be saved before any further bounce.

**Q5. Ball leaves the table after one legal bounce, unhit.** *Proposed:* same as a double bounce. The player whose turn it was serves.

**Q6. Contact on your own side mid-rally.** (a) If a rally hit bounces on the hitter's own side before crossing, is that a fault? (b) If a rally hit touches the hitter's own cups, does play continue? *Proposed:* (a) fault, hitter serves. (b) ignored entirely; the ball stays live.

**Q7. Height rule on serves.** *Proposed:* serves are exempt; the rule applies to rally hits only.

**Q8. Fault precedence at a single hit.** *Proposed order:* wrong teammate → volley/no bounce → low. The first applicable call decides who serves.

**Q9. What exactly is a "table miss"?** *Proposed:* the serve never touches the opponent's half before hitting the ground. That includes a serve that falls off the server's own side. Lines (both center lines and the edges) count as in for either adjoining quarter, like tennis.

**Q10. "Player whose turn it was" when a save fails.** Either teammate could have saved. *Proposed:* the teammate who would have been next under normal alternation.

**Q11. Save return goes out.** The table gives two answers: "hit goes out → hitter serves" and "save fails → player whose turn it was serves". *Proposed:* cup is damaged and the **hitter** (the would-be saver) serves.

**Q12. Multiple cups in one shot.** *Proposed:* the first cup touched is the one at risk, and later cup contacts are ignored. If the ball then sinks in any opponent cup, the sink wins: that cup is removed and the first cup is undamaged.

**Q13. Best of 3.** *Proposed:* each game draws a fresh random first server, uses the same formation, and keeps teams at the same ends.

### Decisions made during implementation (not covered by Q1–Q13)

- **D1. Sinking in your own cup** (a hit that drops into the hitter's own cups) is treated as the hit missing the table: no cup effect, the hitter serves. (Test 8.8.)
- **D2. Auto penalty selection** takes the front-most remaining cup (the point of the pyramid first), whatever its state.
- **D3. A ball that touches a defender cup has reached the defender.** If it then deflects back across or off the table, the save fails; it is not the hitter's fault. (Test 7.9.)
- **D4. A save is confirmed when the return reaches the other side** (a table bounce, cup contact, or sink there). Until then, a return fault fails the save. (Tests 7.10, 7.10b, 8.6b.)
