"""Register a fighter's painted celebration or collapse and pack its final hold."""
from argparse import ArgumentParser
from functools import cache
from pathlib import Path
import json
import runpy

import cv2
import numpy as np
from PIL import Image
from art_output import publish

SCRIPTS = Path(__file__).resolve().parent
PUBLIC = SCRIPTS.parent / 'public'
PERFORMANCES = {
    'collapse': ('defeats', 'hurt', 'fallen', .76),
    'celebrate': ('victories', 'idle', 'victory', 1.0),
}
LAYOUT = json.loads((PUBLIC / 'fighter-kit.json').read_text(encoding='utf-8-sig'))
CELL = (LAYOUT['cell']['width'], LAYOUT['cell']['height'])
GROUND = LAYOUT['cell']['baseline']
BANDS = LAYOUT['health']


def looks(role):
    yield role, PUBLIC / 'assets' / 'skins' / (role + '-founder.png')
    for look in LAYOUT['skins']:
        if look['classId'] == role:
            standing = PUBLIC / look['sheet'].lstrip('/')
            yield look['id'], standing


def grid_edges(coverage, count):
    # Use the gutters in the painted board, which needn't be exact thirds.
    occupied = np.flatnonzero(coverage)
    if not len(occupied):
        raise ValueError('The pose board is empty')
    if count == 1:
        return [0, len(coverage)]
    gaps = [(right - left, (left + right) // 2) for left, right in zip(occupied, occupied[1:]) if right - left > 4]
    if len(gaps) < count - 1:
        raise ValueError('Leave a transparent gutter between the paintings')
    return [0, *sorted(mid for _, mid in sorted(gaps, reverse=True)[:count-1]), len(coverage)]


def tile(image, column, row):
    x, y = column * CELL[0], row * CELL[1]
    return image.crop((x, y, x + CELL[0], y + CELL[1]))


def paste_cel(sheet, cel, column, row):
    sheet.paste(cel, (column * CELL[0], row * CELL[1]))


def register(path, selected, layer, injury):
    art = Image.open(path).convert('RGBA')
    alpha = np.asarray(art.getchannel('A')) > 110
    xs = grid_edges(alpha.sum(axis=0) > 2, len(selected))
    ys = grid_edges(alpha.sum(axis=1) > 2, 3)
    directory, _, _, relative_height = PERFORMANCES[layer]
    masters = SCRIPTS / 'art' / directory
    masters.mkdir(parents=True, exist_ok=True)
    band = next((i for i, condition in enumerate(BANDS) if condition['id'] == injury), 0)
    for column, (look, standing) in enumerate(selected):
        outfit = Image.open(standing).convert('RGBA')
        rest = tile(outfit, *pose_tile('idle', band)).getbbox()
        poses = []
        for top, bottom in zip(ys, ys[1:]):
            cel = art.crop((xs[column], top, xs[column + 1], bottom))
            cel.putalpha(cel.getchannel('A').point(lambda a: 255 if a >= 110 else 0))
            poses.append(cel.crop(cel.getbbox()))
        # One head scale across the take, including raised blades and long hems.
        scale = min(relative_height * (rest[3] - rest[1]) / poses[0].height,
                    (CELL[0] - 12) / max(p.width for p in poses), (GROUND - 2) / max(p.height for p in poses))
        master = Image.new('RGBA', (CELL[0] * 3, CELL[1]))
        for index, cel in enumerate(poses):
            cel = cel.resize((round(cel.width * scale), round(cel.height * scale)), Image.Resampling.LANCZOS)
            cel.putalpha(cel.getchannel('A').point(lambda a: 255 if a >= 110 else 0))
            travel = index * 3 if layer == 'collapse' else 0
            left = min(CELL[0] - cel.width - 3, (CELL[0] - cel.width) // 2 + travel)
            master.paste(cel, (index * CELL[0] + left, GROUND - cel.height))
        suffix = '-' + injury if injury else ''
        publish(master, masters / (look + suffix + '.webp'), lossless=True, method=6)


def outfit_palette(standing, band):
    samples = []
    for col, row in [(0, 0), (0, 2), (1, 2)]:
        pixels = np.asarray(tile(standing, col, band * 3 + row))
        samples.append(pixels[pixels[:, :, 3] > 0, :3])
    return Image.fromarray(np.concatenate(samples).reshape((-1, 1, 3))).quantize(colors=146)


@cache
def solver_type():
    return runpy.run_path(str(SCRIPTS / 'build-fighter-skins.py'))['Inbetweens']


def bridge(first, last, fraction):
    # Register the changing body bounds before interpolating small details.
    # Unregistered feet and long hems otherwise snap across most of a cell.
    a, b = first.getbbox(), last.getbbox()
    rect = tuple(round(x + (y-x)*fraction) for x, y in zip(a,b))
    def registered(image, original):
        cel = Image.new('RGBA', CELL)
        piece = image.crop(original).resize((rect[2]-rect[0], rect[3]-rect[1]), Image.Resampling.NEAREST)
        cel.paste(piece, rect[:2])
        return cel
    solver = solver_type()([registered(first,a), registered(last,b)])
    return solver.between(0, 1, fraction)


def pose_tile(pose, band):
    sheet = LAYOUT['layers']['sheet']
    row, col = divmod(sheet['poses'].index(pose), sheet['columns'])
    return col, row + band * len(sheet['poses']) // sheet['columns']


def install(standing, standing_path, look, layer):
    """The final exposure must match the persistent standing sheet pixel for pixel."""
    directory, opening, final, _ = PERFORMANCES[layer]
    master = SCRIPTS / 'art' / directory / (look + '.webp')
    if not master.is_file():
        return False
    strip = Image.new('RGBA', (CELL[0]*9, CELL[1]*len(BANDS)))
    for band, condition in enumerate(BANDS):
        custom = master.with_name(f'{look}-{condition["id"]}.webp')
        poses = Image.open(custom if custom.exists() else master).convert('RGBA')
        if poses.size != (CELL[0]*3, CELL[1]):
            raise ValueError(f'{master.name}: supply three full-size registered poses')
        palette = outfit_palette(standing, band)
        painted = poses.convert('RGB').quantize(palette=palette, dither=Image.Dither.NONE).convert('RGBA')
        painted.putalpha(poses.getchannel('A'))
        first, accent, end = [tile(painted,i,0) for i in range(3)]
        start = tile(standing, *pose_tile(opening, band))
        frames = [start, bridge(start,first,.50), first, bridge(first,accent,.50), accent,
                  bridge(accent,end,.35), bridge(accent,end,.66), bridge(accent,end,.88), end]
        for i, frame in enumerate(frames):
            paste_cel(strip, frame, i, band)
        paste_cel(standing, end, *pose_tile(final, band))
    prefix = look + '-' if standing_path.name.endswith('-founder.png') else ''
    destination = standing_path.with_name(prefix + layer + '.webp')
    publish(strip, destination, lossless=True, method=5)
    return True


def main(default_layer=None):
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--role', choices=LAYOUT['founders'])
    parser.add_argument('--layer', choices=PERFORMANCES, default=default_layer)
    parser.add_argument('--skin', help='restrict import or rebuild to one outfit')
    parser.add_argument('--injury', choices=[b['id'] for b in BANDS], help='import an override for this condition')
    parser.add_argument('--import-board', type=Path, help='outfits across, three consecutive poses down')
    args = parser.parse_args()
    cv2.setNumThreads(1)
    if args.import_board and not (args.role and args.layer):
        parser.error('--import-board needs --role and --layer')
    if args.skin and not args.role:
        parser.error('--skin needs --role')
    for role in ([args.role] if args.role else LAYOUT['founders']):
        selected = [(look,path) for look,path in looks(role) if not args.skin or look == args.skin or
                    (args.skin == 'founder' and look == role)]
        if not selected:
            parser.error('Unknown costume for ' + role)
        if args.import_board:
            register(args.import_board, selected, args.layer, args.injury)
        for look, path in selected:
            standing = Image.open(path).convert('RGBA')
            layers = [args.layer] if args.layer else PERFORMANCES
            rebuilt = [install(standing,path,look,layer) for layer in layers]
            if any(rebuilt):
                publish(standing, path)
                print(look, flush=True)


if __name__ == '__main__':
    main()
