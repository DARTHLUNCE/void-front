// Run with tsx from the repository root. Timings are diagnostics, not CI assertions.
import { createWorld, step } from '../../../shared/src/sim/step';
import { resolveCollisions } from '../../../shared/src/sim/systems/movement';
for (const fleetSize of [30, 60]) {
  const w = createWorld({ seed: 1234, fleetSize });
  for (let i = 0; i < 600; i++) step(w);
  const start = performance.now();
  for (let i = 0; i < 1200; i++) step(w);
  const total = performance.now() - start;
  const collisionStart = performance.now();
  for (let i = 0; i < 1000; i++) resolveCollisions(w);
  console.log(JSON.stringify({ ships: fleetSize * 2, simulationMsPerTick: total / 1200, restingCollisionMsPerTick: (performance.now() - collisionStart) / 1000 }));
}

// Deliberately overlapping dreadnoughts, reset before each sample.
for (const count of [30,60,120]) {
 const w=createWorld({seed:1234,fleetSize:count/2,classId:'dreadnought'});
 const times:number[]=[];
 for(let i=0;i<12;i++) {
  for(const s of w.ships) {s.x=9000+(s.slot%10)*200;s.y=4500+Math.floor(s.slot/10)*130;s.angle=s.slot*.31;s.alive=true;}
  const t=performance.now();resolveCollisions(w);times.push(performance.now()-t);
 }
 times.sort((a,b)=>a-b);
 console.log(JSON.stringify({ships:count,median:times[6],p95:times[11]}));
}
