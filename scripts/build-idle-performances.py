"""Paint a quiet loop and two ACTING takes per health band from registered cels.

Run after packing a fighter. Use --import-board for a transparent artist sheet
with outfit columns (founder, journey, mastery) and health rows. The registered
key paintings are versioned; runtime needs just the compact three-strip atlas.
"""
from argparse import ArgumentParser
from pathlib import Path
import importlib.util
import math
import json

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent / 'public'
MASTERS = HERE / 'art' / 'idles'
KIT = json.loads((PUBLIC / 'fighter-kit.json').read_text())
spec = importlib.util.spec_from_file_location('founder_art', HERE / 'build-fighter-skins.py')
founder_art = importlib.util.module_from_spec(spec)
spec.loader.exec_module(founder_art)
CELL = founder_art.CELL
BANDS = founder_art.TIERS
# Clip the transparent margin, retaining the center and the combat foot line.
CROP = (14, 0, 194, 150)
COLUMNS = 16

# Sight line, hands, and trailing cloth move on different beats. Anchors are in
# right-facing native cel coordinates. A soft elbow/shoulder falloff keeps each
# moving part attached to the torso; planted boot pixels never move.
# Each point is (x,y, radiusX,radiusY, horizontal px, vertical px, phase).
RIGS = {
    'guardian': [(103,47,23,26,1,-2,0), (128,69,25,30,1,-3,.05), (74,92,21,28,-2,2,.13)],
    'berserker': [(106,58,34,37,3,2,0), (63,54,29,19,-3,-3,.21), (76,106,22,27,3,-4,.12)],
    'chronomancer': [(107,53,21,34,0,-2,0), (67,60,23,25,-4,-3,.19), (138,82,20,20,2,-5,.08)],
    'alchemist': [(112,51,25,24,2,2,0), (132,74,17,21,1,-3,.13), (72,92,22,30,-2,2,.25)],
    'gambler': [(103,50,26,28,-1,-2,.05), (134,76,22,21,3,-4,.18), (70,83,22,31,-2,2,0)],
    'necromancer': [(107,48,22,30,0,-2,0), (71,91,24,31,-3,-3,.23), (135,74,20,25,-2,3,.14)],
    'trickster': [(108,50,26,26,3,0,.08), (68,61,23,20,-3,2,.24), (131,85,18,24,-3,-3,0)],
    'artificer': [(110,49,25,28,1,2,.08), (135,80,25,27,2,-4,.15), (75,84,20,25,-2,2,.24)],
}
# Authored landmarks in the existing body-motion pack for the first idle.
# A Guardian settles behind the shield; a Berserker rolls her knife shoulder;
# a Chronomancer tests the field around her hand; an Alchemist checks the pack.
CHECKS = {
    'guardian': ('brace',6), 'berserker': ('attack',2),
    'chronomancer': ('signature',4), 'alchemist': ('utility',2),
    'gambler': ('signature',4), 'necromancer': ('cast',4),
    'trickster': ('brace',5), 'artificer': ('utility',4),
}
# Each class has a different attack on the idle key and a separate release.
# Values index sixteen displayed exposures, including rest at both ends.
SCORES = {
    'guardian': ((0, 6, 9, 15), (0, 8, 10, 15)),
    'berserker': ((0, 4, 6, 15), (0, 6, 10, 15)),
    'chronomancer': ((0, 7, 9, 15), (0, 7, 11, 15)),
    'alchemist': ((0, 4, 8, 15), (0, 7, 11, 15)),
    'gambler': ((0, 4, 7, 15), (0, 6, 10, 15)),
    'necromancer': ((0, 7, 9, 15), (0, 8, 11, 15)),
    'trickster': ((0, 4, 6, 15), (0, 5, 9, 15)),
    'artificer': ((0, 6, 8, 15), (0, 5, 10, 15)),
}
YY, XX = np.indices((CELL[1], CELL[0]), dtype=np.float32)


def crop_cell(image, col, row):
    x, y = col * CELL[0], row * CELL[1]
    return image.crop((x, y, x + CELL[0], y + CELL[1]))


def skins(role):
    kit = KIT['founders'][role]
    base = '/assets/skins/' + role + '-'
    base_skin = {'classId':role, 'id':'founder', 'sheet':base + 'founder.png'}
    base_skin.update({layer:base + layer + '.webp' for layer in kit['layers']})
    return [base_skin] + [skin for skin in KIT['skins'] if skin['classId'] == role]


def image_asset(url):
    return Image.open(PUBLIC / url.lstrip('/')).convert('RGBA')


def feet(image):
    alpha = np.asarray(image)[:, :, 3]
    ys, xs = np.nonzero(alpha > 110)
    floor = ys.max()
    soles = xs[ys > floor - max(3, (floor - ys.min()) * .075)]
    return float((np.percentile(soles, 5) + np.percentile(soles, 95)) / 2), int(floor)


