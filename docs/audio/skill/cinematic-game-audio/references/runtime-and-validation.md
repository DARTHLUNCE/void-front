# Runtime mixing and validation

## Spatial contract

Choose the listener origin and orientation deliberately. For a top-down game, the physical player's center can anchor attenuation while screen-left/right define panning. Camera extension, zoom or screen resolution must not shift perceived source distance unless intentionally part of the design.

Narrow close sources without removing direction, then smoothly open distant bearings. Apply that policy to both stereo and HRTF. One implementation is constant-sum channel crossfeed after HRTF: same-ear gain `(1+w)/2`, opposite-ear gain `(1-w)/2`. This preserves the mono component while scaling only the ear difference by `w`; it is not additional reverb or an invented source direction. Smooth changes and release all added nodes. Test with short real effects, not only steady tones. Generic HRTF can color close sounds unpleasantly; local machinery may benefit from the stereo path.

Attenuation, low-pass, direct/reflection ratio and transient detail jointly convey distance. Keep useful fights audible outside the camera. Do not route distance-filtered sound back through distortion that recreates the removed high harmonics. Account for processor latency in parallel paths, including native compressor lookahead; unaligned clean/dirty paths can comb-filter.

## Equal protection for player actions

Inspect the complete path, not just a priority score:

- Event/debounce ownership: a remote event must not spend the local action's cooldown.
- Admission: reserve physical capacity for local actions, UI and useful distant events, including release tails. Per-category maxima alone are not reservations if a shared cap is already full.
- Routing: local dry audio and reflection returns must bypass background sidechain, crowd normalization and battle compressors when the brief requires equal player protection.
- Local contention: rapid player shots may replace their own old tails, not an ability, engine or damage feedback. Give continuous player states capacity independent of background loop ranking.
- Bound the exceptional overload case explicitly. Do not promise infinite protected voices; expose dropped/replaced counts and retain a final safety limiter.

Player events can reduce background clutter without reducing other player events. Preserve chosen individual volumes; equal protection does not mean making every action equally loud. Keep headroom so the final limiter does not become another audible sidechain.

## Crowded scenes and quality budgets

Use relevance, proximity and audibility to admit background voices. Coalesce only appropriate near-simultaneous distant repeats, retaining a real representative source position. Avoid a full-volume sublight ignition for every neighboring ship. Retain high-value threat and off-screen battle cues. Prefer fade-stealing quiet/redundant background tails over hard stopping.

Cap live sources and count releasing sources too. Share convolution/processing by mix domain; do not add a reverb instance per emitter. Decode a guaranteed first take per cue, load additional takes on demand with bounded concurrency, and evict only unused optional decoded data. Preserve deterministic game RNG by keeping audio variation separate.

## Reflections

Use a suitable measured, licensed response or a deliberately designed response with credible temporal/spectral structure. Remove unwanted direct arrival, control low/high bands and decay, and keep the dry transient readable. Relative reflection sends can grow with distance while absolute energy still falls. Close player audio should have a restrained audible return when requested, not total dryness.

In Web Audio, test the actual splitter/predelay/convolver graph with a short left-only and right-only impulse. A graph that looks correct can lose delayed channel information after a source ends. Then test a real player weapon and a crowded mix. If using a static measured response, describe it as such; do not claim live geometry acoustics.

## Validation matrix

- **Assets:** every event/identity covered; provenance and recipe ledger; valid formats, durations and loop regions; finite samples; true-peak headroom; endpoint silence where intended; partial banks never overwrite complete manifests.
- **Behavior:** snapshot/event deduplication, separate cosmetic queues, no gameplay RNG/timing changes; shield/overheat failure episodes do not retrigger continuously; meaningful recovery rearms them.
- **Routing:** remote saturation still admits local actions and distant cues; player firing plus ability plus engine plus warning remains stable; local reflections are protected too; no stale sources after exit.
- **DSP:** actual engine/browser render of short transients, HRTF/stereo near/far, dry/wet latency, left/right reflections, long sustains, release, limiter overload and finite output.
- **Listening:** isolated, actual cadence, same-family repetition, opposing identities, simultaneous player actions, dense battle, close/off-screen/far, long holds and transitions at matched levels.
- **Delivery:** record current results and limits, preserve rollback, publish only authorized scope, keep the reusable skill synchronized with accepted corrections.

State which evidence is numerical, runtime or listening-based. A peak meter does not prove punch, a short offline render does not prove a pleasant loop, and a passing build does not prove a mix is readable.
