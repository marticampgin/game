"""Pack the painted founder key drawings into standing and combat atlases.

Requires Pillow, NumPy and opencv-python-headless at authoring time.
The client needs only the produced images. All coordinates are in artist pixels.
"""

from argparse import ArgumentParser
from pathlib import Path

import json
import runpy

import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public' / 'assets'
MASTERS = ROOT / 'scripts' / 'art' / 'founders'
KIT = json.loads((ROOT / 'public' / 'fighter-kit.json').read_text())
ROLES = tuple(KIT['founders'])
CELL = (KIT['cell']['width'], KIT['cell']['height'])
BASELINE = KIT['cell']['baseline']
TIERS = tuple(band['id'] for band in KIT['health'])
MOTIONS = KIT['layers']['motions']

# Each number refers to a painted drawing in the artist's four-by-four key sheet.
# In every attacking take the stroke crosses its apex at exposure seven.
TRACK_KEYS = {
    'idle': ((0, 0), (6, 1), (12, 0)),
    'attack': ((0, 0), (2, 4), (3, 16), (4, 5), (6, 17), (7, 6), (9, 7), (10, 19), (11, 0)),
    'signature': ((0, 0), (2, 8), (4, 9), (6, 18), (7, 10), (9, 11), (11, 0)),
    'cast': ((0, 0), (2, 2), (4, 12), (7, 13), (8, 13), (11, 0)),
    'utility': ((0, 0), (2, 2), (7, 3), (8, 3), (11, 0)),
    'brace': ((0, 0), (2, 2), (6, 14), (9, 14), (11, 0)),
    'hurt': ((0, 0), (2, 15), (5, 15), (9, 1), (11, 0)),
}
# The glass and wrist stay at different heights as wounds lower the shoulder.
GLINT_ORIGIN = {
    'chronomancer': ((130, 85), (128, 87), (120, 101)),
    'alchemist': ((127, 73), (126, 78), (125, 87)),
}


def drawings(master, tier):
    cells = []
    for pose in range(16):
        left = pose % 4 * CELL[0]
        top = (tier * 4 + pose // 4) * CELL[1]
        cells.append(master.crop((left, top, left + CELL[0], top + CELL[1])))
    return cells


class Inbetweens:
    """Register nearby surface detail between authored poses and keep hard cel edges."""

    def __init__(self, keys):
        self.images = [np.asarray(im) for im in keys]
        # Inbetweens share their source palette, which keeps the color clusters
        # calm in motion and keeps the downloadable atlas compact.
        # Supplemental gestures reuse the colors of the original twenty drawings.
        pixels = np.concatenate([im[im[:, :, 3] > 0, :3] for im in self.images[:20]])
        self.palette = Image.fromarray(pixels.reshape((-1, 1, 3))).quantize(colors=112)
        self.gray = []
        for im in self.images:
            # Mid-value matte gives both the dark steel and pale hair a boundary.
            rgb = np.where(im[:, :, 3:4] > 0, im[:, :, :3], (89, 80, 102)).astype('uint8')
            self.gray.append(cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY))
        self.solver = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
        self.solver.setFinestScale(0)
        self.flow = {}
        xy = np.indices((CELL[1], CELL[0]), dtype='float32')
        self.xy = np.stack([xy[1], xy[0]], axis=2)

    def sample(self, source, destination, fraction):
        pair = (source, destination)
        if pair not in self.flow:
            self.flow[pair] = self.solver.calc(self.gray[source], self.gray[destination], None)
        displacement = self.flow[pair]
        # Invert the displacement at the *source* surface. A second sample makes
        # the map follow the elbow, blade and cloth once they have left the old pixel.
        lookup = self.xy - displacement * fraction
        offset = cv2.remap(displacement, lookup, None, cv2.INTER_LINEAR,
                           borderMode=cv2.BORDER_REPLICATE)
        lookup = self.xy - offset * fraction
        return cv2.remap(self.images[source], lookup, None, cv2.INTER_NEAREST,
                         borderMode=cv2.BORDER_CONSTANT)

    def between(self, first, last, fraction):
        if first == last or fraction <= 0:
            return Image.fromarray(self.images[first])
        if fraction >= 1:
            return Image.fromarray(self.images[last])
        departing = self.sample(first, last, fraction)
        arriving = self.sample(last, first, 1 - fraction)
        # Covering/revealing hands use one exposure; a crossfade creates two
        # transparent blades. Only combine shading where the warped surfaces agree.
        chosen = (departing if fraction < .50 else arriving).copy()
        same_surface = ((departing[:, :, 3] != 0) & (arriving[:, :, 3] != 0)
                        & (np.max(np.abs(departing[:, :, :3].astype(int)
                                         - arriving[:, :, :3]), axis=2) < 40))
        chosen[same_surface, :3] = np.rint(
            departing[same_surface, :3] * (1 - fraction) + arriving[same_surface, :3] * fraction
        ).astype('uint8')
        blended = Image.fromarray(chosen)
        limited = blended.convert('RGB').quantize(palette=self.palette, dither=Image.Dither.NONE).convert('RGBA')
        limited.putalpha(blended.getchannel('A'))
        return limited


