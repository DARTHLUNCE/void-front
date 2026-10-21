# Phase 1a notes: economy, classes, capture points, Fleet Command

## What changed

- **Six classes, all 60 nodes.** Every class in `content/classes/` is playable with its full five-tier
  tree. Every node is data built from primitives in `sim/systems/abilities.ts` (dash, teleport,
  projectiles, beam, pulse, zone, strike, summon, deploy, selfStatus, tether, droneOrder, teamBuff,
  rally, repairMothership). Per-class behavior lives only in the quirks (`sim/systems/quirks.ts`).
- **Two currencies** (`content/progression.ts`, `sim/systems/progression.ts`):
  - **Shards** from crystals and wreck loot buy stat upgrades (Weapons, Hull, Engines, Reactor, 7
    levels each). Costs climb per level: 12, 18, 26, 36, 50, 68, 90. The tier-3 hull swap resets
    upgrades and their costs, with no refund.
  - **XP** buys tiers: 150, 350, 650, 1,050, 1,600. XP comes from kills (40 + 15 per victim tier,
    ×1.6 bounty two tiers up), damage dealt, healing allies, pushing a capture meter, flipping a
    point, and holding or killing on a contested point you own.
  - **Rank = tiers owned.** Levels and stat points are gone. Respawn time is 5 s + 1.2 s per tier,
    max 11 s.
  - **Death** keeps 60% of unspent shards; the other 40% spills as loot crystals (12 each, 45 s life)
    where you died. Spent shards and all XP are kept.
- **Capture points** (`sim/systems/points.ts`): meter −100…+100, 450 u radius, 4 per second per ship
  (max 4 ships), engineers count double, cloaked ships count half and don't contest. Held points bank
  Alloy, Energy or Intel and give a team buff; three random hot zones double a point's income for 3 min.
  VP at the time limit now adds 3 per point held.
- **Fleet Commander** (`content/command.ts`, `sim/systems/command.ts`): one human per team, never
  spawns. Nine orders paid from the team bank, 30% off while holding 2 or fewer points. Teams start
  with 150 of each resource. No bot commanders.
- **Bots** pick a random class, buy tiers as soon as they can (50/50 per option) and spend shards by a
  per-bot weighting; they use all three ability slots by tag, target drones and decoys, release Lancer
  charge shots at full charge, heal allies as Engineers, weight points by who holds them, and answer
  Rally Orders.
- **Client**: class picker on load (1–7), tier pop-up (1/2), shard shop with costs, three ability
  slots, quirk gauges, point strip, death screen with shard loss and beacon spawn choice, and the
  commander's war map (free camera, order panel, click-to-target with footprint preview). The
  renderer draws every hull per ship, cloak, statuses, drones, decoys, deployables, zones, strikes,
  tethers and beams. Dev builds expose `game.grant(xp, shards, kill?)` in the console.
- **Tech tree** (`pnpm tech-tree`): an interactive planner. The stat deck is computed in the page by
  `loadoutDeck` (`sim/loadout.ts`), bundled from the shared package.

## Design calls

- Loot spills as crystals anyone can pick up, so a death feeds the killer's side and the shards can be
  recovered.
- Rapid Rebuild (Engineer T4 A) is dormant until FOBs exist.
- The commander sees what their team sees; Recon Sweep reveals cloaked ships unless they took Sensor
  Ghost.
- Single self-cast deployables (turret kit, beacons) land just behind the ship. Dropped on top of it,
  they soaked every shot aimed at the ship.

## Harness (12 matches, 60 v 60, seed 1)

- 72 point flips per match, tier options picked 41–59%, average rank 4.1 at the end.
- Class kill share per ship: 14–23% (Phantom high at 23%).
- Sim tick 100 v 100: mean 0.40 ms, p99 0.95 ms.
- Still open: no match ends by mothership destruction (all reach the 35-minute limit, motherships at
  100%). This was already true in Phase 0 and needs FOBs and the push rework.
