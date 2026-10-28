import { geometryOf } from './hullCollision';
import { describe, expect, it } from 'vitest';
import { CLASS_ORDER } from '../content/classes';
import { PRIMARY_AIM_HALF_ARC } from '../content/combat';
import { duelWorld } from '../test-utils';
import { angleDelta } from './angles';
import { STAT_INDEX } from './stats';
import { aimAndFire, gunFor } from './systems/combat';
import { CHARGE } from './systems/quirks';

describe.each(CLASS_ORDER)('%s primary gun swivel', classId => {
  it.each([10, -10, 22.5, -22.5, 90, -90, 180])('tracks or clamps a %s degree aim without snapping the hull', degrees => {
    const { w, a } = duelWorld(1, classId);
    const originalX = a.x, originalY = a.y;
    a.input.aim = degrees * Math.PI / 180;
    a.input.brake = true;
    a.input.fire = a.cls.quirk !== 'chargeShot';
    if (a.cls.quirk === 'chargeShot') a.quirk[CHARGE] = .5;
    aimAndFire(w, a);
    const gun = gunFor(w, a);
    expect(w.projectiles.count).toBe(gun.count);
    // Rotation still advances gradually; gun swivel must not overwrite body heading.
    expect(Math.abs(a.angle)).toBeLessThan(.05);
    const sockets = geometryOf(w, a).primary;
    let requested = a.input.aim;
    if (gun.count === 1) {
      const distance = Math.hypot(a.input.cursorX - originalX, a.input.cursorY - originalY);
      const [mx, my] = sockets[0];
      const muzzleX = Math.cos(a.angle) * mx - Math.sin(a.angle) * my;
      const muzzleY = Math.sin(a.angle) * mx + Math.cos(a.angle) * my;
      if (distance > 0) requested = Math.atan2(Math.sin(a.input.aim) * distance - muzzleY, Math.cos(a.input.aim) * distance - muzzleX);
    }
    const expectedOffset = Math.max(-PRIMARY_AIM_HALF_ARC, Math.min(PRIMARY_AIM_HALF_ARC, angleDelta(a.angle, requested)));
    const gunAngle = a.angle + expectedOffset;
    for (let k = 0; k < gun.count; k++) {
      const p = w.projectiles.at(k);
      const spread = gun.count > 1 ? (k - (gun.count - 1) / 2) / (gun.count - 1) * gun.spread : 0;
      expect(angleDelta(Math.atan2(p.vy, p.vx), gunAngle + spread)).toBeCloseTo(0, 10);
      const [mx, my] = sockets[Math.floor(k * sockets.length / gun.count)];
      expect(p.x).toBeCloseTo(originalX + Math.cos(a.angle) * mx - Math.sin(a.angle) * my, 8);
      expect(p.y).toBeCloseTo(originalY + Math.sin(a.angle) * mx + Math.cos(a.angle) * my, 8);
    }
  });
});

it('aims across the angle wrap without jumping to the wrong cone edge', () => {
  const { w, a } = duelWorld(1, 'patrol');
  a.angle = Math.PI - .04;
  a.input.aim = -Math.PI + .04;
  a.input.fire = true;
  aimAndFire(w, a);
  const p = w.projectiles.at(0);
  expect(angleDelta(Math.atan2(p.vy, p.vx), a.input.aim)).toBeCloseTo(0, 10);
});

it('applies full-charge recoil opposite the swiveled shot', () => {
  const { w, a } = duelWorld(1, 'dreadnought');
  a.modAdd[STAT_INDEX.recoil] = 220;
  a.input.aim = Math.PI / 2;
  a.quirk[CHARGE] = 1;
  a.input.fire = false;
  const x = a.x, y = a.y;
  aimAndFire(w, a);
  const p = w.projectiles.at(0);
  const direction = Math.atan2(p.vy, p.vx);
  expect(a.x - x).toBeCloseTo(-Math.cos(direction) * 220, 8);
  expect(a.y - y).toBeCloseTo(-Math.sin(direction) * 220, 8);
});
