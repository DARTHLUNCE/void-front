/** Cosmetic power failure after the simulation has already removed shield protection. */
export const SHIELD_FAILURE_LIFE=.7;
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
const bell=(t:number,center:number,width:number)=>{const x=(t-center)/width;return Math.exp(-x*x);};
export function shieldFailure(age:number,sector:number,impact:number):{alpha:number;scale:number;arc:number;reveal:number;erode:number}{
  if(age<=0||age>=SHIELD_FAILURE_LIFE)return {alpha:0,scale:1,arc:0,reveal:0,erode:1};
  // Compress the complete fault sequence, including the last cells, into 0.7 s.
  const t=age/SHIELD_FAILURE_LIFE;
  age=t*.86;
  const distance=Math.abs(Math.atan2(Math.sin(sector-impact),Math.cos(sector-impact)))/Math.PI;
  const phase=.5+.5*Math.sin(sector*3.1+1.4);
  const surge=bell(age,.045+.035*distance,.025);
  const fault=bell(age,.15+.07*phase,.022)+.7*bell(age,.29+.065*distance,.032);
  const off=.34+.17*distance+.045*phase;
  const release=1-smooth((age-off)/.28),ignite=smooth(age/.018);
  return {
    alpha:ignite*(.30*Math.exp(-4.5*t)+.65*surge+.70*fault)*release,
    scale:1,reveal:smooth(age/.055),erode:smooth((age-.34)/.50),
    arc:ignite*Math.min(1,fault)*release,
  };
}
