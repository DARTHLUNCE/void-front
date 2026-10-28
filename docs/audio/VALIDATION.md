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


## Follow-up: complete shot attacks, personal feedback and moving-pilot level

The impulse cutter formerly searched only 20 ms before the loudest energy peak. In the automatic-fire source that selected 17.70 ms, after an earlier crack at 11.53 ms. It also selected 342.86 ms on an already-active decay. Selection now requires at least 2 ms of quiet lead-in within 150 ms of the crest and preserves 0.5 ms of pre-roll. Peaks without a new onset are rejected. All 215 firing files were rebuilt; the complete 208-cue manifest remains installed, and all other 742 WAVs are byte-identical to the rollback bank. The rebuilt firing bank's maximum measured true peak is 0.783285 and maximum 10%-peak onset time is 1.396 ms.

Runtime one-shots start at sample zero with their authored gain, avoiding a second gain ramp across the transient. Held engine/sustain envelopes retain smoothing.

Personal hit confirmations, kill notifications, restoration/readiness, damage warnings, pickups and upgrades are routed through a pilot-only, non-positional UI helper. Remote physical shots, contacts and explosions remain world sounds. Ownership tests include bot-versus-bot events and commander view; this hardens existing ownership checks rather than asserting every old notification was leaking.

Pilot main and secondary gun reports previously retained the fired muzzle's fixed world position, allowing subsequent listener movement to attenuate and low-pass the player's own shot. An explicit onboard pan preserves authored gain, full-band filtering and restrained screen-relative muzzle placement for these mounted guns. Owned remote impacts, drones and deployables retain world positioning. All nine primary classes and their secondary routing are covered. Player abilities and engines remain equally protected from background ducking.

Validation: 4 Python onset tests; 41 focused TypeScript tests across 8 files; client typecheck and production build passed. Actual browser DSP checks passed (limiter overload peak 0.82; finite output; directional HRTF/stereo; reflection channels; sustained-region hold and full release). The updated six-second moving-pilot battle admitted 71/71 player events amid 455 firing groups, with zero player drops, 34 peak voices and sampled output peak 0.132. New low-rate limiter telemetry measured zero dB maximum reduction during this run. All 208 cues loaded without errors; voices and loops returned to zero.

Vite briefly served a stale transformed Audio Lab module after rapid scripted edits. Touching the completed files invalidated that cache; HTTP checks confirmed current onboard routing and moving-pilot test code before reloading and verifying the lab. Reload an already-running game to discard older modules/decoded assets. The runtime test is not subjective listening approval or proof that no other circumstances can cause a dip. No gameplay changes or PR publication were performed in this follow-up.


## Follow-up: frame-dependent player-shot attenuation (2026-10-27)

The previous moving-listener test used a graph fixture whose AudioParam cancellation did nothing. It therefore missed an automation race: `play()` scheduled the authored gain at `currentTime`, then `endLoops()` could run in the same audio quantum and cancel that event, replacing it with a 45 ms approach from silence. This lowered the first 25 ms of an actual patrol shot by **12.462 dB** in a real browser render. Listener movement itself was not required to reproduce it; frame timing was.

`setAudioTarget` now leaves unchanged targets alone and uses `cancelAndHoldAtTime` when a target changes, preserving the value during an active envelope. A current-value fallback supports older implementations. Gain, filtering, playback-rate and spatial updates share this behavior. No sound assets, accepted stereo width, battle balance or gameplay were changed in this correction.

The Audio Lab's **Verify audio rendering** button now includes `pilotShotProbe`, which runs the production voice graph through OfflineAudioContext. The same test after the fix measured **+0.048 dB**, below the 0.25 dB tolerance for the existing +/-3-cent randomized detune. Limiter, HRTF direction, player stereo equivalence, measured reflections and sustained-loop checks also passed. All **44 audio/simulation tests**, client TypeScript and production build passed.

The Web Audio automation semantics are specified at https://www.w3.org/TR/webaudio-1.0/#dom-audioparam-cancelscheduledvalues and https://www.w3.org/TR/webaudio-1.0/#dom-audioparam-cancelandholdattime . This reproduction proves a timing bug, not subjective acceptance or that every reported camera-swing dip had this cause.

## Held sublight interruption

Damage now latches a held drive request off until it is released. Charging and active cruise both stop once, without repeated charge/abort transitions under incoming fire. The rule runs in shared simulation for human and bot pilots; respawning clears it. Normal gunfire, firing drag and ability use remain available after the interruption. Existing charge time and drive speed are unchanged.

Nine focused simulation checks cover charging/active drive for human and bot inputs, release/repress, no false interruption for zero/invulnerable damage, ordinary damage with no drive request, weapons, abilities and respawn. A snapshot-to-audio integration regression confirms one charge plus one abort while holding through three seconds of hits, then a fresh charge after release. Relevant movement, firing and bot-flight regressions passed as well.


## Armor impact ringing and evolving space return — 2026-10-28

The user identified `impact.armor` in isolated auditions as the recurring bleep/cowbell in battle. Seed-matched layer renders reproduced all twelve original files exactly. The dominant plate layer carried narrow 387–527 Hz modes; these were part of the rendered sample, not the pilot hitmarker. Armor-only offline spectral damping now follows those modes while preserving the first 3 ms of the crack and the recorded debris. The input recordings, event routing, cue gain and twelve variants remain. Hitmarker, shield contacts, other impacts and all other 945 bank WAVs are byte-identical; the other 207 manifest entries are unchanged. Originals and comparative metrics are preserved in `warinspace2/reports/audio/impact-ping`.

The shared reverb now uses `evolving-space-v2.wav`, a 2.1-second response derived from the same reviewed CC0 outdoor recording. Early reflections feed an offline, five-stage allpass-diffused late field with high/low-band damping and a smooth exit. Equal-energy normalization avoids increasing total response energy merely because the tail is longer. Two slow, 0.6 ms modulation paths per shared return keep the wet texture evolving after the dry event ends. These affect reflected sound only; accepted dry stereo width, distance filtering, send gains and equal player protection are unchanged. There are still two convolution kernels per shared return, rather than per voice. The old response remains available.

Browser integration exposed the original one-second IR loader limit; it is now bounded at 2.5 seconds, with a regression fixture that actually decodes a 2.1-second response. The real production convolution graph passes finite output, stereo bearing, delayed arrival, measurable energy beyond 0.8 s, silence after 2.4 s, and wet-motion checks. The repeated impulse test changes texture with only -0.009 dB of energy difference. Player shot wet energy measures -10.92 dB relative to dry. The gunshot frame-update regression measures +0.008 dB, preserving the prior fix.

Crowded-browser run: 448 firing groups, 70/70 protected player events, zero player drops, 35 peak voices, 0.161 sampled output peak, no limiter reduction, 208 cues loaded and zero failures. Background suppression remains active. Complete bank validation reports no errors (957 files, maximum true peak 0.8071). Three offline armor DSP tests, audio regressions, typechecking and the client production build pass. Subjective acceptance of the revised armor texture and space tail remains a listening decision, not a numerical claim.

Method references: [Schroeder allpass sections, Julius O. Smith](https://www.dsprelated.com/freebooks/pasp/Schroeder_Allpass_Sections.html) and [Web Audio delay processing](https://www.w3.org/TR/webaudio-1.0/#DelayNode). This is a designed sci-fi return based on measured material, not a simulation of live game geometry.
