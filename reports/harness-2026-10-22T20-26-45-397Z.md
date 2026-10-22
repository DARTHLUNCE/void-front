# Void Front harness report

Phase 1a (six classes, economy, capture points, Fleet Command) · 20 matches · 60 v 60 · base seed 1 · 2026-10-22T20:26:45.397Z

| Metric | Target | Fail if | Result | Status |
|---|---|---|---|---|
| Side win rate (Cobalt) | 45–55% | outside 40–60% | 65.0% (13/20 decided, 0 draws) | FAIL |
| Median match length | 20–30 min | under 15 or over 34 | 19.8 min | WARN |
| Matches ending by time limit | under 15% | over 25% | 0.0% | PASS |
| Comebacks (winner trailed in kills at 10 min) | 20%+ | under 10% | 55.0% | PASS |
| Win route split (siege / territory) | both above 20% | either under 10% | — | N/A |
| Class kills per ship (× average ship) | 0.6–1.8× each | any under 0.4× or over 2.5× | frigate 0.63× (K/D 0.50), corvette 0.72× (K/D 0.62), dreadnought 1.71× (K/D 3.86), battleship 1.63× (K/D 2.88), cruiser 1.17× (K/D 1.22), patrol 0.66× (K/D 0.65), destroyer 0.94× (K/D 0.76), carrier 1.08× (K/D 1.54), battlecruiser 1.40× (K/D 1.41) | PASS |
| Tier option pick rate (bots) | 35–65% per option | any under 20% | min 42.3%, max 57.7% over 45 tiers | PASS |
| Capture point flips per match | 15+ | under 8 | 41.9 | PASS |
| Sim tick time, 100 v 100 | ≤ 12 ms | over 16 ms | mean 1.30 ms, p99 2.53 ms | PASS |

- **Side win rate (Cobalt):** Fail band is defined over 50 matches; 20 matches has a ±22% 1σ-ish spread.
- **Win route split (siege / territory):** A mothership is shielded until both its FOBs fall; this metric splits wins once motherships die.
- **Tier option pick rate (bots):** Bots pick tier options at random (50/50), so this only checks every node gets bought.

## Match summary

- Kills per match: 1587 (≈ one death per ship every 93 s)
- Average rank (tiers owned) at end: 4.6
- Lowest mothership hull at end: 0.0% (mean of losing side 0.0%)
- Matches ended by mothership destroyed: 20
- FOBs destroyed per match: 3.8 of 4; nodes destroyed per match: 37.1
- Projectile peak: 937, pool overflows: 0
- Sim tick (60 v 60): mean 2.404 ms, worst p99 13.21 ms

## Tick-time benchmarks

| Scenario | Ticks | Mean | p99 | Max | Projectile peak |
|---|---|---|---|---|---|
| 100 v 100 match, first 5 min | 9000 | 1.30 ms | 2.53 ms | 20.89 ms | 684 |
| 100 v 100 packed brawl (3,000 u box) | 1800 | 1.91 ms | 2.87 ms | 4.06 ms | 1027 |

## Matches

| # | Seed | Winner | End | Length | Kills C–E | Kills @10m | Mothership hull C / E |
|---|---|---|---|---|---|---|---|
| 1 | 3860308557 | Cobalt | destroyed | 19.4 min | 773–704 | 300–265 | 78.4% / 0.0% |
| 2 | 3725383270 | Cobalt ↺ | destroyed | 15.4 min | 597–505 | 301–312 | 85.1% / 0.0% |
| 3 | 1343487201 | Cobalt ↺ | destroyed | 23.9 min | 848–949 | 274–293 | 13.2% / 0.0% |
| 4 | 3736088519 | Ember ↺ | destroyed | 20.4 min | 883–750 | 338–306 | 0.0% / 97.4% |
| 5 | 4144923559 | Ember ↺ | destroyed | 20.0 min | 721–779 | 309–289 | 0.0% / 78.6% |
| 6 | 3870211076 | Cobalt ↺ | destroyed | 29.4 min | 1244–1173 | 293–316 | 100.0% / 0.0% |
| 7 | 3576843996 | Cobalt ↺ | destroyed | 19.1 min | 666–727 | 302–322 | 48.3% / 0.0% |
| 8 | 3502249781 | Cobalt ↺ | destroyed | 20.2 min | 761–758 | 275–322 | 40.7% / 0.0% |
| 9 | 1657960595 | Cobalt ↺ | destroyed | 28.0 min | 1185–1060 | 282–334 | 100.0% / 0.0% |
| 10 | 2144364893 | Ember | destroyed | 23.6 min | 807–883 | 266–270 | 0.0% / 38.9% |
| 11 | 4045681393 | Cobalt ↺ | destroyed | 19.8 min | 715–802 | 284–330 | 28.4% / 0.0% |
| 12 | 1280149015 | Cobalt | destroyed | 15.3 min | 647–518 | 363–280 | 92.4% / 0.0% |
| 13 | 2820734500 | Ember ↺ | destroyed | 19.5 min | 727–749 | 316–274 | 0.0% / 49.5% |
| 14 | 2761165192 | Cobalt | destroyed | 15.5 min | 581–558 | 336–303 | 70.5% / 0.0% |
| 15 | 1871157155 | Ember | destroyed | 19.5 min | 713–869 | 296–344 | 0.0% / 66.0% |
| 16 | 3408116056 | Cobalt | destroyed | 24.5 min | 1088–1011 | 372–310 | 100.0% / 0.0% |
| 17 | 1172630466 | Ember ↺ | destroyed | 19.8 min | 681–770 | 322–291 | 0.0% / 49.4% |
| 18 | 3080818328 | Cobalt | destroyed | 18.5 min | 739–695 | 341–299 | 7.9% / 0.0% |
| 19 | 2881777392 | Ember | destroyed | 25.4 min | 1014–969 | 312–321 | 0.0% / 9.3% |
| 20 | 3275476701 | Cobalt | destroyed | 15.0 min | 592–532 | 325–295 | 99.4% / 0.0% |

↺ = comeback (winner trailed in kills at minute 10).
