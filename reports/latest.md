# Void Front harness report

Phase 1a (six classes, economy, capture points, Fleet Command) · 30 matches · 60 v 60 · base seed 1 · 2026-10-22T05:18:03.726Z

| Metric | Target | Fail if | Result | Status |
|---|---|---|---|---|
| Side win rate (Cobalt) | 45–55% | outside 40–60% | 50.0% (15/30 decided, 0 draws) | PASS |
| Median match length | 20–30 min | under 15 or over 34 | 15.5 min | WARN |
| Matches ending by time limit | under 15% | over 25% | 0.0% | PASS |
| Comebacks (winner trailed in kills at 10 min) | 20%+ | under 10% | 36.7% | PASS |
| Win route split (siege / territory) | both above 20% | either under 10% | — | N/A |
| Class kills per ship (× average ship) | 0.6–1.8× each | any under 0.4× or over 2.5× | frigate 0.39× (K/D 0.33), corvette 0.32× (K/D 0.22), dreadnought 2.88× (K/D 8.67), battleship 2.35× (K/D 5.02), cruiser 1.25× (K/D 1.54), patrol 0.29× (K/D 0.21), destroyer 0.94× (K/D 0.89), carrier 1.26× (K/D 2.05), battlecruiser 1.56× (K/D 1.94) | FAIL |
| Tier option pick rate (bots) | 35–65% per option | any under 20% | min 0.0%, max 100.0% over 45 tiers | FAIL |
| Capture point flips per match | 15+ | under 8 | 37.8 | PASS |

- **Side win rate (Cobalt):** Fail band is defined over 50 matches; 30 matches has a ±18% 1σ-ish spread.
- **Win route split (siege / territory):** A mothership is shielded until both its FOBs fall; this metric splits wins once motherships die.
- **Tier option pick rate (bots):** Bots pick tier options at random (50/50), so this only checks every node gets bought.

## Match summary

- Kills per match: 1676 (≈ one death per ship every 71 s)
- Average rank (tiers owned) at end: 4.0
- Lowest mothership hull at end: 0.0% (mean of losing side 0.0%)
- Matches ended by mothership destroyed: 30
- FOBs destroyed per match: 3.8 of 4; nodes destroyed per match: 32.8
- Projectile peak: 754, pool overflows: 0
- Sim tick (60 v 60): mean 2.684 ms, worst p99 15.25 ms

## Matches

| # | Seed | Winner | End | Length | Kills C–E | Kills @10m | Mothership hull C / E |
|---|---|---|---|---|---|---|---|
| 1 | 3860308557 | Ember | destroyed | 15.0 min | 705–842 | 407–496 | 0.0% / 60.6% |
| 2 | 3725383270 | Cobalt | destroyed | 15.6 min | 832–544 | 494–318 | 99.6% / 0.0% |
| 3 | 1343487201 | Ember ↺ | destroyed | 15.4 min | 783–758 | 443–428 | 0.0% / 100.0% |
| 4 | 3736088519 | Cobalt | destroyed | 14.6 min | 738–668 | 446–375 | 73.1% / 0.0% |
| 5 | 4144923559 | Ember | destroyed | 15.3 min | 731–740 | 430–448 | 0.0% / 100.0% |
| 6 | 3870211076 | Cobalt ↺ | destroyed | 20.2 min | 1029–1138 | 389–477 | 29.5% / 0.0% |
| 7 | 3576843996 | Ember ↺ | destroyed | 15.2 min | 741–674 | 454–414 | 0.0% / 2.4% |
| 8 | 3502249781 | Ember | destroyed | 10.7 min | 483–524 | 432–475 | 0.0% / 100.0% |
| 9 | 1657960595 | Ember | destroyed | 19.3 min | 951–1158 | 390–516 | 0.0% / 83.2% |
| 10 | 2144364893 | Cobalt ↺ | destroyed | 19.5 min | 1003–1053 | 410–438 | 90.4% / 0.0% |
| 11 | 4045681393 | Ember | destroyed | 20.4 min | 975–1130 | 365–454 | 0.0% / 65.3% |
| 12 | 1280149015 | Ember ↺ | destroyed | 14.8 min | 753–739 | 481–430 | 0.0% / 34.1% |
| 13 | 2820734500 | Ember | destroyed | 15.3 min | 621–741 | 340–403 | 0.0% / 100.0% |
| 14 | 2761165192 | Ember ↺ | destroyed | 14.8 min | 749–724 | 450–433 | 0.0% / 95.2% |
| 15 | 1871157155 | Cobalt | destroyed | 15.2 min | 727–782 | 437–433 | 32.7% / 0.0% |
| 16 | 3408116056 | Cobalt | destroyed | 15.5 min | 784–745 | 464–422 | 100.0% / 0.0% |
| 17 | 1172630466 | Cobalt | destroyed | 15.4 min | 754–748 | 455–436 | 10.4% / 0.0% |
| 18 | 3080818328 | Cobalt | destroyed | 19.9 min | 1192–950 | 476–378 | 41.4% / 0.0% |
| 19 | 2881777392 | Ember | destroyed | 16.0 min | 784–793 | 395–463 | 0.0% / 84.1% |
| 20 | 3275476701 | Cobalt ↺ | destroyed | 14.9 min | 651–711 | 359–425 | 99.6% / 0.0% |
| 21 | 2572970185 | Cobalt | destroyed | 19.8 min | 1022–1047 | 444–444 | 53.2% / 0.0% |
| 22 | 3193922463 | Ember | destroyed | 16.0 min | 819–875 | 441–467 | 0.0% / 100.0% |
| 23 | 3616741829 | Ember | destroyed | 19.6 min | 949–1049 | 399–465 | 0.0% / 92.7% |
| 24 | 3158272224 | Cobalt ↺ | destroyed | 19.8 min | 984–1053 | 429–439 | 81.5% / 0.0% |
| 25 | 3366555164 | Ember ↺ | destroyed | 15.6 min | 751–717 | 390–372 | 0.0% / 38.4% |
| 26 | 296651966 | Ember ↺ | destroyed | 18.6 min | 951–1042 | 475–459 | 0.0% / 6.7% |
| 27 | 1432145215 | Cobalt | destroyed | 16.1 min | 826–800 | 507–429 | 2.3% / 0.0% |
| 28 | 537376853 | Cobalt | destroyed | 19.2 min | 1069–899 | 434–405 | 93.0% / 0.0% |
| 29 | 3297926332 | Cobalt ↺ | destroyed | 15.5 min | 791–867 | 419–501 | 98.3% / 0.0% |
| 30 | 3848499322 | Cobalt | destroyed | 15.2 min | 883–745 | 511–443 | 18.1% / 0.0% |

↺ = comeback (winner trailed in kills at minute 10).
