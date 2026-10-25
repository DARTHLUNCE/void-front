import { H, SELF, SHIP, SHIP_FLAG, SNAP } from '@void-front/shared';
import type { Snap } from '../snap';
import type { Viewport } from '../render/viewport';
import { CombatFeedbackState, DAMAGE_INDICATOR_CAPACITY, damageIndicatorOpacity } from './combatFeedbackState';
interface Point { x: number; y: number }

/** Screen-pixel instruments, clipped to the gameplay aperture, never input-blocking. */
export class CombatOverlay {
  private readonly root = document.createElement('div');
  private readonly hit: HTMLElement;
  private readonly hitLabel: HTMLElement;
  private readonly incoming: HTMLElement;
  private readonly chevrons: SVGPathElement[];
  private readonly notice: HTMLElement;
  private readonly pickup: HTMLElement;
  private readonly state = new CombatFeedbackState();
  private tick = -1;
  private active = false;
  constructor(stage: HTMLElement) {
    this.root.className = 'combat-feedback';
    this.root.innerHTML = `<div class="combat-hit" aria-hidden="true"><svg viewBox="-20 -20 40 40"><path d="M-13-13L-6-6 M13-13L6-6 M-13 13L-6 6 M13 13L6 6"/></svg><span></span></div>
      <div class="combat-incoming" aria-hidden="true"><svg viewBox="-80 -80 160 160">${Array.from({length:DAMAGE_INDICATOR_CAPACITY},()=>`<path d="M61 -7 L69 0 L61 7"/>`).join('')}</svg><span>AREA DAMAGE</span></div>
      <div class="combat-notice" role="status" aria-live="polite"></div>
      <div class="combat-pickup" aria-hidden="true"></div>`;
    stage.appendChild(this.root);
    this.hit = this.root.querySelector('.combat-hit')!;
    this.hitLabel = this.hit.querySelector('span')!;
    this.incoming = this.root.querySelector('.combat-incoming')!;
    this.chevrons = Array.from(this.incoming.querySelectorAll('path'));
    this.notice = this.root.querySelector('.combat-notice')!;
    this.pickup = this.root.querySelector('.combat-pickup')!;
  }
  update(snap: Snap, self: number, now: number, pilot: boolean, pointer: Point | null, ship: Point, view: Viewport): void {
    const b = snap.buf, k = snap.ship(self), s = snap.o.self;
    const active = pilot && !!(b[k+SHIP.flags]&SHIP_FLAG.alive) && !b[H.over];
    this.root.hidden = !active;
    if (!active || !this.active || b[H.tick] < this.tick) this.state.reset();
    const continuous = active && this.active && b[H.tick] >= this.tick;
    this.active = active;
    if (!active) { this.tick = b[H.tick]; return; }
    if (b[H.tick] !== this.tick) {
      if (continuous) for (let i=0,e=snap.o.events;i<b[H.eventCount];i++,e+=SNAP.event)
        this.state.event({type:b[e],a:b[e+1],b:b[e+2],c:b[e+5],d:b[e+6]},self,now);
      this.state.recovery({shield:b[k+SHIP.shield],maxShield:b[k+SHIP.maxShield],spool:b[s+SELF.cruiseSpool],damageTime:b[s+SELF.damageTime]},now);
      this.tick = b[H.tick];
    }
    const state = this.state;
    const place = (el: HTMLElement, point: Point) => {
      el.style.left = `${point.x-view.left}px`; el.style.top = `${point.y-view.top}px`;
    };
    const inside = pointer && pointer.x >= view.left && pointer.y >= view.top && pointer.x <= view.left+view.width && pointer.y <= view.top+view.height;
    this.hit.hidden = !(inside && now < state.hitUntil);
    if (!this.hit.hidden && pointer) {
      // Keep the short confirmation readable even when aiming at the aperture edge.
      place(this.hit,{x:Math.max(view.left+50,Math.min(view.left+view.width-50,pointer.x)),y:Math.max(view.top+30,Math.min(view.top+view.height-50,pointer.y))});
      this.hit.dataset.kind = state.hitKind;
      this.hitLabel.textContent = state.hitKind === 'kill' ? 'KILL' : `${state.hitKind === 'shield' ? 'SHIELD' : 'HIT'} ${Math.round(state.hitDamage)}`;
    }
    place(this.incoming,ship);
    this.chevrons.forEach((chevron,i) => {
      chevron.style.opacity=String(damageIndicatorOpacity(state.directions[i],now));
      chevron.setAttribute('transform',`rotate(${state.directionAngles[i]*180/Math.PI})`);
      chevron.dataset.kind = state.directionHull[i] ? 'hull' : 'shield';
    });
    this.incoming.dataset.area = String(now < state.areaUntil);
    // Keep expired text mounted while CSS completes its exit transition.
    const noticeVisible=now<state.noticeUntil;
    this.notice.classList.toggle('show',noticeVisible);
    if (noticeVisible) {
      if (this.notice.textContent !== state.notice) this.notice.textContent = state.notice;
      this.notice.dataset.kind = state.noticeKind;
    }
    const pickupVisible=now<state.pickupUntil;
    this.pickup.classList.toggle('show',pickupVisible);
    if (pickupVisible) this.pickup.textContent = `+${Math.round(state.pickupAmount)} SHARDS`;
  }
}
