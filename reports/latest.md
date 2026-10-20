# Void Front harness report

Phase 0 (Interceptor base, motherships only) · 30 matches · 60 v 60 · base seed 1 · 2026-10-20T23:41:29.094Z

| Metric | Target | Fail if | Result | Status |
|---|---|---|---|---|
| Side win rate (Cobalt) | 45–55% | outside 40–60% | 53.3% (16/30 decided, 0 draws) | PASS |
| Median match length | 20–30 min | under 15 or over 34 | 35.0 min | FAIL |
| Matches ending by time limit | under 15% | over 25% | 100.0% | FAIL |
| Comebacks (winner trailed in kills at 10 min) | 20%+ | under 10% | 40.0% | PASS |
| Win route split (siege / territory) | both above 20% | either under 10% | — | N/A |
| Class share of kills | 12–22% each | any over 26% or under 8% | interceptor 100.0% | N/A |
| Tier option pick rate (bots) | 35–65% per option | any under 20% | — | N/A |
| Capture point flips per match | 15+ | under 8 | — | N/A |
| Sim tick time, 100 v 100 | ≤ 12 ms | over 16 ms | mean 0.34 ms, p99 1.04 ms | PASS |

- **Side win rate (Cobalt):** Fail band is defined over 50 matches; 30 matches has a ±18% 1σ-ish spread.
- **Win route split (siege / territory):** Shield routes need FOBs and capture points (Phase 1).
- **Class share of kills:** Only the Interceptor exists in Phase 0.
- **Tier option pick rate (bots):** No tier nodes in Phase 0.
- **Capture point flips per match:** Capture points arrive in Phase 1.

## Match summary

- Kills per match: 4280 (≈ one death per ship every 59 s)
- Average level at end: 8.3
- Lowest mothership hull at end: 99.1% (mean of losing side 99.9%)
- Matches ended by mothership destroyed: 0
- Projectile peak: 290, pool overflows: 0
- Sim tick (60 v 60): mean 0.540 ms, worst p99 5.02 ms

## Tick-time benchmarks

| Scenario | Ticks | Mean | p99 | Max | Projectile peak |
|---|---|---|---|---|---|
| 100 v 100 match, first 5 min | 9000 | 0.34 ms | 1.04 ms | 15.14 ms | 362 |
| 100 v 100 packed brawl (3,000 u box) | 1800 | 0.39 ms | 0.99 ms | 5.51 ms | 540 |

## Matches

| # | Seed | Winner | End | Length | Kills C–E | Kills @10m | Mothership hull C / E |
|---|---|---|---|---|---|---|---|
| 1 | 3860308557 | Ember | timeLimit | 35.0 min | 2035–2157 | 502–514 | 100.0% / 100.0% |
| 2 | 3725383270 | Cobalt ↺ | timeLimit | 35.0 min | 2214–2344 | 515–575 | 100.0% / 99.1% |
| 3 | 1343487201 | Ember | timeLimit | 35.0 min | 2157–2143 | 501–520 | 100.0% / 100.0% |
| 4 | 3736088519 | Ember ↺ | timeLimit | 35.0 min | 2100–2139 | 532–500 | 100.0% / 100.0% |
| 5 | 4144923559 | Cobalt | timeLimit | 35.0 min | 2143–2109 | 536–528 | 100.0% / 100.0% |
| 6 | 3870211076 | Ember | timeLimit | 35.0 min | 2205–2290 | 478–567 | 99.5% / 100.0% |
| 7 | 3576843996 | Cobalt ↺ | timeLimit | 35.0 min | 2041–2061 | 494–513 | 100.0% / 100.0% |
| 8 | 3502249781 | Cobalt | timeLimit | 35.0 min | 2141–2141 | 548–547 | 100.0% / 99.8% |
| 9 | 1657960595 | Ember | timeLimit | 35.0 min | 2174–2296 | 462–559 | 100.0% / 100.0% |
| 10 | 2144364893 | Ember ↺ | timeLimit | 35.0 min | 2084–2103 | 523–518 | 100.0% / 100.0% |
| 11 | 4045681393 | Cobalt | timeLimit | 35.0 min | 2194–2050 | 497–473 | 100.0% / 100.0% |
| 12 | 1280149015 | Ember | timeLimit | 35.0 min | 2010–2025 | 490–508 | 99.8% / 100.0% |
| 13 | 2820734500 | Ember | timeLimit | 35.0 min | 2162–2283 | 524–545 | 100.0% / 100.0% |
| 14 | 2761165192 | Cobalt ↺ | timeLimit | 35.0 min | 2106–2233 | 485–558 | 100.0% / 100.0% |
| 15 | 1871157155 | Ember ↺ | timeLimit | 35.0 min | 2059–2110 | 505–496 | 100.0% / 100.0% |
| 16 | 3408116056 | Ember | timeLimit | 35.0 min | 2214–2338 | 520–569 | 100.0% / 100.0% |
| 17 | 1172630466 | Cobalt ↺ | timeLimit | 35.0 min | 1980–1958 | 490–492 | 100.0% / 100.0% |
| 18 | 3080818328 | Cobalt | timeLimit | 35.0 min | 2223–2056 | 563–474 | 100.0% / 100.0% |
| 19 | 2881777392 | Cobalt | timeLimit | 35.0 min | 2254–2159 | 504–489 | 100.0% / 100.0% |
| 20 | 3275476701 | Cobalt | timeLimit | 35.0 min | 2229–2180 | 535–457 | 100.0% / 100.0% |
| 21 | 2572970185 | Cobalt | timeLimit | 35.0 min | 1958–1943 | 522–514 | 100.0% / 100.0% |
| 22 | 3193922463 | Cobalt | timeLimit | 35.0 min | 2203–2094 | 529–491 | 100.0% / 99.6% |
| 23 | 3616741829 | Ember | timeLimit | 35.0 min | 2075–2207 | 490–542 | 100.0% / 100.0% |
| 24 | 3158272224 | Ember | timeLimit | 35.0 min | 2127–2197 | 507–533 | 99.7% / 100.0% |
| 25 | 3366555164 | Ember ↺ | timeLimit | 35.0 min | 2089–2120 | 521–491 | 100.0% / 100.0% |
| 26 | 296651966 | Cobalt ↺ | timeLimit | 35.0 min | 2248–2148 | 501–505 | 100.0% / 100.0% |
| 27 | 1432145215 | Cobalt ↺ | timeLimit | 35.0 min | 2119–2082 | 477–534 | 100.0% / 100.0% |
| 28 | 537376853 | Cobalt ↺ | timeLimit | 35.0 min | 2147–2136 | 527–535 | 100.0% / 100.0% |
| 29 | 3297926332 | Cobalt | timeLimit | 35.0 min | 2166–2104 | 490–480 | 100.0% / 99.8% |
| 30 | 3848499322 | Ember ↺ | timeLimit | 35.0 min | 2184–2156 | 515–492 | 99.9% / 100.0% |

↺ = comeback (winner trailed in kills at minute 10).
