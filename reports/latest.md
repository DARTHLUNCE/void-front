# Void Front harness report

Phase 1a (six classes, economy, capture points, Fleet Command) · 30 matches · 60 v 60 · base seed 1 · 2026-10-21T18:35:03.117Z

| Metric | Target | Fail if | Result | Status |
|---|---|---|---|---|
| Side win rate (Cobalt) | 45–55% | outside 40–60% | 50.0% (15/30 decided, 0 draws) | PASS |
| Median match length | 20–30 min | under 15 or over 34 | 27.3 min | PASS |
| Matches ending by time limit | under 15% | over 25% | 0.0% | PASS |
| Comebacks (winner trailed in kills at 10 min) | 20%+ | under 10% | 46.7% | PASS |
| Win route split (siege / territory) | both above 20% | either under 10% | — | N/A |
| Class share of kills (per ship of that class) | 12–22% each | any over 26% or under 8% | dreadnought 12.1%, phantom 21.0%, engineer 15.5%, carrier 14.1%, lancer 22.9%, interceptor 14.4% | WARN |
| Tier option pick rate (bots) | 35–65% per option | any under 20% | min 45.9%, max 54.1% over 30 tiers | PASS |
| Capture point flips per match | 15+ | under 8 | 58.1 | PASS |
| Sim tick time, 100 v 100 | ≤ 12 ms | over 16 ms | mean 0.54 ms, p99 1.67 ms | PASS |

- **Side win rate (Cobalt):** Fail band is defined over 50 matches; 30 matches has a ±18% 1σ-ish spread.
- **Win route split (siege / territory):** A mothership is shielded until both its FOBs fall; this metric splits wins once motherships die.
- **Tier option pick rate (bots):** Bots pick tier options at random (50/50), so this only checks every node gets bought.

## Match summary

- Kills per match: 3334 (≈ one death per ship every 59 s)
- Average rank (tiers owned) at end: 4.4
- Lowest mothership hull at end: 0.0% (mean of losing side 0.0%)
- Matches ended by mothership destroyed: 30
- FOBs destroyed per match: 3.4 of 4; nodes destroyed per match: 53.1
- Projectile peak: 321, pool overflows: 0
- Sim tick (60 v 60): mean 1.196 ms, worst p99 12.10 ms

## Tick-time benchmarks

| Scenario | Ticks | Mean | p99 | Max | Projectile peak |
|---|---|---|---|---|---|
| 100 v 100 match, first 5 min | 9000 | 0.54 ms | 1.67 ms | 19.76 ms | 203 |
| 100 v 100 packed brawl (3,000 u box) | 1800 | 0.57 ms | 1.23 ms | 4.40 ms | 399 |

## Matches

| # | Seed | Winner | End | Length | Kills C–E | Kills @10m | Mothership hull C / E |
|---|---|---|---|---|---|---|---|
| 1 | 3860308557 | Cobalt ↺ | destroyed | 23.8 min | 1320–1370 | 391–423 | 82.1% / 0.0% |
| 2 | 3725383270 | Cobalt | destroyed | 29.1 min | 1970–1845 | 465–458 | 96.6% / 0.0% |
| 3 | 1343487201 | Cobalt | destroyed | 34.6 min | 2227–2195 | 465–410 | 89.9% / 0.0% |
| 4 | 3736088519 | Cobalt ↺ | destroyed | 31.4 min | 1941–1834 | 427–434 | 100.0% / 0.0% |
| 5 | 4144923559 | Ember | destroyed | 24.7 min | 1387–1489 | 388–514 | 0.0% / 100.0% |
| 6 | 3870211076 | Ember | destroyed | 26.6 min | 1538–1630 | 434–452 | 0.0% / 60.4% |
| 7 | 3576843996 | Cobalt | destroyed | 31.3 min | 1916–1846 | 424–424 | 42.4% / 0.0% |
| 8 | 3502249781 | Cobalt ↺ | destroyed | 25.1 min | 1476–1360 | 407–457 | 100.0% / 0.0% |
| 9 | 1657960595 | Ember ↺ | destroyed | 34.5 min | 2363–2310 | 452–437 | 0.0% / 28.3% |
| 10 | 2144364893 | Ember ↺ | destroyed | 31.3 min | 1998–2089 | 465–422 | 0.0% / 95.6% |
| 11 | 4045681393 | Ember ↺ | destroyed | 23.5 min | 1348–1333 | 473–422 | 0.0% / 62.0% |
| 12 | 1280149015 | Ember ↺ | destroyed | 27.8 min | 1587–1608 | 459–426 | 0.0% / 100.0% |
| 13 | 2820734500 | Ember | destroyed | 24.4 min | 1435–1555 | 380–517 | 0.0% / 100.0% |
| 14 | 2761165192 | Ember | destroyed | 24.1 min | 1338–1521 | 437–462 | 0.0% / 100.0% |
| 15 | 1871157155 | Cobalt | destroyed | 27.2 min | 1683–1797 | 462–424 | 83.7% / 0.0% |
| 16 | 3408116056 | Cobalt ↺ | destroyed | 24.7 min | 1391–1358 | 416–468 | 100.0% / 0.0% |
| 17 | 1172630466 | Cobalt ↺ | destroyed | 30.7 min | 1868–1848 | 420–464 | 17.6% / 0.0% |
| 18 | 3080818328 | Cobalt | destroyed | 24.4 min | 1523–1452 | 452–422 | 96.2% / 0.0% |
| 19 | 2881777392 | Ember | destroyed | 32.6 min | 2105–2003 | 415–419 | 0.0% / 100.0% |
| 20 | 3275476701 | Ember ↺ | destroyed | 19.6 min | 1105–996 | 451–442 | 0.0% / 94.8% |
| 21 | 2572970185 | Ember | destroyed | 28.5 min | 1780–1797 | 428–474 | 0.0% / 100.0% |
| 22 | 3193922463 | Ember | destroyed | 32.0 min | 1908–1898 | 437–458 | 0.0% / 100.0% |
| 23 | 3616741829 | Cobalt | destroyed | 21.4 min | 1033–1256 | 437–402 | 92.3% / 0.0% |
| 24 | 3158272224 | Ember | destroyed | 27.6 min | 1908–1771 | 487–494 | 0.0% / 80.7% |
| 25 | 3366555164 | Ember ↺ | destroyed | 24.5 min | 1495–1603 | 450–435 | 0.0% / 100.0% |
| 26 | 296651966 | Cobalt ↺ | destroyed | 27.5 min | 1678–1730 | 443–446 | 17.3% / 0.0% |
| 27 | 1432145215 | Ember ↺ | destroyed | 31.3 min | 1886–1961 | 463–444 | 0.0% / 100.0% |
| 28 | 537376853 | Cobalt ↺ | destroyed | 30.8 min | 1778–1708 | 389–468 | 100.0% / 0.0% |
| 29 | 3297926332 | Cobalt | destroyed | 24.5 min | 1621–1371 | 487–457 | 100.0% / 0.0% |
| 30 | 3848499322 | Cobalt | destroyed | 24.0 min | 1447–1437 | 459–412 | 100.0% / 0.0% |

↺ = comeback (winner trailed in kills at minute 10).
