import { test } from 'vitest';
import assert from 'node:assert/strict';
import { glassNormal, glassRefraction, refractionTaps } from './glassSurface';

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
test('refraction respects rounded aperture and scales with panel aspect ratio',()=>{
  assert.deepEqual(glassRefraction(0,0,320,160,20),[0,0]);
  assert.ok(glassRefraction(160,80,320,160,20).every(value=>value===0));
  const wide=glassNormal(288,80,320,160,16), square=glassNormal(144,80,160,160,16);
  assert.ok(Math.abs(wide[0])<Math.abs(square[0]));
  for(let y=0;y<=160;y+=2) for(let x=0;x<=320;x+=2) {
    const d=glassRefraction(x,y,320,160,20);
    assert.ok(d.every(Number.isFinite));assert.ok(Math.hypot(...d)<=3.200001);
  }
});
test('bilinear taps reconstruct subpixel ramps and preserve constant colors',()=>{
  for(const dx of [-3.2,-1.01,-.5,0,.03,.5,2.8]) for(const dy of [-2.4,-.2,0,.1,1.5,3.2]) {
    const taps=refractionTaps(dx,dy);
    assert.ok(taps.every(t=>Number.isInteger(t.x)&&Number.isInteger(t.y)&&t.weight>=0));
    assert.ok(Math.abs(taps.reduce((sum,t)=>sum+t.weight,0)-1)<1e-12);
    assert.ok(Math.abs(taps.reduce((sum,t)=>sum+t.x*t.weight,0)-dx)<1e-12);
    assert.ok(Math.abs(taps.reduce((sum,t)=>sum+t.y*t.weight,0)-dy)<1e-12);
  }
});
