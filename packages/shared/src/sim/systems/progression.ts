import { BOT_TIER_PREFS, DIRECTOR } from '../../content/bots';
import { getClass, teamCap } from '../../content/classes/index';
import { COMMAND_RULES } from '../../content/command';
import { CRYSTALS } from '../../content/crystals';
import { RESOURCE_IDS, RESOURCE_INDEX } from '../../content/match';
import { ECONOMY, respawnTime, STAT_POINT_MAX, STAT_POINTS, statCost, tierCost } from '../../content/progression';
import { EXPOSED, FOB_SPAWN_BLOCK } from '../../content/structures';
import { HIGH_COMMAND } from '../../content/upgrades';
import type { ClassId, TeamId } from '../../content/types';
import { applyLoadout, statValue } from '../stats';
import { classCount, EventType, Job, SPAWN_AT_STRUCTURE, TIERS, type Ship, type Structure, type TeamState, type World } from '../world';
import { inOwnedPoint, pointBuff } from './points';
import { pushTarget } from './director';
import { quirkOf } from './quirks';
import { isExposed } from './structures';
import { applyStatus, clearStatuses } from './status';

/** Team behind on kills earns up to +60% XP and shards, full bonus at 160 kills behind. */
export function trailingBonus(w: World, team: TeamState): number {
  const gap = w.enemyOf(team.id).kills - team.kills;
  if (gap <= 0) return 0;
  return ECONOMY.trailingMaxBonus * Math.min(1, gap / ECONOMY.trailingFullGap);
}

export function grantXp(w: World, ship: Ship, amount: number): void {
  if (amount <= 0 || ship.commander) return;
  const gained = amount * statValue(ship, 'xpGain', 1) * (1 + pointBuff(w, ship.team, 'xpGain')) * (1 + trailingBonus(w, w.teams[ship.team]));
  ship.xp += gained;
  ship.xpEarned += gained;
  if (ship.isBot) botShop(w, ship);
}

export function grantShards(w: World, ship: Ship, amount: number): void {
  if (amount <= 0) return;
  ship.shards += amount * (1 + trailingBonus(w, w.teams[ship.team]));
  if (ship.isBot) botShop(w, ship);
}

/** Buy one level of a stat with shards. Costs climb per level. */
export function buyStat(ship: Ship, index: number): boolean {
  if (index < 0 || index >= STAT_POINTS.length) return false;
  const level = ship.statPoints[index];
  if (level >= STAT_POINT_MAX) return false;
  const cost = statCost(level);
  if (ship.shards < cost) return false;
  ship.shards -= cost;
  ship.statPoints[index]++;
  applyLoadout(ship);
  return true;
}

/**
 * Buy the next tier with XP, choosing option A (0) or B (1). The hull-change tier wipes stat
 * upgrades (and their climbing costs) back to zero: a new ship starts its upgrades fresh.
 */
export function buyTier(w: World, ship: Ship, option: number): boolean {
  if (option !== 0 && option !== 1) return false;
  const t = ship.tiersOwned;
  if (t >= TIERS || ship.xp < tierCost(t)) return false;
  ship.xp -= tierCost(t);
  ship.picks[t] = option;
  ship.tiersOwned++;
  if (ship.tiersOwned === ECONOMY.hullTier) ship.statPoints.fill(0);
  applyLoadout(ship);
  const node = ship.cls.tiers[t].options[option];
  w.stats.tierPicks[node.id] = (w.stats.tierPicks[node.id] ?? 0) + 1;
  w.emit(EventType.TierBought, ship.slot, t + 1, ship.x, ship.y, option);
  return true;
}

/** Switch class (picker or respawn screen): keeps shards and XP, clears tiers and stat upgrades. */
export function setClass(ship: Ship, classId: ClassId): void {
  ship.classId = classId;
  ship.cls = getClass(classId);
  ship.radius = ship.cls.radius;
  ship.picks.fill(-1);
  ship.tiersOwned = 0;
  ship.statPoints.fill(0);
  ship.maxHull = 0;
  ship.quirk.fill(0);
  applyLoadout(ship);
}

