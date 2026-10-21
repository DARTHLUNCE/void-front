# Phase 0 notes

Status at end of Phase 0 (Oct 20, 2026). Harness report: `reports/latest.md` (30 matches, 60 v 60, seed 1).

## Built

- pnpm monorepo per SPEC "Repo layout", TS strict, Vitest (32 tests). `pnpm test`, `pnpm typecheck`,
  `pnpm harness`, `pnpm dev`.
- Shared sim: 30 Hz `step()` in SPEC tick order with the two-pass move-then-fire rule, `SpatialHash`
  (512 u, counting sort, no allocation), seeded `Rng` with per-ship and per-team streams, fixed `Pool`s.
- Content as data: Interceptor (hull, gun, Momentum quirk, Phase Dash), statuses, stat points,
  progression and snowball numbers, mothership, Kessler Reach map (points/FOBs as data), crystals, bot tuning.
- Ability primitive registry: dash, teleport, projectiles, pulse, selfStatus implemented; beam, zone,
  summon, deploy throw "Phase 1".
- Bots: Fleet Director (jobs, 15% defend minimum, 40% cap, push waves) + pilot brain (targeting, lead,
  aim-error spread, strafe, retreat, cruise, tag-driven ability use).
- Offline client: PixiJS renderer, sim in a Web Worker, interpolation, DOM HUD, minimap, scoreboard.
- Harness: parallel worker threads, JSON + Markdown report, 100 v 100 tick benchmarks.

## Deviations from SPEC

- **Prototype not in repo.** `docs/reference/void-front-prototype.html` was never added; game feel was
  built from the SPEC's description.
- **No shield in Phase 0.** No FOBs or points exist, so motherships are unshielded and VP counts only
  mothership damage.
- **Push waves gather first.** A push recruits and gathers at a staging point 4,500 u short of the enemy
  mothership for 30 s (`DIRECTOR.pushGather`), then attacks for 30 s. Assaulters stay committed until
  they die or retreat, because crossing the map takes longer than the 30 s push window.
- **Farm cap.** Farmers limited to 25% of a team (`DIRECTOR.farmCapFrac`); without it ~70% of bots
  farmed for most of the match because frequent deaths keep them under Lv 6.
- **Schema extensions** (marked `ext:`): `GunDef.barrelGap`, `AbilityDef.botTags`, `ShipClass.botRange`,
  `StructureDef`, `CapturePointDef.name/botValue`, `MapDef.name`. `ShipClass.tiers` is `TierDef[]`
  until Phase 1 adds node content.
- **Team-relative point order** (`World.pointMirror`): bots walk capture points in mirrored order so both
  teams make mirrored choices; the fairness test found the asymmetry.

## After Phase 0 review

- **Bot difficulty.** `BOT_SKILL` in `content/bots.ts` defines Easy / Normal / Hard (think rate, aim
  error, lead accuracy, reaction delay, burst fire). Skill never changes damage, hull or speed. The menu's
  difficulty sets the enemy fleet; allies fly at Normal. Hard is the SPEC spread and the harness default.
  Headless 10-minute matches: Normal gets 0.36× Hard's kills, Easy 0.08×.
- **Art.** `packages/client/src/art` holds renderer-agnostic vector art for all 18 hulls, the mothership,
  crystals and projectiles. The game bakes it into per-team textures; `pnpm tech-tree` renders the same
  art to SVG in `docs/tech-tree.html` (tier copy in `packages/client/scripts/techTreeData.ts` until
  Phase 1 adds real NodeDefs).

- **Ship redesign and lighting.** All 18 hulls redesigned around per-class silhouettes and checked
  for floating parts and look-alikes (`art.test.ts`), then inspected at full size and at game size.
  Hulls and motherships render through a normal-mapped shader; a quarter-resolution radiance-cascades
  pass lights them from shots, engines, explosions, crystals and mothership lights (L toggles it).

## Findings

- Mothership is unreachable in Phase 0: 30/30 matches hit the 35-min limit with ≥ 99.5% hull. Waves
  reach the turrets but defenders respawn next door and heal at 7%/s. Expected to be fixed by FOBs,
  points and jump gates (Phase 1).
- Combat is very lethal: about one death per ship per minute, average level at end ≈ 8. With 40% XP
  lost per death, tier 3 (Lv 12) is rare and tier 5 (Lv 25) is unreachable.
- Side bias: 36.7% Cobalt over 30 matches (seed 1) was noise; 60 more (seed 2) gave 50.8%.
- Performance: 100 v 100 p99 tick 0.77 ms (budget 12 ms). Projectile peak ~470 in a packed brawl.
