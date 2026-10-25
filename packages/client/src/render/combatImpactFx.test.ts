import { describe, expect, it, vi } from 'vitest';
vi.mock('./abilityFxBatch',()=>({
  FX_SURFACE:{glow:0,detonation:24,smoke:35,impact:36},
  AbilityFxBatch:class {
    used=0;mesh={};bloom={};calls:any[]=[];
    get remaining(){return 4096-this.used;}
    begin(){this.used=0;this.calls=[];}end(){}
    patch(p:any){this.used++;this.calls.push(p);}
  },
}));
import { AbilityFxBatch } from './abilityFxBatch';
import { CombatImpactFx } from './combatImpactFx';
const setup=()=>{const batch=new AbilityFxBatch();return {batch,fx:new CombatImpactFx(batch)};};
describe('shared combat impact rendering',()=>{
  it('caps a sustained barrage and eventually releases every effect',()=>{
    const {fx,batch}=setup();fx.begin(0);
    for(let i=0;i<2000;i++)fx.emit(i*30,0,30,220,0xffaa66);
    expect(fx.count).toBe(96);fx.begin(.15);fx.draw(()=>true);
    expect(batch.used).toBeLessThanOrEqual(384);expect(fx.smoke.used).toBeLessThanOrEqual(192);
    batch.begin();fx.begin(3);fx.draw(()=>true);expect(fx.count).toBe(0);expect(batch.used).toBe(0);expect(fx.smoke.used).toBe(0);
  });
  it('merges nearby contacts without swallowing a subsequent larger detonation',()=>{
    const {fx,batch}=setup();fx.begin(0);fx.emit(0,0,4,110,0xffaa66);fx.emit(1,1,120,700,0xffd49a);
    expect(fx.count).toBe(1);fx.begin(.6);fx.draw(()=>true);expect(batch.used).toBeGreaterThan(0);
    fx.reset();expect(fx.count).toBe(0);
  });
  it('culls offscreen blasts without allocating draw geometry or smoke',()=>{
    const {fx,batch}=setup();fx.begin(0);fx.emit(10000,0,120,700,0xffa040);fx.begin(.2);fx.draw(()=>false);
    expect(batch.used).toBe(0);expect(fx.smoke.used).toBe(0);
  });
  it('reserves shared batch capacity for abilities and clamps smoke submissions',()=>{
    const {fx,batch}=setup();fx.begin(0);fx.emit(0,0,120,700,0xffa040);fx.begin(.2);
    vi.spyOn(batch,'remaining','get').mockReturnValue(128);fx.draw(()=>true);expect(batch.used).toBe(0);
    for(let i=0;i<500;i++)fx.smokePuff(0,0,20,1,.2,i);expect(fx.smoke.used).toBe(192);
  });
  it('keeps the blast origin stable and uses finite eased geometry throughout its lifetime',()=>{
    const {fx,batch}=setup();const patch=vi.spyOn(batch,'patch');fx.begin(0);fx.emit(20,40,18,220,0xffa040,Math.PI);
    for(let i=0;i<100;i++){batch.begin();fx.begin(i/60);fx.draw(()=>true);}
    expect(patch.mock.calls.length).toBeGreaterThan(10);
    for(const [p] of patch.mock.calls)for(const v of [p.x,p.y,p.width,p.height,p.alpha??1])expect(Number.isFinite(v)).toBe(true);
  });
});