def planted(rest, target):
    """Let the upper body act while retaining one planted stance below the hips."""
    solver = Inbetweens([rest, target])
    field = np.clip((131 - solver.xy[:, :, 1]) / 29, 0, 1)[:, :, None]
    departing = solver.sample(0, 1, field)
    arriving = solver.sample(1, 0, 1 - field)
    return Image.fromarray(np.where(field < .5, departing, arriving))


def idle_glint(frame, role, tier, exposure):
    if role not in GLINT_ORIGIN or exposure not in (3, 4, 5, 6, 7):
        return
    x, y = GLINT_ORIGIN[role][tier]
    draw = ImageDraw.Draw(frame)
    if role == 'alchemist':
        brightness = ('#c6c66d', '#dce997', '#ffffcb', '#dce997', '#c6c66d')[exposure - 3]
        draw.line((x, y, x + 1, y - 1), fill=brightness)
        if exposure == 5:
            draw.point((x, y - 2), fill=brightness)
    else:
        # The painted dial is always legible. A single glint travels a few pixels
        # across the upper rim as the lifted wrist catches the sunset.
        rim = (2, 3, 4, 5, 6)[exposure - 3]
        draw.point((x + rim, y - 12), fill='#ddcaff')


def ambient_key(keys, role, tier):
    if role != 'alchemist':
        return keys[2]
    # The field alchemist checks the contents with the sickle kept in hand.
    # Carry the glass from the resting cel into the palm at the belt.
    held = keys[8].copy()
    vx, vy = GLINT_ORIGIN[role][tier]
    glass = keys[0].crop((vx - 3, vy - 6, vx + 6, vy + 7))
    hand = ((109, 72), (110, 78), (110, 93))[tier]
    held.alpha_composite(glass, hand)
    return held


def clip(solver, role, tier, name):
    if name == 'ambient':
        script = ((0, 0), (2, 1), (5, 20), (7, 20), (10, 1), (11, 0))
    elif name == 'consume':
        # Draw from the belt, bring the grip to the lips, swallow, and lower it.
        script = ((0, 0), (2, 21), (6, 22), (8, 22), (10, 21), (11, 0))
    elif name == 'utility' and role == 'guardian':
        # Turn the shield, bend both knees, then reach and rise with the find.
        script = ((0, 0), (2, 24), (4, 25), (7, 23), (9, 26), (11, 0))
    else:
        script = TRACK_KEYS[name]
    for exposure in range(MOTIONS['columns']):
        for (left, a), (right, b) in zip(script, script[1:]):
            if left <= exposure <= right:
                frame = solver.between(a, b, (exposure - left) / (right - left))
                if name in ('idle', 'ambient'):
                    rest = Image.fromarray(solver.images[0])
                    frame.paste(rest.crop((0, 133, CELL[0], CELL[1])), (0, 133))
                if name == 'idle':
                    idle_glint(frame, role, tier, exposure)
                yield frame
                break


