import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MOTHERSHIP_ART } from '../../src/art/props';
import { FOB_ART, NODE_ART } from '../../src/art/stations';
import { CRAFT } from '../../src/art/craft';
import { bounds, ngon, type Shape } from '../../src/art/shapes';
import { rasterMask } from '../../src/art/mask';
import { DEPLOYABLES } from '@void-front/shared';

const shapes: Record<string, Shape[]> = { mothership: MOTHERSHIP_ART, fob: FOB_ART, ...NODE_ART };
for (const [id, art] of Object.entries(CRAFT)) shapes[`craft-${id}`] = art.shapes;
shapes.drone = [{ t: 'poly', pts: [14,0,5,-3.5,-4,-8.5,-8,-6.5,-5,-2.5,-9,0,-5,2.5,-8,6.5,-4,8.5,5,3.5], fill: 'hull', stroke: 'dark', w: 1.5 }];
for (const [id, def] of Object.entries(DEPLOYABLES)) {
  if (id === 'mine') shapes[id] = [{ t: 'circle', x: 0, y: 0, r: def.radius + 1, fill: 'hull' }];
  else shapes[id] = [{ t: 'poly', pts: ngon(0, 0, def.radius, id === 'platform' ? 6 : 8, id === 'platform' ? 0 : Math.PI / 8), fill: 'hull', stroke: 'metal', w: id === 'platform' ? 5 : id === 'beacon' ? 3.5 : 3 }];
}
const output = Object.entries(shapes).map(([id, shapes]) => {
  const b = bounds(shapes);
  const mask = rasterMask(shapes, b.x0, b.y0, b.x1, b.y1, Math.max(b.x1-b.x0,b.y1-b.y0)/64);
  return { id, bounds: b, mask: { ...mask, owner: Array.from(mask.owner) } };
});
writeFileSync(fileURLToPath(new URL('./world-art.generated.json', import.meta.url)), JSON.stringify(output));
