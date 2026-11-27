"""Check a registered skin's packed cels without rebuilding the art masters."""
from argparse import ArgumentParser
from pathlib import Path
import json

from PIL import Image

PUBLIC = Path(__file__).resolve().parents[1] / 'public'
LAYOUT = json.loads((PUBLIC / 'fighter-kit.json').read_text(encoding='utf-8-sig'))
CELL = (LAYOUT['cell']['width'], LAYOUT['cell']['height'])
BANDS = len(LAYOUT['health'])


def skins():
    for role, kit in LAYOUT['founders'].items():
        base = f'/assets/skins/{role}-'
        descriptor = dict(classId=role, id='founder', sheet=base + 'founder.png')
        descriptor.update({layer: base + layer + '.webp' for layer in kit['layers']})
        yield descriptor
    yield from LAYOUT['skins']


def check_layer(path, layer):
    grid = LAYOUT['layers'][layer]
    columns = grid['columns']
    rows = len(grid['poses']) // columns if 'poses' in grid else len(grid.get('rows', ['default']))
    width, height = CELL
    with Image.open(path) as image:
        expected = (width * columns, height * rows * BANDS)
        if expected != image.size:
            raise ValueError(f'{path.name}: expected {expected}, found {image.size}')
        rgba = image.convert('RGBA')
    alpha = rgba.getchannel('A')
    starts = set()
    for band in range(BANDS):
        for row in range(rows):
            for col in range(columns):
                x, y = col * width, (band * rows + row) * height
                box = (x, y, x + width, y + height)
                if alpha.crop(box).getbbox() is None:
                    raise ValueError(f'{path.name}: empty cel at band {band}, row {row}, column {col}')
                if row == col == 0:
                    starts.add(rgba.crop(box).tobytes())
    if len(starts) != BANDS:
        raise ValueError(f'{path.name}: two health bands open with the same drawing')
    return columns * rows * BANDS


def check(skin):
    total = 0
    for layer in LAYOUT['layers']:
        if layer in skin:
            total += check_layer(PUBLIC / skin[layer].lstrip('/'), layer)
    for key in ['portrait', 'model']:
        if key in skin:
            with Image.open(PUBLIC / skin[key].lstrip('/')) as image:
                image.verify()
    print(f"{skin['classId']}/{skin['id']}: {total} populated cels in {BANDS} health bands")


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--class-id', help='check only this class')
    parser.add_argument('--skin', help='check only this skin ID')
    args = parser.parse_args()
    selected = [s for s in skins() if (not args.class_id or s['classId'] == args.class_id)
                and (not args.skin or s['id'] == args.skin)]
    if not selected:
        parser.error('no matching registered skin')
    for selected_skin in selected:
        check(selected_skin)
