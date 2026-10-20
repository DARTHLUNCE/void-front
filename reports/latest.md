# Void Front harness report

Phase 0 (Interceptor base, motherships only) · 30 matches · 60 v 60 · base seed 1 · 2026-10-20T23:14:37.607Z

| Metric | Target | Fail if | Result | Status |
|---|---|---|---|---|
| Side win rate (Cobalt) | 45–55% | outside 40–60% | 36.7% (11/30 decided, 0 draws) | FAIL |
| Median match length | 20–30 min | under 15 or over 34 | 35.0 min | FAIL |
| Matches ending by time limit | under 15% | over 25% | 100.0% | FAIL |
| Comebacks (winner trailed in kills at 10 min) | 20%+ | under 10% | 33.3% | PASS |
| Win route split (siege / territory) | both above 20% | either under 10% | — | N/A |
| Class share of kills | 12–22% each | any over 26% or under 8% | interceptor 100.0% | N/A |
| Tier option pick rate (bots) | 35–65% per option | any under 20% | — | N/A |
| Capture point flips per match | 15+ | under 8 | — | N/A |
| Sim tick time, 100 v 100 | ≤ 12 ms | over 16 ms | mean 0.28 ms, p99 0.77 ms | PASS |

- **Side win rate (Cobalt):** Fail band is defined over 50 matches; 30 matches has a ±18% 1σ-ish spread.
- **Win route split (siege / territory):** Shield routes need FOBs and capture points (Phase 1).
- **Class share of kills:** Only the Interceptor exists in Phase 0.
- **Tier option pick rate (bots):** No tier nodes in Phase 0.
- **Capture point flips per match:** Capture points arrive in Phase 1.

## Match summary

- Kills per match: 4375 (≈ one death per ship every 58 s)
- Average level at end: 8.1
- Lowest mothership hull at end: 99.5% (mean of losing side 100.0%)
- Matches ended by mothership destroyed: 0
- Projectile peak: 297, pool overflows: 0
- Sim tick (60 v 60): mean 0.515 ms, worst p99 5.13 ms

## Tick-time benchmarks

| Scenario | Ticks | Mean | p99 | Max | Projectile peak |
|---|---|---|---|---|---|
| 100 v 100 match, first 5 min | 9000 | 0.28 ms | 0.77 ms | 12.03 ms | 382 |
| 100 v 100 packed brawl (3,000 u box) | 1800 | 0.35 ms | 0.92 ms | 5.87 ms | 473 |

## Matches

| # | Seed | Winner | End | Length | Kills C–E | Kills @10m | Mothership hull C / E |
|---|---|---|---|---|---|---|---|
| 1 | 3860308557 | Ember | timeLimit | 35.0 min | 1971–1983 | 501–512 | 100.0% / 100.0% |
| 2 | 3725383270 | Ember | timeLimit | 35.0 min | 2260–2326 | 480–545 | 100.0% / 100.0% |
| 3 | 1343487201 | Cobalt | timeLimit | 35.0 min | 2206–2122 | 579–513 | 100.0% / 100.0% |
| 4 | 3736088519 | Cobalt | timeLimit | 35.0 min | 2412–2356 | 604–531 | 100.0% / 100.0% |
| 5 | 4144923559 | Ember | timeLimit | 35.0 min | 2035–2140 | 539–553 | 100.0% / 100.0% |
| 6 | 3870211076 | Ember | timeLimit | 35.0 min | 2236–2363 | 498–544 | 100.0% / 100.0% |
| 7 | 3576843996 | Ember | timeLimit | 35.0 min | 2021–2063 | 474–515 | 100.0% / 100.0% |
| 8 | 3502249781 | Cobalt ↺ | timeLimit | 35.0 min | 2207–2190 | 525–546 | 100.0% / 100.0% |
| 9 | 1657960595 | Ember | timeLimit | 35.0 min | 2256–2299 | 499–564 | 100.0% / 100.0% |
| 10 | 2144364893 | Cobalt ↺ | timeLimit | 35.0 min | 2151–2190 | 531–541 | 100.0% / 99.6% |
| 11 | 4045681393 | Ember ↺ | timeLimit | 35.0 min | 2124–2133 | 567–526 | 100.0% / 100.0% |
| 12 | 1280149015 | Ember | timeLimit | 35.0 min | 2235–2240 | 484–532 | 100.0% / 100.0% |
| 13 | 2820734500 | Ember ↺ | timeLimit | 35.0 min | 2157–2287 | 557–520 | 100.0% / 100.0% |
| 14 | 2761165192 | Ember | timeLimit | 35.0 min | 2305–2345 | 486–552 | 100.0% / 100.0% |
| 15 | 1871157155 | Cobalt | timeLimit | 35.0 min | 2339–2244 | 569–504 | 100.0% / 100.0% |
| 16 | 3408116056 | Ember | timeLimit | 35.0 min | 2346–2447 | 474–565 | 100.0% / 100.0% |
| 17 | 1172630466 | Ember ↺ | timeLimit | 35.0 min | 1992–2071 | 535–527 | 100.0% / 100.0% |
| 18 | 3080818328 | Cobalt | timeLimit | 35.0 min | 2328–2226 | 545–454 | 100.0% / 100.0% |
| 19 | 2881777392 | Ember ↺ | timeLimit | 35.0 min | 2164–2252 | 553–545 | 100.0% / 100.0% |
| 20 | 3275476701 | Cobalt | timeLimit | 35.0 min | 2114–2185 | 561–504 | 100.0% / 99.5% |
| 21 | 2572970185 | Ember ↺ | timeLimit | 35.0 min | 1999–2011 | 556–516 | 100.0% / 100.0% |
| 22 | 3193922463 | Cobalt | timeLimit | 35.0 min | 2250–2166 | 554–512 | 100.0% / 100.0% |
| 23 | 3616741829 | Ember | timeLimit | 35.0 min | 2267–2292 | 519–546 | 100.0% / 100.0% |
| 24 | 3158272224 | Ember | timeLimit | 35.0 min | 2239–2423 | 533–568 | 100.0% / 100.0% |
| 25 | 3366555164 | Ember ↺ | timeLimit | 35.0 min | 2097–2105 | 538–519 | 100.0% / 100.0% |
| 26 | 296651966 | Ember | timeLimit | 35.0 min | 2227–2255 | 493–535 | 100.0% / 100.0% |
| 27 | 1432145215 | Ember | timeLimit | 35.0 min | 2228–2292 | 499–551 | 100.0% / 100.0% |
| 28 | 537376853 | Cobalt ↺ | timeLimit | 35.0 min | 1920–1895 | 513–540 | 100.0% / 100.0% |
| 29 | 3297926332 | Cobalt | timeLimit | 35.0 min | 1992–1973 | 510–504 | 100.0% / 100.0% |
| 30 | 3848499322 | Cobalt ↺ | timeLimit | 35.0 min | 2202–2105 | 486–522 | 100.0% / 100.0% |

↺ = comeback (winner trailed in kills at minute 10).
