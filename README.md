# Void Front

A browser team space shooter. Two fleets of up to 100 ships fight across a large map; you fly one of
them alongside bots that fill every empty slot. Shoot, farm crystals, level up, spend stat points, and
push for the enemy mothership.

![All ship hulls at true relative scale](docs/art/ship-lineup.png)

**Status: Phase 0 prototype.** You can play offline against bots as the Interceptor. The other five
classes, the upgrade tree, capture points, forward bases and multiplayer come in later phases. See
[docs/SPEC.md](docs/SPEC.md) for the full design and [docs/phase-0-notes.md](docs/phase-0-notes.md)
for what's built so far.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/DARTHLUNCE/void-front.git
cd void-front
npx --yes pnpm@9.15.0 install
npx --yes pnpm@9.15.0 dev
```

Open http://localhost:5173, pick a fleet size and enemy difficulty, and press **Launch**.

If you have pnpm installed (`corepack enable` sets it up), plain `pnpm install` and `pnpm dev` work too.

## Controls

| Action | Mouse steering (default) | WASD mode |
|---|---|---|
| Move | Point where you want to go | W A S D |
| Fire | Hold left click | Hold left click |
| Phase Dash | Right click | Right click |
| Cruise drive | Hold Shift | Hold Shift |
| Stat points | Q W E R | Z X C V |
| Auto-fire | X | F |
| Scoreboard / map | Tab / M | Tab / M |
| Lighting on/off | L | L |

You fly for Cobalt (blue). Destroy the Ember mothership on the far right of the map.

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
| `pnpm tech-tree` | Rebuild `docs/tech-tree.html` from the ship art |

Hull art can be reviewed at http://localhost:5173/inspect.html while `pnpm dev` is running.
Project conventions are in [docs/CLAUDE.md](docs/CLAUDE.md).