/** A docked human picks their class: they launch straight away. */
/** Returns false when the class is at its team cap (or the player is the commander). */
export function pickClass(w: World, ship: Ship, classId: ClassId): boolean {
  if (ship.commander) return false;
  if (classCount(w, ship.team, classId) >= teamCap(getClass(classId), w.fleetSize)) return false;
  setClass(ship, classId);
  ship.awaitingClass = false;
  respawnShip(w, ship);
  return true;
}

/** Bots buy tiers as soon as they can afford them, then spend shards by their stat weighting. */
export function botShop(w: World, ship: Ship): void {
  const b = ship.bot;
  if (!b) return;
  while (ship.tiersOwned < TIERS && ship.xp >= tierCost(ship.tiersOwned)) {
    const pref = BOT_TIER_PREFS[ship.classId]?.[ship.tiersOwned] ?? 0.5;
    buyTier(w, ship, ship.rng.next() < pref ? 0 : 1);
  }
  const weights = b.statWeights;
  for (let guard = 0; guard < 8; guard++) {
    let total = 0;
    for (let i = 0; i < weights.length; i++) if (ship.statPoints[i] < STAT_POINT_MAX && ship.shards >= statCost(ship.statPoints[i])) total += weights[i];
    if (total <= 0) return;
    let r = ship.rng.next() * total;
    let pick = -1;
    for (let i = 0; i < weights.length; i++) {
      if (ship.statPoints[i] >= STAT_POINT_MAX || ship.shards < statCost(ship.statPoints[i])) continue;
      pick = i;
      r -= weights[i];
      if (r < 0) break;
    }
    if (pick < 0 || !buyStat(ship, pick)) return;
  }
}

/** Step 5: anything at or below zero hull dies (after every hit this tick has landed). */
export function resolveDeaths(w: World): void {
  for (const s of w.ships) if (s.alive && s.hull <= 0) killShip(w, s);
}

export function killShip(w: World, victim: Ship): void {
  victim.alive = false;
  victim.hull = 0;
  victim.deaths++;
  const reinforced = w.time < w.teams[victim.team].reinforceUntil ? COMMAND_RULES.reinforceRespawnMul : 1;
  const exposed = isExposed(w, w.teams[victim.team].mothership) ? EXPOSED.respawnMul : 1;
  victim.respawnAt = w.time + respawnTime(victim.rank) * victim.cls.respawnMul * reinforced * exposed;
  victim.vx = 0;
  victim.vy = 0;
  victim.dashTime = 0;
  victim.cruising = false;
  victim.cruiseSpool = 0;
  quirkOf(victim).onDeath?.(w, victim);

  const enemyTeam = w.enemyOf(victim.team);
  enemyTeam.kills++;

  const credited = victim.lastHitBy >= 0 && w.time - victim.lastHitTime <= ECONOMY.killCreditWindow;
  const killer = credited ? w.ships[victim.lastHitBy] : null;
  if (killer && killer.team !== victim.team) {
    killer.kills++;
    const x = ECONOMY.xp;
    const bounty = victim.rank >= killer.rank + x.bountyRankGap ? x.bountyMul : 1;
    const defending = inOwnedPoint(w, killer.team, victim.x, victim.y) ? x.defendKillBonus : 0;
    grantXp(w, killer, (x.kill + x.killPerRank * victim.rank) * bounty + defending);
    applyKillEffects(w, killer);
    w.stats.killsByClass[killer.classId] = (w.stats.killsByClass[killer.classId] ?? 0) + 1;
  } else {
    w.stats.killsByClass.structure = (w.stats.killsByClass.structure ?? 0) + 1;
  }
  w.emit(EventType.Kill, killer ? killer.slot : -1, victim.slot, victim.x, victim.y);

  // Keep 60% of unspent shards; the rest spills as loot, less the killers' High Command tax
  // (Credits for base upgrades). Spent shards and XP are never lost.
  const lost = victim.shards * (1 - ECONOMY.deathShardKeep);
  victim.shards -= lost;
  victim.shardsLost = lost;
  const tax = lost * HIGH_COMMAND.killTax;
  enemyTeam.credits += tax;
  dropLoot(w, victim, lost - tax);
  victim.lastHitBy = -1;
}

