"""Register painted costume boards and pack them into the standard fighter kit.

Rebuilding assets uses the committed healthy, wounded, and critical paintings.
The optional import step registers a new artist board against a class's footwork.
Requires Pillow, NumPy, and OpenCV at authoring time.
"""
from argparse import ArgumentParser
from functools import lru_cache
from pathlib import Path
from tempfile import NamedTemporaryFile
import importlib.util
import re

import cv2
import numpy as np
from PIL import Image

SCRIPT = Path(__file__).resolve().parent
ROOT = SCRIPT.parent
PACKS = SCRIPT / 'art' / 'costumes'
ART = ROOT / 'public' / 'assets' / 'skins'
spec = importlib.util.spec_from_file_location('founders', SCRIPT / 'build-fighter-skins.py')
founders = importlib.util.module_from_spec(spec)
spec.loader.exec_module(founders)
CELL = founders.CELL
BASELINE = founders.BASELINE
BANDS = founders.TIERS

# The twenty painted landmarks in a costume board occupy five columns, four rows.
# Each pose has its own anatomy, weapon angle and footing. Contact is frame 7.
TRACKS = {
    'idle': ((0, 0), (6, 1), (12, 0)),
    'attack': ((0, 0), (2, 4), (4, 5), (7, 6), (9, 7), (11, 0)),
    'signature': ((0, 0), (2, 8), (4, 9), (7, 10), (9, 11), (11, 0)),
    'cast': ((0, 0), (2, 2), (4, 12), (7, 13), (8, 13), (11, 0)),
    'utility': ((0, 0), (2, 2), (7, 3), (8, 3), (11, 0)),
    'brace': ((0, 0), (2, 2), (6, 14), (9, 14), (11, 0)),
    'hurt': ((0, 0), (2, 15), (5, 15), (9, 1), (11, 0)),
    'ambient': ((0, 0), (2, 1), (5, 2), (7, 2), (10, 1), (11, 0)),
    'consume': ((0, 0), (2, 16), (6, 17), (8, 17), (10, 16), (11, 0)),
}
# Six optional hand and weapon breakdowns per band add sharp brushwork at
# the points where the largest silhouette changes happen between key poses.
DETAILED_TRACKS = {
    'attack': ((0, 0), (2, 4), (3, 20), (4, 5), (6, 21), (7, 6), (9, 7), (10, 23), (11, 0)),
    'signature': ((0, 0), (2, 8), (4, 9), (6, 22), (7, 10), (9, 11), (11, 0)),
}


def tile(board, col, row):
    w, h = CELL
    return board.crop((col * w, row * h, (col + 1) * w, (row + 1) * h))


