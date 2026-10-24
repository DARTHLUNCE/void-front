# Siege and fleet follow-up validation

The final reviewed source produces more actual base damage in three of four fixed 500-second campaigns and reduces broad crowded-and-slow time in all four. It does **not** solve every crowded siege: 100v100 seed 82 produces no base fire, down from 24 volleys in the published baseline. No FOB is destroyed within these final 500-second runs.

## Frozen source and method

Snapshot: `final-review`, built `2026-10-24T12:58:12.583Z`. Bundle SHA-256: `9045ca24fbe8c8a4d728890172a31517e565ff0bdf79c8e22e576f6c7eccb259`. The companion JSON records 70 TypeScript source hashes and both collision-geometry JSON hashes. Geometry is unchanged from published baseline revision `3cbb13f6c85ed4ec0374a42feec6e06f7fd8c8dc`.

The harness runs the normal shared campaign: no forced assault jobs, stat changes, disabled defenders, special collisions, or RNG changes. Volleys require an actual primary discharge while targeting a structure; hull damage is measured separately every tick. Repaired damage can be counted again. Secondary weapons are not included in the primary-volley count.

## Equal-duration campaign outcomes

| Fleet / seed | Baseline volleys | Final volleys (team 0 / team 1) | Baseline hull damage | Final hull damage |
| --- | ---: | ---: | ---: | ---: |
| 40v40 / 41 | 71 | 0 / 30 | 1,284.40 | 5,148.10 |
| 40v40 / 82 | 16 | 49 / 71 | 1,832.62 | 6,543.63 |
| 100v100 / 41 | 0 | 67 / 382 | 0.00 | 60,492.21 |
| 100v100 / 82 | 24 | 0 / 0 | 869.78 | 0.00 |

The earlier `contact-release` candidate destroyed FOBs in longer runs. Those results are superseded and are not claimed for the final reviewed code. Two seeds per fleet size are limited coverage, not a statistical guarantee.

## Separate extended check of the difficult case

The exact final snapshot was extended once for 100v100 seed 82 to 900 simulated seconds. It produced 106 actual base volleys (67 / 39 by team), 4,979.68 hull damage, and 0 destroyed FOBs. The first nonzero 30-second timeline sample is at 750s. This is delayed, weak pressure rather than a permanent zero-fire lock, and it does not erase the 500-second regression.

At 900s, 5 / 1 active assault ships are within broad base firing range, with mean remaining station distances 1,950 / 3,006 units. Long approach delays and scattered waves remain. This extended result has no equal-duration published baseline; do not compare it directly with the 500-second table.

## Movement and congestion

| Fleet / seed | Median net/path baseline → final | Low-directness windows baseline → final | Hull-contact ship samples baseline → final | Crowded-and-slow baseline → final |
| --- | ---: | ---: | ---: | ---: |
| 40 / 41 | 0.814 → 0.899 | 10.24% → 7.22% | 0.578% → 0.489% | 7.94% → 6.97% |
| 40 / 82 | 0.815 → 0.925 | 8.94% → 5.67% | 0.534% → 0.406% | 8.39% → 5.16% |
| 100 / 41 | 0.735 → 0.830 | 13.39% → 9.42% | 1.393% → 1.061% | 12.83% → 10.63% |
| 100 / 82 | 0.758 → 0.838 | 12.00% → 8.27% | 1.287% → 1.372% | 12.41% → 11.12% |

The exact contact metric samples compound-hull overlaps after collision resolution once per second. It excludes already-resolved impacts. The crowded-and-slow proxy is broader. Net/path uses stable five-second movement windows and can mark legitimate tactical arcs as indirect. These measures do not establish teamwork by themselves. Every final run recorded zero non-mouse-steering samples.

## Class participation and remaining bottleneck

| Class | Active assault ship-seconds across four final runs | Actual primary base volleys |
| --- | ---: | ---: |
| patrol | 0 | 0 |
| corvette | 0 | 0 |
| frigate | 0 | 0 |
| destroyer | 3,400 | 19 |
| cruiser | 12,603 | 91 |
| battlecruiser | 10,232 | 4 |
| battleship | 9,465 | 22 |
| dreadnought | 5,476 | 452 |
| carrier | 9,209 | 11 |

