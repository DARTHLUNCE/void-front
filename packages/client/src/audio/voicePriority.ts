/** Admission control for repeated drive chatter, independent of render FPS.
 * Local player feedback is never rate-limited by neighbouring ships. */
export class DriveVoiceBudget {
  private nextLaunch = -Infinity;
  private nextDetail = -Infinity;
  admit(id: string, now: number, distance: number, own: boolean): boolean {
    if (own || !/^movement\.(charge|abort|engage|disengage)$/.test(id)) return true;
    if (id === 'movement.engage') {
      if (distance > 2200 || now < this.nextLaunch) return false;
      this.nextLaunch = now + .65;
      return true;
    }
    // Spooling, aborted charges and bleed-offs are background detail. They
    // must not make a fleet of bots sound like the player's drive is retriggering.
    if (distance > 650 || now < this.nextDetail) return false;
    this.nextDetail = now + 1.5;
    return true;
  }
}

export const isRoutineVoice = (id: string): boolean => /^(weapon|secondary|turret|drone|engine)\./.test(id) || id.startsWith('loop.');
