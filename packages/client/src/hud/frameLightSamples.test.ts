import { test } from 'vitest';
import assert from 'node:assert/strict';
import { FrameLightSamples } from './frameLightSamples';

const view = { x: 0, y: 0, zoom: 1, left: 340, top: 80, width: 900, height: 640 };
const lights = Array.from({ length: 80 }, (_, i) => ({ x: i*7-280, y: i%9*30-120, radius: 10+i%5, color: i%2 ? 0x40aaff : 0xff7830, intensity: 1 }));
const settle = (samples: FrameLightSamples, sources = lights) => { for (let i=0;i<90;i++) samples.update(sources,view,16.667); };

test('all emitters contribute independently of insertion order', () => {
  const a = new FrameLightSamples(), b = new FrameLightSamples();
  settle(a); settle(b,[...lights].reverse());
  for (let i=0;i<24;i++) assert(Math.abs(a.colors[i]-b.colors[i])<1e-6);
  for (let i=0;i<16;i++) assert(Math.abs(a.positions[i]-b.positions[i])<1e-4);
});
test('no top-N cutoff: adding more emitters increases lighting', () => {
  const a=new FrameLightSamples(),b=new FrameLightSamples();
  settle(a,lights.slice(0,16));settle(b);
  assert(b.colors.reduce((a,b)=>a+b,0)>a.colors.reduce((a,b)=>a+b,0));
});
test('team color and finite bounded energy survive bright sources', () => {
  const a=new FrameLightSamples();
  settle(a,[{x:0,y:0,radius:100,color:0x0000ff,intensity:10000}]);
  for(let i=0;i<8;i++) { assert.equal(a.colors[i*3],0);assert.equal(a.colors[i*3+1],0);assert(a.colors[i*3+2]>1); }
  assert([...a.colors,...a.positions].every(Number.isFinite));
  assert([...a.colors].every(v=>v>=0&&v<=1.40001));
});
test('disabled/expired lights decay without persisting', () => {
  const a=new FrameLightSamples();settle(a);
  const previous=a.colors[0];a.update([],view,16.667);assert(a.colors[0]>0&&a.colors[0]<previous);
  for(let i=0;i<120;i++)a.update([],view,16.667);
  assert(Math.max(...a.colors)<1e-6);
});
test('small camera movement has a continuous response', () => {
  const a=new FrameLightSamples();settle(a);const before=a.colors.slice();
  a.update(lights,{...view,x:.25},16.667);
  assert(Math.max(...a.colors.map((v,i)=>Math.abs(v-before[i])))<.001);
});
test('zero-radius emitters do not affect the frame', () => {
  const a=new FrameLightSamples();a.update([{x:0,y:0,radius:0,color:0xffffff}],view,100);
  assert.equal(Math.max(...a.colors),0);
});

test('game-sized engine cores still illuminate the cockpit at pilot zoom', () => {
  const a=new FrameLightSamples();
  for(let i=0;i<90;i++)a.update([{x:-1400,y:0,radius:8,color:0x60bcff,intensity:1}],{x:0,y:0,zoom:.25,left:370,top:90,width:890,height:600},16.667);
  assert(Math.max(...a.colors)>.03,'core size must not make screen reflection imperceptible');
});

test('distant offscreen emitters cannot wash out the frame response', () => {
  const a=new FrameLightSamples();
  a.update([{x:20000,y:0,radius:100,color:0xffffff,intensity:10000}],view,100);
  assert.equal(Math.max(...a.colors),0);
});
