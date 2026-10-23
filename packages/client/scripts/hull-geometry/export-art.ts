import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HULLS } from '../../src/art/hulls';
import { bounds } from '../../src/art/shapes';
import { rasterMask } from '../../src/art/mask';
const output = HULLS.map(h => {
  const b = bounds(h.shapes);
  const m = rasterMask(h.shapes, b.x0, b.y0, b.x1, b.y1, Math.max(b.x1-b.x0,b.y1-b.y0)/64);
  return { id:h.id, classId:h.classId, bounds:b, mask:{...m,owner:Array.from(m.owner)} };
});
writeFileSync(fileURLToPath(new URL('./hull-art.generated.json', import.meta.url)), JSON.stringify(output));
