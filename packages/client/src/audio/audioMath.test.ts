import { describe,it,expect } from 'vitest';
import { attenuation, spatial, distanceMix, doppler, nextVariant, pitchVariationCents, voiceScore } from './audioMath';
describe('spatial audio',()=>{
  it('keeps firing pitch stable without removing small decorrelation',()=>{
    for(const id of ['weapon.patrol','weapon.ordnance','secondary.carrier','turret.fob.laser','drone.bomber']){
      expect(pitchVariationCents(id,'world',false,0)).toBe(-3);
      expect(pitchVariationCents(id,'world',false,1)).toBe(3);
      expect(pitchVariationCents(id,'world',false,.5)).toBe(0);
    }
    expect(pitchVariationCents('weapon.flyby','world',false,1)).toBe(20);
    expect(pitchVariationCents('engine.patrol','engines',true,1)).toBe(9);
  });
  it('has continuous distance fade and a genuinely silent boundary',()=>{
    let previous=1;
    for(let d=0;d<=2000;d+=5){const gain=attenuation(d,1800);expect(gain).toBeGreaterThanOrEqual(0);expect(gain).toBeLessThanOrEqual(previous);previous=gain;}
    expect(attenuation(1800,1800)).toBe(0);expect(attenuation(1799,1800)).toBeLessThan(.00001);
  });
  it('preserves left/right and circular distance across screen aspect or camera zoom',()=>{
    const l={x:100,y:100};
    const left=spatial({x:-400,y:100},l,1800),right=spatial({x:600,y:100},l,1800),top=spatial({x:100,y:-400},l,1800);
    expect(left.pan).toBeCloseTo(-right.pan);expect(left.gain).toBe(right.gain);expect(top.gain).toBe(left.gain);expect(top.pan).toBeCloseTo(0);
    expect(spatial(l,l,1800).pan).toBe(0);
  });
  it('uses the ship nose as forward while the world and camera stay fixed',()=>{
    const source={x:0,y:5000};
    const right=spatial(source,{x:0,y:0,heading:0},8000);
    const ahead=spatial(source,{x:0,y:0,heading:Math.PI/2},8000);
    const left=spatial(source,{x:0,y:0,heading:Math.PI},8000);
    expect(right.pan).toBeGreaterThan(.9);expect(ahead.pan).toBeCloseTo(0);
    expect(ahead.z).toBeLessThan(0);expect(left.pan).toBeLessThan(-.9);
    expect(right.gain).toBe(ahead.gain);expect(left.gain).toBe(ahead.gain);
    expect(spatial(source,{x:0,y:0,heading:-Math.PI/2},8000).z).toBeGreaterThan(0);
  });
  it('keeps off-screen battles audible with progressive distance coloration',()=>{
    const near=spatial({x:600,y:0},{x:0,y:0},8000);
    const far=spatial({x:3500,y:0},{x:0,y:0},8000);
    expect(far.gain).toBeGreaterThan(.1);expect(far.gain).toBeLessThan(near.gain);
    expect(far.cutoff).toBeLessThan(near.cutoff);
    expect(far.cutoff).toBeLessThan(1800);
    expect(distanceMix(0)).toBe(0);expect(distanceMix(2500)).toBe(1);
    expect(distanceMix(1000)).toBeGreaterThan(0);expect(distanceMix(1000)).toBeLessThan(1);
  });
  it('narrows nearby panning without removing its direction or changing distant bearings',()=>{
    const origin={x:0,y:0};
    const close=spatial({x:100,y:0},origin,8000),near=spatial({x:600,y:0},origin,8000),far=spatial({x:4500,y:0},origin,8000);
    expect(close.pan).toBeGreaterThan(.1);expect(close.pan).toBeLessThan(.16);
    expect(near.pan).toBeGreaterThan(close.pan);expect(near.pan).toBeLessThan(.32);
    expect(far.pan).toBeGreaterThan(.95);
    expect(spatial({x:-100,y:0},origin,8000).pan).toBeCloseTo(-close.pan);
  });
  it('bounds Doppler and cancels common translation',()=>{
    expect(doppler({x:500,y:0,vx:400},{x:0,y:0,vx:400})).toBe(1);
    expect(doppler({x:100,y:0,vx:1e9},{x:0,y:0})).toBe(.94);
    expect(doppler({x:100,y:0,vx:-1e9},{x:0,y:0})).toBe(1.06);
  });
  it('never repeats the previous variant and can select every other one',()=>{
    for(let last=0;last<4;last++){const picked=new Set<number>();for(let i=0;i<=100;i++){const v=nextVariant(4,last,i/100);expect(v).not.toBe(last);picked.add(v);}expect(picked.size).toBe(3);}
    expect(nextVariant(1,0,.5)).toBe(0);
  });
  it('retains important pilot cues above quiet remote clutter',()=>{
    expect(voiceScore(95,.4,true)).toBeGreaterThan(voiceScore(40,.08));
  });
});
