# Building Void Front

How to set up the repo, run the game, build it for the web, and run the tests, balance harness and art
tools. For what the game is and how it plays, see the [README](README.md).

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| [Node.js](https://nodejs.org) | 20 or newer | Everything |
| [pnpm](https://pnpm.io) | 9.15.0 (pinned in `package.json`) | Installing and running scripts |
| [Git](https://git-scm.com) | any | Cloning |
| Python 3 with NumPy and Pillow | any recent | Only for rebuilding sprite atlases |
| A browser with WebGL 2 | Chrome, Edge, Brave, Firefox | Playing |

You don't need pnpm installed globally. Either run it through npx (`npx --yes pnpm@9.15.0 …`) or let
Node's corepack provide the pinned version:

```bash
corepack enable
```

## Get the code

```bash
git clone https://github.com/DARTHLUNCE/void-front.git
cd void-front
pnpm install
```

## Run it locally

```bash
pnpm dev
```

This starts Vite on **http://localhost:5173**. The port is fixed (`strictPort`), so close anything else
using 5173 first.

How reloading works:

- Edits to the client hot-reload in place.
- Edits to `packages/shared`, `src/worker.ts` or `src/protocol.ts` trigger a full page reload. The page
  and the simulation worker always need the same build of the sim, so those files never hot-swap.

## Production build

```bash
pnpm build
```

This writes a static site to `packages/client/dist/`. It is about 60 MB, almost all of it the sprite
atlases in `ship-test/`. The build includes three pages:

| Page | What it is |
|---|---|
| `index.html` | The game |
| `ship-test.html` | The sprite gallery |
| `zoom-check.html` | The camera zoom check |

The other dev pages are only served by `pnpm dev`. To add one to the build, add its HTML file to
`build.rollupOptions.input` in `packages/client/vite.config.ts`.

To serve the build locally, run:

```bash
pnpm --filter @void-front/client preview
```

### Hosting the build

The game is a fully static site. The whole simulation runs in the browser in a Web Worker, so any static
host works, including Netlify, Cloudflare Pages and Vercel. Upload `packages/client/dist/` as is.

> **Serve it from the root of a domain.** The game loads its sprite atlases from absolute paths like
> `/ship-test/…`. A sub-path such as a GitHub Pages project site (`username.github.io/void-front/`)
> breaks those paths until the loaders are switched to use Vite's `import.meta.env.BASE_URL`.

## Checks

Run all three before pushing:

| Command | What it does |
|---|---|
| `pnpm typecheck` | Type-checks every package (`tsc -p` in each) |
| `pnpm test` | Runs every `packages/*/src/**/*.test.ts` with Vitest |
| `pnpm test:watch` | Runs Vitest in watch mode |

The tests cover:

- **Sim and combat:** deterministic simulation, combat math, the economy and progression, and the bot AI.
- **Client:** HUD state, render helpers and input.
- **Fairness:** a mirrored-map test that requires both teams to start in exact mirror positions.

## Balance harness

The harness plays bot-only matches headlessly in Node, spread across CPU cores, and writes a report:

```bash
pnpm harness --matches 20 --fleet 60 --seed 1
```

| Flag | Default | Meaning |
|---|---|---|
| `--matches` | 30 | Matches to play |
| `--fleet` | 60 | Ships per side |
| `--seed` | 1 | Base seed. Each match gets its own seed from it, so runs are reproducible. |
| `--workers` | CPU cores − 1 | Parallel worker threads |
| `--out` | `reports` | Output folder for `latest.md` and the JSON results |
| `--no-bench` | (bench on) | Skip the 60 v 60 tick-time benchmark |

The report scores each run against balance targets:

- Side win rate
- Match length
- Matches reaching the time limit
- Comebacks
- Kills per ship for each class
- Tier option pick rates
- Node flips
- Sim tick time

`reports/*.json` is git-ignored.

## Content and data

All game tuning lives as data in `packages/shared/src/content/`: classes, tiers, weapons, orders,
economy, the map and score. Change a number there and the sim, the HUD, the bots and the harness all
pick it up.

Two pages show the tech tree:

- The in-game Tech Tree tab is `packages/client/public/tech-tree-v2.html`.
- The standalone build planner is generated from the content data:

  ```bash
  pnpm tech-tree     # rewrites docs/tech-tree.html
  ```

## Art pipeline

Ship, station and shard sprites are atlases in `packages/client/public/ship-test/`. Each atlas has
these maps:

- Cutout albedo
- Team-paint mask
- Packed normal map
- Relief derived from the normals
- Packed roughness / metallic / emissive map

Rebuild them with the Python tools, run from the repo root (they need NumPy and Pillow):

```bash
python tools/prepare-reference-sprites.py
python tools/prepare-remaining-sprites.py
python tools/prepare-world-assets.py
python tools/refine-paint-masks.py
python tools/normal_to_height.py packages/client/public/ship-test packages/client/public/ship-test/remaining packages/client/public/ship-test/props packages/client/public/ship-test/shards
python tools/pack-material-maps.py
python tools/test_normal_to_height.py
```

Details on the map formats are in [docs/reference-sprite-test.md](docs/reference-sprite-test.md).

### Regenerating the README ship lineup

1. With `pnpm dev` running, open **http://localhost:5173/inspect.html?lineup=1**. When the tab title
   reads "lineup saved", `packages/client/.inspect/lineup.png` has been written.
2. Shrink it to 2400 px wide and save it as `docs/art/ship-lineup.jpg`.

### Dev pages

While `pnpm dev` runs, these pages each test one visual system:

| Page | What it checks |
|---|---|
| `inspect.html`, `ship-test.html` | Hull and sprite review |
| `pbr-check.html` | Material response |
| `lighting-check.html`, `asset-lighting-check.html`, `camera-lighting-check.html` | Lighting |
| `ship-shadow-check.html` | Hull shadows |
| `ability-check.html`, `impact-check.html`, `vfx-motion-check.html` | Ability, impact and trail VFX |
| `sublight-check.html` | The Sub-Light lens |
| `zoom-check.html` | Camera zoom |
| `remaining-ships.html`, `remaining-assets.html` | Art coverage |

## Tuning performance

Lighting is the expensive part. The knobs are in `LIGHT_QUALITY` at the top of
`packages/client/src/render/lighting.ts`: light-buffer resolution, cascade traces, hull-on-hull shadows
and lights per tile. The defaults favor ordinary GPUs. In game:

- **L** toggles lighting.
- Settings → Performance readout shows the frame rate and sim time in the corner.

## Repo layout

```
packages/
  shared/    simulation, content data, protocol (pure TypeScript, deterministic)
  client/    PixiJS v8 renderer, HUD, menus, input; the sim runs in src/worker.ts
  harness/   headless bot matches and balance reports
  server/    multiplayer stub: proves the sim runs headless at 30 Hz in Node
tools/       Python sprite and material tools
docs/        design spec, AI notes, art pipeline, phase notes, screenshots
reports/     harness output
```

## Multiplayer server (stub)

```bash
pnpm --filter @void-front/server start
```

This only runs a headless 30 Hz room. It has no networking yet. Online play (WebSocket rooms, interest
management and bot backfill) is planned and not yet built.
