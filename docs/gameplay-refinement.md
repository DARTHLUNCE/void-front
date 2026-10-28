# Gameplay refinement review

This pass lengthens progression, keeps ship roles distinct, and removes several incentives and AI assignment problems that made matches feel repetitive. It was frozen for player review on October 28, 2026; further balance tuning is intentionally deferred.

## Player-facing changes

- Primary firing/charging gradually reduces available movement to **10%**, with the same rule and recovery for players and bots. Defensive turrets do not impose this penalty.
- QWER calibration costs are **32 / 64 / 140 / 320 / 700 / 1,300 / 2,000** shards: **4,556 per track**, **18,224 for all four**. Tier XP costs are **150 / 350 / 1,700 / 2,000 / 2,800**. The match cap is **45 minutes**.
- Actual hull evolution resets QWER; banked shards, remaining XP and tier choices carry over. Death preserves purchased upgrades and XP. Death's 40% unspent-shard loss is capped at **160**, with exact loot/tax accounting.
- Fixed salvage farming areas become seeded, multilayered natural resource pockets. Starting and replenished kinds/values are point-mirrored to preserve team fairness.
- Power emphasis is a smaller situational tradeoff: speed/weapon bonuses **12%**, shield capacity **18%**, with gentler low-channel penalties. Switch-triggered benefits have cooldowns to discourage cycling.
- Useful healing, qualifying assists, hostile combat-craft damage and active node defense receive bounded XP credit. Overhealing, overkill and wreck transfers cannot inflate those rewards.
- Fleet pushes no longer run on a match timer. Local forces, access and visible threats determine assault opportunities. Resource hot zones continue into the late game; those are resource events, not scripted attacks.
- Vacant command seats may buy limited support with existing resources, visibility and cooldown rules. Human occupancy stops those staff orders. Base upgrades remain a human decision.
- HUD/manual prices, reset warnings and death-loss information match the simulation.

## Role and combat fixes

These are specific corrections, not blanket hull or DPS normalization.

- **Patrol:** Storm Run free signature casts have a 0.3-second repeat interval and cannot refund themselves. Power Coupler has passive 8% shield capacity, an 8% switch surge, 30-shield restoration and an eight-second trigger cooldown. Patrol bots can screen nearby armed craft while retaining self-defense and target commitment.
- **Destroyer:** shield-power repair retains its 15% heal over four seconds, with an eight-second trigger cooldown.
- **Frigate:** Fortress no longer doubles node bonuses; Warden Tether composes with Node Bastion. Healing credit counts actual restored hull.
- **Corvette:** Phase Slip compensates for low weapon-power speed across engine levels. Saboteur text matches its existing three-second duration.
- **Carrier:** craft regeneration is 1% per craft, capped at 6% hull/sec. Hive's off-axis designator aims from its actual muzzle within the existing aim cone, without extra range, damage or perfect bot aim.
- Forward-flight perks use the actual firing-speed envelope. Burns obey the documented cap; shield drains respect invulnerability, interruption and credit rules. All eight Titan rockets can be intercepted.
- Bot node assignments recognize real progress and choose nearby replacements independent of ship slot order. Large hulls screen outside the capture ring while smaller eligible ships occupy usable capture seats. Outer stations preserve weapon reach.
- Staging preserves occupied ground rather than retreating toward an isolated rear contact. Shared movement, imperfect aiming and reaction remain intact.

## Review tools and evidence

Run the client and open **`/gameplay-lab.html`** to inspect the bundled match recordings. The manifest labels difficulty, fleet size, simulation hash, clock and historical candidates. Positions are sampled analysis data, not a replay. The viewer also accepts compatible audit JSON.

`packages/harness/src/class-combat-audit.ts` provides controlled class/build diagnostics. Existing harness reports now distinguish actual destruction from timeouts and expose progression/contribution data. Unit tests cover economy conservation, evolution resets, firing envelopes, ability interactions, capture seats, staging, replacement selection and report semantics.

### Frozen candidate 12 validation

The pre-upstream-integration simulation bundle SHA256 is `247355bf0443bfe7bc2b2e5628850630b1c5cf73dda484760261762c522c25d8`. Recordings retain that original provenance; they must not be presented as simulations of later merged code.

- **1,542 tests in 96 files passed**, all four package TypeScript checks passed, and the client production build passed.
- Chrome game/worker checks verified prices, hull evolution reset with bank preservation, the 45-minute clock, exact 10% firing slowdown and recovery, removed salvage labels, and price layout at 1440/1100 widths. No page errors were reported.
- The analysis page passed 1440/1024/768/320-width checks without page overflow.
- Isolated 100v100 shared-simulation timings: opening **2.51 ms mean / 6.00 ms p99**; deliberately packed battle **4.83 ms / 8.03 ms**; zero projectile overflow. These exclude graphics, audio and networking.
- Four complete Normal/Hard 40v40/60v60 campaigns used matching frozen hashes and explicit reference hull geometry.

## Known limitations

**All four final campaigns reached the 45-minute timeout without a FOB loss or Titan damage. Bot endgame pressure is not solved.** Staging preserves ground, but exact formation-seat readiness can still delay otherwise coherent forces. A readiness redesign is deferred rather than hidden behind a damage buff.

Light-bot progression is uneven: Normal Patrol evolution reached 8/16 and 5/24 pilots, and neither light class reached T5. None of the 400 final pilots maxed all 28 calibration levels. These observations support substantial investment; they do not establish enjoyable human progression or post-evolution rebuilding.

Human role feel, exploration and long-match enjoyment still need playtesting. Large-scale live multiplayer is not validated; the server room/join path remains a stub.


## Upstream integration for the PR

The publication branch integrates upstream `61f8e01`. It preserves shield remnants absorbing a full
non-bypassing hit, the removal of natural hull regeneration, refinery shield-recharge bonuses,
cosmetic base drift, the expanded README/ship lineup and BUILD.md.

One intentional progression difference: **tier-3 evolution resets calibration without a refund**,
matching this pass's requested rebuilding phase. Explicit class changes/redeploys retain upstream's
refund behavior. Tests cover both paths. Frozen campaign results above predate this integration.

The integrated branch passed **1,543 tests in 96 files**, all four package typechecks, whitespace
checks and a production client build. An isolated Chrome game/worker run rechecked prices, the
45-minute clock, evolution reset with bank preservation, firing slowdown/recovery and price layout
at 1440/1100 widths with no page errors. The shield-drain assist fixture now explicitly uses a shield
breaking hit followed by a hull hit, matching upstream's absorption rule. No full campaign rerun
was performed after integration; the recorded endgame and progression results remain historical.
