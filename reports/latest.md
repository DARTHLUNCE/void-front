# Void Front harness report

Phase 1a (six classes, economy, capture points, Fleet Command) · 30 matches · 60 v 60 · base seed 1 · 2026-10-21T19:17:34.238Z

| Metric | Target | Fail if | Result | Status |
|---|---|---|---|---|
| Side win rate (Cobalt) | 45–55% | outside 40–60% | 56.7% (17/30 decided, 0 draws) | WARN |
| Median match length | 20–30 min | under 15 or over 34 | 24.7 min | PASS |
| Matches ending by time limit | under 15% | over 25% | 3.3% | PASS |
| Comebacks (winner trailed in kills at 10 min) | 20%+ | under 10% | 60.0% | PASS |
| Win route split (siege / territory) | both above 20% | either under 10% | — | N/A |
| Class kills per ship (× average ship) | 0.6–1.8× each | any under 0.4× or over 2.5× | frigate 0.76× (K/D 0.78), corvette 1.04× (K/D 0.81), dreadnought 1.41× (K/D 3.06), battleship 0.80× (K/D 1.12), cruiser 1.25× (K/D 1.58), patrol 0.78× (K/D 0.53), destroyer 1.44× (K/D 1.48), carrier 0.64× (K/D 0.93), battlecruiser 0.98× (K/D 1.02) | PASS |
| Tier option pick rate (bots) | 35–65% per option | any under 20% | min 42.9%, max 57.1% over 45 tiers | PASS |
| Capture point flips per match | 15+ | under 8 | 57.9 | PASS |
| Sim tick time, 100 v 100 | ≤ 12 ms | over 16 ms | mean 0.57 ms, p99 1.91 ms | PASS |

- **Side win rate (Cobalt):** Fail band is defined over 50 matches; 30 matches has a ±18% 1σ-ish spread.
- **Win route split (siege / territory):** A mothership is shielded until both its FOBs fall; this metric splits wins once motherships die.
- **Tier option pick rate (bots):** Bots pick tier options at random (50/50), so this only checks every node gets bought.

## Match summary

- Kills per match: 3252 (≈ one death per ship every 55 s)
- Average rank (tiers owned) at end: 4.5
- Lowest mothership hull at end: 0.0% (mean of losing side 1.3%)
- Matches ended by mothership destroyed: 29
- FOBs destroyed per match: 3.5 of 4; nodes destroyed per match: 52.7
- Projectile peak: 421, pool overflows: 0
- Sim tick (60 v 60): mean 0.878 ms, worst p99 8.66 ms

## Tick-time benchmarks

| Scenario | Ticks | Mean | p99 | Max | Projectile peak |
|---|---|---|---|---|---|
| 100 v 100 match, first 5 min | 9000 | 0.57 ms | 1.91 ms | 23.37 ms | 229 |
| 100 v 100 packed brawl (3,000 u box) | 1800 | 0.54 ms | 1.09 ms | 5.53 ms | 511 |

## Matches

| # | Seed | Winner | End | Length | Kills C–E | Kills @10m | Mothership hull C / E |
|---|---|---|---|---|---|---|---|
| 1 | 3860308557 | Cobalt ↺ | destroyed | 24.9 min | 1602–1701 | 468–540 | 100.0% / 0.0% |
| 2 | 3725383270 | Ember ↺ | destroyed | 30.2 min | 2104–2165 | 504–478 | 0.0% / 98.5% |
| 3 | 1343487201 | Cobalt ↺ | destroyed | 31.0 min | 2066–2014 | 458–523 | 90.4% / 0.0% |
| 4 | 3736088519 | Ember ↺ | destroyed | 24.9 min | 1710–1652 | 535–498 | 0.0% / 56.0% |
| 5 | 4144923559 | Ember | destroyed | 17.2 min | 928–1030 | 442–513 | 0.0% / 82.7% |
| 6 | 3870211076 | Ember | destroyed | 27.4 min | 1810–1846 | 496–508 | 0.0% / 100.0% |
| 7 | 3576843996 | Ember ↺ | destroyed | 27.6 min | 2011–1920 | 525–463 | 0.0% / 4.4% |
| 8 | 3502249781 | Cobalt ↺ | destroyed | 24.9 min | 1468–1523 | 458–485 | 100.0% / 0.0% |
| 9 | 1657960595 | Ember | destroyed | 23.9 min | 1700–1689 | 448–525 | 0.0% / 100.0% |
| 10 | 2144364893 | Cobalt ↺ | destroyed | 24.1 min | 1635–1668 | 473–513 | 100.0% / 0.0% |
| 11 | 4045681393 | Ember | destroyed | 17.3 min | 971–1070 | 511–524 | 0.0% / 17.1% |
| 12 | 1280149015 | Cobalt ↺ | destroyed | 24.5 min | 1646–1563 | 499–548 | 100.0% / 0.0% |
| 13 | 2820734500 | Cobalt ↺ | destroyed | 34.8 min | 2394–2331 | 499–526 | 98.7% / 0.0% |
| 14 | 2761165192 | Cobalt ↺ | destroyed | 24.8 min | 1602–1729 | 527–530 | 100.0% / 0.0% |
| 15 | 1871157155 | Cobalt | destroyed | 16.7 min | 1053–986 | 548–497 | 62.6% / 0.0% |
| 16 | 3408116056 | Ember ↺ | timeLimit | 35.0 min | 2222–2454 | 549–490 | 39.5% / 86.0% |
| 17 | 1172630466 | Ember ↺ | destroyed | 20.6 min | 1290–1226 | 511–482 | 0.0% / 100.0% |
| 18 | 3080818328 | Cobalt ↺ | destroyed | 17.1 min | 1011–987 | 493–494 | 91.8% / 0.0% |
| 19 | 2881777392 | Ember | destroyed | 32.5 min | 2267–2207 | 467–493 | 0.0% / 100.0% |
| 20 | 3275476701 | Ember ↺ | destroyed | 20.7 min | 1289–1192 | 483–468 | 0.0% / 100.0% |
| 21 | 2572970185 | Ember | destroyed | 24.0 min | 1467–1527 | 456–530 | 0.0% / 1.8% |
| 22 | 3193922463 | Cobalt ↺ | destroyed | 28.6 min | 1902–1938 | 439–539 | 100.0% / 0.0% |
| 23 | 3616741829 | Cobalt | destroyed | 16.3 min | 1036–1009 | 592–560 | 94.6% / 0.0% |
| 24 | 3158272224 | Cobalt | destroyed | 34.2 min | 2359–2323 | 518–518 | 46.1% / 0.0% |
| 25 | 3366555164 | Ember ↺ | destroyed | 19.7 min | 1231–1180 | 512–458 | 0.0% / 19.2% |
| 26 | 296651966 | Cobalt ↺ | destroyed | 24.7 min | 1537–1702 | 498–514 | 95.5% / 0.0% |
| 27 | 1432145215 | Cobalt | destroyed | 25.2 min | 1780–1702 | 518–483 | 100.0% / 0.0% |
| 28 | 537376853 | Cobalt | destroyed | 24.3 min | 1669–1611 | 517–505 | 97.0% / 0.0% |
| 29 | 3297926332 | Cobalt | destroyed | 20.8 min | 1328–1219 | 508–440 | 100.0% / 0.0% |
| 30 | 3848499322 | Cobalt ↺ | destroyed | 24.9 min | 1698–1612 | 505–526 | 100.0% / 0.0% |

↺ = comeback (winner trailed in kills at minute 10).
