/** Cosmetic state only: follows authoritative spool progress, never advances the drive. */
export class SublightFxState {
  charge = 0;
  travel = 0;
  ignition = 0;
  private active = false;
  private initialized = false;
  private ignitionAge = 1;
  reset(): void {
    this.charge=this.travel=this.ignition=0;
    this.active=this.initialized=false;this.ignitionAge=1;
  }
  update(spool: number, active: boolean, alive: boolean, dt: number): void {
    if (!alive) { this.reset();return; }
    const step=Math.max(0,Math.min(.1,dt));
    const progress=Number.isFinite(spool) ? Math.max(0,Math.min(1,spool)) : 0;
    if (active && !this.active && this.initialized) this.ignitionAge=0;
    if (!active) this.ignitionAge=1; // interrupted charge/cruise cannot leave a launch flash
    const chargeTarget=active ? 0 : progress*progress;
    this.charge+=(chargeTarget-this.charge)*(1-Math.exp(-step/.055));
    this.travel+=((active ? 1 : 0)-this.travel)*(1-Math.exp(-step/(active ? .18 : .26)));
    this.ignitionAge+=step;
    this.ignition=this.ignitionAge<.32 ? Math.sin(Math.PI*this.ignitionAge/.32)**2 : 0;
    this.active=active;this.initialized=true;
  }
}
