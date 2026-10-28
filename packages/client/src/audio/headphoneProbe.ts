import { spatial } from './audioMath';
import { createVoiceSpatializer } from './voiceSpatializer';

/** Actual browser convolution, using a production gunshot rather than a test
 * tone. The legacy branch preserves the reported startup bug for comparison. */
export async function headphoneProbe(shot: AudioBuffer) {
  const results = [];
  const pilotBuffers: Float32Array[][] = [];
  for (const position of [{ x: 700, y: 0 }, { x: -700, y: 0 }, { x: 0, y: 0 }]) {
    for (const mode of ['legacy', 'binaural', 'stereo'] as const) {
      const ctx = new OfflineAudioContext(2, 24000, 48000);
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
      source.buffer = shot; filter.type = 'lowpass'; filter.Q.value = .5;
      const p = spatial(position, { x: 0, y: 0 }, 8000);
      let pan: AudioNode, panOutput:AudioNode;
      if (mode === 'legacy') {
        const old = ctx.createPanner(); old.panningModel = 'HRTF'; old.rolloffFactor = 0;
        old.positionY.value = .08;
        old.positionX.setTargetAtTime(p.x, 0, .045); old.positionZ.setTargetAtTime(p.z, 0, .045);
        filter.frequency.setTargetAtTime(p.cutoff, 0, .06);
        pan = panOutput = old;
      } else {
        const voice = createVoiceSpatializer(ctx, mode === 'binaural', p, position.x === 0);
        pan=voice.input;panOutput=voice.output;
        filter.frequency.value = p.cutoff;
      }
      source.connect(filter); filter.connect(pan); panOutput.connect(ctx.destination); source.start();
      const output = await ctx.startRendering(), channels = [output.getChannelData(0), output.getChannelData(1)];
      const power = channels.map(a => a.reduce((s, v) => s + v * v, 0));
      const early = channels.reduce((s, a) => s + a.slice(0, 960).reduce((q, v) => q + v * v, 0), 0);
      results.push({ x: position.x, mode, rightMinusLeftDb: 10 * Math.log10(Math.max(1e-12, power[1]) / Math.max(1e-12, power[0])), early20msEnergy: early, totalEnergy: power[0] + power[1] });
      if (position.x === 0 && mode !== 'legacy') pilotBuffers.push(channels);
    }
  }
  let pilotDifference = 0;
  for (let c = 0; c < 2; c++) for (let i = 0; i < pilotBuffers[0][c].length; i++) {
    pilotDifference = Math.max(pilotDifference, Math.abs(pilotBuffers[0][c][i] - pilotBuffers[1][c][i]));
  }
  const sided = results.filter(r => r.mode === 'binaural' && r.x !== 0);
  return { pass: pilotDifference < 1e-7 && sided.every(r => Math.sign(r.x) * r.rightMinusLeftDb > .2 && r.early20msEnergy > 0), pilotDifference, results };
}
