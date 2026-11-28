"""Check a registered skin's packed cels without rebuilding the art masters."""
from argparse import ArgumentParser
from pathlib import Path
import json

from PIL import Image, ImageChops, ImageDraw, ImageFont

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
    left, top, right, bottom = grid.get('crop', (0,0,*CELL))
    width, height = right-left, bottom-top
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
    if 'collapse' in skin:
        with Image.open(PUBLIC / skin['sheet'].lstrip('/')) as stand, Image.open(PUBLIC / skin['collapse'].lstrip('/')) as strip:
            poses = LAYOUT['layers']['sheet']['poses']
            columns = LAYOUT['layers']['sheet']['columns']
            row, column = divmod(poses.index('fallen'), columns)
            last = LAYOUT['layers']['collapse']['columns'] - 1
            for band in range(BANDS):
                def cel(image, x, y):
                    return image.crop((x*CELL[0], y*CELL[1], (x+1)*CELL[0], (y+1)*CELL[1])).convert('RGBA')
                floor = cel(stand, column, band * len(poses) // columns + row)
                end = cel(strip, last, band)
                matte = Image.new('RGBA', CELL, '#453943')
                a, b = (Image.alpha_composite(matte, frame).convert('RGB') for frame in (floor, end))
                if ImageChops.difference(a, b).getbbox() or ImageChops.difference(floor.getchannel('A'),end.getchannel('A')).getbbox():
                    raise ValueError(f'{skin["id"]}: collapse ends on a different painting from the standing sheet')
    for key in ['portrait', 'model']:
        if key in skin:
            with Image.open(PUBLIC / skin[key].lstrip('/')) as image:
                image.verify()
    print(f"{skin['classId']}/{skin['id']}: {total} populated cels in {BANDS} health bands")


def wardrobe_board(path):
    """Build a portrait and three native-scale stances for every registered look."""
    wardrobe = list(skins())
    roles = list(LAYOUT['founders'])
    columns = 4
    width, row_height, header = 348, 178, 43
    groups = [roles[index:index + columns] for index in range(0, len(roles), columns)]
    names = {role: [skin for skin in wardrobe if skin['classId'] == role] for role in roles}
    heights = [header + row_height * max(len(names[role]) for role in group) + 9 for group in groups]
    board = Image.new('RGB', (columns * width, sum(heights)), '#1b1821')
    draw = ImageDraw.Draw(board)

    def font(size, bold=False):
        for family in (('georgiab.ttf', 'DejaVuSerif-Bold.ttf') if bold else ('georgia.ttf', 'DejaVuSerif.ttf')):
            try:
                return ImageFont.truetype(family, size)
            except OSError:
                continue
        return ImageFont.load_default()

    category, label = font(23, True), font(18)
    top = 0
    for group, height in zip(groups, heights):
        for column, role in enumerate(group):
            left = column * width
            draw.text((left + 12, top + 7), role.title(), font=category, fill='#f3d196')
            for index, skin in enumerate(names[role]):
                y = top + header + index * row_height
                draw.rectangle((left + 4, y, left + width - 5, y + row_height - 6), fill='#2a2531', outline='#514452')
                draw.text((left + 13, y + 10), skin.get('name', 'Founder'), font=label, fill='#f6e5c9')
                photo = skin.get('portrait', '/assets/portrait-' + role + '.webp')
                with Image.open(PUBLIC / photo.lstrip('/')) as image:
                    head = image.convert('RGBA').resize((61, 61), Image.Resampling.LANCZOS)
                draw.rectangle((left + 10, y + 68, left + 74, y + 132), outline='#b38a5b')
                board.paste(head, (left + 12, y + 70), head)
                with Image.open(PUBLIC / skin['sheet'].lstrip('/')) as image:
                    body = image.convert('RGBA')
                for band in range(BANDS):
                    y0 = band * 3 * CELL[1]
                    cel = body.crop((0, y0, CELL[0], y0 + CELL[1]))
                    figure = cel.crop(cel.getbbox())
                    figure.thumbnail((86, 116), Image.Resampling.NEAREST)
                    center = left + 121 + 87 * band
                    board.paste(figure, (center - figure.width // 2, y + 156 - figure.height), figure)
        top += height
    board.save(path, lossless=True, method=6)


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--class-id', help='check only this class')
    parser.add_argument('--skin', help='check only this skin ID')
    parser.add_argument('--wardrobe-board', type=Path, help='also export a WebP reference of the entire wardrobe')
    args = parser.parse_args()
    selected = [s for s in skins() if (not args.class_id or s['classId'] == args.class_id)
                and (not args.skin or s['id'] == args.skin)]
    if not selected:
        parser.error('no matching registered skin')
    for selected_skin in selected:
        check(selected_skin)
    if args.wardrobe_board:
        wardrobe_board(args.wardrobe_board)
