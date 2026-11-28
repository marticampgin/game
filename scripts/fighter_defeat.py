"""Register and pack a fighter's kneeling, bracing and grounded defeat paintings."""
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
MASTERS = SCRIPTS / 'art' / 'defeats'
LAYOUT = json.loads((PUBLIC / 'fighter-kit.json').read_text(encoding='utf-8-sig'))
CELL = (LAYOUT['cell']['width'], LAYOUT['cell']['height'])
GROUND = LAYOUT['cell']['baseline']
BANDS = LAYOUT['health']


def looks(role):
    yield role, PUBLIC / 'assets' / 'skins' / (role + '-founder.png'), PUBLIC / 'assets' / 'skins' / (role + '-collapse.webp')
    for look in LAYOUT['skins']:
        if look['classId'] == role:
            standing = PUBLIC / look['sheet'].lstrip('/')
            yield look['id'], standing, standing.with_name('collapse.webp')


def grid_edges(coverage):
    # Use the gutters in the painted board, which needn't be exact thirds.
    occupied = np.flatnonzero(coverage)
    if not len(occupied):
        raise ValueError('The defeat board is empty')
    gaps = [(right - left, (left + right) // 2) for left, right in zip(occupied, occupied[1:]) if right - left > 4]
    if len(gaps) < 2:
        raise ValueError('Leave a transparent gutter between each of the three paintings')
    return [0, *sorted(mid for _, mid in sorted(gaps, reverse=True)[:2]), len(coverage)]


def tile(image, column, row):
    x, y = column * CELL[0], row * CELL[1]
    return image.crop((x, y, x + CELL[0], y + CELL[1]))


def paste_cel(sheet, cel, column, row):
    sheet.paste(cel, (column * CELL[0], row * CELL[1]))


def register(role, path):
    art = Image.open(path).convert('RGBA')
    alpha = np.asarray(art.getchannel('A')) > 110
    xs = grid_edges(alpha.sum(axis=0) > 2)
    ys = grid_edges(alpha.sum(axis=1) > 2)
    MASTERS.mkdir(parents=True, exist_ok=True)
    for column, (look, standing, _) in enumerate(looks(role)):
        outfit = Image.open(standing).convert('RGBA')
        rest = tile(outfit, 0, 0).getbbox()
        poses = []
        for top, bottom in zip(ys, ys[1:]):
            cel = art.crop((xs[column], top, xs[column + 1], bottom))
            cel.putalpha(cel.getchannel('A').point(lambda a: 255 if a >= 110 else 0))
            poses.append(cel.crop(cel.getbbox()))
        # Keep one common head scale from the first knee drop to the floor.
        scale = min(.76 * (rest[3] - rest[1]) / poses[0].height, (CELL[0] - 12) / max(p.width for p in poses))
        master = Image.new('RGBA', (CELL[0] * 3, CELL[1]))
        for index, cel in enumerate(poses):
            cel = cel.resize((round(cel.width * scale), round(cel.height * scale)), Image.Resampling.LANCZOS)
            cel.putalpha(cel.getchannel('A').point(lambda a: 255 if a >= 110 else 0))
            left = min(CELL[0] - cel.width - 3, (CELL[0] - cel.width) // 2 + index * 3)
            master.paste(cel, (index * CELL[0] + left, GROUND - cel.height))
        publish(master, MASTERS / (look + '.webp'), lossless=True, method=6)


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


def install(standing, destination, look):
    """Keep the persistent floor pose and its incoming animation on the same cel."""
    master = MASTERS / (look + '.webp')
    if not master.is_file():
        return False
    poses = Image.open(master).convert('RGBA')
    if poses.size != (CELL[0]*3, CELL[1]):
        raise ValueError(f'{master.name}: supply three full-size registered poses')
    strip = Image.new('RGBA', (CELL[0]*9, CELL[1]*len(BANDS)))
    for band in range(len(BANDS)):
        palette = outfit_palette(standing, band)
        painted = poses.convert('RGB').quantize(palette=palette, dither=Image.Dither.NONE).convert('RGBA')
        painted.putalpha(poses.getchannel('A'))
        kneel, hip, floor = [tile(painted,i,0) for i in range(3)]
        hurt = tile(standing, 1, band*3 + 2)
        frames = [hurt, bridge(hurt,kneel,.50), kneel, bridge(kneel,hip,.50), hip,
                  bridge(hip,floor,.35), bridge(hip,floor,.66), bridge(hip,floor,.88), floor]
        for i, frame in enumerate(frames):
            paste_cel(strip, frame, i, band)
        paste_cel(standing, floor, 2, band*3 + 2)
    publish(strip, destination, lossless=True, method=5)
    return True


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--role', choices=LAYOUT['founders'])
    parser.add_argument('--import-board', type=Path, help='three costumes across, knee / hip / floor down')
    args = parser.parse_args()
    cv2.setNumThreads(1)
    if args.import_board:
        if not args.role:
            parser.error('--import-board needs --role')
        register(args.role, args.import_board)
    for role in ([args.role] if args.role else LAYOUT['founders']):
        for look, path, dest in looks(role):
            standing = Image.open(path).convert('RGBA')
            if install(standing, dest, look):
                if path.suffix == '.png':
                    publish(standing, path, optimize=True)
                else:
                    publish(standing, path, lossless=True, method=5)
                print(look, flush=True)
