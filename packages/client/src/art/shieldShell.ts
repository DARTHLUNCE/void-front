/**
 * Energy shield shells that hug a hull's outline, baked from its sprite with Canvas 2D: a soft rim
 * in the band just outside the plating, and a hex lattice over the whole field (fainter over the
 * hull itself). Used by the in-game renderer and the title screen battle.
 */
export interface ShieldShell {
  rim: HTMLCanvasElement;
  hex: HTMLCanvasElement;
  /** Solid enclosed field for scene refraction, with the same antialiased contour. */
  field: HTMLCanvasElement;
  /** Padding (px of the source drawing) the shell extends beyond the sprite on every side. */
  pad: number;
  /** Radius of the baked lattice cells in source pixels. */
  hexRadius: number;
  /** Points on the rim (px from the shell centre), for collapse sparks. */
  pts: [number, number][];
}

/** Shield tints per team: the game's shield cyan for Cobalt, a warm amber for Ember. */
export const SHIELD_TINT = ['111, 243, 255', '255, 196, 120'] as const;
export const SHIELD_TINT_HEX = [0x6ff3ff, 0xffc478] as const;

/** How far the shell stands off a hull drawn `length` px long. */
export function shellPad(length: number): number {
  return Math.max(1, length * 0.13);
}

function canvasOf(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

/** Bake the shell for `image` drawn at `length` × `height` px (nose +x), in colour `rgb` ("r, g, b"). */
export function bakeShieldShell(image: CanvasImageSource, length: number, height: number, rgb: string): ShieldShell {
  const L = length;
  const H = height;
  const pad = shellPad(L);
  const W = L + pad * 2;
  const HH = H + pad * 2;
  const [sil, sg] = canvasOf(W, HH);
  sg.drawImage(image, pad, pad, L, H);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = '#fff';
  sg.fillRect(0, 0, sil.width, sil.height);
  const [halo, hg] = canvasOf(W, HH);
  // Smooth small protrusions more strongly; padding contains the wider filter footprint.
  hg.filter = `blur(${(L * 0.08).toFixed(1)}px)`;
  for (let i = 0; i < 3; i++) hg.drawImage(sil, 0, 0);
  // Rim: the halo minus a tighter blur of the hull, so a thin band follows the outline.
  const [rim, rg] = canvasOf(W, HH);
  const field=hg.getImageData(0,0,halo.width,halo.height),pixels=rg.createImageData(rim.width,rim.height);
  const [coverage,cg]=canvasOf(W,HH),cover=cg.createImageData(rim.width,rim.height);
  const tint=rgb.split(',').map(Number),smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
  // A one-pixel antialiased outer contour; energy falls only inward toward the plating.
  for(let y=1;y<rim.height-1;y++)for(let x=1;x<rim.width-1;x++){
    const i=(y*rim.width+x)*4,u=field.data[i+3]/255;
    const gx=(field.data[i+7]-field.data[i-1])/510,gy=(field.data[i+rim.width*4+3]-field.data[i-rim.width*4+3])/510;
    const aa=Math.max(1/255,Math.hypot(gx,gy)*.5);
    const outer=smooth((u-.28+aa)/(2*aa));
    // Start losing energy immediately inside the contour: no broad, bright plateau.
    const inner=Math.exp(-10.5*Math.max(0,u-.28));
    cover.data[i]=cover.data[i+1]=cover.data[i+2]=255;cover.data[i+3]=255*outer;
    pixels.data[i]=tint[0];pixels.data[i+1]=tint[1];pixels.data[i+2]=tint[2];pixels.data[i+3]=255*outer*inner;
  }
  rg.putImageData(pixels,0,0);cg.putImageData(cover,0,0);
  // Hex lattice across the whole field, fading over the hull itself.
  const [hex, xg] = canvasOf(W, HH);
  const r = Math.max(3.5, L * 0.03);
  xg.strokeStyle = `rgb(${rgb})`;
  xg.lineWidth = Math.max(1, L / 220);
  xg.beginPath();
  for (let row = 0, y = 0; y < HH + r * 2; row++, y += r * 1.5) {
    for (let x = row % 2 ? r * 0.866 : 0; x < W + r * 2; x += r * 1.732) {
      for (let k = 0; k < 6; k++) {
        const a0 = (Math.PI / 3) * k + Math.PI / 6;
        const a1 = a0 + Math.PI / 3;
        xg.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
        xg.lineTo(x + Math.cos(a1) * r, y + Math.sin(a1) * r);
      }
    }
  }
  xg.stroke();
  xg.globalCompositeOperation = 'destination-in';
  xg.drawImage(halo, 0, 0);
  xg.globalCompositeOperation = 'destination-out';
  xg.globalAlpha = 0.55;
  xg.drawImage(sil, 0, 0);
  // Trace every bearing deterministically. Random sparse rim samples left the smaller
  // hulls with misplaced arcs and lights, sometimes jumping to the opposite rim.
  const pts: [number, number][] = [];
  const data=pixels.data,cx=rim.width/2,cy=rim.height/2;
  for(let j=0;j<64;j++){
    const angle=j*Math.PI/32,dx=Math.cos(angle),dy=Math.sin(angle);
    const limit=Math.min(cx/Math.max(.0001,Math.abs(dx)),cy/Math.max(.0001,Math.abs(dy)))-1;
    let best=0,dist=0;
    for(let r=limit;r>=0;r-=.5){
      const x=Math.max(0,Math.min(rim.width-1,Math.round(cx+dx*r)));
      const y=Math.max(0,Math.min(rim.height-1,Math.round(cy+dy*r)));
      const a=data[(y*rim.width+x)*4+3];
      if(a>best){best=a;dist=r;}
    }
    pts.push([dx*dist,dy*dist]);
  }
  return { rim, hex, field:coverage, pad, pts, hexRadius:r };
}
