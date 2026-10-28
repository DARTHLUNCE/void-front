import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CLASSES, CLASS_ORDER } from '../../shared/src/content/classes';
import { POWER_INDEX } from '../../shared/src/content/power';
import { duelWorld, place } from '../../shared/src/test-utils';
import { applyLoadout, liveStat } from '../../shared/src/sim/stats';
import { runSteps, shipCaster, tryCast } from '../../shared/src/sim/systems/abilities';
import { gunFor, outgoingDamageMul, shipArmor, ARC_BOW } from '../../shared/src/sim/systems/combat';
import { regenHull } from '../../shared/src/sim/systems/progression';
import { switchPower, heatPowerMul, weaponPowerMul, speedPowerMul, shieldCapPowerMul } from '../../shared/src/sim/systems/power';
import { applyStatus, statusMagnitude } from '../../shared/src/sim/systems/status';
import type { Ship } from '../../shared/src/sim/world';

function equip(s: Ship, picks: readonly number[], calibration = 0): void {
  s.picks.fill(-1);
  picks.forEach((pick, index) => { s.picks[index] = pick; });
  s.tiersOwned = picks.length;
  s.statPoints.fill(calibration);
  applyLoadout(s);
}

/** Controlled mechanics and all 288 builds. These are diagnostics, not match win-rate predictions. */
export function runClassCombatAudit() {
  const profiles = CLASS_ORDER.map(id => {
    const c = CLASSES[id];
    const primaryCycle = c.gun.fireInterval + (c.gun.chargeMax ?? 0);
    return { id, role: c.role, hull: c.hull, shield: c.shield, armor: c.armor, speed: c.speed,
      radius: c.radius, primaryAp: c.gun.ap, primaryDps: c.gun.damage * c.gun.count * (c.gun.chargeMax ? 3 : 1) / primaryCycle,
      secondaryDps: c.secondary ? c.secondary.damage * c.secondary.count / c.secondary.fireInterval : 0,
      range: c.gun.projectileSpeed * c.gun.life, signature: c.signature.name, signatureCooldown: c.signature.cooldown };
  });
  const builds = CLASS_ORDER.flatMap(id => Array.from({ length: 32 }, (_, mask) => {
    const { w, a } = duelWorld(1, id);
    const picks = Array.from({ length: 5 }, (_, tier) => (mask >> tier) & 1);
    equip(a, picks, 7);
    a.vx = a.cls.speed;
    const g = gunFor(w, a);
    const cycle = g.fireInterval / liveStat(w, a, 'fireRate', 1) + (g.chargeMax ?? 0) * liveStat(w, a, 'chargeTime', 1) * heatPowerMul(w, a);
    return { id, mask, picks, hull: a.maxHull, shield: a.maxShield, bowArmor: shipArmor(w, a, ARC_BOW),
      primaryAp: g.ap, primaryDpsMoving: g.damage * g.count * (g.chargeMax ? 3 : 1) * outgoingDamageMul(w, a) / cycle,
      secondaryCount: (a.cls.secondary?.count ?? 0) + liveStat(w, a, 'secondaryCount', 0),
      signature: a.signature.def.id, cooldown: a.signature.def.cooldown * liveStat(w, a, 'cooldown', 1) };
  }));
  const carrierRegen = [2, 4, 11, 21, 28].map(drones => {
    const { w, a } = duelWorld(1, 'carrier');
    equip(a, [0, 0, 0, 1]);
    a.hull = 1;
    a.lastDamageTime = w.time;
    regenHull(w, a, 1, drones);
    return { drones, fractionPerSecond: (a.hull - 1) / a.maxHull, hullPerSecond: a.hull - 1 };
  });
  const { w: powerWorld, a: patrol } = duelWorld();
  equip(patrol, [0, 0, 0, 1]);
  let shieldFromSwitches = 0;
  for (let tick = 0; tick < 30; tick++) {
    powerWorld.time = tick / 30;
    patrol.shield = 0; // Continuous damage creates room to measure every shield proc.
    switchPower(powerWorld, patrol, tick % 2 ? POWER_INDEX.speed : POWER_INDEX.weapons);
    shieldFromSwitches += patrol.shield;
  }
  const { w: bleedWorld, b: burned } = duelWorld();
  for (let i = 0; i < 100; i++) applyStatus(bleedWorld, burned, { status: 'bleed', duration: 3, magnitude: 5 });
  const frigateNodes = [0, 1].map(specialization => {
    const { w, a, b } = duelWorld(1, 'frigate');
    equip(a, [0, 0, specialization, 0]);
    const node = w.points[0];
    node.owner = a.team;
    node.hull = node.maxHull * 0.1;
    place(w, a, node.x - 300, node.y, 0);
    place(w, b, node.x + 2000, node.y, Math.PI);
    a.input.cursorX = node.x;
    a.input.cursorY = node.y;
    const before = node.hull;
    runSteps(w, shipCaster(a, -1), a.signature.def.steps);
    return { specialization: a.signature.def.name, instantRepairFraction: (node.hull - before) / node.maxHull, nodeArmor: node.armorBonus };
  });
  const { w: stormWorld, a: striker, b: victim } = duelWorld();
  equip(striker, [0, 0, 0, 0, 0]);
  victim.maxHull = victim.hull = 100_000;
  victim.shield = 0;
  place(stormWorld, striker, 10_000, 5_500, 0);
  place(stormWorld, victim, 10_100, 5_500, Math.PI);
  striker.input.cursorX = striker.x;
  striker.input.cursorY = striker.y;
  applyStatus(stormWorld, striker, { status: 'stormRun', duration: 6 });
  let stormCasts = 0;
  for (let tick = 0; tick < 30; tick++) {
    stormWorld.time = tick / 30;
    if (tryCast(stormWorld, striker, striker.signature, victim.slot)) stormCasts++;
  }
  const powerModes = Object.entries(POWER_INDEX).map(([mode, index]) => {
    const { w, a } = duelWorld();
    a.powerMode = index;
    return { mode, speed: speedPowerMul(w, a), damage: weaponPowerMul(w, a), shieldCap: shieldCapPowerMul(w, a) };
  });
  return {
    methodology: 'Class data, all 32 builds per class at equal max calibration, and direct runtime mechanic probes. Raw DPS assumes every projectile hits; omits armor, evasion, cloak, heat/momentum ramp, abilities, terrain and support value. It is not a balance ranking.',
    profiles, builds, powerModes,
    probes: { carrierRegen, patrolSwitchShieldPerSecond: shieldFromSwitches, bleedDpsAfter100Hits: statusMagnitude(burned, 'bleed'), frigateNodes,
      stormCastsPerSecond: stormCasts, stormDamagePerSecond: 100_000 - victim.hull },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = resolve(process.argv[2] ?? 'reports/class-combat-audit.json');
  const report = runClassCombatAudit();
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, profiles: report.profiles, powerModes: report.powerModes, probes: report.probes }, null, 2));
}
