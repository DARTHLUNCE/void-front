import { EventType } from '@void-front/shared';
export interface FeedbackEvent { type: number; a: number; b: number; c: number; d: number }
export interface RecoveryState { shield: number; maxShield: number; spool: number; damageTime: number }
export const DAMAGE_INDICATOR_CAPACITY=8;
const DAMAGE_INDICATOR_LIFETIME=550;
export function damageIndicatorOpacity(until:number,now:number):number {
  return Math.max(0,Math.min(1,(until-now)/450));
}
/** Bounded marker pool with continuous bearings, not fixed directional sectors. */
export class CombatFeedbackState {
  hitUntil = 0;
  hitKind = 'hull';
  hitDamage = 0;
  notice = '';
  noticeKind = 'good';
  noticeUntil = 0;
  private priority = 0;
  pickupUntil = 0;
  pickupAmount = 0;
  readonly directions = new Float64Array(DAMAGE_INDICATOR_CAPACITY);
  readonly directionHull = new Uint8Array(DAMAGE_INDICATOR_CAPACITY);
  readonly directionAngles = new Float64Array(DAMAGE_INDICATOR_CAPACITY);
  readonly directionSources = new Int32Array(DAMAGE_INDICATOR_CAPACITY).fill(-2);
  areaUntil = 0;
  private previous: RecoveryState | null = null;
  private recoveryAnnounced = false;

  reset(): void {
    this.hitUntil = this.noticeUntil = this.pickupUntil = this.areaUntil = 0;
    this.hitDamage = this.pickupAmount = 0;
    this.directions.fill(0); this.directionHull.fill(0);
    this.directionAngles.fill(0); this.directionSources.fill(-2);
    this.previous = null; this.recoveryAnnounced = false;
  }
  announce(text: string, kind: string, now: number, priority: number, duration = 1600): void {
    if (now < this.noticeUntil && priority < this.priority) return;
    this.notice = text; this.noticeKind = kind; this.priority = priority; this.noticeUntil = now+duration;
  }
  event(e: FeedbackEvent, self: number, now: number): void {
    if (e.type === EventType.CombatHit && e.d !== 0) {
      if (e.b === self && e.a !== self) {
        this.hitDamage = (now < this.hitUntil ? this.hitDamage : 0)+Math.abs(e.d);
        this.hitKind = e.d < 0 ? 'shield' : 'hull'; this.hitUntil = now+240;
      }
      if (e.a === self) {
        if (Math.abs(e.c) <= Math.PI+.00001) {
          // Repeated hits from a moving attacker refresh its exact bearing.
          // Unknown sources can share a nearby marker, using wrapped distance.
          let index=-1;
          for(let i=0;i<this.directions.length;i++){
            if(this.directions[i]<=now)continue;
            const difference=Math.atan2(Math.sin(e.c-this.directionAngles[i]),Math.cos(e.c-this.directionAngles[i]));
            if((e.b>=0 && this.directionSources[i]===e.b) ||
              (e.b<0 && this.directionSources[i]<0 && Math.abs(difference)<Math.PI/18)){
              index=i;break;
            }
          }
          if(index<0){
            index=0;
            for(let i=0;i<this.directions.length;i++){
              if(this.directions[i]<=now){index=i;break;}
              if(this.directions[i]<this.directions[index])index=i;
            }
          }
          this.directions[index]=now+DAMAGE_INDICATOR_LIFETIME;
          this.directionAngles[index]=e.c;this.directionSources[index]=e.b;
          this.directionHull[index]=e.d>0?1:0;
        } else this.areaUntil = now+650;
      }
    } else if (e.type === EventType.Kill && e.a === self && e.b !== self) {
      this.hitKind = 'kill'; this.hitUntil = now+500;
      this.announce('TARGET DESTROYED','good',now,4);
    } else if (e.type === EventType.ShieldBreak && e.b === self && e.a !== self) {
      this.announce('TARGET SHIELD BROKEN','good',now,2,1100);
    } else if (e.type === EventType.ShardPickup && e.a === self && e.c > 0) {
      this.pickupAmount = (now < this.pickupUntil ? this.pickupAmount : 0)+e.c;
      this.pickupUntil = now+1200;
    } else if (e.type === EventType.StructureDestroyed && e.b === self) {
      this.announce('STRUCTURE DESTROYED','good',now,4);
    } else if (e.type === EventType.NodeDestroyed && e.c === self) {
      this.announce('NODE DISABLED','good',now,3);
    }
  }
  recovery(next: RecoveryState, now: number): void {
    const prev = this.previous;
    if (prev) {
      const hit = next.damageTime > prev.damageTime;
      if (hit) this.recoveryAnnounced = false;
      if (prev.spool > 0 && next.spool === 0 && hit)
        this.announce('SUB-LIGHT INTERRUPTED','danger',now,3);
      if (!hit && next.maxShield === prev.maxShield && next.maxShield > 0) {
        if (next.shield >= next.maxShield && prev.shield < next.maxShield) {
          this.announce('SHIELDS RESTORED','good',now,1);
          this.recoveryAnnounced = false;
        } else if (!this.recoveryAnnounced && next.shield > prev.shield && prev.shield < next.maxShield*.75) {
          this.announce('SHIELDS RECOVERING','shield',now,0,1000);
          this.recoveryAnnounced = true;
        }
      }
    }
    this.previous = next;
  }
}
