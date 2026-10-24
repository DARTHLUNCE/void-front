import { describe, it, expect } from 'vitest';
import { cameraBlend, followOffset, headingExtension, lookAhead, PilotCameraOffset, PilotReachInput, pointerReach } from './pilotCamera';
import { clientToWorld, worldToClient } from './viewport';
const view = {left:300,top:64,width:1000,height:600},center={x:800,y:364};
const right={x:1300,y:364};
const maxReach=Math.hypot(...Object.values(headingExtension(view,0,1)));
const minReach=maxReach*.35;
function settled(){const c=new PilotCameraOffset();for(let i=0;i<180;i++)c.update(right,view,0,1/60);return c;}
describe('pilot camera reach',()=>{
  it('has identical strength at every edge and corner, including off-frame pointers',()=>{
    const points=[right,{x:300,y:364},{x:800,y:64},{x:800,y:664},{x:1300,y:64},{x:300,y:664},{x:-100,y:364}];
    for(const p of points)expect(pointerReach(p,view)).toBeCloseTo(1);
    expect(pointerReach(center,view)).toBe(0);expect(pointerReach(null,view)).toBe(0);
    expect(pointerReach({x:820,y:370},view)).toBe(0);
  });
  it('keeps the same camera distance along top, side and diagonal hull headings',()=>{
    for(const heading of [0,Math.PI/2,Math.PI/4,-Math.PI/4,Math.PI]){
      const o=lookAhead(right,view,heading);
      expect(Math.hypot(o.x,o.y)).toBeCloseTo(maxReach);
      expect(Math.atan2(o.y,o.x)).toBeCloseTo(heading);
    }
  });
  it('matches intermediate reach around a circular mouse path in screen pixels',()=>{
    const diagonal=150/Math.sqrt(2);
    const points=[{x:950,y:364},{x:800,y:214},{x:800+diagonal,y:364-diagonal}];
    for(const p of points)expect(pointerReach(p,view)).toBeCloseTo(pointerReach(points[0],view));
  });
  it('starts gently and has consistent radial easing at different frame rates',()=>{
    const result=(fps:number)=>{const c=new PilotCameraOffset();for(let i=0;i<fps/2;i++)c.update(right,view,0,1/fps);return c.value.x;};
    const c=new PilotCameraOffset();c.update(right,view,0,1/60);
    expect(c.value.x).toBeGreaterThan(0);expect(c.value.x).toBeLessThan(2);
    expect(Math.abs(result(30)-result(60))).toBeLessThan(.05);expect(Math.abs(result(144)-result(60))).toBeLessThan(.05);
    expect(result(60)).toBeGreaterThan(maxReach*.78);expect(result(60)).toBeLessThan(maxReach*.85);
  });
  it('retracts gradually without snapping the stored offset when the mouse moves inward',()=>{
    const c=settled();c.update(center,view,0,1/60);expect(c.value.x).toBeGreaterThan(maxReach*.98);
    let last=c.value.x;
    for(let i=0;i<180;i++){c.update(center,view,0,1/60);expect(c.value.x).toBeGreaterThanOrEqual(0);expect(c.value.x).toBeLessThanOrEqual(last);expect(c.value.x).toBeGreaterThanOrEqual(minReach);expect(last-c.value.x).toBeLessThan(9);last=c.value.x;}
    expect(c.value.x).toBeCloseTo(minReach,3);
  });
  it('allows reversals to pass inward without selecting an orbit',()=>{
    const c=settled();let closest=Infinity;
    for(let i=0;i<120;i++){
      c.update(center,view,Math.PI,1/60);
      closest=Math.min(closest,Math.hypot(c.value.x,c.value.y));
      expect(Number.isFinite(c.value.x+c.value.y)).toBe(true);
    }
    expect(closest).toBeLessThan(minReach);
    expect(c.value.x).toBeCloseTo(-minReach,1);
    expect(Math.abs(c.value.y)).toBeLessThan(.01);
  });
  it('eases retraction over a longer interval without adding angular lag',()=>{
    const c=settled();
    for(let i=1;i<=12;i++)c.update(center,view,i/60*2,1/60);
    const radius=Math.hypot(c.value.x,c.value.y);
    expect(radius).toBeGreaterThan(minReach+(maxReach-minReach)*.6);
    expect(radius).toBeLessThan(minReach+(maxReach-minReach)*.85);
    expect(.4-Math.atan2(c.value.y,c.value.x)).toBeLessThan(.08);
  });
  it('takes the short arc through the angle seam',()=>{
    const c=new PilotCameraOffset();
    for(let i=0;i<180;i++)c.update(right,view,Math.PI-.02,1/60);
    c.update(right,view,-Math.PI+.02,1/60);
    expect(c.value.x).toBeLessThan(-maxReach*.99);
    expect(Math.abs(Math.hypot(c.value.x,c.value.y)-maxReach)).toBeLessThan(.02);
  });
  it('has consistent light turn damping at 30, 60 and 144 fps',()=>{
    const result=(fps:number)=>{
      const c=settled();
      for(let i=1;i<=fps/2;i++)c.update(right,view,i/fps*2,1/fps);
      return Math.atan2(c.value.y,c.value.x);
    };
    expect(result(30)).toBeCloseTo(result(60),4);
    expect(result(144)).toBeCloseTo(result(60),4);
    expect(1-result(60)).toBeLessThan(.1);
  });
  it('allows a shallow inward pan during turning, then recovers the requested reach',()=>{
    const p={x:1050,y:364},c=new PilotCameraOffset();for(let i=0;i<180;i++)c.update(p,view,0,1/60);
    for(let i=0;i<60;i++){
      c.update(p,view,i/30,1/60);
      const target=maxReach*(.35+.65*pointerReach(p,view));
      expect(Math.abs(Math.hypot(c.value.x,c.value.y)-target)).toBeLessThan(target*.015);
    }
  });
  it('pans directly toward every target, including the old arc transition angles',()=>{
    const a={x:100,y:0},b={x:0,y:60};
    const next=followOffset(a,b,.25);
    expect(next).toEqual({x:75,y:15});
    const reverse=followOffset(a,{x:-100,y:0},.5);
    expect(reverse).toEqual({x:0,y:0});
    for(const angle of [0,Math.PI/2-.001,Math.PI/2+.001,Math.PI*5/6,Math.PI,-Math.PI+.001]){
      const target={x:60*Math.cos(angle),y:60*Math.sin(angle)};
      const result=followOffset(a,target,.25);
      expect(result.x).toBeCloseTo(75+target.x*.25);
      expect(result.y).toBeCloseTo(target.y*.25);
    }
  });
  it('keeps combined turn and extension motion consistent across frame rates',()=>{
    const run=(fps:number)=>{
      const c=settled();
      for(let i=1;i<=fps;i++){
        const t=i/fps,angle=t*2;
        const radius=180+90*Math.cos(t*Math.PI*2);
        c.update({x:center.x+Math.cos(angle)*radius,y:center.y+Math.sin(angle)*radius},view,angle,1/fps);
      }
      return {...c.value};
    };
    const reference=run(144);
    for(const fps of [30,60]){const p=run(fps);expect(Math.hypot(p.x-reference.x,p.y-reference.y)).toBeLessThan(2);}
  });
  it('has continuous orbital velocity where the old rectangle handed off at a corner',()=>{
    const h=Math.atan2(view.height,view.width),epsilon=.00001;
    const a=headingExtension(view,h-epsilon,1),b=headingExtension(view,h,1),c=headingExtension(view,h+epsilon,1);
    const left={x:(b.x-a.x)/epsilon,y:(b.y-a.y)/epsilon};
    const right={x:(c.x-b.x)/epsilon,y:(c.y-b.y)/epsilon};
    expect(Math.hypot(left.x-right.x,left.y-right.y)).toBeLessThan(.02);
  });
  it('has no mouse-distance derivative handoff when crossing a diagonal',()=>{
    const epsilon=.00001;
    const reach=(x:number)=>pointerReach({x:800+500*x,y:364+300*.4},view);
    const left=(reach(.4)-reach(.4-epsilon))/epsilon;
    const right=(reach(.4+epsilon)-reach(.4))/epsilon;
    expect(Math.abs(left-right)).toBeLessThan(.001);
  });
  it('keeps minimum reach at 35% of the maximum along every heading',()=>{
    for(const heading of [0,Math.PI/2,Math.PI/4,Math.PI]){
      const c=new PilotCameraOffset();
      for(let i=0;i<180;i++)c.update(center,view,heading,1/60);
      const max=lookAhead(right,view,heading),min=lookAhead(center,view,heading);
      expect(c.value.x).toBeCloseTo(max.x*.35);
      expect(c.value.y).toBeCloseTo(max.y*.35);
      expect(min.x).toBeCloseTo(max.x*.35);expect(min.y).toBeCloseTo(max.y*.35);
    }
  });
  it('scales the same world look-ahead proportionally with zoom',()=>{
    const offset=lookAhead(right,view,0),framingZoom=.4;
    const worldOffset=offset.x/framingZoom;
    expect(worldOffset*.2).toBeCloseTo(offset.x*.5);
    expect(worldOffset*.8).toBeCloseTo(offset.x*2);
  });
  it('has the same zoom easing at 30, 60 and 144 fps',()=>{
    const result=(fps:number)=>{let zoom=1;for(let i=0;i<fps/2;i++)zoom+=(.6-zoom)*cameraBlend(.12,1/fps);return zoom;};
    expect(result(30)).toBeCloseTo(result(60),10);expect(result(144)).toBeCloseTo(result(60),10);
  });
  it('keeps the world aim direction correct with an off-center ship',()=>{
    const ship={x:1000,y:2000},cam={x:1200,y:2100,zoom:.5},cursor={x:1100,y:410};
    const screen=worldToClient(ship,cam,view),target=clientToWorld(cursor,cam,view);
    expect(Math.atan2(cursor.y-screen.y,cursor.x-screen.x)).toBeCloseTo(Math.atan2(target.y-ship.y,target.x-ship.x));
  });
});

