import { CLASS_ORDER, CLASSES } from './classes';
import type { AbilityDef } from './types';

/** Presentation IDs cover every actual ability, including extras and ultimates.
 * Stable for a given content build; snapshot fingerprint includes this ordering. */
const definitions=new Map<string,AbilityDef>();
for(const id of CLASS_ORDER){
  const cls=CLASSES[id];definitions.set(cls.signature.id,cls.signature);
  for(const tier of cls.tiers)for(const option of tier.options)
    for(const ability of [option.replacesSignature,option.extraAbility,option.ultimate])if(ability)definitions.set(ability.id,ability);
}
export const AUDIO_ABILITIES:readonly AbilityDef[]=[...definitions.values()].sort((a,b)=>a.id.localeCompare(b.id));
const indices=new Map(AUDIO_ABILITIES.map((a,i)=>[a.id,i]));
export const abilitySoundIndex=(id:string):number=>indices.get(id)??-1;
export const SOUND_KIND={weapon:0,ability:1,damage:2} as const;
export const AUDIO_WEAPONS:readonly string[]=[...CLASS_ORDER.map(id=>'weapon.'+id),
  'weapon.secondary','weapon.turret','weapon.drone','weapon.ordnance',
  'turret.mothership.standard','turret.mothership.rocket','turret.mothership.laser',
  'turret.fob.standard','turret.fob.rocket','turret.fob.laser','turret.node',
  'drone.orbit','drone.swarm','drone.guard','drone.bomber','drone.interceptor','drone.fighter',
  'turret.deployable','turret.platform'];
const weaponIndices=new Map(AUDIO_WEAPONS.map((id,i)=>[id,i]));
export const weaponSoundIndex=(id:string):number=>weaponIndices.get(id)??10;
export const WEAPON_SOUND={secondary:9,turret:10,drone:11,ordnance:12} as const;
export const AUDIO_EVENT_CAPACITY=192;
export const AUDIO_EVENT_STRIDE=7;
