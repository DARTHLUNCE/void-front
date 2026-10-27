# Audio validation - 2026-10-27

The delivered bank contains 208 cues, 957 mono WAVs, 36 continuous identities and 72 per-take internal loop regions. Asset validation found zero errors; maximum measured bank true peak is 0.807042. All 35 firing identities / 215 takes were rebuilt with atonal recorded attacks; the other 742 WAVs match the prior complete bank byte for byte. Sources, recipes, hashes and rendering tools are preserved under `packages/client/scripts/audio` and `public/assets/audio-v4`.

## Code and actual browser checks

- Full suite: 1,044 tests across 71 files passed. Final ownership tags and remote voice reservations were followed by 27 focused audio tests across six files, plus client typecheck and production build, all passing.
- TypeScript and production Vite build passed. No gameplay rules were intentionally changed. The cosmetic audio event stream extends the snapshot schema, so client and worker/server packages must be deployed together.
- Browser OfflineAudioContext: limiter overload peak 0.82; finite output; correct stereo/HRTF direction; player-center output identical in stereo/headphones; continuous sustain held and fully released.
- At 700 world units, the gunshot's left/right difference measured 2.46 dB in narrowed headphones mode and 5.19 dB in stereo. Earlier values were 4.39 and 7.29 dB respectively. This measures a reduction in ear separation, not subjective listening approval.
- Measured stereo reflection checks passed for both input channels. A production player gunshot produced a nonzero post-shot tail, with integrated wet/dry energy -11.10 dB through the reflection test graph.
- Six-second dense battle: 441 fleet firing groups plus 69 simultaneous player gun/ability events, all 69 admitted, zero player drops. 34 peak physical voices, sampled output peak 0.135, 521 played, 146 background/duplicate drops, 138 suppressed remote drive details, 39 priority replacements. All 208 cues loaded, zero load/browser errors, 93.07 MiB decoded, and zero active voices/loops after release.
- Engine graph tests verify local dry and wet routing bypasses battle compression/ducking, remote cooldowns cannot suppress the pilot, background saturation leaves local capacity, and repeated player shots cannot steal another local action or held engine.

## Limits and reproduction

Use `/audio-check.html` for matched-level isolated/cadence/crowd/distance/long-hold listening and the browser rendering checks. `/audio-direction.html` auditions a small selection directly from the current bank. Neither runs source generation at runtime.

The tests do not establish that every take was heard, every internal loop gesture is inaudible, or every device's HRTF will suit its listener. The output limiter is still shared safety protection; player sounds do not deliberately duck each other, but sufficiently excessive summed peaks can engage the limiter. The measured outdoor reverb is not live geometry acoustics. No GPU or cross-device performance benchmark is claimed.