describe('circular camera orbit',()=>{
  it('has constant orbit speed through a full turn, including wide viewports',()=>{
    for(const width of [600,1000,2400]){
      const v={...view,width};
      const distances:number[]=[];
      let previous=headingExtension(v,0,1);
      for(let i=1;i<=360;i++){
        const next=headingExtension(v,i*Math.PI/180,1);
        distances.push(Math.hypot(next.x-previous.x,next.y-previous.y));
        expect(Math.hypot(next.x,next.y)).toBeLessThanOrEqual(v.height*.225+1e-9);
        previous=next;
      }
      expect(Math.max(...distances)-Math.min(...distances)).toBeLessThan(1e-9);
    }
  });
});


describe('ship-relative reach input',()=>{
  it('does not extend when the pointer circles an off-center ship to turn around',()=>{
    const input=new PilotReachInput(),ship={x:640,y:364};
    const start=input.update({x:ship.x+140,y:ship.y},ship,view);
    for(let i=1;i<=180;i++){
      const angle=i*Math.PI/180;
      const reach=input.update({x:ship.x+140*Math.cos(angle),y:ship.y+140*Math.sin(angle)},ship,view);
      expect(reach).toBeCloseTo(start,10);
    }
    // The old viewport-centered measure interpreted this as maximum reach.
    expect(pointerReach({x:ship.x-140,y:ship.y},view)).toBe(1);
    expect(start).toBeLessThan(.4);
  });
  it('ignores ship movement from camera turns and zoom with a stationary pointer',()=>{
    const input=new PilotReachInput(),pointer={x:900,y:364};
    const start=input.update(pointer,center,view);
    for(let i=0;i<360;i++){
      const a=i*Math.PI/180,ship={x:center.x-150*Math.cos(a),y:center.y-150*Math.sin(a)};
      expect(input.update(pointer,ship,view)).toBeCloseTo(start,10);
    }
  });
  it('still extends and retracts from deliberate radial mouse movement',()=>{
    const input=new PilotReachInput(),ship={x:650,y:400};
    expect(input.update({x:ship.x+300,y:ship.y},ship,view)).toBe(1);
    expect(input.update({x:ship.x+140,y:ship.y},ship,view)).toBeLessThan(.4);
    expect(input.update(ship,ship,view)).toBe(0);
    expect(input.update({x:ship.x-300,y:ship.y},ship,view)).toBe(1);
  });
  it('keeps input bounded at off-screen edges and reanchors after focus loss',()=>{
    const input=new PilotReachInput();
    expect(input.update({x:3000,y:364},center,view)).toBe(1);
    expect(input.update({x:2900,y:364},center,view)).toBe(1);
    expect(input.update(null,center,view)).toBe(0);
    expect(input.update(center,center,view)).toBe(0);
  });
});


