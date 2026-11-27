"""Build Riftbound's original illustrated animation cels from its class artwork.

Run with Python 3 and Pillow. Coordinates below are in the 100 × 120 model
space, facing right, with both feet on y=119. A four-column sheet contains
three rows of poses for each of the three health bands.
"""

from math import cos, radians, sin
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public' / 'assets'
OUTPUT = ASSETS / 'skins'
MODEL = (100, 120)
CELL = (208, 166)
WORK = (264, 240)
ORIGIN = (80, 60)
CROP = (27, 36, 235, 202)
NEAREST = Image.Resampling.NEAREST
POSES = ('idle', 'breathe', 'survey', 'settle', 'windup', 'strike',
         'channel', 'release', 'guard', 'hurt', 'fallen', 'victory')

# Each silhouette has its own articulated foreground prop, fulcrum, cuff and
# underpainting. Only the area normally hidden behind a moving prop is painted.
RIGS = {
    'guardian': {
        'weapon': [(64,49),(70,44),(77,44),(84,39),(99,46),(99,77),(93,90),(87,98),(83,100),(74,91),(68,78),(64,64)],
        'pivot': (69,65), 'shoulder': (61,60), 'cuff': (73,65),
        'under': [(54,51),(66,47),(74,53),(77,66),(71,76),(65,88),(54,80)],
        'colors': ('#302237','#646078','#e5b15e'),
        'damage': 'plate', 'sway': 0.85,
    },
    'berserker': {
        'weapon': [(47,0),(99,0),(99,49),(94,52),(79,43),(83,54),(93,63),(99,64),(99,77),(94,78),(83,69),(76,66),(70,66),(67,60),(62,55),(61,51),(65,46),(62,39),(49,27)],
        'pivot': (70,51), 'shoulder': (66,55), 'cuff': (73,54),
        'under': [(52,36),(62,37),(69,43),(73,48),(74,57),(66,65),(55,61)],
        'colors': ('#3e2930','#a85436','#f4ab74'),
        'damage': 'fur', 'sway': 1.28,
    },
    'chronomancer': {
        'weapon': [(74,0),(91,0),(96,15),(91,21),(99,28),(99,44),(86,49),(81,52),(80,59),(77,92),(77,107),(74,118),(69,119),(67,112),(68,87),(70,63),(66,55),(69,49),(74,45),(62,41),(57,37),(58,30),(63,24),(64,16),(68,8)],
        'pivot': (75,54), 'shoulder': (61,58), 'cuff': (75,54),
        'under': [(55,56),(66,52),(73,49),(77,53),(73,61),(60,65)],
        'colors': ('#272642','#56509a','#d4a2ec'),
        'damage': 'silk', 'sway': 1.02,
    },
    'alchemist': {
        'weapon': [(84,11),(98,11),(99,23),(99,40),(94,44),(86,47),(81,55),(74,60),(69,55),(69,49),(74,45),(78,39),(83,36),(79,33),(79,24)],
        'pivot': (75,51), 'shoulder': (65,54), 'cuff': (78,47),
        'under': [(60,49),(67,46),(71,47),(77,51),(75,57),(69,62),(61,59)],
        'colors': ('#30252b','#6d6142','#bca576'),
        'damage': 'leather', 'sway': 1.08,
    }
}


def polygon(points):
    mask = Image.new('L', MODEL)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return mask


def move(layer, pivot, *, angle=0, shift=(0, 0), scale=(1, 1), lean=0):
    """Inverse affine sampling preserves the hard pixel edge and the foot pivot."""
    theta = radians(angle)
    a, b = scale[0] * cos(theta), -scale[1] * sin(theta) - lean
    c, d = scale[0] * sin(theta), scale[1] * cos(theta)
    det = a * d - b * c
    x, y = pivot
    tx = x + shift[0] - a * x - b * y
    ty = y + shift[1] - c * x - d * y
    inverse = (d/det, -b/det, (b*ty-d*tx)/det, -c/det, a/det, (c*tx-a*ty)/det)
    return layer.transform(WORK, Image.Transform.AFFINE, inverse, NEAREST)


def place(image):
    layer = Image.new('RGBA', WORK)
    layer.alpha_composite(image, ORIGIN)
    return layer


def point(xy):
    return (ORIGIN[0]+xy[0], ORIGIN[1]+xy[1])


