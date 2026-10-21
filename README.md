# Void Front

A browser team space shooter. Two fleets of up to 100 ships fight across a large map; you fly one of
them alongside bots that fill every empty slot. Pick one of six classes (or command the fleet from the war
map), take capture points, earn XP and shards, and push for the enemy mothership.

![All ship hulls at true relative scale](docs/art/ship-lineup.png)

**Status: offline prototype.** All six classes with their full five-tier trees, the shard/XP economy,
capture points with resources, and the Fleet Commander role are playable offline against bots. Forward
bases and multiplayer come later. See [docs/SPEC.md](docs/SPEC.md) for the full design and the phase
notes in [docs/](docs/) for what's built so far.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/DARTHLUNCE/void-front.git
cd void-front
npx --yes pnpm@9.15.0 install
npx --yes pnpm@9.15.0 dev
```

Open http://localhost:5173, pick a fleet size and enemy difficulty, and press **Launch**. Then choose a
class (keys 1–6) or the Fleet Commander seat (7).

If you have pnpm installed (`corepack enable` sets it up), plain `pnpm install` and `pnpm dev` work too.

## Controls

| Action | Mouse steering (default) | WASD mode |
|---|---|---|
| Move | Point where you want to go | W A S D |
| Fire | Hold left click | Hold left click |
| Signature ability | Right click | Right click |
| Ultimate (tier 5) | Space | Space |
| Extra ability (some tier nodes) | G | G |
| Cruise drive | Hold Shift | Hold Shift |
| Buy stat upgrades (shards) | Q W E R | Z X C V |
| Pick a tier (XP) when the pop-up shows | 1 / 2 | 1 / 2 |
| Auto-fire | X | F |
| Scoreboard / map | Tab / M | Tab / M |
| Lighting on/off | L | L |

You fly for Cobalt (blue). Win by destroying the Ember mothership on the far right of the map. It is
shielded until both of Ember's FOBs (the space stations in front of it) are destroyed. Take the
asteroid nodes in the middle for resources (the Research Lab in the center gives +25% XP instead): a
node someone holds has to be shot down, then sits locked for 20 s before it can be captured again.
Destroying an enemy FOB leaves you a salvage beacon to respawn at. FOBs and motherships heal friendly
ships nearby. Bot matches run about 20–35 minutes.

**Economy.** Shards (crystals and wreck loot) buy stat upgrades; each level costs more, and upgrades reset
when tier 3 swaps your hull. XP from kills, damage, healing and capturing or defending points buys tiers.
Dying drops 40% of your unspent shards as loot; XP and anything you bought are kept.

**Fleet Commander.** One human per team can take the commander seat instead of a ship: pan the war map
(WASD, arrows, screen edge, wheel to zoom), right-click to ping targets for free, and spend what your
nodes and FOBs pay each minute on orders (keys 1–9, 0, -, =). Munitions (weapons factories) buy
strikes and recon, Fuel (refineries) buys drone wings, Manpower (training camps) buys spawn beacons
and reinforcements.

## For developers

The repo is a pnpm workspace:

- `packages/shared`: the simulation, content data and protocol. Pure TypeScript, deterministic and seeded.
- `packages/client`: the PixiJS renderer, HUD and input, with the sim running in a Web Worker.
- `packages/harness`: headless bot-only matches and balance reports.
- `packages/server`: a stub for later multiplayer work.

| Command | What it does |
|---|---|
| `pnpm dev` | Run the game locally |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm typecheck` | Type-check every package |
| `pnpm harness --matches 30 --fleet 60 --seed 1` | Simulate bot matches and write `reports/latest.md` |
| `pnpm tech-tree` | Rebuild `docs/tech-tree.html`, the interactive build planner |

Hull art can be reviewed at http://localhost:5173/inspect.html while `pnpm dev` is running.
Project conventions are in [docs/CLAUDE.md](docs/CLAUDE.md).
