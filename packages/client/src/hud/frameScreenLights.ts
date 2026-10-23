import panelLayout from '../../public/assets/ui/noir-panel-layout.json';
import { mapFrameRect, type FrameGeometry, type FramePiece, type Rect } from './frameGeometry';

export const MAX_SCREEN_LIGHTS = 32;
interface FrameSection { piece: { kind: FramePiece; geometry?: FrameGeometry }; rect: DOMRect; clip: DOMRect }

/** Emissive display rectangles, sharing the exact retargeted glass geometry. */
export class FrameScreenLights {
  readonly rectangles = new Float32Array(MAX_SCREEN_LIGHTS*4);
  readonly glassDisplayBounds = new Float32Array(MAX_SCREEN_LIGHTS*4);
  readonly glassDisplayRadii = new Float32Array(MAX_SCREEN_LIGHTS);
  readonly glassBounds = new Float32Array(MAX_SCREEN_LIGHTS*4);
  readonly glassRadii = new Float32Array(MAX_SCREEN_LIGHTS);
  readonly colors = new Float32Array(MAX_SCREEN_LIGHTS*3);
  count = 0;
  private readonly panels;

  constructor(private readonly root: HTMLElement) {
    this.panels = Object.entries(panelLayout.panels).filter(([,panel])=>panel.selector).map(([name,panel])=>({
      name, radius: panel.radius, glass: panel.glass as unknown as Rect, kind: panel.glass[0]>=835?'top':'rail',
      element: root.querySelector<HTMLElement>(panel.selector!),
    }));
  }

  update(sections: readonly FrameSection[], drawerOpen: boolean): void {
    this.count=0; this.rectangles.fill(0); this.colors.fill(0);
    const rail=sections.find(section=>section.piece.kind==='rail')!;
    for (const panel of this.panels) {
      if (!panel.element || this.count>=MAX_SCREEN_LIGHTS) continue;
      const section=sections.find(section=>section.piece.kind===panel.kind);
      if (!section?.piece.geometry || section.clip.width<=0 || section.clip.height<=0) continue;
      const [x,y,r,b]=mapFrameRect(section.piece.geometry,panel.glass);
      const left=Math.max(section.rect.left+x,section.clip.left,drawerOpen&&panel.kind==='top'?rail.clip.right:0);
      const top=Math.max(section.rect.top+y,section.clip.top,0);
      const right=Math.min(section.rect.left+r,section.clip.right,window.innerWidth);
      const bottom=Math.min(section.rect.top+b,section.clip.bottom,window.innerHeight);
      if (right<=left || bottom<=top) continue;
      const enemy=panel.name==='ember'||panel.element.classList.contains('e');
      const friendly=panel.name==='cobalt'||panel.element.classList.contains('c');
      const amber=enemy||(!friendly&&this.root.dataset.team==='1');
      let color=amber?[.8,.25,.07]:[.09,.36,.8];
      if (panel.name==='clock') color=[.35,.44,.55];
      if (panel.name==='status'&&panel.element.querySelector('.hull-state.crit')) color=[.9,.045,.025];
      const disabled=panel.element instanceof HTMLButtonElement && panel.element.disabled;
      const area=(right-left)*(bottom-top);
      const strength=(disabled?.12:.45)*Math.min(1,Math.sqrt(area)/80);
      this.rectangles.set([left,top,right,bottom],this.count*4);
      // Keep full display geometry, not the clipped visible portion: scrolling
      // and the mobile drawer must not reshape a screen's lens.
      this.glassDisplayBounds.set([section.rect.left+x,section.rect.top+y,section.rect.left+r,section.rect.top+b],this.count*4);
      const corner=mapFrameRect(section.piece.geometry,[panel.glass[0],panel.glass[1],panel.glass[0]+panel.radius,panel.glass[1]+panel.radius]);
      this.glassDisplayRadii[this.count]=Math.min(corner[2]-corner[0],corner[3]-corner[1]);
      this.glassBounds.set(panel.glass,this.count*4);
      this.glassRadii[this.count]=panel.radius;
      this.colors.set(color.map(channel=>channel*strength),this.count*3);
      this.count++;
    }
  }
}
