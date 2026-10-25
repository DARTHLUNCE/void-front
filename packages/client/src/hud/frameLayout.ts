import panelLayout from '../../public/assets/ui/noir-panel-layout.json';
import { buildFrameGeometry, mapFrameRect, topFrameHeight, TOP_WRAP_WIDTH, type FrameGeometry, type FramePiece, type Rect } from './frameGeometry';

const geometries = new WeakMap<HTMLElement, FrameGeometry>();
export const frameGeometryFor = (element: HTMLElement): FrameGeometry | undefined => geometries.get(element);

/** Keep the hand-traced apertures and both artwork renderers on one resizing map. */
export function installFrameLayout(root: HTMLElement): void {
  if (typeof ResizeObserver === 'undefined') return;
  const selectors: Record<FramePiece,string> = { rail: '.noir-surface', top: '.noir-top-surface', window: '.noir-window-frame' };
  const pieces = (Object.entries(selectors) as [FramePiece,string][]).map(([kind,selector]) => {
    const element = root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing cockpit frame section: ${selector}`);
    const canvas = document.createElement('canvas');
    canvas.className = 'noir-static-frame'; canvas.setAttribute('aria-hidden','true');
    element.append(canvas);
    const panels = Object.entries(panelLayout.panels).filter(([,panel]) => panel.selector &&
      (kind === 'top' ? panel.safe[0] >= 835 : kind === 'rail' && panel.safe[0] < 835))
      .map(([name,panel]) => {
        const glow = document.createElement('div');
        glow.className = 'noir-screen-glow'; glow.dataset.screen = name; glow.setAttribute('aria-hidden','true');
        element.prepend(glow);
        return { element: root.querySelector<HTMLElement>(panel.selector!), safe: panel.safe as unknown as Rect, glass: panel.glass as unknown as Rect, glow };
      });
    return { kind, element, canvas, panels };
  });
  const artwork = new Image();
  let artworkReady = false, scheduled = 0;
  const paint = (canvas: HTMLCanvasElement, geometry: FrameGeometry): void => {
    const context = canvas.getContext('2d');
    if (!context) return;
    const dpr = Math.min(window.devicePixelRatio || 1,1.5);
    canvas.width = Math.round(geometry.width*dpr); canvas.height = Math.round(geometry.height*dpr);
    const scaleX = canvas.width/geometry.width, scaleY = canvas.height/geometry.height;
    for (const { source:[x,y,right,bottom], target:[tx,ty,tr,tb] } of geometry.patches) {
      // Shared integer pixel edges prevent transparent hairline cracks in the fallback.
      const left = Math.round(tx*scaleX), top = Math.round(ty*scaleY);
      context.drawImage(artwork,x,y,right-x,bottom-y,left,top,Math.round(tr*scaleX)-left,Math.round(tb*scaleY)-top);
    }
    canvas.parentElement!.classList.add('noir-frame-mapped');
  };
  const update = (): void => {
    scheduled = 0;
    if (!root.isConnected) { observer.disconnect(); window.removeEventListener('resize',queue); return; }
    // One shared responsive decision controls frame packing and the gameplay aperture.
    const topWidth = pieces.find(piece => piece.kind === 'top')!.element.parentElement!.clientWidth;
    root.dataset.topRows = topWidth < TOP_WRAP_WIDTH ? "2" : "1";
    const topHeight = `${topFrameHeight(topWidth)}px`;
    if (document.documentElement.style.getPropertyValue('--hud-top-height') !== topHeight) {
      document.documentElement.style.setProperty('--hud-top-height',topHeight);
    }
    const measured = pieces.map(piece => ({ piece, rect: piece.element.getBoundingClientRect() }));
    for (const { piece,rect } of measured) {
      if (!(rect.width > 0 && rect.height > 0)) continue;
      const geometry = buildFrameGeometry(piece.kind,rect.width,rect.height);
      geometries.set(piece.element,geometry);
      for (const panel of piece.panels) {
        const [gx,gy,gr,gb] = mapFrameRect(geometry,panel.glass);
        Object.assign(panel.glow.style,{left:`${gx}px`,top:`${gy}px`,width:`${gr-gx}px`,height:`${gb-gy}px`});
        if (!panel.element) continue;
        const [x,y,right,bottom] = mapFrameRect(geometry,panel.safe);
        Object.assign(panel.element.style,{left:`${x}px`,top:`${y}px`,width:`${right-x}px`,height:`${bottom-y}px`});
      }
      if (piece.kind === 'window') {
        const [x,y,right,bottom] = mapFrameRect(geometry,panelLayout.panels.gameplay.glass as unknown as Rect);
        const style = document.documentElement.style;
        style.setProperty('--play-left',`${rect.left+x}px`);
        style.setProperty('--play-top',`${rect.top+y}px`);
        style.setProperty('--play-right',`${Math.max(0,window.innerWidth-rect.left-right)}px`);
        style.setProperty('--play-bottom',`${Math.max(0,window.innerHeight-rect.top-bottom)}px`);
      }
      if (artworkReady) paint(piece.canvas,geometry);
    }
    root.dispatchEvent(new Event('noir-frame-layout'));
  };
  const queue = (): void => { if (!scheduled) scheduled = requestAnimationFrame(update); };
  const observer = new ResizeObserver(queue);
  pieces.forEach(piece => observer.observe(piece.element));
  window.addEventListener('resize',queue);
  artwork.onload = () => { artworkReady = true; queue(); };
  artwork.onerror = () => console.warn('Cockpit resizing artwork unavailable; using the original frame fallback.');
  artwork.src = '/assets/ui/noir-cockpit-cutout.png';
  queue();
}
