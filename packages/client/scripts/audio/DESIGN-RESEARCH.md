# Recording-led audio redesign

The first sound bank failed the user's listening review. Noise plus a small set of resonant oscillators produced similar synthetic gestures across unrelated actions. Adding more instances of that recipe would not fix it.

## Primary research and implementation decisions

- [Aadahl: Transformers character design](https://designingsound.org/2010/03/25/erik-aadahl-special-the-sound-design-of-transformers-exclusive-interview/): choose an audible identity for each character before building its library. Here, each hull gets a distinct mechanism; weapons and abilities have their own recognizable articulation. Preserve identity across variation instead of randomizing everything.
- [Aadahl: recording and processing questions](https://designingsound.org/2010/03/30/erik-aadahl-special-reader-questions/): collect material palettes, experiment with unexpected sources, and perform processing gestures. A stressed hinge may provide a richer energy sound than a generic synth. Our implementation edits real material recordings, uses nonuniform speed envelopes, frequency shifting, moving resonances, multiband saturation and resampling. The article does not disclose the proprietary theremin chain; we do not claim to recreate it.
- [Transformers production interviews](https://designingsound.org/2010/03/10/erik-aadahl-special-all-about-the-sound-of-transformers/): varied machinery recordings form the palette; designed elements must retain physical credibility. Edit towards a focused mix. Application: recognizable attacks, a clear characteristic body, then contrasting mechanical recovery; avoid stacking every sound full-band at once.
- [Dark of the Moon sound team](https://www.postmagazine.com/publications/2011/July-1-2011/Audio-Transformers-Dark-of-the-Moon/): ordinary objects can become alien vehicles through transformation; recognizable locking sounds communicate threat. Application: distinct recognisable pre-contact/recoil motifs and source-led transformations; a single well-chosen body can carry an effect.
- [War for Cybertron audio team](https://designingsound.org/2010/07/27/exclusive-interview-with-the-audio-team-of-transformers-war-for-cybertron/): collect vehicles at different operating states, source motors/servos, and design distance perspectives for weapons/explosions. Application: class-specific engine textures, drive-state transitions, close mechanical detail versus distant body. World sound must continue beyond visual visibility.
- [DICE's Ben Minto on mix options](https://www.waves.com/ben-minto-on-game-sound-design): War Tapes is described as the heavily compressed, loud end of their mix choices. Application: a selectable battle-bus profile with parallel compression, soft saturation, controlled top end, and bounded output. UI bypasses the dirty stage. This is an original inspired mix, not DICE's preset or a claim that tape emulation alone matches it.
- [Battlefield 3 interview](https://www.audiotechnology.com/features/shooting-for-a-third-hit): source realism and intelligent dynamic focus are central to clarity. Application: reserve remote fight cues and protect local threats; dense mix must still distinguish direction/distance.

## Production workflow

1. Record source provenance and licence, retain originals, identify meaningful transients and sustained material regions.
2. Author each cue's lead material, physical onset, body transformation, irregular mechanical phrase, and exit. A recognisable identity has several independent dimensions, not just pitch.
3. Build destructive processing offline at high sample rate: varispeed with authored curves; source-excited resonators; frequency shift; moving comb/filter stages; different distortion for lows/mids/highs; short source-grain edits and convolution where appropriate.
4. Print and re-edit processed layers. Keep intentional gaps and ordered articulation. Do not produce a wall of equally loud hiss.
5. Render variations from different source takes/windows, with small timing/deformation changes while retaining the signature. No white-noise generator as a substitute for a body recording.
6. Compare unrelated cues and repeated variations at matched listening level. Inspect transient/low-end/tail, then audition in a crowded battle and at multiple distances.
7. Validate peak headroom, loop joins, finite samples, source coverage, real browser spatial routing, concurrency and lifecycle. Numerical validation is not a substitute for the user's listening acceptance.

## Spatial contract

Final user preference: screen-up is forward, screen-left/right remain left/right regardless of ship heading. The earlier ship-relative orientation request is superseded. Listener position follows the player's ship, not the camera extension or zoom. Audible attacks are independent of visual culling; idle cloaked engines remain silent. Larger weapons carry further. Distance reduces sharp mechanisms and changes spectral balance before fading out. Binaural mode uses generic HRTF filtering, which is not universally preferable; stereo also works on headphones. Initial source position and filter state are set before playback, and close pilot machinery bypasses HRTF coloration. Remote attacks get a bounded voice reservation so nearby chatter cannot silence an entire approaching battle.


## Continuous sounds, envelopes and final mix correction

The user rejected full-clip loops that repeatedly played startup/shutdown, especially ordinary flight and sublight. Every sustained cue now has per-variation internal sustain markers: same-direction zero-crossing search, nearby spectrum/RMS/slope matching, and a 600 ms correlation-aware equal-energy waveform join. Source playback uses loopStart/loopEnd, plays its entrance once, retains the same voice while the state persists, and releases on exit. Ignition/disengagement remain separate event cues. This is a sustained region, not repetition of an entire performance.

One-shots are audited separately. Primary gun durations follow their actual cadence (roughly 0.15–0.34 s), with a brief attack, fast body decay and very low-energy release. UI and small contacts get shorter envelopes; important ability phrases retain their distinct phases. DC removal precedes the final envelope so endpoints stay zero. Pitch/body weighting is action-specific: heavy cannon bodies lower, small emitters lighter; tiny point defence on a large hull does not become a capital cannon.

Distance filtering now falls toward roughly 2.5 kHz at 2.2k units and 1.2 kHz at 4.5k. Remote sounds bypass the nonlinear near-battle path so it cannot regenerate their removed high frequencies. Near/far and parallel dry/dirty paths align the native compressor's 6 ms look-ahead, per the [Web Audio specification](https://www.w3.org/TR/webaudio-1.0/#DynamicsCompressorNode). This is an original War Tapes-inspired mix, not a reproduction of DICE's private preset.


## Later listening corrections

The user rejected the first short-gun revision as too click-like and the v3 continuous materials as repeating motor startup gestures. The subsequent revision preserves more pressure/body energy inside the same short cadence, uses distinct real-material layers with a brief rising pitch gesture, and constructs steady sustain material from stable interior source grains. Correlation-aware 600 ms joins prevent the level loss of linear fades without boosting highly correlated overlaps. Physical bot-versus-bot hull contacts are separately audible; hitmarker confirmation is a tiny dry click. Remote drive transitions and background engine voices have dedicated budgets. These are responses to listening feedback; numerical tests alone did not catch the rejected sound quality.

## Final firing and player mix revision (2026-10-27)

All 35 firing identities (215 takes) now lead with atonal recorded pressure cracks and compact blast bodies, with restrained mechanical recovery. This covers primary/secondary guns, turrets and drones. Spring, glass and coil ringing no longer carry the firing body. Offline firing layers keep fixed playback rates; runtime variation is only +/-3 cents per event. Different source takes retain texture without turning repeated shots into a melody. The other 742 WAVs are byte-identical to the prior complete bank.

The user's final correction asked for still less spatial spread close to the pilot. Stereo width now eases from 0.16 to full width at 2200 world units. The headphone path applies the same distance-dependent narrowing through constant-sum crossfeed, preserving physical HRTF angles and reducing only ear differences. Both modes retain close direction and full distant bearings. Listener position remains the ship's physical center, independent of camera extension; orientation stays screen-relative.

All local actions share equal protection. Player dry buses and their reflection return bypass battle ducking, density gain and battle compressors. Player shots do not sidechain player abilities, engines or warnings. Player/world cooldowns are separate. Sixteen voice slots are reserved for player actions, eight for interface feedback, and four for overlapping release tails within the 60-source total. A single local cue may replace only its own oldest tail after six overlapping instances; it cannot steal another local action. At the exceptional full local-pool limit, unrelated new voices are rejected rather than cutting another action. The final stereo-linked safety limiter still protects total output peaks, so sufficient mix headroom remains necessary.

Reverb uses an adapted, measured CC0 stereo outdoor response from [PaRIRset](https://huggingface.co/datasets/enricguso/parirset), by Enric Guso and Xavier Serra. Its direct arrival is removed; the reflection band is 160-7200 Hz and its length is 0.68 seconds. Separate shared player/background returns use the same response, so background density changes do not lower player reflections. Each return splits before its two mono predelays/convolvers, preserving short-source stereo tails. There is no per-voice convolution. This measured response is not a simulation of live world geometry.
