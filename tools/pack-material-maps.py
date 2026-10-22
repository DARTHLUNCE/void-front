"""Pack image-generated material maps; remove gray leakage from ALL emissive atlases."""
from pathlib import Path
import json
import numpy as np
from PIL import Image

BLACK_POINT = 64
EMISSION_GAMMA = 1.35


def pack(folder: Path) -> dict:
    albedo = Image.open(folder / 'original-cutout-atlas.png').convert('RGBA')
    alpha = np.asarray(albedo)[..., 3]
    channels = []
    report = {'folder': folder.name, 'blackPoint': BLACK_POINT, 'gamma': EMISSION_GAMMA}
    for kind in ('roughness', 'metallic', 'emissive'):
        source = Image.open(folder / f'generated-{kind}-source.png').convert('L')
        source = source.resize(albedo.size, Image.Resampling.BILINEAR)
        original = np.asarray(source)
        values = original.copy()
        if kind == 'roughness':
            # Smooth affine remap: retain all source differences without crushing
            # dark/bright values into flat threshold plateaus.
            values = np.rint((0.08 + original.astype(float) / 255 * 0.87) * 255).astype(np.uint8)
            report['roughnessRange'] = [0.08, 0.95]
        if kind == 'emissive':
            values = np.rint(np.clip((original.astype(float) - BLACK_POINT) / (255 - BLACK_POINT), 0, 1) ** EMISSION_GAMMA * 255).astype(np.uint8)
            assert not np.any(values[original <= BLACK_POINT])
            report['grayPixelsRemoved'] = int(np.count_nonzero((original > 0) & (original <= BLACK_POINT) & (alpha > 0)))
            report['emittingPixels'] = int(np.count_nonzero((values > 0) & (alpha > 0)))
        values[alpha == 0] = 0
        channels.append(values)
        Image.fromarray(np.dstack([values, values, values, alpha])).save(folder / f'{kind}-atlas.png')
    packed = np.dstack([*channels, alpha])
    Image.fromarray(packed).save(folder / 'packed-material-atlas.png')
    assert np.array_equal(packed[..., 3], alpha)
    (folder / 'material-pack-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    return report


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1] / 'packages/client/public/ship-test'
    print(json.dumps([pack(root / folder) for folder in ('', 'remaining', 'props', 'shards')], indent=2))

