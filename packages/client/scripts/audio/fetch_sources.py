"""Fetch only the reviewed CC0 inputs and verify exact content before use."""
from pathlib import Path
import argparse
import hashlib
import json
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    records = json.loads(Path(__file__).with_name('sources.json').read_text(encoding='utf-8'))
    args.out.mkdir(parents=True, exist_ok=True)
    for source in records:
        filename = source['file']
        if Path(filename).name != filename or source['license'] != 'CC0-1.0':
            raise ValueError(f'Unexpected source record: {filename}')
        target = args.out / filename
        if target.exists():
            data = target.read_bytes()
        else:
            if args.verify_only:
                raise FileNotFoundError(target)
            request = urllib.request.Request(source['url'], headers={'User-Agent': 'VoidFront-AudioSourceFetch/1.0'})
            with urllib.request.urlopen(request, timeout=90) as response:
                data = response.read(source['bytes'] + 1)
        if len(data) != source['bytes'] or hashlib.sha256(data).hexdigest() != source['sha256']:
            raise ValueError(f'Source differs from reviewed content: {filename}. Existing files were not overwritten.')
        if not target.exists():
            with target.open('xb') as output:
                output.write(data)
        print(f'Verified {filename}')
    print(f'All {len(records)} reviewed inputs verified.')


if __name__ == '__main__':
    main()