def register(board, role):
    wardrobe = skins(role)
    w, h = board.size
    for col, skin in enumerate(wardrobe):
        original = image_asset(skin['sheet'])
        masters = Image.new('RGBA',(CELL[0], CELL[1] * len(BANDS)))
        for band in range(len(BANDS)):
            art = board.crop((round(col*w/len(wardrobe)), round(band*h/len(BANDS)),
                              round((col+1)*w/len(wardrobe)), round((band+1)*h/len(BANDS))))
            art.putalpha(art.getchannel('A').point(lambda v: 255 if v >= 110 else 0))
            art = art.crop(art.getbbox())
            rest = crop_cell(original, 0, band*3)
            height = rest.getbbox()[3] - rest.getbbox()[1]
            scale = min(height/art.height, (CROP[2]-CROP[0]-2)/art.width)
            art = art.resize((round(art.width*scale), round(art.height*scale)), Image.Resampling.LANCZOS)
            art.putalpha(art.getchannel('A').point(lambda v: 255 if v>=110 else 0))
            foot, floor = feet(rest)
            new_foot, new_floor = feet(art)
            origin = max(CROP[0], min(CROP[2]-art.width, round(foot-new_foot)))
            masters.alpha_composite(art, (origin, band*CELL[1] + floor-new_floor))
        MASTERS.mkdir(parents=True,exist_ok=True)
        masters.save(MASTERS / (role+'-'+skin['id']+'.webp'), lossless=True,method=6)


def ripple(image, role, band, phase, strength):
    # An asymmetric inhale and release with delayed shoulder/cloth follow-through.
    dx, dy = np.zeros_like(XX), np.zeros_like(YY)
    for x,y,rx,ry,side,rise,lag in RIGS[role]:
        y += (0,5,15)[band]
        weight = np.exp(-((XX-x)/rx)**2 - ((YY-y)/ry)**2)
        angle = math.tau * (phase-lag)
        beat = (.5 - .5*math.cos(angle)) - (.5 - .5*math.cos(math.tau*lag))
        dx += weight * side * beat
        dy += weight * rise * beat
    strength *= (1,.84,.64)[band] * np.clip((132-YY)/24,0,1)
    return Image.fromarray(cv2.remap(np.asarray(image), XX-dx*strength, YY-dy*strength,
                                     cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT))


def planted(rest, target):
    # Blend displacement rather than opacity to restore the stance below the
    # hips. This avoids transparency seams or doubled boots in new paintings.
    field = np.clip((131-YY)/29,0,1)[:, :, None]
    solver = founder_art.Inbetweens([rest,target])
    src = solver.sample(0,1,field)
    dst = solver.sample(1,0,1-field)
    return Image.fromarray(np.where(field < .5,src,dst))


def exposure(frame, timing):
    _, arrive, leave, end = timing
    v = min(1,frame/arrive) if frame <= leave else (end-frame)/(end-leave)
    return v*v*(3-2*v)


def publish(skin):
    role, name = skin['classId'], skin['id']
    rest_sheet, motions = image_asset(skin['sheet']), image_asset(skin['motions'])
    path = MASTERS / (role+'-'+name+'.webp')
    key_sheet = Image.open(path).convert('RGBA') if path.exists() else None
    width, height = CROP[2]-CROP[0], CROP[3]-CROP[1]
    atlas = Image.new('RGBA',(COLUMNS*width,len(BANDS)*3*height))
    tracks = KIT['layers']['motions']['rows']
    for band in range(len(BANDS)):
        base = crop_cell(rest_sheet,0,band*3)
        track, col = CHECKS[role]
        check = planted(base, crop_cell(motions,col,band*len(tracks)+tracks.index(track)))
        # New authors can rehearse a costume with a readied weapon pose before
        # supplying its own second key painting.
        alternate = crop_cell(key_sheet,0,band) if key_sheet else crop_cell(motions,3,band*len(tracks)+tracks.index('attack'))
        focus = planted(base,alternate)
        interp = founder_art.Inbetweens([base,check,focus])
        for take in range(3):
            for col in range(COLUMNS):
                phase = col / (COLUMNS if take==0 else COLUMNS-1)
                image = base if take==0 else interp.between(0,take,exposure(col,SCORES[role][take-1]))
                image = ripple(image,role,band,phase,1 if take==0 else .5)
                bbox = image.getbbox()
                if bbox[0]<CROP[0] or bbox[1]<CROP[1] or bbox[2]>CROP[2] or bbox[3]>CROP[3]:
                    raise ValueError(f'{role}/{name}, band {band} take {take}: drawing crosses {CROP}: {bbox}')
                atlas.paste(image.crop(CROP),(col*width,(band*3+take)*height))
    points = np.asarray(atlas)
    samples = points[points[:, :, 3] >= 128,:3][::5]
    palette = Image.fromarray(samples.reshape(-1,1,3)).quantize(colors=245)
    packed = atlas.convert('RGB').quantize(palette=palette,dither=Image.Dither.NONE).convert('RGBA')
    packed.putalpha(atlas.getchannel('A'))
    output = PUBLIC / skin['idles'].lstrip('/')
    packed.save(output,lossless=True,method=5)
    print(f'{role}/{name}: {output.stat().st_size:,} bytes',flush=True)


if __name__ == '__main__':
    parser=ArgumentParser(description=__doc__)
    parser.add_argument('--role',choices=tuple(RIGS))
    parser.add_argument('--skin')
    parser.add_argument('--import-board',type=Path)
    args=parser.parse_args()
    cv2.setNumThreads(1)
    if args.import_board:
        if not args.role: parser.error('--import-board requires --role')
        register(Image.open(args.import_board).convert('RGBA'),args.role)
    for role in (args.role,) if args.role else KIT['founders']:
        for skin in skins(role):
            if skin.get('idles') and (not args.skin or skin['id']==args.skin):
                publish(skin)
