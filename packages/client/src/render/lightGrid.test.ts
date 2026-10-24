import { describe, expect, it } from 'vitest';
import { LightGrid, type SceneLight } from './lightGrid';
const light=(x:number,radius:number,color=0xffffff):SceneLight=>({x,y:0,radius,color,intensity:1});
function build(lights:SceneLight[],budget=6) {
  const grid=new LightGrid();
  grid.update(lights,0,0,1,128,128,32,32,0,0,budget);
  return grid;
}
describe('crowded VFX lighting',()=>{
  it('prioritizes a nearby impact over a larger distant source',()=>{
    const grid=build([light(400,25),light(0,10)],1);
    expect(grid.tiles.data[1]).toBe(1);
    expect(grid.indices.data[0]).toBe(1);
    expect(grid.overflow.data[0]).toBeGreaterThan(0);
  });
  it('retains every omitted light as diffuse energy with bounded direct lists',()=>{
    const grid=build(Array.from({length:20},()=>light(0,10)));
    expect(grid.tiles.data[1]).toBe(6);
    expect(Array.from(grid.overflow.data.slice(0,3))).toEqual([14,14,14]);
  });
  it('preserves colour, intensity and clears overflow on a quiet frame',()=>{
    const grid=build([light(0,10,0xff0000),{...light(0,10,0x00ff00),intensity:.5}],0);
    expect(Array.from(grid.overflow.data.slice(0,3))).toEqual([1,.5,0]);
    grid.update([],0,0,1,128,128,32,32,0,0,6);
    expect(grid.tiles.data[1]).toBe(0);
    expect(Array.from(grid.overflow.data)).toEqual([0,0,0,0]);
  });
  it('does not allocate direct or overflow light for sources outside their range',()=>{
    const grid=build([light(10000,10)]);
    expect(grid.tiles.data[1]).toBe(0);
    expect(grid.overflow.data[0]).toBe(0);
  });
});
