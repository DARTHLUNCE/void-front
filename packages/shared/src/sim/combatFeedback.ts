import { SOUND_KIND, AUDIO_EVENT_CAPACITY } from '../content/sounds';
import { EVENT_CAPACITY, EventType, type World } from './world';

/** Cosmetic feedback only for human participants. Reserve room for kills/objectives. */
export function reportHit(w: World, target: number, attacker: number, x: number, y: number, damage: number, bearing = 10): void {
  // World contact audio also exists for bot-versus-bot fights. Reserve room
  // for firing/casts; this stream never consumes visual hitmarker slots.
  if (damage > 0 && w.audioEventCount < AUDIO_EVENT_CAPACITY * .6)
    w.emitSound(SOUND_KIND.damage, 0, target, x, y, Math.min(1.2, .4 + damage / 90));
  if (!damage || (!human(w, target) && !human(w, attacker))) return;
  if (target >= 0 && attacker >= 0 && w.ships[target]?.team === w.ships[attacker]?.team) return;
  if (w.eventCount >= EVENT_CAPACITY / 2) return;
  w.emit(EventType.CombatHit, target, attacker, x, y, bearing, damage);
}
function human(w: World, slot: number): boolean {
  return slot >= 0 && !!w.ships[slot] && !w.ships[slot].isBot;
}
