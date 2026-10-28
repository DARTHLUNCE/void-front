# Sustains and action envelopes

## Choose a region, not a whole clip

A machine recording may contain ignition, acceleration, stable operation and shutdown. Looping all of it replays the performance. A zero-amplitude crossing only addresses the instantaneous discontinuity; it does not match waveform slope, phase, RMS, spectrum or perceived gesture.

Find a stable interior region using windowed energy, spectral balance and stationarity, then inspect/listen. Pick matching same-direction crossings near the intended boundaries. If suitable material is too short, author a stationary bed from stable grains with overlap-add and slow independent texture variation. Do not keep obvious startup ramps inside the grains. Preserve natural detail without rhythmic repetition.

For an overlap join, account for correlation. Equal-amplitude fades can dip with uncorrelated material; equal-power fades can boost highly correlated material. Normalize the overlapping energy appropriately with bounded compensation. Longer overlaps, such as several hundred milliseconds for machinery, can conceal a seam; choose by material rather than making the same duration mandatory everywhere.

Store exact per-take start/end markers and crossfade provenance. Keep the entrance outside the sustain and the release under state control. Pitch or rate modulation must not invalidate the available region. Validate both ends and the internal seam after resampling/export.

## Runtime ownership

Use stable emitter/state keys. Start once on activation, update gain/filter/rate/position smoothly, hold indefinitely, release once on exit. Brief virtualization must resume the appropriate sustain phase rather than replay ignition. A separate activation one-shot should trigger on the state edge, not every update.

Audit engines, boost, charging, beam/repair tethers, fields, drones, missiles and ambience. Handle interrupted charge, repeated button input, depletion, death, respawn, pause and tab visibility. Decide explicitly whether return resumes the state or requires a new activation.

## One-shots

Do not reuse continuous smoothing for initial transients. Set position, filter and playback rate before starting a short source. Initial gain should preserve the authored attack; later changes can be smoothed.

Design envelopes from action cadence and role. A quick gunshot needs an immediate transient and compact body, not a long metallic decay. A large ability may need anticipation, impulse, sustained energy and recovery; do not shorten that phrase just because gunfire is crowded. Preserve distinct gameplay timing.

## Verification

Listen across several loop seams and extended holds at stable power, then with power/velocity changes. A seam can be numerically smooth while a recurring drill-start gesture remains obvious. Compare held-state RMS and spectrum across the boundary, local sample/derivative jumps, and end silence. Check stop/restart races with the same runtime code used in-game. Keep subjective seam acceptance separate from automated continuity tests.
