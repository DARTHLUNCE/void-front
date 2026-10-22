# Hull geometry authoring

Run from the repository root (Node dependencies and Python Pillow required):

```
node node_modules/tsx/dist/cli.mjs packages/client/scripts/hull-geometry/export-art.ts
python packages/client/scripts/hull-geometry/build.py
node node_modules/tsx/dist/cli.mjs packages/client/scripts/hull-geometry/export-world.ts
python packages/client/scripts/hull-geometry/build-world.py
```

`weapon-sockets.json` contains hand-authored primary, secondary and ordnance points.
`pixels` coordinates refer to the untouched source atlas; `vector` coordinates refer
to the original hull before HULL_CLASS_SCALE. On artwork without separate secondary
barrels, batteries reuse visible barrel/emitter sockets. Upgrades preserve shot counts.
The sprite itself is not an articulated turret; gun swivel changes shot direction at
the fixed pictured tip. Change socket coordinates here when art changes, then regenerate.

The builder uses the renderer's alpha crop (alpha > 12), pivot and world scale. Solid
alpha >= 128 is conservatively sampled on a roughly 64-cell grid; vector art uses its
coverage mask. Runs merge into compound rectangles (up to 65 per hull). Small gaps below
one cell can close; this is a close silhouette approximation, not per-pixel collision.

## Runtime choices

Single class circles caused empty-space hits and missed wings. A single convex hull
would still fill wing gaps. Per-pixel runtime tests are expensive and would make the
headless simulation depend on image decoding. Static compound rectangles preserve
large concavities and run in the shared simulation, with circle/AABB broad-phase checks.
Bullet and beam queries sweep their radius along the whole segment. Physical separation
uses a cached local-space bounding volume hierarchy (BVH). Non-touching branches are
skipped, and separation queries follow only the connected overlap along each candidate
face normal. Scratch buffers are reused rather than allocating a part-pair matrix.
The contact manifold is built once per tick; six cheap constraint iterations share it.
New contacts caused by positional repair are discovered on the next tick.

Relative closing velocity and inverse mass determine collision impulses. Mass scales
with class radius cubed; tangential sliding is preserved. Depenetration is capped and
does not become velocity, preventing crowded spawn overlaps from launching ships.
World structures, nodes and non-mine deployables are fixed obstacles. Drones/strike craft
have art-matched projectile/beam hit geometry but remain non-solid traffic, and mines
remain proximity triggers. Capture/aura ranges are unchanged. This is discrete linear
contact response at 30 Hz, not continuous ship collision or angular rigid-body dynamics.

WorldOptions.hullGeometry chooses `reference` (default, also neutral/team-painted art)
or `original`. Both teams use the same profile. The worker receives it at match start;
headless callers should pass the matching profile when comparing runs. Class radius
continues to control existing handling/range/balance calculations. The profiles cover 27 playable hulls and 17 world-object/craft assets per art mode.
The player sprite uses the same scale as its collision shape and muzzle sockets.

## Validation

Regression tests cover all 27 hulls in both profiles, primary/secondary/ability sockets,
angle-independent muzzle origins, fast hits, rounded bullet corners, empty silhouette
space, solid wings beyond the old radius, full overlaps, scenery and rotated world bounds.
The existing deterministic 10,000-tick and mirrored-team checks also pass.
Run the reproducible performance diagnostic from the repository root:

```
node node_modules/tsx/dist/cli.mjs packages/client/scripts/hull-geometry/benchmark.ts
```

Local headless samples averaged about 0.6 ms/tick with 60 ships and 1.4 ms/tick with
120 ships (1,200 measured ticks after 600 warmup ticks, seed 1234). A deliberately
overlapping 60-dreadnought test fell from roughly 577 ms to 11 ms per collision solve;
120 overlapping dreadnoughts took roughly 25 ms. These are CPU diagnostics, not live
browser FPS guarantees, and densely coincident fleets remain the expensive case.
An additional 3,000 seeded ship/world pair comparisons matched the prior exhaustive
solver to 1e-5, including 1,325 contacts. 543 regression tests pass.

Snapshots include a 24-bit layout fingerprint and length validation before decoding.
Development edits to the shared simulation or worker force a full page/worker reload.
This prevents a stale worker's projectile layout from being read by a newer renderer.
Browser access was unavailable during this change; live visual acceptance is pending.
