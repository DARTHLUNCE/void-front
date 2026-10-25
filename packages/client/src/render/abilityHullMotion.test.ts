import { expect, it } from 'vitest';
import { abilityCameraPulse, abilityHullPose } from './abilityHullMotion';

it('materializes at the destination smoothly and restores the exact hull transform',()=>{
  const pose={alpha:1,x:1,y:1};let previous=0;
  for(let i=0;i<=100;i++){
    abilityHullPose(2,i*.0014,pose);
    expect(pose.alpha).toBeGreaterThanOrEqual(previous-1e-10);
    expect(pose.x).toBeGreaterThan(0);expect(pose.y).toBeGreaterThan(0);previous=pose.alpha;
  }
  abilityHullPose(2,.4,pose);expect(pose).toEqual({alpha:1,x:1,y:1});
  abilityHullPose(0,.04,pose);expect(pose).toEqual({alpha:1,x:1,y:1});
});
it('bounds camera movement and eases to rest without an abrupt start or exit',()=>{
  expect(abilityCameraPulse(2,0)).toBe(0);expect(abilityCameraPulse(2,.34)).toBe(0);
  expect(abilityCameraPulse(2,.001)).toBeLessThan(.000001);
  for(let i=0;i<340;i++)expect(abilityCameraPulse(2,i/1000)).toBeLessThanOrEqual(.008);
  expect(abilityCameraPulse(1,.05)).toBe(0);
});

it.each([[16,.62,.0035],[17,.36,.009],[18,.62,.0035],[22,.28,.004],[23,.28,.004]])('bounds and releases ability %s camera response',(visual,duration,limit)=>{
  expect(abilityCameraPulse(visual,0)).toBe(0);expect(abilityCameraPulse(visual,duration)).toBe(0);
  for(let i=0;i<100;i++){const value=abilityCameraPulse(visual,duration*i/100);expect(value).toBeGreaterThanOrEqual(0);expect(value).toBeLessThanOrEqual(limit);}
  expect(abilityCameraPulse(visual,.0001)).toBeLessThan(1e-8);
});
it('restores micro-jump hull pose with monotonic materialization',()=>{
  const pose={alpha:1,x:1,y:1};let previous=0;
  for(let i=0;i<=160;i++){abilityHullPose(17,i/1000,pose);expect(pose.alpha).toBeGreaterThanOrEqual(previous);previous=pose.alpha;}
  abilityHullPose(17,.3,pose);expect(pose).toEqual({alpha:1,x:1,y:1});
});
