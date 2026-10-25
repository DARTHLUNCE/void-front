import { abilityVisualIndex } from '@void-front/shared';

export interface AbilityHullPose { alpha:number; x:number; y:number }
const BLINK=abilityVisualIndex('patrol.blinkStrike');
const eased=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*t*(10+t*(-15+6*t));};
/** C2-continuous camera pulse: zero velocity and acceleration at both ends. */
export function abilityCameraPulse(visual:number,age:number):number {
  if(visual===22||visual===23){if(age<0||age>=.28)return 0;return .004*eased(age/.025)*(1-eased((age-.025)/.255));}
  if(visual===17){if(age<0||age>=.36)return 0;return .009*eased(age/.035)*(1-eased((age-.035)/.325));}
  if(visual===16||visual===18){if(age<0||age>=.62)return 0;return .0035*eased(age/.085)*(1-eased((age-.16)/.46));}
  if(visual!==BLINK||age<0||age>.34)return 0;
  return .008*eased(age/.055)*(1-eased((age-.055)/.285));
}
/** Cosmetic materialization only: never feeds simulation transforms or aiming coordinates. */
export function abilityHullPose(visual:number,age:number,out:AbilityHullPose):void {
  out.alpha=out.x=out.y=1;
  if(age<0||age>.24)return;
  if(visual===17){
    const u=Math.min(1,age/.16),e=eased(u);out.alpha=e;out.x=.55+.45*e;out.y=1.12-.12*e;
  }
  if(visual===BLINK){
    const u=Math.min(1,age/.14),e=1-(1-u)**3;
    out.alpha=eased(u);
    out.x=.40+.60*e+Math.sin(u*Math.PI)*.055;
    out.y=1.18-.18*e;
  }
}