function applyKillEffects(w: World, killer: Ship): void {
  for (const node of killer.nodes) {
    const k = node.onKill;
    if (!k) continue;
    if (k.resources) {
      const res = w.teams[killer.team].resources;
      for (const id of RESOURCE_IDS) res[RESOURCE_INDEX[id]] += k.resources[id] ?? 0;
    }
    if (k.ventHeat) quirkOf(killer).vent?.(killer);
    if (k.signatureCooldownMul !== undefined) killer.signature.cooldown *= k.signatureCooldownMul;
  }
}

function dropLoot(w: World, victim: Ship, amount: number): void {
  let left = Math.floor(amount);
  const sign = w.teamSign(victim.team);
  while (left > 0) {
    const c = w.crystals.alloc();
    if (!c) return;
    const value = Math.min(ECONOMY.lootCrystalValue, left);
    left -= value;
    const a = victim.rng.next() * Math.PI * 2;
    const d = victim.rng.next() * CRYSTALS.lootScatter;
    c.x = victim.x + sign * Math.cos(a) * d;
    c.y = victim.y + sign * Math.sin(a) * d;
    c.kind = 2;
    c.shards = value;
    c.radius = CRYSTALS.lootRadius;
    c.expires = w.time + CRYSTALS.lootLife;
  }
}

/** Step 5: bring back ships whose timer is up. */
export function processRespawns(w: World): void {
  for (const s of w.ships) if (!s.alive && !s.commander && !s.awaitingClass && w.time >= s.respawnAt) respawnShip(w, s);
}

export function respawnShip(w: World, s: Ship): void {
  if (s.commander || s.awaitingClass) return;
  const home = w.teams[s.team].mothership;
  const sign = w.teamSign(s.team);
  if (s.bot) s.spawnChoice = botSpawn(w, s);
  const fob = s.spawnChoice >= SPAWN_AT_STRUCTURE ? w.structures[s.spawnChoice - SPAWN_AT_STRUCTURE] : null;
  const beacon = s.spawnChoice >= 0 && !fob ? w.deployables.items[s.spawnChoice] : null;
  if (fob && canSpawnAt(w, fob, s.team)) {
    // FOBs launch ships from their enemy-facing side.
    const a = s.rng.range(-Math.PI / 2, Math.PI / 2);
    const d = fob.radius + 60 + s.rng.next() * 160;
    s.x = fob.x + sign * Math.cos(a) * d;
    s.y = fob.y + sign * Math.sin(a) * d;
  } else if (beacon && beacon.active && beacon.team === s.team && beacon.def.respawn) {
    const a = s.rng.next() * Math.PI * 2;
    const d = beacon.def.radius + 40 + s.rng.next() * 120;
    s.x = beacon.x + Math.cos(a) * d;
    s.y = beacon.y + Math.sin(a) * d;
  } else {
    // Spawn on the side of the mothership facing the enemy; offsets are mirrored per team.
    const a = s.rng.range(-Math.PI / 2, Math.PI / 2);
    const d = home.radius + 80 + s.rng.next() * 260;
    s.x = home.x + sign * Math.cos(a) * d;
    s.y = home.y + sign * Math.sin(a) * d;
  }
  s.x = Math.min(w.map.width - 40, Math.max(40, s.x));
  s.y = Math.min(w.map.height - 40, Math.max(40, s.y));
  s.vx = 0;
  s.vy = 0;
  s.angle = s.team === 0 ? 0 : Math.PI;
  s.thrustAngle = s.angle;
  s.ax = s.ay = s.angularVelocity = 0;
  s.engineForward = s.engineLateral = s.engineTorque = 0;
  s.input.aim = s.angle;
  applyLoadout(s);
  s.hull = s.maxHull;
  s.alive = true;
  s.fireCooldown = 0;
  s.dashTime = 0;
  s.cruiseSpool = 0;
  s.cruising = false;
  s.lastDamageTime = -99;
  s.lastHitBy = -1;
  s.signature.reset();
  s.ultimate?.reset();
  s.extra?.reset();
  clearStatuses(s);
  quirkOf(s).reset?.(w, s);
  const b = s.bot;
  if (b) {
    b.retreating = false;
    b.targetShip = -1;
    b.targetDrone = -1;
    b.targetStructure = -1;
    b.nextThink = w.time;
    b.farmer = s.rank < DIRECTOR.farmBelowRank && s.rng.chance(DIRECTOR.farmChance);
    // Assaulters who die rejoin the push if it's still on, otherwise go back to skirmishing.
    if (b.job === Job.Assault && w.time >= w.teams[s.team].pushUntil) {
      b.job = Job.Skirmish;
      b.jobUntil = 0;
    }
  }
  w.emit(EventType.Respawn, s.slot, 0, s.x, s.y);
}

