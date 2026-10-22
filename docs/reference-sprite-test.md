# Sprite materials and surface lighting

The reference artwork mode replaces 27 ship hulls, the Titan, 13 world assets and 8 shard variants. Team paint uses authored panel masks; neutral-gray and original vector artwork remain selectable. The sprite gallery is available at `/ship-test.html`.

## Assets and provenance

`packages/client/public/ship-test/` holds four atlases: the original supplied 18-ship gray sheet, `remaining` (nine ships and Titan), `props` (13 world assets), and `shards` (eight top-down crystals). The latter three albedo sheets and the normal, roughness, metallic and emissive source maps were created with the built-in image-generation tool from the approved references. Original source images are retained alongside derived data.

All packed maps reuse the cutout alpha and crop coordinates. Internal feature alignment and inferred geometry are approximate, not measured or guaranteed pixel-perfect. All active height maps are reconstructed from normals using masked screened-Poisson integration; generated grayscale height/AO experiments are not used.

Material channels are R=roughness, G=metallic, B=emission, A=cutout alpha. Roughness is linearly remapped into 0.08-0.95 to preserve variation. Emissive input at or below 64/255 becomes zero, followed by a smooth power curve. Team-colored visible emission has a separate strength from its weaker cast illumination.

## Rebuilding

Python tools require NumPy and Pillow. Run from the repository root:

```sh
python tools/prepare-reference-sprites.py
python tools/prepare-remaining-sprites.py
python tools/prepare-world-assets.py
python tools/refine-paint-masks.py
python tools/normal_to_height.py packages/client/public/ship-test packages/client/public/ship-test/remaining packages/client/public/ship-test/props packages/client/public/ship-test/shards
python tools/pack-material-maps.py
python tools/test_normal_to_height.py
```

Run mask refinement after cutout preparation: it aligns FOB/station paint and excludes ship fixtures. Runtime loads the albedo cutout, armor mask, packed normals, normal-derived relief, and packed material atlas. Source maps and individual channel previews remain for inspection.

## Rendering

Surface lighting includes roughness/metallic response and height-field self-shadowing across each hull. Environmental blockers remain supported. Hulls do not cast offset silhouettes into empty space. Emissive textures seed cascades and bounded spatial emission patches illuminate the same surface-lighting path as authored lights.

Variable-length tiled light lists avoid top-N light replacement. Cascades share a padded world-anchored sampling grid, with camera-reprojected and neighborhood-clamped temporal filtering. Mipmapped sprites, normal-variance roughness and minimum 1.5x render resolution reduce aliasing. These techniques add GPU/memory cost; a 2D height field is not a full 3D model.

Blue shards choose one of the top four assets; gold shards use the bottom four, with stable random full-circle rotation and 0.9-1.1 scale. Projectiles fade and shrink over their final 220ms, shedding short-lived cosmetic sparks. The snapshot gains remaining projectile lifetime, so worker and client must update together. Damage, collision, weapon lifetime and economy are unchanged.

## Checks

Development diagnostics: `/lighting-check.html`, `/pbr-check.html`, `/camera-lighting-check.html`, `/ship-shadow-check.html`, and `/asset-lighting-check.html`. They exercise normal response, blockers, self-shadows, material emission, many-light stability and camera motion. Run the client build/type checks and the snapshot regression test before publishing. Camera diagnostics cover specific paths, not every camera/zoom/scene combination.
