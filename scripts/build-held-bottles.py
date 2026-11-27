"""Paint the uncorked hand props on a common neck pivot for the drink gesture."""
from pathlib import Path
from PIL import Image, ImageColor

glass = [
    '   kkkkk   ',
    '   kyyyw   ',
    '    egg    ',
    '    egw    ',
    '    edg    ',
    '   kdgwe   ',
    '  kddggwe  ',
    ' eddggggwe ',
    'kdmmmHHHmwk',
    'kdmmHHHHHLk',
    'kdmwHHHHHLk',
    'kdwwHHHHLmk',
    'kdmwHHHLmmk',
    ' kdmLLLmms ',
    ' kdsmmmmse ',
    '  kdgwwge  ',
    '   kkkkk   ',
]

glass_ink = dict(k='#2c222b', e='#66565b', d='#908893', g='#c0c1b3', w='#fff2d0', y='#ba925e')
liquids = [
    dict(s='#6b2938', m='#a63547', H='#eb5143', L='#ff966a'),
    dict(s='#285345', m='#388259', H='#88b85a', L='#c7d585'),
    dict(s='#482f65', m='#7a4289', H='#aa68b7', L='#e5a1da'),
]
atlas = Image.new('RGBA', (33, 17))
for i, liquid in enumerate(liquids):
    ink = {**glass_ink, **liquid}
    for y, row in enumerate(glass):
        for x, color in enumerate(row):
            if color != ' ':
                atlas.putpixel((11 * i + x, y), ImageColor.getcolor(ink[color], 'RGBA'))
atlas.save(Path(__file__).resolve().parents[1] / 'public/assets/skins/held-bottles.png')