/** An FOB takes respawns while it stands and hasn't been hit for FOB_SPAWN_BLOCK seconds. */
export function canSpawnAt(w: World, fob: Structure, team: TeamId): boolean {
  return fob.alive && fob.team === team && w.time - fob.lastDamageTime >= FOB_SPAWN_BLOCK;
}

/** Bots launch from the standing FOB nearest their job (defenders from the mothership). */
function botSpawn(w: World, s: Ship): number {
  const b = s.bot!;
  if (b.job === Job.Defend) return -1;
  const team = w.teams[s.team];
  // Assaulters on a live push launch toward the push target; everyone else toward their node.
  const target = b.job === Job.Assault && w.time < team.pushUntil ? pushTarget(w, s.team) : null;
  const p = target ?? w.map.points[b.jobPoint].pos;
  let best = -1;
  let bestD = Infinity;
  for (const f of team.fobs) {
    if (!canSpawnAt(w, f, s.team)) continue;
    const d = (f.x - p.x) ** 2 + (f.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = SPAWN_AT_STRUCTURE + f.index;
    }
  }
  // Beacons (salvage beacons, forward beacons) count too.
  const dep = w.deployables;
  for (let i = 0; i < dep.count; i++) {
    const d = dep.at(i);
    if (d.team !== s.team || !d.def.respawn) continue;
    const dd = (d.x - p.x) ** 2 + (d.y - p.y) ** 2;
    if (dd < bestD || (dd === bestD && best >= 0 && best < SPAWN_AT_STRUCTURE && d.index < best)) {
      bestD = dd;
      best = d.index;
    }
  }
  return best;
}

/** Passive hull repair after a few seconds without damage; Drone Link adds regen per active drone. */
export function regenHull(w: World, s: Ship, dt: number, drones = 0): void {
  // A ship already at 0 hull dies this tick; regen must not bring it back.
  if (s.hull >= s.maxHull || s.hull <= 0) return;
  const link = drones * statValue(s, 'droneRegen', 0);
  if (link > 0) heal(s, s.maxHull * link * dt);
  if (w.time - s.lastDamageTime < ECONOMY.regenDelay) return;
  heal(s, s.maxHull * ECONOMY.hullRegen * statValue(s, 'hullRegen', 1) * (1 + pointBuff(w, s.team, 'hullRegen')) * dt);
}

/** Heal a ship, returning how much hull was actually restored. */
export function heal(s: Ship, amount: number): number {
  if (!s.alive || amount <= 0) return 0;
  const before = s.hull;
  s.hull = Math.min(s.maxHull, s.hull + amount);
  return s.hull - before;
}

/** Credit a healer: XP for hull restored on others, plus their on-heal node effects. */
export function creditHealing(w: World, healer: Ship | null, target: Ship, restored: number): void {
  if (!healer || restored <= 0 || healer === target) return;
  healer.healingDone += restored;
  grantXp(w, healer, restored * ECONOMY.xp.healing);
  for (const node of healer.nodes) if (node.onHealAlly) applyStatus(w, target, node.onHealAlly);
}
