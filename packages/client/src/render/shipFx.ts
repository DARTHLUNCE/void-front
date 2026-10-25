import { Container, Rectangle, Sprite, Texture, type Renderer as PixiRenderer } from 'pixi.js';
import { bakeShieldShell, SHIELD_TINT, SHIELD_TINT_HEX, type ShieldShell } from '../art/shieldShell';
import type { LitArt } from './textures';
import { SHIELD_FAILURE_LIFE, shieldFailure } from './shieldFailure';
import { ShieldSurface } from './shieldSurface';
import { fxRandom,smooth } from './abilityFxCatalog';

/**
 * Cosmetic ship effects layered over the sim (nothing here changes gameplay):
 * - Hull-shaped shields: localized rim/hex impacts; whole-shell electrical failure on break.
 *   Formation, interference and dissolution evolve in the shared shield material.
 * - Hit jolts: shots nudge the hull sprite a few units.
 * - Wrecks: a destroyed ship burns out (dark, drifting, turning, blasts walking the hull), then
 *   breaks in two; the halves drift apart smouldering and fade.
 * - Smoke and debris that sit under the additive sparks.
 */
export interface ShipFxHooks {
  /** The renderer's spark particles and point lights. */
  spark(x: number, y: number, vx: number, vy: number, life: number, color: number, size: number): void;
  burst(x: number, y: number, color: number, count: number, speed: number): void;
  smoke?(x:number,y:number,size:number,alpha:number,age:number,seed:number,angle:number):void;
  faultArc?(x:number,y:number,ex:number,ey:number,width:number,color:number,alpha:number,seed:number):void;
  fieldFragment?(x:number,y:number,size:number,rotation:number,color:number,alpha:number,age:number,seed:number):void;
  light(x: number, y: number, r: number, color: number, alpha?: number): void;
}

interface Shell {
  /** Rim and lattice at a modest resolution, kept to bake the lit patches from. */
  rim: HTMLCanvasElement;
  hex: HTMLCanvasElement;
  /** Shared GPU surface for continuously positioned impacts and full-shell failure. */
  surface: ShieldSurface;
  /** World size of the shell. */
  w: number;
  h: number;
  pts: [number, number][];
  failureRim: [number,number][];
}

/** Shell textures are kept at most this many px across (they are soft glows). */
const SHELL_PX = 320;

interface SlotFx {
  /** Collapse flash: remaining time and the side it went down on (world angle). */
  collapse: number;
  /** Latches one failure episode until the shield has meaningfully recovered. */
  shieldBroken: boolean;
  collapseA: number;
  collapseContact?: {x:number;y:number};
  collapseLocal?: number;
  collapseOrigin?: {x:number;y:number;rotation:number;scale:number};
  sparkPending: boolean;
  lastHull: number;
  jx: number;
  jy: number;
  /** Impacts: the side struck (world angle, toward the shooter) and remaining life. */
  impacts: {a:number;life:number;power:number;pending:boolean;localA?:number;contact?:{x:number;y:number}}[];
}



interface Wreck {
  art: LitArt;
  team: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  /** Seconds left burning before the break-up; then the halves' life. */
  burn: number;
  burnMax: number;
  blastCd: number;
  big: number;
  halves: { sprite: Sprite; edge: Sprite; x: number; y: number; vx: number; vy: number; rot: number; spin: number; side: number }[] | null;
  life: number;
  sprite: Sprite;
}

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  seed:number;
  /** 1 smoke, 2 debris. */
  kind: 1 | 2;
  rot: number;
  spin: number;
}

const BLAST = 0xffa040;
const IMPACT_LIFE = 0.55;
/** At most this many lit patches per ship; hits on the same side refresh one patch. */
const MAX_IMPACTS = 3;
const MERGE_ARC = 0.6;
const COLLAPSE_SPARKS = 8;
// Presentation hysteresis only: combat trickle/glance restores must not resurrect a
// failed shell every shot. Damage absorption and regeneration remain entirely in the sim.
const SHIELD_VISUAL_REARM = 0.05;

export class ShipFx {
  private readonly shells = new Map<string, Shell | null>();
  private readonly slots: SlotFx[] = [];
  private readonly wrecks: Wreck[] = [];
  private readonly puffs: Puff[] = [];

