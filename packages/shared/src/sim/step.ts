import { tickAbility, tryCast } from './systems/abilities';
import { aimAndFire, damageShip, stepProjectiles } from './systems/combat';
import { buyUpgrade, issueCommand, issuePing } from './systems/command';
import { collectCrystals, rebuildCrystalHash, seedCrystals, spawnCrystals } from './systems/crystals';
import { runDirectors } from './systems/director';
import { countOwnedDrones, rebuildDroneHash, stepDrones } from './systems/drones';
import { updateMatch } from './systems/match';
import { applyAuras, moveShips, rebuildShipHash, resolveCollisions } from './systems/movement';
import { botAim, steer, think } from './systems/pilot';
import { updatePoints } from './systems/points';
import { buyStat, buyTier, processRespawns, regenHull, resolveDeaths, respawnShip } from './systems/progression';
import { quirkOf } from './systems/quirks';
import { fireTurrets, structureAuras } from './systems/structures';
import { statusMagnitude, tickStatuses } from './systems/status';
import { updateVision, VISION_EVERY } from './systems/vision';
import { stepDeployables, stepZones } from './systems/zones';
import { DT, World, type Ship, type WorldOptions } from './world';

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

/** Advance the world one fixed 30 Hz tick, in the order SPEC "Simulation tick" defines. */
export function step(w: World): void {
  if (w.match.over) return;
  w.tick++;
  w.time = w.tick * DT;
  w.eventCount = 0;

  // 1. Inputs and decisions. Bots write the same ShipInput humans do; queued Fleet Command
  //    orders and pings run here.
  for (const s of w.ships) {
    const inp = s.input;
    if (inp.statPick >= 0) {
      buyStat(s, inp.statPick);
      inp.statPick = -1;
    }
    if (inp.tierPick >= 0) {
      buyTier(w, s, inp.tierPick);
      inp.tierPick = -1;
    }
  }
  for (const order of w.pendingOrders.splice(0)) issueCommand(w, order);
  for (const ping of w.pendingPings.splice(0)) issuePing(w, ping.team, ping.x, ping.y);
  for (const u of w.pendingUpgrades.splice(0)) buyUpgrade(w, u.team, u.seat, u.base, u.track, u.option);
  runDirectors(w);
  for (const s of w.ships) {
    if (!s.alive || !s.bot) continue;
    if (w.time >= s.bot.nextThink) think(w, s);
    steer(w, s);
  }

  // 2. Move everything, then collisions and separation.
  moveShips(w);
  resolveCollisions(w);
  rebuildDroneHash(w);

  // 3. Only now aim, fire and use abilities (fairness rule: all ships have moved).
  for (const s of w.ships) {
    if (!s.alive) continue;
    if (s.bot) botAim(w, s);
    aimAndFire(w, s);
    const inp = s.input;
    if (inp.cruise) continue;
    const target = s.bot ? s.bot.targetShip : -1;
    if (inp.ability && !inp.brake) tryCast(w, s, s.signature, target);
    if (inp.ultimate && s.ultimate) tryCast(w, s, s.ultimate, target);
    if (inp.extra && s.extra) tryCast(w, s, s.extra, target);
  }
  fireTurrets(w);
  stepDeployables(w);

  // 4. Projectiles, drones, zones and strikes.
  stepProjectiles(w);
  stepDrones(w);
  stepZones(w);

  // 5. Statuses, regen, cooldowns, quirks, auras, crystals, deaths, rewards, respawns.
  const drones = countOwnedDrones(w);
  for (const s of w.ships) {
    if (!s.alive) continue;
    tickStatuses(w, s, DT);
    bleed(w, s);
    regenHull(w, s, DT, drones[s.slot]);
    tickAbility(w, s, s.signature);
    tickAbility(w, s, s.ultimate);
    tickAbility(w, s, s.extra);
    quirkOf(s).tick?.(w, s);
  }
  applyAuras(w);
  collectCrystals(w);
  resolveDeaths(w);
  processRespawns(w);

  // 6. Structures, capture points and resources, the crystal field.
  structureAuras(w);
  updatePoints(w);
  spawnCrystals(w);
  rebuildCrystalHash(w);

  // 7. Match state.
  if (w.tick % VISION_EVERY === 0) updateVision(w);
  updateMatch(w);

  // 8. Events were emitted into w.events during the tick; readers consume them before the next step.
}

/** Bleed: magnitude is damage per second (stacks add), credited to whoever last hit the ship. */
function bleed(w: World, s: Ship): void {
  const dps = statusMagnitude(s, 'bleed');
  if (dps > 0) damageShip(w, s, dps * DT, s.lastHitBy);
}
