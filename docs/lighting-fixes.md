# Lighting and camera fixes

The pilot camera fits 1,650 x 937.5 world units, extending the wider viewport axis.
Cruise still pulls back by 40%.

Radiance cascades run at half screen resolution. Float data passes disable blending,
retain transmittance, and merge visibility along connected intervals before interpolation.
Conservative distance-field steps reduce silhouette leaks and flicker.

Hull surfaces evaluate up to 16 nearby area emitters separately, with distance-field
shadows and 2x normal slope strength. Each mesh owns its light list, so opposing lights
do not collapse into one direction. Ships, motherships and FOBs supply solid silhouettes.
The receiver's own interior is skipped: this is a 2D approximation for lighting the
visible top surface. The fixed key light remains unshadowed for readability.

Run the dev server and open /lighting-check.html to exercise the actual GPU shaders:
normal response, blocking, opposing emitters, subpixel emitter motion and static stability.
This increases GPU work relative to the original quarter-resolution cascades.
