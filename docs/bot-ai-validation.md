# AI validation — 2026-10-24

## Release checks

- 843 tests passed across 49 files, including 10,000-tick determinism, mirrored start fairness, class-specific maneuver execution, legal player-input parity, attack reaction, support/retreat, target commitment, queue/convoy ingress and actual projectile firing.
- Shared, client, server and harness TypeScript checks passed. Production Vite build passed (796 modules).
- The same local game tab was inspected during development; the battle rendered and progressed without captured warning/error logs. This is a smoke test, not visual proof of strong strategy or a GPU performance measurement.

## Whole-simulation timing

Local Node/tsx, same fleet/seed/duration configurations before and after the AI rewrite. The final benchmark ran without concurrent tests/campaign jobs. Each run excludes the first 60 ticks from timing, and samples proximity once per second after the first ten seconds. Game behavior diverges between versions, so projectile/entity workloads also differ. These numbers describe the whole simulation rather than isolating AI cost; they are not FPS predictions or a controlled hardware survey.

| Fleet / seed / duration | Before p95 ms | After p95 ms | After mean ms | Before near-ally samples | After near-ally samples |
| --- | ---: | ---: | ---: | ---: | ---: |
| 20v20 / 41 / 180s | 0.548 | 0.598 | 0.387 | 10.862% | 0.060% |
| 20v20 / 82 / 180s | 0.417 | 0.751 | 0.496 | 14.884% | 0.030% |
| 100v100 / 41 / 90s | 3.733 | 5.544 | 3.781 | 33.714% | 0.189% |

The near-ally measure uses the legacy circular radius sum plus 25 units; it is NOT exact silhouette contact, avoidance safety or teamwork quality. Actual oriented hulls can overlap comfort envelopes despite a low value. All sampled live bots used mouse-steered flight in the final run, versus none in the old pilot. Capability-parity tests cover all nine classes separately.

## Difficulty test correction

The original two-seed test claimed equal fleets but used different random rosters and always put Easy on the same side. The replacement uses six seeds, both side assignments, and matched initial class rosters. It requires Hard to win at least ten of twelve matches, win each combined seed pair and score at least 1.5 times the aggregate kills. This tests consistent skill advantage rather than an exact two-to-one ratio in a biased small sample. No difficulty, aim, reaction, damage, hull or movement parameters were boosted to pass it. The expanded pre-contact-fix diagnostic recorded 120 Easy kills to 235 Hard, with Hard winning every match; the complete final suite also passes after the approach-clearing change.

## Long battle: current release, not a historical best run

100v100, seed 41, 500 simulated seconds: 346 kills, 12 point flips, five nodes destroyed, two launched assaults (42 and 40 ships), no failed musters and no projectile overflow (peak 485 projectiles). All nine classes participated and purchased existing upgrades.

**Material limitation:** this final run produced zero structure-target firing and zero FOB hull damage. Dense-front navigation and attack coordination are still inconsistent at maximum fleet size. Correct destinations, valid reservations and a successful assembly do not prove successful siege. Earlier intermediate revisions damaged FOBs, but those figures are superseded and are not evidence for this release. No full-match victory rate, human-play superiority or collision-free guarantee is established.

Target changes in the raw summary include acquisition, loss and death, so they should not be treated as a direct measure of harmful target switching. Focused commitment tests verify that small score fluctuations do not repeatedly swap a valid target.

## Reproduce

From the repository root, using installed dependencies:

```powershell
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc -p packages/shared/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p packages/client/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p packages/server/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p packages/harness/tsconfig.json --noEmit
node packages/client/node_modules/vite/bin/vite.js build packages/client
node node_modules/tsx/dist/cli.mjs packages/harness/src/ai-benchmark.ts reports/ai-benchmark.json
```

Compact raw benchmark and final campaign figures are in `bot-ai-validation.json`. Architecture and primary research links are in `bot-ai.md`.
