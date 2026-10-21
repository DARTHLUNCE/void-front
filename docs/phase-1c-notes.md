# Phase 1c notes: hull classes

The six role classes were replaced by nine hull classes on a size ladder, after the naval
classification in Templin Institute's "Building Your Interstellar Navy". Titans are the motherships.
Only Titans (Fleet Command call-ins) and Carriers launch **starships** (the code still calls them
drones internally: `Drone`, `DroneBehavior`, `drone*` stats).

## Roster (`content/classes/`)

| Class | Radius | Hull | Speed | Turn | Respawn | Team cap | Kit |
|---|---|---|---|---|---|---|---|
| Patrol Craft | 13 | 125 | 360 | free | ×0.8 | — | Momentum + Phase Dash (old Interceptor) |
| Corvette | 16 | 140 | 335 | free | ×0.9 | — | Ghost Drive + Ambush (old Phantom) |
| Frigate | 20 | 220 | 270 | free | ×1.0 | — | Field Engineer + Repair Pulse (old Engineer) |
| Destroyer | 24 | 260 | 280 | 258°/s | ×1.05 | — | **new**: Point Defense + Torpedo Salvo |
| Cruiser | 30 | 360 | 245 | 195°/s | ×1.15 | 20% | **new**: Lock-On + Shield Battery |
| Battlecruiser | 34 | 420 | 265 | 172°/s | ×1.25 | 12% | **new**: Momentum + Afterburner ram |
| Battleship | 40 | 560 | 195 | 138°/s | ×1.4 | 10% | Heat + Bulwark (old Dreadnought) |
| Dreadnought | 48 | 700 | 170 | 80°/s | ×1.6 | 5% | Spinal Cannon charge shot + Rail Beam (old Lancer) |
| Carrier | 44 | 520 | 190 | 115°/s | ×1.5 | 10% | Starship Bay + Launch Swarm |

- Every class is open at spawn. Tradeoffs: bigger hulls have more hull and heavier guns but less
  speed, slower acceleration (`ShipClass.accel`), a turret turn limit (`turnRate`), a bigger target,
  and slower respawns (`respawnMul`). Caps are `teamCapFrac` of the fleet (min 1).
- Bots roll classes by `BOT_CLASS_WEIGHTS` within the caps and leave one slot of every capped class
  per human on their team, so a player can always pick any class at the start.
- The three new kits are 30 new nodes built from existing primitives (torpedoes are homing
  `projectiles`, Flak Screen and EMP Torpedo are `pulse`es, Fleet Shield is a `selfStatus` +
  `pulse`, Jump Strike is `teleport` + `projectiles`...). New quirks: `pointDefense` (shoot down an
  enemy missile or hit a starship within 320 u twice a second) and `lockOn` (up to +25% damage
  while firing without a break).
- The old Engineer T4 "Rapid Rebuild" stays Field Repairs; Phantom decoys stay decoys (holograms,
  not starships).

## Art

- Existing hulls were renamed to their new classes and scaled per class (`CLASS_SCALE` in
  `art/hulls.ts`): Patrol Craft ~40 u long up to the ~170 u Dreadnought and ~130 u Carrier. The
  Titan is ~600 u.
- Nine new hulls in `art/lineHulls.ts`: Destroyer (Hunter-Killer, Escort), Cruiser (Strike Cruiser,
  Command Cruiser), Battlecruiser (Raider, Ironclad). All 27 pass the connectivity and silhouette
  tests. `docs/art/ship-lineup.png` is regenerated.

## Harness (30 matches, 60 v 60, seed 1)

- 29 of 30 matches end with a Titan destroyed; median 24.7 min; Cobalt 56.7% (noise at n = 30).
- Kills per ship by class, relative to the average ship: 0.64× (Carrier) to 1.44× (Destroyer).
  Dreadnoughts trade best (K/D 3.1) but only 3 per 60-ship team; Patrol Craft trade worst (K/D 0.53).
- FOB hull raised to 36,000 to keep match length on target with the heavier hulls.
- 100 v 100 tick: mean 0.57 ms, p99 1.91 ms.
