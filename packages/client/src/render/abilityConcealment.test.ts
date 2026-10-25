import {expect,it} from 'vitest';
import {AbilityConcealment} from './abilityConcealment';
it('eases the actual hull into cloak and promptly returns on an early reveal',()=>{
  const c=new AbilityConcealment();
  expect(c.sample(0,0,true,0).alpha).toBe(1);
  expect(c.sample(0,0,true,.2).alpha).toBeCloseTo(.26);
  expect(c.sample(0,0,false,.3).alpha).toBeCloseTo(.26);
  expect(c.sample(0,0,false,.37).alpha).toBeCloseTo(.63);
  expect(c.sample(0,0,false,.45).alpha).toBe(1);
  expect(c.sample(0,0,false,.6).leaving).toBe(0);
});
it('starts unseen/late admissions without replaying a false cast or revealing another slot',()=>{
  const c=new AbilityConcealment();
  expect(c.sample(3,0,true,2).entering).toBe(0);
  expect(c.sample(4,0,false,2).alpha).toBe(1);
  c.reset();expect(c.sample(3,0,false,2).leaving).toBe(0);
  expect(c.sample(3,3,true,3).alpha).toBe(1);
});
