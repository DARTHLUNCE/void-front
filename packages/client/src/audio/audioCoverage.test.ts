import { describe,it,expect } from 'vitest';
import { AUDIO_ABILITIES, AUDIO_WEAPONS, ABILITY_VISUAL_IDS, HULL_MODELS, CLASS_ORDER, CLASSES, COMMANDS } from '@void-front/shared';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import manifest from '../../public/assets/audio-v4/manifest.json';
describe('authored audio coverage',()=>{
  it('covers every real primary weapon, signature, extra, ultimate and fleet command',()=>{
    const cues=manifest as Record<string,unknown>;
    for(const id of CLASS_ORDER)expect(cues['weapon.'+id],id).toBeTruthy();
    for(const ability of AUDIO_ABILITIES)expect(cues['ability.'+ability.id],ability.id).toBeTruthy();
    for(const command of COMMANDS)expect(cues['command.'+command.id],command.id).toBeTruthy();
    for(const hull of HULL_MODELS)expect(cues['engine.'+hull],hull).toBeTruthy();
    for(const id of CLASS_ORDER)if(CLASSES[id].secondary)expect(cues['secondary.'+id],id).toBeTruthy();
    for(const id of AUDIO_WEAPONS)expect(cues[id],id).toBeTruthy();
    for(const id of ABILITY_VISUAL_IDS)expect(cues['contact.'+id],id).toBeTruthy();
    expect(AUDIO_ABILITIES.length).toBe(49);
  });
  it('ships every referenced asset and variants for repetitive contacts',()=>{
    for(const cue of Object.values(manifest))for(const file of cue.files)expect(existsSync(fileURLToPath(new URL('../../public/assets/audio-v4/'+file,import.meta.url))),file).toBe(true);
    expect(manifest['impact.shield'].files.length).toBeGreaterThanOrEqual(3);
    expect(manifest['impact.armor'].files.length).toBeGreaterThanOrEqual(12);
    expect(manifest['status.hitmarker'].duration).toBeLessThan(.08);
  });
  it('uses internal sustain regions for every continuous sound and short gun envelopes',()=>{
    for(const cue of Object.values(manifest))if(cue.loop){
      expect('sustain' in cue).toBe(true);
      const regions=(cue as {sustain:Array<{loopStart:number;loopEnd:number}>}).sustain;
      expect(regions).toHaveLength(cue.files.length);
      for(const loop of regions){expect(loop.loopStart).toBeGreaterThan(.5);expect(loop.loopEnd).toBeLessThan(cue.duration-.1);expect(loop.loopEnd-loop.loopStart).toBeGreaterThan(2);}
    }
    for(const id of CLASS_ORDER){
      const cue=manifest['weapon.'+id as keyof typeof manifest];
      expect(cue.duration).toBeLessThanOrEqual(CLASSES[id].gun.fireInterval);
    }
  });
});