def damaged(source, role, tier):
    if tier == 0:
        return source.copy()
    art = source.copy()
    ink = Image.new('RGBA', MODEL)
    draw = ImageDraw.Draw(ink)
    eraser = ImageDraw.Draw(art)
    dark = '#291c32'

    def crack(points, glint):
        draw.line(points, fill=dark, width=3)
        draw.line([(x+1,y) for x,y in points], fill=glint, width=1)

    def tear(points):
        eraser.polygon(points, fill=(0,0,0,0))

    if role == 'guardian':
        crack([(98,57),(89,62),(91,65),(82,68),(85,73),(80,77)], '#f5c279')
        crack([(33,48),(38,47),(43,42)], '#f7c9a4')
        draw.polygon([(71,57),(76,59),(78,68),(83,73),(81,78),(75,72)], fill='#504553',outline=dark)
        draw.line([(72,58),(77,67),(77,70)], fill='#ecc89c', width=2)
        tear([(83,41),(87,44),(89,40),(86,38)])
        if tier == 2:
            tear([(0,0),(53,0),(58,8),(53,12),(47,9),(45,17),(37,15),(31,24),(26,20),(18,29),(0,30)])
            tear([(98,62),(89,68),(94,70),(85,75),(94,75),(97,81),(100,82)])
            tear([(0,87),(10,94),(11,89),(18,97),(18,102),(26,109),(0,108)])
            crack([(72,47),(73,55),(80,62),(80,70),(87,76),(84,88)], '#c49f70')
            crack([(50,29),(52,36),(58,37),(61,42)], '#e3aa72')
    elif role == 'berserker':
        crack([(90,18),(84,22),(86,26),(78,29),(77,34)], '#ffce99')
        crack([(17,53),(23,48),(28,47)], '#ffbd91')
        tear([(97,25),(91,28),(94,29),(91,33),(99,32)])
        draw.polygon([(8,62),(23,57),(25,61),(10,68)],fill='#ceb28e',outline=dark)
        draw.line([(13,65),(24,60)],fill='#826656',width=2)
        if tier == 2:
            tear([(74,0),(100,0),(100,28),(92,23),(93,19),(85,19),(86,14),(81,13),(83,9),(76,7)])
            tear([(0,28),(11,23),(12,27),(19,27),(14,32),(19,35),(2,41),(0,40)])
            crack([(66,20),(69,26),(68,30),(76,36),(75,41)], '#dda374')
            draw.polygon([(12,71),(22,69),(25,73),(14,77)], fill='#66514e',outline=dark)
            draw.line([(13,74),(21,71)],fill='#bd9380',width=2)
            crack([(44,45),(47,49),(45,54)], '#ffd1a1')
    elif role == 'chronomancer':
        crack([(75,25),(79,29),(76,32),(81,35)], '#e7dfea')
        tear([(8,103),(13,99),(12,107),(19,104),(14,115),(5,118)])
        crack([(33,26),(38,29),(40,34)], '#e5b3ce')
        draw.polygon([(43,80),(49,85),(46,89),(50,94),(45,101),(45,93),(40,90)],fill='#372b53')
        draw.line([(42,80),(47,85),(44,90)],fill='#cf9abf',width=2)
        if tier == 2:
            tear([(73,0),(91,0),(91,11),(85,10),(82,15),(79,12),(74,13)])
            tear([(26,113),(29,102),(32,107),(35,99),(39,104),(37,120),(23,120)])
            draw.polygon([(74,26),(83,25),(80,29),(78,33),(82,36),(74,35),(78,30)],fill='#446174',outline=dark)
            draw.line([(75,34),(80,35)],fill='#7df0de',width=1)
            crack([(41,94),(47,91),(45,86),(51,82)], '#c79bbc')
            tear([(27,24),(34,23),(34,27),(40,27),(33,31),(25,31)])
    else:
        crack([(88,24),(92,26),(89,29),(94,31)], '#e7ffa0')
        crack([(22,66),(29,64),(32,68)], '#d7a776')
        draw.line([(87,34),(87,39),(85,42)], fill='#88c33a', width=2)
        draw.polygon([(31,73),(42,69),(45,76),(34,80)],fill='#81604c',outline=dark)
        draw.line([(33,74),(38,77),(42,72)],fill='#c5a581',width=1)
        if tier == 2:
            tear([(0,20),(18,22),(14,28),(21,28),(15,33),(19,35),(3,40),(0,38)])
            tear([(27,112),(31,98),(35,104),(37,97),(40,109),(46,103),(41,120),(23,120)])
            draw.polygon([(83,27),(96,26),(95,30),(92,33),(86,32)],fill='#3a5653',outline=dark)
            draw.line([(86,32),(92,32)],fill='#9bec48',width=2)
            draw.rectangle((52,66,58,77),fill='#523b32',outline=dark)
            crack([(53,22),(57,25),(54,28),(58,31)], '#dbc29a')
            draw.line([(89,34),(87,38),(88,43),(85,47)],fill='#96d83c',width=2)
    ink.putalpha(ImageChops.multiply(ink.getchannel('A'),art.getchannel('A')))
    return Image.alpha_composite(art,ink)


