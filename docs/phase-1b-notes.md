# Phase 1b notes: FOBs, destructible nodes, new resources, pings

## The loop

1. **Take nodes.** Seven asteroid nodes sit mid-map. A neutral node is captured with the meter as
   before. Once held it gets 6,000 hull and can't be pushed back: the enemy has to destroy it, wait
   out a 20 s lockout, then capture it from neutral. Held nodes repair themselves slowly (0.5%/s
   after 8 s without damage); Engineers with Field Repairs (T4) patch them with Repair Pulse.
2. **Break the FOBs.** Each team has two FOB space stations (20,000 hull, two turrets) between its
   mothership and the nodes. FOBs stay destroyed.
3. **Kill the mothership.** It is shielded (takes no damage) while either of its FOBs stands.
   Destroying it wins. At the time limit VP = mothership damage dealt + 15 per enemy FOB destroyed
   + 3 per node held.

FOBs and motherships both have healing auras for friendly ships. Ships can respawn at a standing
FOB (death screen, or bots near their job), except within 10 s of the FOB taking damage.

## Resources (`content/match.ts`, `content/command.ts`)

Paid once a minute: each node +10 of its own resource, each standing FOB +20 of every resource.
The center node is a **Research Lab**: it pays no resource, and its holder earns +25% XP (tiers
come faster).
Teams start with 40 of each; the bank caps at 500.

| Resource | Building | Buys |
|---|---|---|
| Munitions | Weapons factory (West/East Arsenal) | Orbital Strike, Recon Sweep, Defense Platform, Fleet Overcharge |
| Fuel | Fuel refinery (West/East Refinery) | Defense Drones, Bomber Wing, Interceptor Wing, Recon Drones |
| Manpower | Training camp (North/South Camp) | Forward Beacon, Rapid Deployment, Rally Order, Hull Reinforcement |

Order costs were rescaled to the per-minute economy (15–90). Signal Jam was dropped to keep twelve
orders on the 1–9, 0, -, = keys. New drone wings: bombers (go after structures, nodes and
deployables near the target), interceptors (hunt ships and drones), recon drones (1,600 u of vision).
Rapid Deployment halves the team's respawn times for 60 s.

## Pings

Right-click on the war map (no order armed) drops a free ping. It snaps to a node or structure within
700 u: enemy or open node/structure = Attack, our own = Defend, empty space = Move. Teammates see it
in the world, on the minimap and in the feed. Bots: a node ping sends the nearest 20% of skirmishers
there and weights that node ×3 for 25 s; an attack ping on an enemy structure starts the next push now.

## Sieges (tuned so matches end)

- **FOBs**: 30,000 hull, two turrets (22 dmg / 0.24 s, 750 u).
- **Salvage beacons**: destroying an enemy FOB leaves the attackers a permanent spawn beacon at the
  wreck (5,000 hull, until the defenders destroy it). This was the missing piece: attackers used to
  respawn ~16 km away while defenders respawned beside their mothership.
- **Exposed mothership** (both FOBs down): its heal aura runs at 30% and its team respawns at ×2.
- **Pushes**: the first waits until minute 5–6, then every 110–150 s (×0.6 once the enemy
  mothership is exposed, with 65% of the fleet). A wave gathers at its staging point until 70% has
  arrived (60 s cap) and goes in together. Assaulters commit (no retreating), keep shooting the
  objective unless an enemy is within 220 u, and rejoin the push if they respawn while it's on.
- **Defense**: the Defend job guards whichever structure is most threatened (mothership or an FOB),
  not just the mothership.
- Skirmishers shoot down enemy-held nodes at their job point; bots avoid enemy turret ranges unless
  assaulting that structure.

## Fixes found along the way

- Commander orders and pings issued between ticks had their events wiped by the next tick; they are
  now queued on the world and run in step 1.
- The client dropped events (kill feed lines included) from snapshots that arrived between two
  frames; undrawn snapshots now carry their events forward.

## Harness (30 matches, 60 v 60, seed 1)

- **Every match ended with a mothership destroyed.** Median length 27.3 min (target 20–30), side
  win rate 50%, comebacks 47%, average tier at the end 4.4.
- FOBs destroyed per match: 3.4 of 4. Node flips: 58 per match.
- Class kill share 12–23% (Lancer slightly high at 22.9%).
- 100 v 100 tick: mean 0.54 ms, p99 1.67 ms.