  private readonly puffPool: Sprite[] = [];

  private time = 0;
  private zoom=1;
  private reducedMotion=false;
  private fieldFragments = 0;
  private shieldPatches=0;
  /** Bounded submission count for the existing VFX inspection page. */
  get patchCount():number{return this.shieldPatches;}

  constructor(
    private readonly gpu: PixiRenderer,
    /** Under the ships: wrecks. Over the ships: shields. Between: smoke and debris. */
    private readonly wreckLayer: Container,
    private readonly shieldLayer: Container,
    private readonly smokeLayer: Container,
    private readonly glow: Texture,
    private readonly fragments: readonly Texture[],
    private readonly hooks: ShipFxHooks,
    private readonly bloomLayer?:Container,
    private readonly refractionLayer?:Container,
  ) {}

  reset(): void {
    this.slots.length = 0;
    for (const w of this.wrecks) this.dropWreck(w);
    this.wrecks.length = 0;
    this.puffs.length = 0;
    for(const shell of this.shells.values()){shell?.surface.begin(0);shell?.surface.end();}
  }

  private slot(i: number): SlotFx {
    let s = this.slots[i];
    if (!s) s = this.slots[i] = { collapse: 0, shieldBroken: false, collapseA: 0, sparkPending: false, lastHull: 1, jx: 0, jy: 0, impacts: [] };
    return s;
  }