These mission samples reflect larger classes assigned assault duty, while the lighter classes retain other jobs. They do not measure escort protection, repair effectiveness or coordination causally.

In 100v100 seed 41, dreadnoughts produce 425 of 449 base volleys (94.7%). Five distinct dreadnought slots, three cruisers, two battleships and one battlecruiser appear with structure targets in the five-second trace, but a target assignment is not proof of a shot. Exact unique shooter IDs were not recorded. At 480s only 2 members per team are in broad base weapon range while 31/36 remain active assault members. The pressure is still artillery-heavy; it is not a whole wave simultaneously unloading on the base.

In 100v100 seed 82, the final 480s sample has 34/29 active assault ships, no members in base range, and mean remaining station distances 4,414/5,026 units. The baseline managed small late pressure. This remains a crowded-front approach limitation, not proof of universal siege success.

The paired 420–480s motion images show both teams for both 100v100 seeds. Seed 41 reaches enemy-base approaches beyond the baseline front. Seed 82 still has long travel loops and scattered assault approaches. Connections over 2,500 units are omitted because they may be respawn or fast-travel jumps. Raw traces and class/mission samples remain in the local full results.

## Performance boundary

| Final scenario | Mean step ms | p95 | p99 | p99.9 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| 40 / 41 | 0.861 | 1.313 | 1.759 | 3.049 | 6.561 |
| 40 / 82 | 0.761 | 1.152 | 1.490 | 2.378 | 6.519 |
| 100 / 41 | 2.481 | 3.467 | 4.429 | 7.176 | 22.549 |
| 100 / 82 | 2.613 | 3.697 | 4.773 | 7.221 | 23.239 |

These are whole `step()` CPU wall timings, excluding rendering, transfer and diagnostic work. The actual game worker was also run without rendering for 120 simulated seconds: 120.09 wall seconds, mean 5.477ms, p95 7.2ms, p99 8.1ms, maximum 13.5ms after 20s warmup; snapshot arrivals averaged 33.33ms. It used seed 41, 100 ships/team, Normal/Normal difficulty, human slot 0 plus Admiral, and reference hulls.

The user confirmed a concurrent GPU image-generation workload. The earlier rendered-game slowdown is therefore confounded and is not proven to be caused by AI. The isolated worker result is not a rendered FPS claim or a guarantee against longer-run spikes.

## Reproduction and artifacts

Final integration checks passed: 903 tests across 52 files; shared, client, server and harness TypeScript checks; production Vite build with 798 modules.

Current source: `node node_modules/tsx/dist/cli.mjs packages/harness/src/siege-benchmark.ts output.json 40,100 41,82 500 --trace`.

Focused harness test: `node node_modules/vitest/vitest.mjs run packages/harness/src/siege-benchmark.test.ts`. The observational equivalence test compares real campaign hashes with and without diagnostics. Full suite: `node node_modules/vitest/vitest.mjs run`.

Compact raw evidence: [bot-ai-validation.json](bot-ai-validation.json). Full local traces remain outside the repository. Their artifact names are `final-review-campaigns.json`, `baseline.json`, `baseline-medium.json`, `baseline-100-82.json`, `final-review-snapshot.json`, `browser-worker-validation.json`, and `final-motion-seed{41,82}-100-420-480.png`.

## Historical context (superseded)

The previous AI release passed 843 tests and its typechecks/build, but its 100v100 seed 41/500s campaign recorded zero base firing and damage. That specific behavior is the baseline in the table above. The earlier short 20v20/180s and 100v100/90s proximity benchmarks used a legacy circular near-ally measure and cannot be compared directly with the exact compound-hull metric here. Their raw results are retained under `historicalPreviousAIRelease` in the companion JSON.

The earlier difficulty test correction remains relevant: six seeds, both side assignments and matched initial class rosters replaced a biased two-seed comparison. This follow-up does not establish human-play superiority, full-match win rates or a collision-free guarantee. Architecture and primary research sources remain in [bot-ai.md](bot-ai.md).
