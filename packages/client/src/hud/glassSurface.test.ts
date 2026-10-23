import { test } from 'vitest';
import assert from 'node:assert/strict';
import { glassNormal } from './glassSurface';

test('convex glass normals are finite, symmetric and point outwards for varied panels',()=>{
  for(const [w,h,r] of [[320,160,16],[160,320,24],[30,20,2],[240,40,4]]) {
    assert.deepEqual(glassNormal(w/2,h/2,w,h,r),[0,0,1]);
    for(let j=0;j<=10;j++) for(let i=0;i<=10;i++) {
      const n=glassNormal(w*i/10,h*j/10,w,h,r), opposite=glassNormal(w*(1-i/10),h*(1-j/10),w,h,r);
      assert.ok(n.every(Number.isFinite)); assert.ok(Math.abs(Math.hypot(...n)-1)<1e-12);
      assert.ok(Math.abs(n[0]+opposite[0])<1e-12 && Math.abs(n[1]+opposite[1])<1e-12);
      assert.ok(n[0]*(i-5)>=0 && n[1]*(j-5)>=0 && n[2]>0);
    }
  }
});