  /** The shell for a hull and team, baked on first use from its albedo sprite. */
  private shell(id: string, art: LitArt, team: number): Shell | null {
    const key = `${id}:${team}`;
    if (this.shells.has(key)) return this.shells.get(key)!;
    let shell: Shell | null = null;
    try {
      const tex = art.albedo[team];
      const res = tex.source.resource as unknown;
      const image = res instanceof HTMLCanvasElement || res instanceof HTMLImageElement ? (res as CanvasImageSource) : (this.gpu.extract.canvas(tex) as unknown as HTMLCanvasElement);
      const iw = (image as HTMLCanvasElement).width;
      const ih = (image as HTMLCanvasElement).height;
      const baked: ShieldShell = bakeShieldShell(image, iw, ih, SHIELD_TINT[team]);
      const unit = art.widthWorld / iw;
      // Cache bounded rim/lattice masks; directional selection happens in the shader.
      const k = Math.min(1, SHELL_PX / Math.max(baked.rim.width, baked.rim.height));
      const shrink = (src: HTMLCanvasElement) => {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(src.width * k));
        c.height = Math.max(1, Math.round(src.height * k));
        c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
        return c;
      };
      const pts:[number,number][]=baked.pts.map(([x,y])=>[x*unit,y*unit]);
      const failureRim=Array.from({length:16},(_,i):[number,number]=>{
        const angle=i*Math.PI/8,dx=Math.cos(angle),dy=Math.sin(angle);
        let best:[number,number]=[dx*baked.rim.width*unit*.42,dy*baked.rim.height*unit*.42],score=-2;
        for(const p of pts){const value=(p[0]*dx+p[1]*dy)/Math.max(.001,Math.hypot(...p));if(value>score){score=value;best=p;}}
        return best;
      });
      const rim=shrink(baked.rim),hex=shrink(baked.hex),field=shrink(baked.field);
      // One packed mask texture: rim / lattice / enclosed field. Opaque alpha avoids
      // premultiplication changing the independent masks during upload or filtering.
      const packed=document.createElement('canvas');packed.width=rim.width;packed.height=rim.height;
      const pg=packed.getContext('2d')!,data=pg.createImageData(rim.width,rim.height);
      const channels=[rim,hex,field].map(c=>c.getContext('2d')!.getImageData(0,0,c.width,c.height).data);
      for(let i=0;i<data.data.length;i+=4){for(let j=0;j<3;j++)data.data[i+j]=channels[j][i+3];data.data[i+3]=255;}
      pg.putImageData(data,0,0);
      const surface=new ShieldSurface(Texture.from(packed),SHIELD_TINT_HEX[team],baked.rim.width/baked.rim.height,baked.hexRadius/baked.rim.height);
      surface.begin(this.time,this.zoom,this.reducedMotion);this.shieldLayer.addChild(surface.mesh);this.bloomLayer?.addChild(surface.bloom);this.refractionLayer?.addChild(surface.refraction);
      shell = {rim,hex,surface,
        w: baked.rim.width * unit,
        h: baked.rim.height * unit,
        pts, failureRim,
      };
    } catch {
      shell = null;
    }
    this.shells.set(key, shell);
    return shell;
  }

  // Events from the sim ---------------------------------------------------------------------

  shieldHit(slot: number, dir: number, amount: number, hitX?:number, hitY?:number): void {
    // Area damage (blasts, fields, bleeds) has no side to light.
    if (amount < 0) return;
    const s = this.slot(slot);
    if (s.shieldBroken) return;
    // dir is the shot's travel; it struck the side facing back along it.
    const a = dir + Math.PI;
    const power=Math.min(1,.4+Math.sqrt(amount)/16),contact=hitX!==undefined&&hitY!==undefined?{x:hitX,y:hitY}:undefined;
    const same = s.impacts.find((imp) => Math.abs(Math.atan2(Math.sin(imp.a - a), Math.cos(imp.a - a))) < MERGE_ARC);
    if (same) {
      same.a = a;
      same.life = IMPACT_LIFE;same.power=Math.max(same.power,power);same.pending=true;same.localA=undefined;same.contact=contact;
    } else {
      s.impacts.push({a,life:IMPACT_LIFE,power,pending:true,contact});
      if (s.impacts.length > MAX_IMPACTS) s.impacts.shift();
    }
    const push = Math.min(4, amount * 0.06);
    s.jx += Math.cos(dir) * push;
    s.jy += Math.sin(dir) * push;
  }

  shieldBreak(slot: number): void {
    const s = this.slot(slot);
    // Full SHIELDS power can emit another break on every hit of its regenerated sliver.
    // Keep the original deadline, including after it expires, until recovery rearms it.
    if (s.shieldBroken) return;
    s.shieldBroken = true;
    s.collapse = SHIELD_FAILURE_LIFE;
    s.collapseOrigin=undefined;
    // It goes down on the side that took the last hit.
    s.collapseA = s.impacts.length ? s.impacts[s.impacts.length - 1].a : 0;
    const last=s.impacts[s.impacts.length-1];s.collapseContact=last?.contact;s.collapseLocal=last?.localA;
    s.impacts.length = 0;
    // Sparks are spawned on the next draw, where the hull's position and shell are known.
    s.sparkPending = true;
  }

  /** A ship was destroyed: leave a burning hulk that breaks up. */
  kill(art: LitArt, team: number, x: number, y: number, vx: number, vy: number, rot: number, radius: number): void {
    const big = Math.min(1, radius / 155);
    const sprite = new Sprite(art.albedo[team]);
    sprite.anchor.set(art.anchorX, art.anchorY);
    sprite.width = art.widthWorld;
    sprite.height = art.heightWorld;
    sprite.tint = 0x8a8a8a;
    this.wreckLayer.addChild(sprite);
    const burn = 0.8 + big * 1.4;
    this.wrecks.push({ art, team, x, y, vx: vx * 0.7, vy: vy * 0.7, rot, spin: ((Math.random() - 0.5) * 0.8) / (0.5 + big), burn, burnMax: burn, blastCd: 0, big, halves: null, life: 4, sprite });
  }

  // Per frame -------------------------------------------------------------------------------

  begin(dt: number,zoom=1,reducedMotion=false): void {
    this.time += dt;this.fieldFragments=0;this.shieldPatches=0;this.zoom=zoom;this.reducedMotion=reducedMotion;
    for(const shell of this.shells.values())shell?.surface.begin(this.time,zoom,reducedMotion);
    for (const s of this.slots) {
      if (!s) continue;
      s.collapse = Math.max(0, s.collapse - dt);
      if (s.collapse <= 0) { s.sparkPending = false; s.collapseOrigin = undefined; }
      for (let i = s.impacts.length - 1; i >= 0; i--) if ((s.impacts[i].life -= dt) <= 0) s.impacts.splice(i, 1);
      const decay = Math.exp(-12 * dt);
      s.jx *= decay;
      s.jy *= decay;
    }
  }

  /** The hull jolt to add to a ship's drawn position (also notes hull hits for a small shake). */
  jolt(slot: number, hullFrac: number): [number, number] {
    const s = this.slot(slot);
    if (hullFrac < s.lastHull - 0.004) {
      const a = Math.random() * Math.PI * 2;
      const k = Math.min(3, (s.lastHull - hullFrac) * 60);
      s.jx += Math.cos(a) * k;
      s.jy += Math.sin(a) * k;
    }
    s.lastHull = hullFrac;
    return [s.jx, s.jy];
  }

  /** Draw the lit parts of a ship's shield: only the sides struck in the last moment. */
  shield(slot: number, id: string, art: LitArt, team: number, x: number, y: number, rot: number, scale: number, frac: number, hidden: boolean): void {
    const s = this.slot(slot);
    if (s.shieldBroken && s.collapse <= 0 && frac >= SHIELD_VISUAL_REARM) s.shieldBroken = false;
    // Clear old contact patches while down; a fractional regen tick must not revive them.
    if (frac <= 0 || s.shieldBroken) s.impacts.length = 0;
    if (hidden || (!s.impacts.length && s.collapse <= 0 && !s.sparkPending)) return;
    const sh = this.shell(id, art, team);
    if (!sh) return;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    // Centre of the hull sprite (anchors can be off-centre for vector art).
    const ox = (0.5 - art.anchorX) * art.widthWorld * scale;
    const oy = (0.5 - art.anchorY) * art.heightWorld * scale;
    const cx = x + ox * cos - oy * sin;
    const cy = y + ox * sin + oy * cos;
    /** World point on the shell on the side facing world angle `a`. */
    const side = (a: number): [number, number] => {
      const la = a - rot;
      const u=((la/(Math.PI*2)*16)%16+16)%16,index=Math.floor(u),f=u-index;
      const p=sh.failureRim[index],q=sh.failureRim[(index+1)%16];
      const lx=p[0]+(q[0]-p[0])*f,ly=p[1]+(q[1]-p[1])*f;
      return [cx + (lx * cos - ly * sin) * scale, cy + (lx * sin + ly * cos) * scale];
    };
    const radius = Math.max(.5, Math.min(sh.w, sh.h * 1.6) * 0.38) * scale;
    if(s.collapse>0){
      if(s.collapseLocal===undefined){const hit=s.collapseContact;s.collapseLocal=(hit&&Math.hypot(hit.x-cx,hit.y-cy)>1?Math.atan2(hit.y-cy,hit.x-cx):s.collapseA)-rot;}
      s.collapseA=rot+s.collapseLocal;
      s.collapseOrigin??={x:cx,y:cy,rotation:rot,scale};
    }
    if (s.sparkPending) {
      // A few sparks shed from the side that gave way, nothing around the rest of the hull.
      s.sparkPending = false;
      const [hx, hy] = side(s.collapseA);
      let n = 0;
      for (const [px, py] of sh.pts) {
        const wx = cx + (px * cos - py * sin) * scale;
        const wy = cy + (px * sin + py * cos) * scale;
        if ((wx - hx) ** 2 + (wy - hy) ** 2 > radius * radius * 1.6) continue;
        const out = Math.atan2(wy - cy, wx - cx);
        const v = 30 + Math.random() * 60;
        this.hooks.spark(wx, wy, Math.cos(out) * v, Math.sin(out) * v, 0.3 + Math.random() * 0.2, SHIELD_TINT_HEX[team], 0.6 + Math.random() * 0.5);
        if (++n >= COLLAPSE_SPARKS) break;
      }
    }
    if(s.collapse>0){
      const age=SHIELD_FAILURE_LIFE-s.collapse;
      for(let j=0;j<8;j++){
        const local=j*Math.PI/4,world=local+rot,state=shieldFailure(age,world,s.collapseA);
        if(state.alpha>.001)this.patch(sh,cx,cy,rot,scale,world,state.alpha,state.reveal,state.erode,.75,age/SHIELD_FAILURE_LIFE,slot);
        if(j%2===0&&state.arc>.02){
          const p=sh.failureRim[j*2],q=sh.failureRim[(j*2+3)%16];
          const ax=cx+(p[0]*cos-p[1]*sin)*scale,ay=cy+(p[0]*sin+p[1]*cos)*scale;
          const bx=cx+(q[0]*cos-q[1]*sin)*scale,by=cy+(q[0]*sin+q[1]*cos)*scale;
          this.hooks.faultArc?.(ax,ay,bx,by,radius*.15,SHIELD_TINT_HEX[team],state.arc*1.15,slot*13+j);
          this.hooks.light(ax,ay,radius*.22,SHIELD_TINT_HEX[team],state.arc*.55);
        }
      }
      // Detached field cells peel from the failure location; they do not follow a moving hull.
      const origin=s.collapseOrigin!,oc=Math.cos(origin.rotation),os=Math.sin(origin.rotation);
      for(let j=0;j<8&&this.fieldFragments<64;j++){
        const seed=slot*47+j*19;if(fxRandom(seed+11)<.20)continue;
        const speed=SHIELD_FAILURE_LIFE/.86;
        const delay=(.065+.12*fxRandom(seed))*speed,life=(.34+.20*fxRandom(seed+4))*speed;
        const elapsed=age-delay;if(elapsed<=0||elapsed>=life)continue;
        const progress=elapsed/life,p=sh.failureRim[j*2];
        const direction=Math.atan2(p[1],p[0])+origin.rotation;
        const travel=radius*(.20+.35*fxRandom(seed+9))*(1-Math.exp(-4.5*progress));
        const curl=(fxRandom(seed+6)-.5)*.8*smooth(progress);
        const px=origin.x+(p[0]*oc-p[1]*os)*origin.scale+Math.cos(direction+curl)*travel;
        const py=origin.y+(p[0]*os+p[1]*oc)*origin.scale+Math.sin(direction+curl)*travel;
        const alpha=smooth(elapsed/.025)*Math.exp(-2.2*progress)*(1-smooth((progress-.60)/.40));
        this.hooks.fieldFragment?.(px,py,radius*(.13+.08*fxRandom(seed+3)),direction+curl+fxRandom(seed+7)*Math.PI*2,SHIELD_TINT_HEX[team],alpha*.8,progress,seed);
        this.fieldFragments++;
      }
    }
    if (frac <= 0) return;
    const ease=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
    for (const imp of s.impacts) {
      if(imp.localA===undefined){const hit=imp.contact;imp.localA=(hit&&Math.hypot(hit.x-cx,hit.y-cy)>1?Math.atan2(hit.y-cy,hit.x-cx):imp.a)-rot;}
      imp.a=rot+imp.localA;
      const age=IMPACT_LIFE-imp.life;
      const release=Math.exp(-3.6*age/IMPACT_LIFE)*(1-ease((age-.36)/.19)),ignite=ease(age/.016);
      // Short localized contact must remain legible against lit hull plating. The material
      // applies rim coverage and angular falloff again; their product used to bury small hits.
      const alpha=ignite*release*imp.power*(.95+.40*Math.exp(-Math.pow((age-.04)/.025,2)));
      const radiance=alpha*3.6;
      this.patch(sh,cx,cy,rot,scale,imp.a,radiance,ease(age/.065),ease((age-.26)/.29),.21,-1,slot);
      const [hx,hy]=side(imp.a),spread=.03+.24*(1-Math.pow(1-Math.min(1,age/.32),3));
      for(const sign of [-1,1]){
        const angle=imp.a+sign*spread;
        this.patch(sh,cx,cy,rot,scale,angle,radiance*.22*ease(age/.055),ease(age/.08),ease((age-.26)/.29),.14,-1,slot);
        if(age<.32){const [ex,ey]=side(angle);this.hooks.faultArc?.(hx,hy,ex,ey,radius*.07,SHIELD_TINT_HEX[team],alpha*.70,slot*17+sign);}
      }
      if(imp.pending){
        imp.pending=false;
        for(let j=0;j<3;j++){const a=imp.a+(j-1)*.4,v=55+j*22;this.hooks.spark(hx,hy,Math.cos(a)*v,Math.sin(a)*v,.18+j*.035,SHIELD_TINT_HEX[team],.65);}
      }
      this.hooks.light(hx,hy,radius*.30,SHIELD_TINT_HEX[team],alpha);
    }
  }

  /** Energize the real hull contour; appearance changes in material space, never by scaling. */
  private patch(sh:Shell,cx:number,cy:number,rot:number,scale:number,a:number,alpha:number,reveal=1,erode=0,spread=.21,fault=-1,seed=0):void{
    if(alpha>=.001)this.shieldPatches++;
    sh.surface.patch(cx,cy,sh.w*scale,sh.h*scale,rot,a,alpha,reveal,erode,spread,fault,seed);
  }

  private sprite(pool: Sprite[], i: number, layer: Container, blend: 'add' | 'normal'): Sprite {
    let s = pool[i];
    if (!s) {
      s = new Sprite();
      s.blendMode = blend;
      layer.addChild(s);
      pool[i] = s;
    }
    s.visible = true;
    s.tint = 0xffffff;
    return s;
  }

  /** After all ships: hide unused shell sprites, run the wrecks, smoke and debris. */
  end(dt: number): void {
    for(const shell of this.shells.values())shell?.surface.end();

    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      if (!w.halves) {
        // Burning out: dark, drifting, turning, blasts walking along the hull.
        w.burn -= dt;
        w.x += w.vx * dt;
        w.y += w.vy * dt;
        w.vx *= 1 - dt * 0.2;
        w.vy *= 1 - dt * 0.2;
        w.rot += w.spin * dt;
        const k = Math.max(0, w.burn / w.burnMax);
        const shade = Math.round(0x30 + 0x50 * k);
        w.sprite.tint = (shade << 16) | (shade << 8) | shade;
        w.sprite.position.set(w.x, w.y);
        w.sprite.rotation = w.rot;
        w.blastCd -= dt;
        if (w.blastCd <= 0) {
          w.blastCd = 0.1 + Math.random() * 0.22;
          const along = (Math.random() - 0.5) * w.art.widthWorld * 0.8;
          const side = (Math.random() - 0.5) * w.art.heightWorld * 0.5;
          const bx = w.x + Math.cos(w.rot) * along - Math.sin(w.rot) * side;
          const by = w.y + Math.sin(w.rot) * along + Math.cos(w.rot) * side;
          this.hooks.burst(bx, by, BLAST, 6 + Math.round(w.big * 6), 160);
          this.hooks.light(bx, by, 18 + w.big * 30, 0xffc080);
          this.puff(bx, by, 1, 18 + w.big * 26);
        }
        if (w.burn <= 0) this.breakUp(w);
        continue;
      }
      w.life -= dt;
      const f=Math.min(1,Math.max(0,w.life/1.6)),fade=f*f*(3-2*f);
      for (const h of w.halves) {
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        h.rot += h.spin * dt;
        h.sprite.position.set(h.x, h.y);
        h.sprite.rotation = h.rot;
        h.sprite.alpha = fade;
        // A smouldering glow along the torn edge (each half hangs off the split line).
        const ex = h.x;
        const ey = h.y;
        h.edge.position.set(ex, ey);
        h.edge.rotation = h.rot;
        h.edge.alpha = 0.55 * Math.max(0, w.life / 4) * (0.77 + .13*Math.sin(this.time*4+h.side)+.10*Math.sin(this.time*7.3+h.side*2));
        if (w.life > 2 && Math.random() < dt * 10) this.hooks.spark(ex, ey, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 0.5, BLAST, 0.8);
      }
      if (w.life <= 0) {
        this.dropWreck(w);
        this.wrecks.splice(i, 1);
      }
    }

    let used = 0;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.puffs[i] = this.puffs[this.puffs.length - 1];
        this.puffs.pop();
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const drag = 1 - dt * (p.kind === 1 ? 0.6 : 0.25);
      p.vx *= drag;
      p.vy *= drag;
      if(p.kind===1){
        const spinDecay=Math.exp(-.9*dt);
        p.rot+=p.spin*(1-spinDecay)/.9;p.spin*=spinDecay;
      }else p.rot+=p.spin*dt;
      if(p.kind===1&&this.hooks.smoke){
        const u=Math.min(1,Math.max(0,1-p.life/p.max)),growth=1-(1-u)**3,remaining=1-u;
        this.hooks.smoke(p.x,p.y,p.size+growth*p.max*14,remaining*remaining*(3-2*remaining)*.55,u*p.max,p.seed,p.rot);
        continue;
      }
      const s = this.sprite(this.puffPool, used++, this.smokeLayer, 'normal');
      const a = p.life / p.max;
      if (p.kind === 1) {
        s.texture = this.glow;
        s.anchor.set(0.5);
        s.tint = 0x2a2e38;
        s.alpha = a * 0.55;
        s.scale.set((p.size * 2) / 128);
      } else {
        s.texture = this.fragments[Math.floor(p.seed)%this.fragments.length];
        s.anchor.set(0.5);
        s.tint = 0x89919d;
        const fade=Math.min(1,a*1.5);s.alpha=fade*fade*(3-2*fade);
        s.width=p.size*1.4;s.height=p.size*.85;
      }
      s.position.set(p.x, p.y);
      s.rotation = p.rot;
    }
    for (let i = used; i < this.puffPool.length; i++) this.puffPool[i].visible = false;
  }

  private puff(x: number, y: number, kind: 1 | 2, size: number, vx = (Math.random() - 0.5) * 20, vy = (Math.random() - 0.5) * 20): void {
    if (this.puffs.length > 600) return;
    const life=kind===1?2+Math.random():1.6+Math.random();
    this.puffs.push({x,y,vx,vy,life,max:life,size,kind,rot:Math.random()*6.28,spin:(Math.random()-.5)*(kind===1?.9:6),seed:Math.random()*10000});
  }

  /** The final blast: the hull splits and the halves drift apart. */
  private breakUp(w: Wreck): void {
    const { art } = w;
    this.hooks.burst(w.x, w.y, BLAST, 18 + Math.round(w.big * 24), 220);
    this.hooks.burst(w.x, w.y, 0xfff5e0, 8, 140);
    this.hooks.light(w.x, w.y, 60 + w.big * 120, 0xffe0a8);
    for (let i = 0; i < 5 + w.big * 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 30 + Math.random() * 110;
      this.puff(w.x, w.y, 2, 3 + Math.random() * art.widthWorld * 0.05, Math.cos(a) * v + w.vx * 0.4, Math.sin(a) * v + w.vy * 0.4);
    }
    for (let i = 0; i < 3 + w.big * 4; i++) this.puff(w.x + (Math.random() - 0.5) * art.widthWorld * 0.4, w.y + (Math.random() - 0.5) * art.heightWorld * 0.4, 1, 30 + w.big * 50);
    const tex = art.albedo[w.team];
    const f = tex.frame;
    w.sprite.destroy();
    w.halves = ([0, 1] as const).map((half) => {
      const side = half ? 1 : -1;
      const part = new Texture({ source: tex.source, frame: new Rectangle(f.x + half * f.width * 0.5, f.y, f.width * 0.5, f.height) });
      const sprite = new Sprite(part);
      sprite.anchor.set(half ? 0 : 1, art.anchorY);
      sprite.width = art.widthWorld * 0.5;
      sprite.height = art.heightWorld;
      sprite.tint = 0x3a3a3a;
      this.wreckLayer.addChild(sprite);
      const edge = new Sprite(this.glow);
      edge.anchor.set(0.5);
      edge.blendMode = 'add';
      edge.tint = BLAST;
      edge.scale.set((art.widthWorld * 0.16) / 128, (art.heightWorld * 0.9) / 128);
      this.wreckLayer.addChild(edge);
      const v = 14 + Math.random() * 22;
      // The split runs through the hull centre (anchor 0.5): each half hangs off that line.
      const cx = w.x + Math.cos(w.rot) * (0.5 - art.anchorX) * art.widthWorld;
      const cy = w.y + Math.sin(w.rot) * (0.5 - art.anchorX) * art.widthWorld;
      return {
        sprite,
        edge,
        x: cx,
        y: cy,
        vx: w.vx * 0.6 + Math.cos(w.rot) * side * v + (Math.random() - 0.5) * 8,
        vy: w.vy * 0.6 + Math.sin(w.rot) * side * v + (Math.random() - 0.5) * 8,
        rot: w.rot,
        spin: w.spin + side * (0.1 + Math.random() * 0.25),
        side,
      };
    });
    w.life = 4;
  }

  private dropWreck(w: Wreck): void {
    if (!w.halves) w.sprite.destroy();
    else
      for (const h of w.halves) {
        h.sprite.texture.destroy();
        h.sprite.destroy();
        h.edge.destroy();
      }
  }
}