def reference(class_id, band):
    registered = PACKS / class_id / (BANDS[band] + '.webp')
    if registered.exists():
        return skin_cels(Image.open(registered).convert('RGBA'))
    master = Image.open(founders.MASTERS / (class_id + '-keys.webp')).convert('RGBA')
    consume = Image.open(founders.MASTERS / (class_id + '-consume-keys.webp')).convert('RGBA')
    steps = Image.open(ART / (class_id + '-footwork.webp')).convert('RGBA')
    poses = [tile(master, i % 4, 4 * band + i // 4) for i in range(16)]
    if class_id == 'guardian':
        poses[3] = tile(Image.open(founders.MASTERS / 'guardian-reach.webp'), 0, band)
    return poses + [tile(consume, i, band) for i in range(2)] + [tile(steps, i, band) for i in range(2)]


def separate(board, columns=5, rows=4):
    """Recover intact figures even when a blade crosses a nominal column edge."""
    rgba = np.asarray(board.convert('RGBA'))
    height, width = rgba.shape[:2]
    _, labels, stats, _ = cv2.connectedComponentsWithStats((rgba[:, :, 3] >= 110).astype('uint8'))
    parts = sorted(range(1, len(stats)), key=lambda i: int(stats[i, 4]), reverse=True)
    count = columns * rows
    bodies = parts[:count]
    if len(bodies) != count or min(stats[i, 4] for i in bodies) < height * width * .04 / count:
        raise ValueError(f'Expected {count} separate opaque figures on a transparent {columns} by {rows} board')
    centers = {i: stats[i, :2] + stats[i, 2:4] / 2 for i in bodies}
    vertical = sorted(bodies, key=lambda i: centers[i][1])
    ordered = [i for row in range(rows) for i in sorted(vertical[row * columns:(row + 1) * columns],
                                                      key=lambda i: centers[i][0])]
    owners = np.zeros(len(stats), dtype=np.int32)
    for index, i in enumerate(ordered, start=1):
        owners[i] = index
    # Include disconnected glass, particles, hair curls, and constellation rings.
    # Assign by distance to the silhouette envelope so an extended hand wins
    # over a neighboring fighter on the other side of a nominal grid boundary.
    for i in parts[count:]:
        x, y, w, h, area = stats[i]
        if area < 4:
            continue
        px, py = x + w / 2, y + h / 2
        nearest, distance = None, float('inf')
        for body in bodies:
            bx, by, bw, bh, _ = stats[body]
            dx = max(bx - px, px - (bx + bw), 0)
            dy = max(by - py, py - (by + bh), 0)
            score = dx * dx + dy * dy
            if score < distance:
                nearest, distance = body, score
        if distance < (min(width / columns, height / rows) * .22) ** 2:
            owners[i] = owners[nearest]
    assigned = owners[labels]
    figures = []
    for index in range(1, count + 1):
        yy, xx = np.nonzero(assigned == index)
        left, right, top, bottom = xx.min(), xx.max() + 1, yy.min(), yy.max() + 1
        figure = rgba[top:bottom, left:right].copy()
        figure[:, :, 3] = np.where(assigned[top:bottom, left:right] == index, 255, 0)
        figures.append(Image.fromarray(figure))
    return figures


def feet(image):
    """Use both grounded boots to register lunges and short return steps."""
    alpha = np.asarray(image.convert('RGBA'))[:, :, 3]
    yy, _ = np.nonzero(alpha > 96)
    floor = int(yy.max())
    start = floor - max(4, round((floor - yy.min()) * .085))
    _, xx = np.nonzero(alpha[start:floor + 1] > 96)
    return float((np.percentile(xx, 5) + np.percentile(xx, 95)) / 2)


def palette_board(out):
    pixels = np.asarray(out)
    colours = pixels[pixels[:, :, 3] > 128, :3]
    palette = Image.fromarray(colours.reshape(-1, 1, 3)).quantize(colors=152)
    limited = out.convert('RGB').quantize(palette=palette, dither=Image.Dither.NONE).convert('RGBA')
    limited.putalpha(out.getchannel('A'))
    return limited


def fitted_cels(figures, centers, scale):
    limits = [min((CELL[0] - 4) / im.width, (BASELINE - 2) / im.height) for im in figures]
    scale = min(scale, min(limits))
    for im, center in zip(figures, centers):
        cel = Image.new('RGBA', CELL)
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))),
                       Image.Resampling.LANCZOS)
        im.putalpha(im.getchannel('A').point(lambda a: 255 if a >= 110 else 0))
        x = max(1, min(CELL[0] - im.width - 1, round(center - feet(im))))
        cel.alpha_composite(im, (x, BASELINE - im.height))
        yield cel


