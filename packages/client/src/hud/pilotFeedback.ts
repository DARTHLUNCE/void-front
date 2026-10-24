/** Display easing only: engagement still follows the actual simulation spool. */
export function driveChargeProgress(progress: number): number {
  return Math.pow(Math.max(0,Math.min(1,progress)),1.7);
}

export interface PilotReadout {
  time: number;
  damageTime: number;
  alive: boolean;
  identity: string;
  hull: number;
  shield: number;
  shielded: boolean;
  affordable: number;
  tierReady: boolean;
  abilityReady: readonly boolean[];
  firingMul: number;
  spool: number;
  jammed: boolean;
  charges: readonly number[];
  statLevels: readonly number[];
}

/** One actionable message at a time; upgrade readiness stays beside the upgrade keys. */
export function combatCue(hull: number, shield: number, shielded: boolean, takingDamage: boolean): string {
  if (hull <= .25) return 'CRITICAL HULL';
  if (shielded && shield <= .01) return 'SHIELDS DOWN';
  if (takingDamage) return 'TAKING FIRE';
  if (hull < .5) return 'HULL DAMAGED';
  return '';
}

/** State transitions trigger brief emphasis; continuous numeric updates do not restart it. */
export class PilotFeedback {
  private previous?: PilotReadout;
  private hitUntil = 0;
  private upgradeUntil = 0;
  private readonly readyUntil = [0, 0, 0];
  private readonly usedUntil = [0, 0, 0];
  private readonly purchasedUntil = [0, 0, 0, 0];
  private hitStrength = 0;
  private hullTrail = 1;
  private shieldTrail = 1;
  private readonly upgrades: HTMLElement[];
  private readonly status: HTMLElement | null;
  private readonly prompt: HTMLElement | null;
  private readonly bank: HTMLElement | null;
  private readonly flight: HTMLElement | null;
  private readonly bays: HTMLElement[];

  constructor(private readonly root: HTMLElement) {
    this.status = root.querySelector('[data-k="pilotStatus"]');
    this.prompt = root.querySelector('[data-k="upgradePrompt"]');
    this.bank = root.querySelector('.vhud-bank-strip');
    this.flight = root.querySelector('[data-k="flightState"]');
    this.bays = Array.from(root.querySelectorAll('[data-ab]'));
    this.upgrades = Array.from(root.querySelectorAll('[data-stat]'));
  }

  deactivate(): void {
    if (!this.previous) return;
    this.previous = undefined;
    for (const key of ['hit','shieldsDown','firing','tierReady','jammed']) this.root.dataset[key] = 'false';
    this.root.dataset.driveState = 'idle';
    this.root.dataset.hull = 'healthy';
    this.root.dataset.hitEnergy = '0';
    this.root.style.setProperty('--hit-energy','0');
  }

  update(next: PilotReadout): void {
    const previous = this.previous;
    const continuous = previous?.alive && next.alive && previous.identity === next.identity && next.time >= previous.time;
    if (!continuous) {
      this.hitUntil = this.upgradeUntil = 0;
      this.readyUntil.fill(0); this.usedUntil.fill(0); this.purchasedUntil.fill(0);
      this.hullTrail = next.hull; this.shieldTrail = next.shield;
    }
    const dt = continuous ? Math.min(.1, next.time - previous.time) : 0;
    const loss = continuous ? Math.max(previous.hull-next.hull, previous.shield-next.shield) : 0;
    if (continuous && next.damageTime > previous.damageTime) { this.hitUntil = next.time + .7; this.hitStrength = Math.min(1, .35 + loss*5); }
    if (next.time > this.hitUntil-.45) {
      this.hullTrail = Math.max(next.hull, this.hullTrail-dt*.65);
      this.shieldTrail = Math.max(next.shield, this.shieldTrail-dt*.9);
    }
    this.hullTrail = Math.max(this.hullTrail,next.hull);
    this.shieldTrail = Math.max(this.shieldTrail,next.shield);
    if (continuous && ((next.affordable > 0 && previous.affordable === 0) || (next.tierReady && !previous.tierReady))) this.upgradeUntil = next.time + 2.4;
    const hit = next.alive && next.time < this.hitUntil;
    const cue = next.alive ? combatCue(next.hull, next.shield, next.shielded, hit) : 'OFFLINE';
    const write = (el: HTMLElement | null, value: string): void => { if (el && el.textContent !== value) el.textContent = value; };
    write(this.status, cue);
    const data = (el: HTMLElement, name: string, value: string): void => { if (el.dataset[name] !== value) el.dataset[name] = value; };
    const variable = (name: string, value: string): void => { if (this.root.style.getPropertyValue(name) !== value) this.root.style.setProperty(name,value); };
    data(this.root,'hull',next.hull <= .25 ? 'critical' : next.hull < .5 ? 'damaged' : 'healthy');
    data(this.root,'hit',String(hit));
    data(this.root,'shieldsDown',String(next.alive && next.shielded && next.shield <= .01));
    data(this.root,'firing',String(next.alive && next.firingMul < 1));
    data(this.root,'tierReady',String(next.alive && next.tierReady));
    data(this.root,'driveState',!next.alive ? 'idle' : next.spool >= 1 ? 'active' : next.spool > 0 ? 'charging' : 'idle');
    data(this.root,'jammed',String(next.alive && next.jammed));
    const energy = hit ? this.hitStrength*Math.max(0,(this.hitUntil-next.time)/.7) : 0;
    data(this.root,'hitEnergy',energy.toFixed(3));
    variable('--hit-energy',energy.toFixed(3));
    variable('--hull-trail',`${(this.hullTrail*100).toFixed(1)}%`);
    variable('--shield-trail',`${(this.shieldTrail*100).toFixed(1)}%`);
    variable('--drive-charge',`${(driveChargeProgress(next.spool)*100).toFixed(1)}%`);
    const ready = next.alive && (next.tierReady || next.affordable > 0);
    if (this.bank) {
      data(this.bank,'ready',String(ready));
      data(this.bank,'notice',String(next.time < this.upgradeUntil));
    }
    write(this.prompt, next.tierReady ? 'CHOOSE 1 / 2' : next.affordable ? 'UPGRADE READY' : 'SHARDS');
    write(this.flight, next.firingMul < 1 ? `FIRING · ${Math.round(next.firingMul * 100)}% DRIVE` : '');
    this.bays.forEach((bay, i) => {
      if (continuous && next.abilityReady[i] && !previous.abilityReady[i]) this.readyUntil[i] = next.time + 1.4;
      if (continuous && next.charges[i] < previous.charges[i]) this.usedUntil[i] = next.time + .5;
      bay.classList.toggle('just-ready', next.alive && next.time < this.readyUntil[i]);
      bay.classList.toggle('just-used', next.alive && next.time < this.usedUntil[i]);
    });
    this.upgrades.forEach((card,i) => {
      if (continuous && next.statLevels[i] > previous.statLevels[i]) this.purchasedUntil[i] = next.time + .8;
      card.classList.toggle('just-purchased',next.alive && next.time < this.purchasedUntil[i]);
    });
    this.previous = next;
  }
}
