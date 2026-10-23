# Void Front harness report

Phase 1a (six classes, economy, capture points, Fleet Command) · 20 matches · 60 v 60 · base seed 1 · 2026-10-23T20:50:47.133Z

| Metric | Target | Fail if | Result | Status |
|---|---|---|---|---|
| Side win rate (Cobalt) | 45–55% | outside 40–60% | 50.0% (10/20 decided, 0 draws) | PASS |
| Median match length | 20–30 min | under 15 or over 34 | 27.4 min | PASS |
| Matches ending by time limit | under 15% | over 25% | 5.0% | PASS |
| Comebacks (winner trailed in kills at 10 min) | 20%+ | under 10% | 40.0% | PASS |
| Win route split (siege / territory) | both above 20% | either under 10% | — | N/A |
| Class kills per ship (× average ship) | 0.6–1.8× each | any under 0.4× or over 2.5× | frigate 0.62× (K/D 0.43), corvette 0.65× (K/D 0.47), dreadnought 1.44× (K/D 3.58), battleship 1.57× (K/D 3.08), cruiser 1.18× (K/D 1.30), patrol 0.79× (K/D 0.72), destroyer 0.89× (K/D 0.71), carrier 0.95× (K/D 1.43), battlecruiser 1.66× (K/D 1.72) | PASS |
| Tier option pick rate (bots) | 35–65% per option | any under 20% | min 41.0%, max 59.0% over 45 tiers | PASS |
| Capture point flips per match | 15+ | under 8 | 51.5 | PASS |
| Sim tick time, 100 v 100 | ≤ 12 ms | over 16 ms | mean 6.33 ms, p99 13.08 ms | WARN |

- **Side win rate (Cobalt):** Fail band is defined over 50 matches; 20 matches has a ±22% 1σ-ish spread.
- **Win route split (siege / territory):** A mothership is shielded until both its FOBs fall; this metric splits wins once motherships die.
- **Tier option pick rate (bots):** Bots pick tier options at random (50/50), so this only checks every node gets bought.

## Match summary

- Kills per match: 2514 (≈ one death per ship every 76 s)
- Average rank (tiers owned) at end: 4.7
- Lowest mothership hull at end: 0.0% (mean of losing side 4.9%)
- Matches ended by mothership destroyed: 19
- FOBs destroyed per match: 3.6 of 4; nodes destroyed per match: 46.5
- Projectile peak: 893, pool overflows: 0
- Sim tick (60 v 60): mean 8.134 ms, worst p99 26.30 ms

## Tick-time benchmarks

| Scenario | Ticks | Mean | p99 | Max | Projectile peak |
|---|---|---|---|---|---|
| 100 v 100 match, first 5 min | 9000 | 6.33 ms | 13.08 ms | 57.42 ms | 605 |
| 100 v 100 packed brawl (3,000 u box) | 1800 | 14.85 ms | 24.73 ms | 37.09 ms | 975 |

## Matches

| # | Seed | Winner | End | Length | Kills C–E | Kills @10m | Mothership hull C / E |
|---|---|---|---|---|---|---|---|
| 1 | 3860308557 | Ember ↺ | destroyed | 20.2 min | 837–884 | 332–314 | 0.0% / 95.6% |
| 2 | 3725383270 | Cobalt ↺ | destroyed | 33.2 min | 1998–1580 | 356–364 | 100.0% / 0.0% |
| 3 | 1343487201 | Ember | destroyed | 33.6 min | 1641–1810 | 334–337 | 0.0% / 97.5% |
| 4 | 3736088519 | Ember ↺ | timeLimit | 35.0 min | 1918–1750 | 355–342 | 98.3% / 100.0% |
| 5 | 4144923559 | Cobalt ↺ | destroyed | 28.8 min | 1588–1277 | 321–376 | 100.0% / 0.0% |
| 6 | 3870211076 | Cobalt | destroyed | 29.8 min | 1384–1243 | 351–296 | 4.0% / 0.0% |
| 7 | 3576843996 | Ember | destroyed | 19.9 min | 864–893 | 336–360 | 0.0% / 90.4% |
| 8 | 3502249781 | Ember ↺ | destroyed | 22.5 min | 929–956 | 382–302 | 0.0% / 100.0% |
| 9 | 1657960595 | Ember | destroyed | 27.2 min | 1289–1291 | 338–356 | 0.0% / 78.2% |
| 10 | 2144364893 | Cobalt | destroyed | 31.4 min | 1515–1528 | 356–302 | 100.0% / 0.0% |
| 11 | 4045681393 | Ember | destroyed | 24.9 min | 1087–1185 | 306–337 | 0.0% / 100.0% |
| 12 | 1280149015 | Cobalt | destroyed | 23.1 min | 1130–1060 | 432–295 | 99.1% / 0.0% |
| 13 | 2820734500 | Cobalt ↺ | destroyed | 29.0 min | 1504–1358 | 346–369 | 100.0% / 0.0% |
| 14 | 2761165192 | Cobalt | destroyed | 28.1 min | 1293–1358 | 354–337 | 100.0% / 0.0% |
| 15 | 1871157155 | Cobalt ↺ | destroyed | 27.7 min | 1221–1250 | 292–322 | 86.0% / 0.0% |
| 16 | 3408116056 | Cobalt | destroyed | 23.2 min | 1067–994 | 364–338 | 100.0% / 0.0% |
| 17 | 1172630466 | Ember | destroyed | 19.9 min | 790–884 | 336–371 | 0.0% / 86.7% |
| 18 | 3080818328 | Cobalt | destroyed | 23.3 min | 1128–1055 | 377–359 | 30.9% / 0.0% |
| 19 | 2881777392 | Ember ↺ | destroyed | 23.7 min | 1087–1106 | 373–338 | 0.0% / 35.8% |
| 20 | 3275476701 | Ember | destroyed | 27.5 min | 1161–1384 | 329–373 | 0.0% / 99.8% |

↺ = comeback (winner trailed in kills at minute 10).
