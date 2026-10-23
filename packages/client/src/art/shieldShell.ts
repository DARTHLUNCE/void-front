/**
 * Energy shield shells that hug a hull's outline, baked from its sprite with Canvas 2D: a soft rim
 * in the band just outside the plating, and a hex lattice over the whole field (fainter over the
 * hull itself). Used by the in-game renderer and the title screen battle.
 */
export interface ShieldShell {
  rim: HTMLCanvasElement;
  hex: HTMLCanvasElement;
  /** Padding (px of the source drawing) the shell extends beyond the sprite on every side. */
  pad: number;
  /** Points on the rim (px from the shell centre), for collapse sparks. */
  pts: [number, number][];
}

/** Shield tints per team: the game's shield cyan for Cobalt, a warm amber for Ember. */
export const SHIELD_TINT = ['111, 243, 255', '255, 196, 120'] as const;
export const SHIELD_TINT_HEX = [0x6ff3ff, 0xffc478] as const;

/** How far the shell stands off a hull drawn `length` px long. */
export function shellPad(length: number): number {
  return Math.max(7, length * 0.07);
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
  hg.filter = `blur(${(pad * 0.55).toFixed(1)}px)`;
  for (let i = 0; i < 3; i++) hg.drawImage(sil, 0, 0);
  // Rim: the halo minus a tighter blur of the hull, so a thin band follows the outline.
  const [rim, rg] = canvasOf(W, HH);
  rg.drawImage(halo, 0, 0);
  rg.globalCompositeOperation = 'destination-out';
  rg.filter = `blur(${(pad * 0.18).toFixed(1)}px)`;
  rg.drawImage(sil, 0, 0);
  rg.drawImage(sil, 0, 0);
  rg.filter = 'none';
  rg.globalCompositeOperation = 'source-in';
  rg.fillStyle = `rgb(${rgb})`;
  rg.fillRect(0, 0, rim.width, rim.height);
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
  // Points on the rim for the collapse sparks.
  const data = rg.getImageData(0, 0, rim.width, rim.height).data;
  const pts: [number, number][] = [];
  for (let tries = 0; tries < 4000 && pts.length < 48; tries++) {
    const px = Math.floor(Math.random() * rim.width);
    const py = Math.floor(Math.random() * rim.height);
    if (data[(py * rim.width + px) * 4 + 3] > 110) pts.push([px - rim.width / 2, py - rim.height / 2]);
  }
  return { rim, hex, pad, pts };
}
