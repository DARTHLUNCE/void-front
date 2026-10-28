---
name: cinematic-game-audio
description: Design, author, integrate and validate distinctive game sound effects, seamless sustained sounds and readable spatial mixes. Use for mechanical or cinematic SFX, weapon and ability sound identities, engine loops, crowded-battle mixing and audio-engine corrections.
---

# Cinematic game audio

Create recognizable actions with physical weight, purposeful timing and useful information. Sound design and runtime behavior are one deliverable: a good sample with the wrong envelope, looping region, priority or spatial treatment still fails.

## Establish the listening contract

- Inspect existing events, identities, cadence, continuous states, audio routes and accepted tuning before designing replacements. Keep gameplay mechanics, timing and RNG separate from sound presentation unless explicitly asked otherwise.
- Translate references into properties: material, mass, mechanism, pressure, articulation, distance and dynamic range. A film reference is a research direction, not permission to sample its soundtrack or a claim to reproduce its proprietary processing.
- Maintain a coverage map of action -> identity -> trigger/state -> variants -> envelope -> spatial route. Include player and non-player events, UI, damage, shutdown and interruptions.
- Treat the latest listening correction as authoritative. Preserve accepted settings outside its scope. Do not repeatedly broaden a successful mix while fixing a different problem.

## Author the sound, not just a cue count

Read [Sound design](references/sound-design.md) when building or revising assets.

- Start from licensed material with useful internal detail; retain originals, license/source links, hashes and processing recipes. Distinctive sound rarely comes from copying one noise-plus-resonator recipe across a catalog.
- Give each important mechanism an audible identity across attack, body, articulation and release. Variation should preserve recognition, not swap the mechanism or musical note every trigger.
- Process assertively when the brief calls for it: resample, perform pitch/filter gestures, use frequency shifts or nonlinear multiband treatment, print and re-edit. Layer by acoustic function rather than accumulating full-band sounds.
- Firing shots need compact, atonal pressure and transient impact. Metallic clicks, pitched resonator tails and chimes are supporting detail, not a substitute for the weapon's body. Judge isolated shots and actual firing cadence together.
- For repeated firing, use almost imperceptible fixed-per-event pitch variation only when helpful; +/-3 cents is a useful starting example. Audit both baked source-rate variation and runtime detuning so they do not stack into a melody. Keep intentional size/action pitch differences.

## Make timing belong to the action

Read [Sustains and envelopes](references/sustains-and-envelopes.md) for continuous sounds or envelope complaints.

- Separate entrance, steady material and exit. Hold one voice while the state persists; changing power or position must not restart it. One-shot transients and continuous-state smoothing require different envelopes.
- Select stable interior material, not merely a zero crossing. Match level, spectral character and slope around the join; use a sufficiently long, correlation-aware constant-energy crossfade when needed.
- An inaudible waveform join cannot hide a repeating startup gesture inside the sustain. Repair the material itself if necessary. Test ordinary flight as thoroughly as dramatic boost/sublight.
- Match shot release to cadence while retaining pressure/body. Shortening everything to a metal click is not a solution to crowding.

## Build a mix that communicates

Read [Runtime and validation](references/runtime-and-validation.md) when integrating or debugging the engine.

- Define listener position and axes explicitly. Do not infer the desired orientation from a top-down camera. A physical player anchor can remain independent of camera extension/zoom while left/right remain screen-relative.
- Nearby sources should have restrained width without losing direction. Keep wider distant bearings and progressive distance coloration. Verify both stereo and headphone paths; narrowing a StereoPanner does not narrow HRTF by itself.
- Protect all player actions equally when requested: own gunfire, abilities, movement, damage feedback and UI must not deliberately duck or steal from each other. Isolate their dry and wet routing from battle ducking/compression; reserve capacity and separate debounce keys by ownership. Do not solve this by prioritizing guns above the player's abilities.
- Keep a final safety limiter and enough headroom that it is rarely engaged. Equal player protection does not imply unlimited voices or exemption from output peak safety. Bound repeated instances of the same cue without cutting unrelated local actions.
- Control crowded mixes with relevance, distance, per-emitter/per-cue admission and background budgets. Do not render every remote startup or every barrel as a full-volume hero event. Preserve useful off-screen battle cues.
- A cinematic compressed/distorted mode should retain readable distance and clarity. Distant filtered sounds should not have their removed harmonics regenerated by a later distortion stage.

## Finish in the runtime

- Compare matched-level isolated actions, rapid repeats, simultaneous player actions, crowded battles, close/off-screen/far positions, and long-held continuous states. Confirm release, pause, tab visibility and respawn transitions.
- Validate asset coverage, finite samples, true peaks, loop joins, runtime routing/admission, bounded voices/cache and actual browser/engine DSP. Metrics and a passing build do not establish perceived quality.
- Distinguish what was rendered, measured, heard and accepted. Keep a rollback bank and deterministic recipes. Never deploy a partial audition manifest as the complete bank.
- Update this skill only after the relevant implementation and listening corrections are complete. Publishing a PR or installing a skill still requires the user's authorization; this workflow does not grant it.
