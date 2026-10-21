# Void Front — conventions for Claude Code

Read `docs/SPEC.md` before changing gameplay. These rules exist so the same sim runs in the
browser worker, on the server and in the harness, and so 60 upgrade nodes stay buildable.

## Package boundaries

- `packages/shared` is pure TypeScript. No DOM, no Node APIs, no `Math.random`, no `Date`,
  no `performance`, no timers. Its tsconfig has `lib: ["ES2022"]` and `types: []` so DOM/Node
  usage fails to typecheck, and `src/purity.test.ts` greps for the forbidden calls.
- `packages/client` owns rendering (PixiJS), DOM HUD, input and the offline Web Worker.
- `packages/server` owns rooms, sockets and interest management (Phase 4).
- `packages/harness` owns headless runs and balance reports. Wall-clock timing lives here,
  never in the sim.
- Client and server only exchange inputs and snapshots. Every game rule lives in `shared`.

## Content is data

- All classes, abilities, statuses, structures, maps, crystals, progression numbers and bot
  tuning live in `packages/shared/src/content` as typed data. Rebalancing = editing data.
- **No one-off ability code.** An ability is `AbilityDef.steps: PrimitiveDef[]`, run in order by
  the primitive registry in `sim/systems/abilities.ts`. If a node can't be expressed, add or
  extend a *primitive* (with a test), never a special case keyed on an ability id.
- Passives are `ModifierDef`s; conditions are `ConditionId`s resolved by one registry.
- Quirks (one per class) are the only per-class code: `sim/systems/quirks.ts`, numbers from
  `content/quirks.ts`.
- The schema types in `content/types.ts` follow the SPEC contract. Extending them is fine;
  bypassing them is not. Extensions are marked `// ext:` with a reason.

## Determinism

- All randomness comes from `Rng` (`sim/rng.ts`). Each ship and each team director has its own
  stream derived from the match seed, so adding a ship never reshuffles everyone else.
- Same seed + same inputs = identical state (`hashWorld`). The determinism test runs 10,000 ticks.
- Iteration order must never decide an outcome between the two teams. Use "closest wins" with a
  slot tie-break (projectile hits, crystal pickups), accumulate-then-apply (separation), and
  resolve deaths after all hits in a tick.

## Tick order (30 Hz, `sim/step.ts`)

1. Inputs + Fleet Director + pilot brains (bots write the same `ShipInput` humans do)
   (shop picks `statPick`/`tierPick` apply first; Fleet Command orders are applied by the host
   between ticks with `issueCommand`)
2. Move every ship, collisions, separation
3. Aim, fire, abilities (signature, ultimate, extra) — **only after every ship has moved** (fairness rule)
4. Projectiles, drones, zones and orbital strikes (deployables fire in step 3)
5. Statuses and bleed, regen, cooldowns, quirk ticks, auras, crystals, deaths (shard loss, kill
   XP), respawns
6. Structures, capture points and resources, crystal field
7. Match state: pushes, win and time-limit checks
8. Events for clients

## Art and lighting (client)

- Ship and structure art is vector data in `packages/client/src/art` (`hulls.ts`, `props.ts`). The game
  bakes it to per-team albedo plus a generated normal map (`raster.ts`); the tech tree renders the
  same data to SVG (`pnpm tech-tree`).
- Hull rules, enforced by `art/art.test.ts`: one connected silhouette (no floating parts), no fully
  hidden shapes, outline overlap < 0.3 and fill overlap < 0.72 between any two hulls. Keep dark paint
  off the silhouette edge and bright paint small.
- Review art with `http://localhost:5173/inspect.html` (`?class=…&view=all`), or `?save=1` to write
  full-size sheets to `packages/client/.inspect/` (dev server only).
- Lighting (`render/lighting.ts`): ships use a normal-mapped shader lit by a fixed key light plus a
  2D radiance-cascades light field. Emitters are solid discs added in `Renderer.light()`; the
  mothership is an occluder. Keep it subtle: `uGI` and the overlay alpha are the two dials.
- Pixi 8.5 allocates resource-less render textures as RGBA8 regardless of `format`; float targets
  must be backed by a `BufferImageSource` (see `Lighting.resize`).

## Performance

- Entities live in fixed pools (`sim/pool.ts`); nothing is allocated per tick in the hot path.
- All spatial queries go through `SpatialHash` (512 u cells) with caller-owned result buffers.

## Workflow

- `pnpm test` (Vitest), `pnpm typecheck`, `pnpm harness --matches 30 --fleet 60 --seed 1`.
- Run the harness after every gameplay change and read the report in `reports/latest.md`.
- One phase per session. Don't start the next phase until the user says so.
- When the spec is ambiguous, pick the option that keeps content data-driven and note it in
  the phase summary.
