# Void Front harness report

Phase 1a (six classes, economy, capture points, Fleet Command) · 20 matches · 60 v 60 · base seed 1 · 2026-10-23T19:54:58.416Z

| Metric | Target | Fail if | Result | Status |
|---|---|---|---|---|
| Side win rate (Cobalt) | 45–55% | outside 40–60% | 70.0% (14/20 decided, 0 draws) | FAIL |
| Median match length | 20–30 min | under 15 or over 34 | 25.2 min | PASS |
| Matches ending by time limit | under 15% | over 25% | 10.0% | PASS |
| Comebacks (winner trailed in kills at 10 min) | 20%+ | under 10% | 45.0% | PASS |
| Win route split (siege / territory) | both above 20% | either under 10% | — | N/A |
| Class kills per ship (× average ship) | 0.6–1.8× each | any under 0.4× or over 2.5× | frigate 0.40× (K/D 0.30), corvette 0.67× (K/D 0.49), dreadnought 1.46× (K/D 3.38), battleship 2.00× (K/D 3.58), cruiser 1.17× (K/D 1.20), patrol 0.71× (K/D 0.67), destroyer 0.94× (K/D 0.73), carrier 0.93× (K/D 1.35), battlecruiser 1.64× (K/D 1.75) | WARN |
| Tier option pick rate (bots) | 35–65% per option | any under 20% | min 41.8%, max 58.2% over 45 tiers | PASS |
| Capture point flips per match | 15+ | under 8 | 54.2 | PASS |
| Sim tick time, 100 v 100 | ≤ 12 ms | over 16 ms | mean 3.82 ms, p99 8.41 ms | PASS |

- **Side win rate (Cobalt):** Fail band is defined over 50 matches; 20 matches has a ±22% 1σ-ish spread.
- **Win route split (siege / territory):** A mothership is shielded until both its FOBs fall; this metric splits wins once motherships die.
- **Tier option pick rate (bots):** Bots pick tier options at random (50/50), so this only checks every node gets bought.

## Match summary

- Kills per match: 2391 (≈ one death per ship every 79 s)
- Average rank (tiers owned) at end: 4.7
- Lowest mothership hull at end: 0.0% (mean of losing side 6.8%)
- Matches ended by mothership destroyed: 18
- FOBs destroyed per match: 3.5 of 4; nodes destroyed per match: 49.6
- Projectile peak: 911, pool overflows: 0
- Sim tick (60 v 60): mean 3.948 ms, worst p99 11.01 ms

## Tick-time benchmarks

| Scenario | Ticks | Mean | p99 | Max | Projectile peak |
|---|---|---|---|---|---|
| 100 v 100 match, first 5 min | 9000 | 3.82 ms | 8.41 ms | 42.24 ms | 609 |
| 100 v 100 packed brawl (3,000 u box) | 1800 | 9.10 ms | 15.57 ms | 25.21 ms | 958 |

## Matches

| # | Seed | Winner | End | Length | Kills C–E | Kills @10m | Mothership hull C / E |
|---|---|---|---|---|---|---|---|
| 1 | 3860308557 | Cobalt ↺ | destroyed | 24.7 min | 1117–1112 | 328–335 | 38.8% / 0.0% |
| 2 | 3725383270 | Cobalt | destroyed | 29.1 min | 1439–1514 | 394–309 | 100.0% / 0.0% |
| 3 | 1343487201 | Cobalt | destroyed | 29.2 min | 1396–1280 | 341–327 | 84.2% / 0.0% |
| 4 | 3736088519 | Cobalt | destroyed | 31.6 min | 1547–1582 | 361–296 | 100.0% / 0.0% |
| 5 | 4144923559 | Ember ↺ | destroyed | 20.2 min | 934–868 | 354–349 | 0.0% / 76.5% |
| 6 | 3870211076 | Cobalt | destroyed | 23.1 min | 968–970 | 351–306 | 100.0% / 0.0% |
| 7 | 3576843996 | Cobalt | destroyed | 22.0 min | 993–942 | 317–316 | 100.0% / 0.0% |
| 8 | 3502249781 | Ember | destroyed | 26.8 min | 1063–1161 | 303–339 | 0.0% / 2.3% |
| 9 | 1657960595 | Cobalt ↺ | timeLimit | 35.0 min | 1610–1429 | 347–348 | 100.0% / 50.2% |
| 10 | 2144364893 | Cobalt | destroyed | 24.6 min | 1106–1002 | 323–308 | 100.0% / 0.0% |
| 11 | 4045681393 | Cobalt | destroyed | 20.4 min | 783–804 | 320–296 | 40.2% / 0.0% |
| 12 | 1280149015 | Cobalt ↺ | destroyed | 23.0 min | 1085–1083 | 383–414 | 83.7% / 0.0% |
| 13 | 2820734500 | Cobalt ↺ | timeLimit | 35.0 min | 1820–1733 | 342–351 | 94.8% / 85.7% |
| 14 | 2761165192 | Ember ↺ | destroyed | 19.9 min | 890–878 | 403–288 | 0.0% / 100.0% |
| 15 | 1871157155 | Ember | destroyed | 24.5 min | 1052–1063 | 303–359 | 0.0% / 95.1% |
| 16 | 3408116056 | Cobalt ↺ | destroyed | 29.4 min | 1311–1291 | 313–355 | 60.4% / 0.0% |
| 17 | 1172630466 | Cobalt | destroyed | 26.2 min | 1204–1219 | 379–342 | 100.0% / 0.0% |
| 18 | 3080818328 | Cobalt ↺ | destroyed | 32.3 min | 1778–1580 | 326–396 | 83.5% / 0.0% |
| 19 | 2881777392 | Ember | destroyed | 25.7 min | 1252–1279 | 327–362 | 0.0% / 100.0% |
| 20 | 3275476701 | Ember ↺ | destroyed | 19.7 min | 853–828 | 366–323 | 0.0% / 100.0% |

↺ = comeback (winner trailed in kills at minute 10).