describe('moving-origin reach regression',()=>{
  it('reanchors near the ship after a held-pointer camera turn instead of retaining stale reach',()=>{
    const input=new PilotReachInput();
    expect(input.update({x:1100,y:364},center,view)).toBe(1);
    const shifted={x:1000,y:364};
    expect(input.update({x:1100,y:364},shifted,view)).toBe(1);
    expect(input.update({x:1099,y:364},shifted,view)).toBeLessThan(.1);
    expect(input.update(shifted,shifted,view)).toBe(0);
  });
  it('preserves normalized reach when resizing under a stationary mouse',()=>{
    const input=new PilotReachInput(),pointer={x:950,y:364};
    const before=input.update(pointer,center,view);
    expect(input.update(pointer,center,{...view,width:500,height:300})).toBeCloseTo(before,10);
  });
  it('does not accumulate reach through repeated turns with a moving off-center ship',()=>{
    for(const fps of [30,60,144])for(const phase of [-.4,.4]){
      const input=new PilotReachInput();let initial=0;
      for(let i=0;i<=fps*4;i++){
        const angle=i/fps*Math.PI;
        const ship={x:center.x-100*Math.cos(angle+phase),y:center.y-100*Math.sin(angle+phase)};
        const pointer={x:center.x+120*Math.cos(angle),y:center.y+120*Math.sin(angle)};
        const reach=input.update(pointer,ship,view);
        if(i===0)initial=reach;
        // The cursor-to-ship distance is constant throughout both complete turns.
        expect(reach).toBeCloseTo(initial,8);
      }
    }
  });
});


describe('smooth distance response',()=>{
  it('uses matching smooth inward and outward motion, without overshoot or sharp frame steps',()=>{
    const inward=settled(),outward=new PilotCameraOffset();
    for(let i=0;i<240;i++)outward.update(center,view,0,1/60);
    let lastIn=inward.value.x,lastOut=outward.value.x;
    for(let i=0;i<180;i++){
      const a=inward.update(center,view,0,1/60).x;
      const b=outward.update(right,view,0,1/60).x;
      expect(a).toBeLessThanOrEqual(lastIn+.00001);
      expect(b).toBeGreaterThanOrEqual(lastOut-.00001);
      expect(a).toBeGreaterThanOrEqual(minReach-.001);
      expect(b).toBeLessThanOrEqual(maxReach+.001);
      expect(lastIn-a).toBeLessThan(3.1);
      expect(b-lastOut).toBeLessThan(3.1);
      expect((maxReach-a)-(b-minReach)).toBeCloseTo(0,3);
      lastIn=a;lastOut=b;
    }
    expect(lastIn).toBeCloseTo(minReach,3);
    expect(lastOut).toBeCloseTo(maxReach,3);
  });
});