# Arm rotations (clockwise), hand offsets, body lean and squashing. Different
# silhouettes have different preparations and contact points for the same beat.
GESTURES = {
    'guardian': [(0,0,0),(2,0,-1),(-5,1,-2),(1,0,0),(-24,-5,-4),(31,19,-8),(-15,0,-8),(-32,11,-16),(-12,8,-5),(20,-7,6),(58,0,6),(-25,0,-13)],
    'berserker': [(0,0,0),(-4,-1,-1),(4,0,1),(-2,0,0),(-55,-9,-9),(78,15,5),(-40,-4,-8),(45,15,-7),(22,3,-2),(34,-6,5),(61,0,8),(-48,-2,-15)],
    'chronomancer': [(0,0,0),(-2,0,-2),(4,1,-3),(0,0,-1),(-28,-6,0),(51,13,4),(-22,-5,-8),(32,14,-4),(-12,-2,-3),(19,-6,5),(57,0,5),(-17,-1,-13)],
    'alchemist': [(0,0,0),(-5,0,-1),(-16,-4,-5),(2,0,0),(-55,-10,-8),(66,12,6),(-40,-6,-10),(42,14,-9),(-18,-4,-2),(27,-6,6),(64,0,4),(-32,-1,-13)]
}
BODY = [(0,1,1,0),(0,1,.985,1),(-.022,1,1,0),(.012,1,.992,0),
        (-.105,1.02,.93,0),(.15,1.06,.94,1),(-.07,.98,.96,0),(.10,1.01,.985,0),
        (.012,1.05,.89,0),(-.15,.97,.90,0),(0,1,.86,0),(-.038,.97,1.025,-1)]


def frames(role,tier):
    rig = RIGS[role]
    source = Image.open(ASSETS/(role+'.png')).convert('RGBA').resize(MODEL, Image.Resampling.LANCZOS)
    source = damaged(source,role,tier)
    mask = polygon(rig['weapon'])
    weapon = source.copy()
    weapon.putalpha(ImageChops.multiply(source.getchannel('A'),mask))
    body = source.copy()
    body.putalpha(ImageChops.subtract(source.getchannel('A'),mask))
    under = Image.new('RGBA',MODEL)
    paint = ImageDraw.Draw(under)
    paint.polygon(rig['under'],fill=rig['colors'][1],outline=rig['colors'][0],width=2)
    paint.line(rig['under'][1:4],fill=rig['colors'][2],width=2)
    under.alpha_composite(body)
    for index, (angle,dx,dy) in enumerate(GESTURES[role]):
        hand = place(weapon)
        base = place(under)
        if dx or dy:
            shoulder = point(rig['shoulder'])
            cuff = point((rig['cuff'][0]+dx,rig['cuff'][1]+dy))
            limb = ImageDraw.Draw(base)
            for width,color in zip((11,7,2),rig['colors']):
                limb.line((shoulder,cuff),fill=color,width=width)
        base.alpha_composite(move(hand,point(rig['pivot']),angle=angle,shift=(dx,dy)))
        lean,sx,sy,bob=BODY[index]
        if index == 10:  # Collapse toward the floor around the hips, without cutting off the feet.
            positioned=move(base,point((51,83)),angle=-67,shift=(-8,20),scale=(.9,.83))
            bottom = positioned.getbbox()[3]
            positioned=move(positioned,(0,0),shift=(0,ORIGIN[1]+MODEL[1]-bottom))
        else:
            wear = .018*tier if index<4 else 0
            positioned=move(base,point((50,118)),lean=lean*rig['sway']+wear,scale=(sx,sy-wear),shift=(0,bob))
        yield positioned.crop(CROP)


def build():
    OUTPUT.mkdir(parents=True,exist_ok=True)
    for role in RIGS:
        sheet=Image.new('RGBA',(CELL[0]*4,CELL[1]*9))
        for tier in range(3):
            for index,frame in enumerate(frames(role,tier)):
                sheet.paste(frame,((index%4)*CELL[0],(tier*3+index//4)*CELL[1]))
        sheet.save(OUTPUT/(role+'-founder.png'),optimize=True)


if __name__ == '__main__':
    build()
