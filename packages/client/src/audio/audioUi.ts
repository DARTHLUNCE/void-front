import { audioEngine, type AudioSettings } from './audioEngine';
import './audio.css';

const levels=['master','world','engines','ambience','ui'] as const;
const labels={master:'Master volume',world:'Weapons & impacts',engines:'Engines & movement',ambience:'Fields & ambience',ui:'Interface & warnings'};
export function controlsMarkup(prefix:string):string {
  return `<div class="audio-controls">${levels.map(k=>`<label for="${prefix}-${k}"><span>${labels[k]}</span><output data-level="${k}"></output><input id="${prefix}-${k}" data-audio-level="${k}" type="range" min="0" max="100" step="1"></label>`).join('')}
    <label class="audio-choice" for="${prefix}-spatial">Output mode<select id="${prefix}-spatial" data-audio-select="spatial"><option value="stereo">Stereo · speakers / headphones</option><option value="headphones">Binaural · HRTF headphones</option></select></label>
    <label class="audio-choice" for="${prefix}-dynamic">Battle mix<select id="${prefix}-dynamic" data-audio-select="dynamic"><option value="warTapes">War Tapes · compressed mechanical grit</option><option value="full">Full · stronger impact contrast</option><option value="night">Night · gentler peaks</option></select></label>
    <button type="button" data-audio-mute aria-pressed="false">Mute audio</button>
    <p class="audio-note" role="status" data-audio-status>Screen-left is left; screen-up is forward. Binaural adds head filtering; stereo also works on headphones. Audio starts on your first interaction.</p></div>`;
}
export function bindAudioControls(root:HTMLElement):()=>void {
  const sync=()=>{
    for(const k of levels){const slider=root.querySelector<HTMLInputElement>(`[data-audio-level="${k}"]`);if(slider)slider.value=String(Math.round(audioEngine.settings[k]*100));const output=root.querySelector(`[data-level="${k}"]`);if(output)output.textContent=`${Math.round(audioEngine.settings[k]*100)}%`;}
    for(const k of ['spatial','dynamic'] as const){const el=root.querySelector<HTMLSelectElement>(`[data-audio-select="${k}"]`);if(el)el.value=audioEngine.settings[k];}
    const mute=root.querySelector<HTMLButtonElement>('[data-audio-mute]');if(mute){mute.textContent=audioEngine.settings.muted?'Unmute audio':'Mute audio';mute.setAttribute('aria-pressed',String(audioEngine.settings.muted));}
  };
  root.addEventListener('input',e=>{const el=e.target as HTMLInputElement,key=el.dataset.audioLevel;if(key&&levels.includes(key as typeof levels[number]))audioEngine.configure({[key]:Number(el.value)/100});});
  root.addEventListener('change',e=>{const el=e.target as HTMLSelectElement,key=el.dataset.audioSelect;if(key==='spatial'||key==='dynamic')audioEngine.configure({[key]:el.value} as Partial<AudioSettings>);});
  root.querySelector('[data-audio-mute]')?.addEventListener('click',()=>audioEngine.configure({muted:!audioEngine.settings.muted}));
  window.addEventListener('vf-audio-settings',sync);sync();
  const timer=setInterval(()=>{const status=root.querySelector('[data-audio-status]');if(status){const d=audioEngine.diagnostics();status.textContent=d.error|| (d.state==='locked'?'Click or press a key to enable audio.':`${d.loaded} / ${Object.keys(audioEngine.catalog).length} sounds ready · ${d.state==='running'?'audio on':'audio paused'}`);}},1000);
  return ()=>{window.removeEventListener('vf-audio-settings',sync);clearInterval(timer);};
}
export function installAudioUi():()=>void {
  audioEngine.installLifecycle();
  const slot=document.getElementById('audio-settings');
  if(slot)slot.innerHTML=controlsMarkup('menu-audio');
  const unbind=slot?bindAudioControls(slot):()=>{};
  const button=document.createElement('button');button.className='audio-access';button.type='button';button.textContent='AUDIO';button.setAttribute('aria-label','Audio settings');
  const dialog=document.createElement('dialog');dialog.id='audio-dialog';dialog.className='audio-dialog panel';
  dialog.innerHTML=`<header><h2>Audio</h2><button type="button" aria-label="Close audio settings" data-close>Close</button></header>${controlsMarkup('game-audio')}<p class="audio-note">Battle continues while this panel is open.</p>`;
  document.body.append(button,dialog);const unbindDialog=bindAudioControls(dialog);
  button.addEventListener('click',()=>{dialog.showModal();audioEngine.play('ui.open');});
  dialog.querySelector('[data-close]')!.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{audioEngine.play('ui.back');button.focus();});
  let lastHover:Element|null=null;
  const focus=(e:Event)=>{const target=(e.target as Element)?.closest?.('button, [role="button"], select');if(target&&target!==lastHover&&!target.hasAttribute('disabled')){lastHover=target;audioEngine.play('ui.hover',{cooldown:.09});}};
  const click=(e:Event)=>{const target=(e.target as Element)?.closest?.('button, [role="button"]');if(target&&!target.hasAttribute('disabled'))audioEngine.play('ui.select',{cooldown:.06});};
  document.addEventListener('pointerover',focus);document.addEventListener('focusin',focus);document.addEventListener('click',click);
  if(import.meta.env.DEV)(window as unknown as {audioEngine:typeof audioEngine}).audioEngine=audioEngine;
  return ()=>{unbind();unbindDialog();button.remove();dialog.remove();document.removeEventListener('pointerover',focus);document.removeEventListener('focusin',focus);document.removeEventListener('click',click);void audioEngine.dispose();};
}
