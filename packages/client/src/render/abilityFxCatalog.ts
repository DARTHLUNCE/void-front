import { ABILITY_VISUAL_IDS, CLASS_ORDER, CLASSES, hullGeometry, type AbilityDef, type AbilityVisualId, type ClassId } from '@void-front/shared';

export interface AbilityLook {
  id: AbilityVisualId; color: number; accent: number; name: string;
  description: string; classId: ClassId; hull: string; def: AbilityDef;
  bounds:{nose:number;stern:number}; duration:number;
}
const COLORS: readonly (readonly [number,number,string])[] = [
  [0x54e6ff,0xc1f8ff,'Split cyan phase wakes and white displacement echoes.'],
  [0x9b68ff,0xffc9ff,'A collapsing violet aperture and a sharp arrival corona.'],
  [0xffbc42,0xfff2bf,'A violent amber bow surge, engine overburn and a directional contact burst.'],
  [0x716cff,0xb6d0ff,'Indigo interference folding across the hull.'],
  [0xb254fa,0xf6bbff,'Violet spectral folds and a narrow re-entry flare.'],
  [0x42e5c4,0xc0fff1,'Prismatic splitting into three false signatures.'],
  [0x4bea9b,0xc9ffe7,'An arcing mint nanite release and a luminous repair sweep over affected hulls.'],
  [0x67d9a0,0xffca67,'Amber emitter ignition, a curved jade containment field and sustained recipient repair.'],
  [0x60f7b7,0xffdb78,'Twin green-gold plasma conduits, eased energy packets and sustained hull restoration.'],
  [0xff8d39,0xffe9af,'A hot white warhead, orange motor, and directional impact bloom.'],
  [0xff514b,0xc58cff,'Crimson penetrators with violet armor-stripping impact filaments.'],
  [0xffc36b,0xfff5cc,'A staggered brass interceptor curtain with fast-cooling fragments.'],
  [0x448aff,0xb5eaff,'Stacked blue harmonic bands charging a shield lattice.'],
  [0xf661c5,0xffe6f6,'Compact magenta-white breachers with forked engine plumes.'],
  [0x52d2ff,0xffd778,'Broad blue-gold restoration fronts and local shield glints.'],
  [0xff5a32,0xffd677,'A crimson pressure cone and a bright sustained reactor burn.'],
  [0xffcf69,0xdde9ff,'Gold-white jump apertures followed by brilliant ballistic needles.'],
  [0xea8e47,0xffe9bc,'Heavy copper bow plates and compressed shock bands.'],
  [0xe8bc62,0xffefb4,'Interlocking amber armor segments around the hull.'],
  [0x71eedb,0xffd5f7,'Pearlescent mirrored facets with traveling specular glints.'],
  [0xff6528,0xffe6b4,'Molten vent channels and turbulent thermal exhaust.'],
  [0x56dcff,0xe4fbff,'A coherent white-cyan spinal lance, violent muzzle discharge and rolling ionized wake.'],
  [0xae84ff,0xf1e6ff,'Three violet lances with braided interference sleeves.'],
  [0x9a62ee,0xffc5f1,'An inky core, orbiting accretion filaments and inward flow.'],
  [0x42c9f4,0xcff7ff,'Sequenced magnetic runway lights, deck vapor and four engine-lit departures.'],
  [0xa3f14e,0xf2ffd1,'Honeycomb dispatch cells and seven fast jade launch signatures.'],
  [0x9c6eff,0xe5f2ff,'A violet electrical front with crawling arcs and residual sparks.'],
];

export const ABILITY_LOOKS: readonly AbilityLook[] = ABILITY_VISUAL_IDS.map((id,i) => {
  const classId=CLASS_ORDER[Math.floor(i/3)],cls=CLASSES[classId];
  const node=cls.tiers.flatMap(t=>t.options).find(n=>n.replacesSignature?.id===id);
  const def=node?.replacesSignature??cls.signature;
  const [color,accent,description]=COLORS[i];
  const hull=node?.hullModel??cls.hullModel,boxes=hullGeometry(hull).boxes;
  const bounds={nose:Math.max(...boxes.map(b=>b[2])),stern:Math.min(...boxes.map(b=>b[0]))};
  const duration=Math.max(0,...def.steps.map(s=>'duration' in s?s.duration:0));
  return {id,name:def.name,def,classId,hull,color,accent,description,bounds,duration};
});
export function abilityLook(index: number): AbilityLook | undefined { return ABILITY_LOOKS[index-1]; }

export function abilityDuration(index:number):number {
  return abilityLook(index)?.duration??0;
}

/** Bounded, deterministic particle seeds; deliberately independent of the simulation RNG. */
export function fxRandom(seed:number):number {
  let n=Math.imul(seed^0x9e3779b9,0x85ebca6b);n=Math.imul(n^(n>>>13),0xc2b2ae35);
  return ((n^(n>>>16))>>>0)/4294967296;
}
export const easeOut=(x:number):number=>1-(1-Math.max(0,Math.min(1,x)))**3;
export const smooth=(x:number):number=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
