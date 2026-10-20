import { tickAbility, tryCast, type CastContext } from './systems/abilities';
import { aimAndFire, stepProjectiles } from './systems/combat';
import { collectCrystals, rebuildCrystalHash, seedCrystals, spawnCrystals } from './systems/crystals';
import { runDirectors } from './systems/director';
import { updateMatch } from './systems/match';
import { moveShips, rebuildShipHash, resolveCollisions } from './systems/movement';
import { botAim, steer, think } from './systems/pilot';
import { processRespawns, regenHull, resolveDeaths, respawnShip, spendStatPoint } from './systems/progression';
import { fireTurrets, structureAuras } from './systems/structures';
import { tickStatuses } from './systems/status';
import { updateVision, VISION_EVERY } from './systems/vision';
import { DT, World, type WorldOptions } from './world';

/** Build a world and put it in its t = 0 state: ships spawned, crystal field seeded. */
export function createWorld(opts: WorldOptions): World {
  const w = new World(opts);
  for (const s of w.ships) respawnShip(w, s);
  w.eventCount = 0;
  seedCrystals(w);
  rebuildShipHash(w);
  rebuildCrystalHash(w);
  updateVision(w);
  return w;
}

const castCtx: CastContext = { cursorX: 0, cursorY: 0, targetSlot: -1 };

/** Advance the world one fixed 30 Hz tick, in the order SPEC "Simulation tick" defines. */
export function step(w: World): void {
  if (w.match.over) return;
  w.tick++;
  w.time = w.tick * DT;
  w.eventCount = 0;

  // 1. Inputs and decisions. Bots write the same ShipInput humans do.
  for (const s of w.ships) {
    if (s.input.statPick >= 0) {
      spendStatPoint(s, s.input.statPick);
      s.input.statPick = -1;
    }
  }
  runDirectors(w);
  for (const s of w.ships) {
    if (!s.alive || !s.bot) continue;
    if (w.time >= s.bot.nextThink) think(w, s);
    steer(w, s);
  }

  // 2. Move everything, then collisions and separation.
  moveShips(w);
  resolveCollisions(w);

  // 3. Only now aim, fire and use abilities (fairness rule: all ships have moved).
  for (const s of w.ships) {
    if (!s.alive) continue;
    if (s.bot) botAim(w, s);
    aimAndFire(w, s);
    if (s.input.ability && !s.input.cruise) {
      castCtx.cursorX = s.input.cursorX;
      castCtx.cursorY = s.input.cursorY;
      castCtx.targetSlot = s.bot ? s.bot.targetShip : -1;
      tryCast(w, s, s.signature, castCtx);
    }
  }
  fireTurrets(w);

  // 4. Projectiles and hits.
  stepProjectiles(w);

  // 5. Statuses, regen, cooldowns, crystals, deaths, XP, respawns.
  for (const s of w.ships) {
    if (!s.alive) continue;
    tickStatuses(w, s, DT);
    regenHull(w, s, DT);
    tickAbility(s, s.signature);
  }
  collectCrystals(w);
  resolveDeaths(w);
  processRespawns(w);

  // 6. Structures and the crystal field. (Phase 1: points, FOBs, shields, resources, command.)
  structureAuras(w);
  spawnCrystals(w);
  rebuildCrystalHash(w);

  // 7. Match state.
  if (w.tick % VISION_EVERY === 0) updateVision(w);
  updateMatch(w);

  // 8. Events were emitted into w.events during the tick; readers consume them before the next step.
}