def import_board(class_id, band_name, source, dest, founder=False):
    band = BANDS.index(band_name)
    figures = separate(Image.open(source))
    # A founder establishes the class footprint. An outfit uses its founder's
    # individual boot positions and matches its size across several landmarks.
    if founder:
        scale = (120, 113, 101)[band] / figures[0].height
        foot_centers = [CELL[0] / 2] * len(figures)
    else:
        guides = reference(class_id, band)
        ratios = [(guides[i].getbbox()[3] - guides[i].getbbox()[1]) / figures[i].height
                  for i in (0, 1, 2, 8, 12, 14, 16, 17)]
        scale = float(np.median(ratios))
        foot_centers = [feet(guide) for guide in guides]
    board = Image.new('RGBA', (5 * CELL[0], 4 * CELL[1]))
    for i, cel in enumerate(fitted_cels(figures, foot_centers, scale)):
        board.paste(cel, (i % 5 * CELL[0], i // 5 * CELL[1]))
    dest.parent.mkdir(exist_ok=True, parents=True)
    palette_board(board).save(dest, lossless=True, method=6)


def skin_cels(board):
    if board.size != (5 * CELL[0], 4 * CELL[1]):
        raise ValueError('A registered costume master must have five columns and four rows')
    return [tile(board, i % 5, i // 5) for i in range(20)]


def detail_guide(keys):
    solver = founders.Inbetweens(keys)
    return [keys[16], keys[17], solver.between(4, 5, .5), solver.between(5, 6, .72),
            solver.between(9, 10, .72), solver.between(7, 0, .55)]


def match_paint(cels, guides):
    """Bind extra artist drawings to the injury band’s existing shade ramps."""
    def samples(images):
        pixels = [np.asarray(im) for im in images]
        return np.concatenate([p[p[:, :, 3] > 128, :3] for p in pixels])

    incoming, reference = samples(cels), samples(guides)
    to_lab = lambda rgb: cv2.cvtColor(rgb.reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(-1, 3)
    source_lab, target_lab = to_lab(incoming), to_lab(reference)
    levels = np.linspace(0, 100, 33)
    ramp = np.arange(256)
    curves = []
    for channel, limit in enumerate((15, 9, 9)):
        values = np.percentile(source_lab[:, channel], levels)
        wanted = np.percentile(target_lab[:, channel], levels)
        unique, indices = np.unique(values, return_index=True)
        shift = np.interp(ramp, unique, wanted[indices] - unique)
        curves.append(np.uint8(np.clip(np.rint(ramp + np.clip(shift, -limit, limit)), 0, 255)))
    palette = Image.fromarray(reference.reshape(-1, 1, 3)).quantize(colors=152)
    for cel in cels:
        lab = cv2.cvtColor(np.asarray(cel.convert('RGB')), cv2.COLOR_RGB2LAB)
        for channel, curve in enumerate(curves):
            lab[:, :, channel] = curve[lab[:, :, channel]]
        rgb = Image.fromarray(cv2.cvtColor(lab, cv2.COLOR_LAB2RGB))
        fitted = rgb.quantize(palette=palette, dither=Image.Dither.NONE).convert('RGBA')
        fitted.putalpha(cel.getchannel('A'))
        yield fitted


def import_details(id, source):
    figures = separate(Image.open(source), columns=6, rows=3)
    master = Image.new('RGBA', (6 * CELL[0], 3 * CELL[1]))
    for band, name in enumerate(BANDS):
        keys = skin_cels(Image.open(PACKS / id / (name + '.webp')).convert('RGBA'))
        guides = detail_guide(keys)
        row = figures[6 * band:6 * (band + 1)]
        ratios = [(guide.getbbox()[3] - guide.getbbox()[1]) / fig.height for guide, fig in zip(guides, row)]
        centers = [feet(g) for g in guides]
        # Keep the two hand poses at standing scale. A wide jab or tall
        # overhead weapon should not make a wounded fighter grow to drink.
        cels = []
        for i in (0, 1):
            cels.extend(fitted_cels([row[i]], [centers[i]], ratios[i]))
        cels.extend(fitted_cels(row[2:], centers[2:], float(np.median(ratios[2:]))))
        for i, cel in enumerate(match_paint(cels, guides)):
            master.paste(cel, (i * CELL[0], band * CELL[1]))
    palette_board(master).save(PACKS / id / 'details.webp', lossless=True, method=6)


def import_portrait(source, dest):
    portrait = Image.open(source).convert('RGBA')
    width, height = portrait.size
    side = min(width, height)
    x, y = (width - side) // 2, (height - side) // 2
    portrait = portrait.crop((x, y, x + side, y + side)).resize((144, 144), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    palette_board(portrait).save(dest, lossless=True, method=6)


def publish(image, destination):
    with NamedTemporaryFile(dir=destination.parent, suffix=destination.suffix, delete=False) as temp:
        staged = Path(temp.name)
    try:
        if destination.suffix == '.png':
            image.save(staged, optimize=True)
        else:
            image.save(staged, lossless=True, method=5)
        staged.replace(destination)
    finally:
        staged.unlink(missing_ok=True)


def asset_path(id, layer, founder):
    if not founder:
        return ART / 'outfits' / id / (layer + '.webp')
    if layer == 'standing':
        return ART / (id + '-founder.png')
    if layer == 'model':
        return ART.parent / (id + '.png')
    if layer == 'portrait':
        return ART.parent / ('portrait-' + id + '.webp')
    return ART / (id + '-' + layer + '.webp')


def build(id, founder=False):
    pack = PACKS / id
    asset_path(id, 'standing', founder).parent.mkdir(parents=True, exist_ok=True)
    layers = founders.KIT['layers']
    def sheet(cols, rows):
        return Image.new('RGBA', (cols * CELL[0], rows * CELL[1]))
    standing = sheet(layers['sheet']['columns'], 9)
    motion = sheet(layers['motions']['columns'], len(layers['motions']['rows']) * 3)
    ambient = sheet(layers['ambient']['columns'], 3)
    consume = sheet(layers['consume']['columns'], 3)
    steps = sheet(layers['footwork']['columns'], 3)
    def place(image, cel, col, row):
        image.paste(cel, (col * CELL[0], row * CELL[1]))

    details_path = pack / 'details.webp'
    details = Image.open(details_path).convert('RGBA') if details_path.is_file() else None
    tracks = TRACKS | DETAILED_TRACKS if details is not None else TRACKS
    for band, name in enumerate(BANDS):
        keys = skin_cels(Image.open(pack / (name + '.webp')).convert('RGBA'))
        if details is not None:
            if details.size != (6 * CELL[0], len(BANDS) * CELL[1]):
                raise ValueError('A detail master must have six columns and a row for each health band')
            drawings = [tile(details, c, band) for c in range(6)]
            # A standing drink moves the wrist and head. Keep the two boots
            # on their marks from the belt pickup through the last exposure.
            keys[16:18] = [founders.planted(keys[0], cel) for cel in drawings[:2]]
            keys.extend(drawings[2:])
        solver = founders.Inbetweens(keys)
        between = lru_cache(maxsize=None)(solver.between)
        stills = [keys[0], keys[1], keys[2], between(0, 1, .5), keys[5], keys[6], keys[12], keys[13],
                  keys[14], keys[15], founders.fallen(keys[15]), keys[9]]
        for index, cel in enumerate(stills):
            place(standing, cel, index % 4, band * 3 + index // 4)
        track_rows = layers['motions']['rows']
        for track, script in tracks.items():
            dest_sheet = ambient if track == 'ambient' else consume if track == 'consume' else motion
            row = band if track in ('ambient', 'consume') else band * len(track_rows) + track_rows.index(track)
            for frame in range(12):
                (left, a), (right, b) = next((l, r) for l, r in zip(script, script[1:]) if l[0] <= frame <= r[0])
                cel = between(a, b, (frame - left) / (right - left))
                if track in ('idle', 'ambient'):
                    cel = cel.copy()
                    cel.paste(keys[0].crop((0, 133, CELL[0], CELL[1])), (0, 133))
                place(dest_sheet, cel, frame, row)
        for frame, cel in enumerate((keys[18], between(18, 19, .5), keys[19], between(19, 0, .5))):
            place(steps, cel, frame, band)
        between.cache_clear()
    # One costume palette keeps painted holds and in-betweens consistent. It
    # also lets WebP encode the largest atlas as indexed art for faster loads.
    sheets = {'standing': standing, 'motions': motion, 'ambient': ambient, 'consume': consume, 'footwork': steps}
    samples = []
    for image in sheets.values():
        pixels = np.asarray(image)
        samples.append(pixels[pixels[:, :, 3] > 0, :3][::4])
    palette = Image.fromarray(np.concatenate(samples).reshape((-1, 1, 3))).quantize(colors=250)
    for name, image in sheets.items():
        packed = image.convert('RGB').quantize(palette=palette, dither=Image.Dither.NONE).convert('RGBA')
        packed.putalpha(image.getchannel('A'))
        publish(packed, asset_path(id, name, founder))
        if name == 'standing':
            rest = tile(packed, 0, 0)
            publish(rest.crop(rest.getbbox()), asset_path(id, 'model', founder))
    print(id + ': packed 372 cels', flush=True)


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--skin', help='costume ID; omit to rebuild every registered costume')
    parser.add_argument('--founder', action='store_true', help='author the base art for --class-id')
    parser.add_argument('--import-board', type=Path, help='register a raw five-by-four painted board')
    parser.add_argument('--import-details', type=Path, help='register an optional six-by-three gesture breakdown board')
    parser.add_argument('--import-portrait', type=Path, help='pack a square head and shoulders painting')
    parser.add_argument('--class-id', help='class used for foot registration')
    parser.add_argument('--health', choices=BANDS)
    args = parser.parse_args()
    for token in (args.class_id, args.skin):
        if token is not None and not re.fullmatch(r'[a-z][a-z0-9]*(?:-[a-z0-9]+)*', token):
            parser.error('expected a lowercase class or costume ID')
    if args.founder and (not args.class_id or args.skin):
        parser.error('use --founder with --class-id')
    id = args.class_id if args.founder else args.skin
    cv2.setNumThreads(1)
    if args.import_details:
        if not id:
            parser.error('detail import requires a costume or founder')
        import_details(id, args.import_details)
    elif args.import_portrait:
        if not id:
            parser.error('portrait import requires a costume or founder')
        import_portrait(args.import_portrait, asset_path(id, 'portrait', args.founder))
    elif args.import_board:
        if not (id and args.class_id and args.health):
            parser.error('board import requires a costume or founder, --class-id and --health')
        import_board(args.class_id, args.health, args.import_board, PACKS / id / (args.health + '.webp'), args.founder)
    elif id:
        build(id, args.founder)
    else:
        for skin in founders.KIT['skins']:
            if (PACKS / skin['id']).is_dir():
                build(skin['id'])