def fallen(frame):
    # Rotate the hurt drawing around the hip on a larger board; then ground the
    # boots/shoulder at the same baseline and keep the entire fallen silhouette.
    art = frame.crop(frame.getbbox()).rotate(78, Image.Resampling.NEAREST, expand=True)
    art = art.crop(art.getbbox())
    cel = Image.new('RGBA', CELL)
    cel.alpha_composite(art, ((CELL[0] - art.width) // 2, BASELINE - art.height))
    return cel


def build(role):
    if (MASTERS.parent / 'costumes' / role / 'healthy.webp').is_file():
        kit = runpy.run_path(str(Path(__file__).with_name('build-costume-skins.py')))
        kit['build'](role, founder=True)
        return
    master = Image.open(MASTERS / f'{role}-keys.webp').convert('RGBA')
    breakdowns = Image.open(MASTERS / f'{role}-breakdowns.webp').convert('RGBA')
    drink = Image.open(MASTERS / f'{role}-consume-keys.webp').convert('RGBA')
    reach = Image.open(MASTERS / 'guardian-reach.webp').convert('RGBA') if role == 'guardian' else None
    bends = Image.open(MASTERS / 'guardian-cache-bends.webp').convert('RGBA') if reach else None
    if drink.size != (CELL[0] * 2, CELL[1] * len(TIERS)):
        raise ValueError(f'{role}: expected a belt grip and a raised grip per health band')
    if breakdowns.size != (CELL[0] * 4, CELL[1] * 3):
        raise ValueError(f'{role}: expected four extra breakdowns for each health band')
    if master.size != (CELL[0] * 4, CELL[1] * 12):
        raise ValueError(f'{role}: expected a four-column master with sixteen drawings per health band')
    standing = Image.new('RGBA', (CELL[0] * 4, CELL[1] * 9))
    moving = Image.new('RGBA', (CELL[0] * MOTIONS['columns'], CELL[1] * len(MOTIONS['rows']) * len(TIERS)))
    ambient = Image.new('RGBA', (CELL[0] * 12, CELL[1] * 3))
    consume = Image.new('RGBA', (CELL[0] * KIT['layers']['consume']['columns'], CELL[1] * len(TIERS)))
    for tier in range(3):
        keys = drawings(master, tier)
        for column in range(4):
            x, y = column * CELL[0], tier * CELL[1]
            keys.append(breakdowns.crop((x, y, x + CELL[0], y + CELL[1])))
        keys.append(ambient_key(keys, role, tier))
        y = tier * CELL[1]
        for column in range(2):
            x = column * CELL[0]
            keys.append(drink.crop((x, y, x + CELL[0], y + CELL[1])))
        if reach:
            keys.append(reach.crop((0, y, CELL[0], y + CELL[1])))
            for col in range(3):
                x = col * CELL[0]
                keys.append(bends.crop((x, y, x + CELL[0], y + CELL[1])))
        solver = Inbetweens(keys)
        stills = [keys[0], keys[1], keys[2], solver.between(0, 1, .55),
                  keys[5], keys[6], keys[12], keys[13], keys[14], keys[15], fallen(keys[15]), keys[9]]
        for i, cel in enumerate(stills):
            standing.paste(cel, (CELL[0] * (i % 4), CELL[1] * (tier * 3 + i // 4)))
        for row, name in enumerate(MOTIONS['rows']):
            y = (tier * len(MOTIONS['rows']) + row) * CELL[1]
            for i, cel in enumerate(clip(solver, role, tier, name)):
                moving.paste(cel, (CELL[0] * i, y))
        for i, cel in enumerate(clip(solver, role, tier, 'ambient')):
            ambient.paste(cel, (CELL[0] * i, CELL[1] * tier))
        for i, cel in enumerate(clip(solver, role, tier, 'consume')):
            consume.paste(cel, (CELL[0] * i, CELL[1] * tier))
        if tier == 0:
            keys[0].crop(keys[0].getbbox()).save(ASSETS / f'{role}.png', optimize=True)
    standing.save(ASSETS / 'skins' / f'{role}-founder.png', optimize=True)
    moving.save(ASSETS / 'skins' / f'{role}-motions.webp', lossless=True, method=5)
    ambient.save(ASSETS / 'skins' / f'{role}-ambient.webp', lossless=True, method=5)
    consume.save(ASSETS / 'skins' / f'{role}-consume.webp', lossless=True, method=5)
    print(f'{role}: 60 painted keys, {len(TRACK_KEYS) * 36} combat and idle cels')


def review(path):
    out = Image.new('RGB', (750, 30 + 175 * len(ROLES)), '#302b3d')
    draw = ImageDraw.Draw(out)
    for tier, label in enumerate(TIERS):
        draw.text((tier * 250 + 32, 8), label.upper(), fill='#f5dba6')
    for r, role in enumerate(ROLES):
        sheet = Image.open(ASSETS / 'skins' / f'{role}-founder.png').convert('RGBA')
        for tier in range(3):
            y = tier * 3 * CELL[1]
            cel = sheet.crop((0, y, CELL[0], y + CELL[1]))
            out.paste(cel, (tier * 250 + 15, r * 175 + 22), cel)
        draw.text((25, r * 175 + 174), role.title(), fill='#f0d6b0')
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path)


if __name__ == '__main__':
    parser = ArgumentParser()
    parser.add_argument('--role', choices=ROLES)
    parser.add_argument('--review', type=Path, help='save a contact sheet of all three painted health bands')
    args = parser.parse_args()
    cv2.setNumThreads(1)
    for selected in (args.role,) if args.role else ROLES:
        build(selected)
    if args.review:
        review(args.review)
