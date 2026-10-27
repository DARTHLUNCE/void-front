# Recorded audio build

The runtime bank uses mono, 48 kHz PCM WAV assets; each voice is spatialized at playback. The sound renderer operates offline at 96 kHz, then resamples and limits true peaks before 16-bit export. Existing VFX, simulation timing, damage, movement and ability rules are untouched.

## Rebuild

Use Python 3.12, the versions in `requirements.txt`, and FFmpeg on PATH (or set `FFMPEG` to its executable). Run from this directory. Fetching checks every source against the reviewed SHA-256 and fails rather than accepting changed remote content.

```powershell
python -m pip install -r requirements.txt
python fetch_sources.py --out source-recordings
python build_foundry.py --inventory inventory.json --sources source-recordings --out rebuilt-bank
python validate_bank.py --bank rebuilt-bank --report rebuilt-bank-validation.json
```

For existing originals, use `fetch_sources.py --out source-recordings --verify-only`. `--only weapon.patrol,engine.destroyer --variants 1` makes a small audition bank in a **separate output directory**. Its manifest is intentionally partial; never replace the runtime bank with it.

`sources.json` and `CREDITS.md` identify 44 CC0 recordings: 40 original WAVs and four explicitly disclosed MP3 sources. `recipes.json` and `audit.json` in each rendered bank record the material/processing recipe, source use and output hashes. Published assets need no runtime Python, DSP generation or network source fetches.

## Design and runtime contracts

- All 35 firing identities use independently selected atonal crack/pressure/mechanism materials. Broadband attacks and compact pressure bodies replace the rejected metallic ringing. Short duration does not mean only a latch: retain a substantial 20–100 ms body and a quiet release before the next shot.
- Every hull has a drive identity. Continuous material is built from interior grains selected for stable spectrum and level, with overlapping windows. Full recorded motor performances contain revs even when their endpoints match; do not reuse those as sustain textures.
- Every continuous take has internal zero-crossing markers and a 600 ms correlation-aware, equal-energy join. Startup/exit cues remain separate. Never replay their attack/release at each wrap. File-level checks are necessary, but listen across multiple wraps at fixed throttle as well.
- Physical hull impacts have twelve variations and occur in both bot and human combat. A separate 55 ms dry click acknowledges the player's confirmed hits. Shield contact, shield collapse, detonations and ship/structure deaths remain distinct events.
- Screen-left is left and screen-up is forward. Listener position follows the pilot, independent of camera extension and zoom. Stereo is valid on headphones; generic HRTF is an optional binaural coloration, not a promise of wider or better sound. Own close machinery bypasses HRTF. Initial position, filter and rate are set before starting a voice; only subsequent motion is smoothed.
- Distance filtering applies before separate near/far routing. Distant material bypasses the near distortion stage, which otherwise regenerates removed high frequencies. Parallel paths align native compressor look-ahead. War Tapes is an original inspired mix, not a copied DICE preset.
- Per-category/per-cue caps, slight fixed pitch variation, remote-shot grouping, background-engine budgets and priority stealing bound density. Own controls and warnings remain protected. Nearby sublight launches have a shared 650 ms admission interval; remote charge/abort/bleed detail shares 1.5 s and a smaller radius. Important nearby impacts/abilities briefly lower routine background voices.
- Decode one take per cue, warm extra takes on use with four concurrent fetches and a 128 MiB cache target. A stereo-linked limiter protects peaks. Audio events use a separate bounded cosmetic snapshot stream and no gameplay RNG.

## Review

Use `/audio-check.html` to audition every cue, compare output modes and distance, hold continuous sounds, and run the dense battle and browser audio checks. The offline checks test actual browser HRTF, sustain/release behavior and limiter output. They do not establish listening quality or prove that a loop's internal gesture is inaudible.

Before replacing a bank, run the manifest/content coverage tests, listen at matched level, compare isolated shots with rapid fire, and hold idle/flight/sublight long enough to cross several loop joins. Then check the actual game. Avoid treating a successful build or a high cue count as artistic acceptance.

## Research

See `DESIGN-RESEARCH.md` for primary sound-designer interviews and the reasoning behind the recorded-material approach. The steady-texture renderer uses windowed overlap-add principles; it is not a claim of implementing full WSOLA. See [Driedger and Mueller's time-scale modification review](https://www.audiolabs-erlangen.com/content/05_fau/professor/00_mueller/06_projects/90_siamus/2016_DriedgerMueller_TSMOverview_AppliedSciences_ePrint.pdf) for the distinction between overlap-add and waveform-aligned methods.


## Final firing and player mix revision (2026-10-27)

All 35 firing identities (215 takes) now lead with atonal recorded pressure cracks and compact blast bodies, with restrained mechanical recovery. This covers primary/secondary guns, turrets and drones. Spring, glass and coil ringing no longer carry the firing body. Offline firing layers keep fixed playback rates; runtime variation is only +/-3 cents per event. Different source takes retain texture without turning repeated shots into a melody. The other 742 WAVs are byte-identical to the prior complete bank.

The user's final correction asked for still less spatial spread close to the pilot. Stereo width now eases from 0.16 to full width at 2200 world units. The headphone path applies the same distance-dependent narrowing through constant-sum crossfeed, preserving physical HRTF angles and reducing only ear differences. Both modes retain close direction and full distant bearings. Listener position remains the ship's physical center, independent of camera extension; orientation stays screen-relative.

All local actions share equal protection. Player dry buses and their reflection return bypass battle ducking, density gain and battle compressors. Player shots do not sidechain player abilities, engines or warnings. Player/world cooldowns are separate. Sixteen voice slots are reserved for player actions, eight for interface feedback, and four for overlapping release tails within the 60-source total. A single local cue may replace only its own oldest tail after six overlapping instances; it cannot steal another local action. At the exceptional full local-pool limit, unrelated new voices are rejected rather than cutting another action. The final stereo-linked safety limiter still protects total output peaks, so sufficient mix headroom remains necessary.

Reverb uses an adapted, measured CC0 stereo outdoor response from [PaRIRset](https://huggingface.co/datasets/enricguso/parirset), by Enric Guso and Xavier Serra. Its direct arrival is removed; the reflection band is 160-7200 Hz and its length is 0.68 seconds. Separate shared player/background returns use the same response, so background density changes do not lower player reflections. Each return splits before its two mono predelays/convolvers, preserving short-source stereo tails. There is no per-voice convolution. This measured response is not a simulation of live world geometry.

## Rebuild the measured reflection response

The reviewed original is included at `impulses/acustica-outdoors.wav`. Its hash is checked by the builder. From this script directory:

```powershell
python build_space_ir.py --source impulses/acustica-outdoors.wav --out ../../public/assets/audio-space/outdoor-reflections-v1.wav
```

The prepared WAV and adjacent audit JSON retain source provenance and processing details. No runtime download from the dataset is required. See `CREDITS.md` for its license. The audio bank and reflection response are separate builds.
