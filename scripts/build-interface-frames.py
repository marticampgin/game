"""Paint nine-slice brass frames on the native one-pixel interface grid."""
from pathlib import Path
from PIL import Image, ImageDraw

DEST = Path(__file__).resolve().parents[1] / 'public' / 'assets' / 'interface'
DEST.mkdir(exist_ok=True)
PALETTES = {
    'brass': ('#241a22', '#48353a', '#715349', '#b28c64', '#d6b58b'),
    'lit': ('#33202a', '#655041', '#a57b4c', '#deb777', '#ffdda1'),
    'amethyst': ('#302036', '#5d4260', '#8c648b', '#c49db0', '#f0c9b8'),
    'iron': ('#1c1720', '#322935', '#4d4149', '#746064', '#9a8583'),
}

def frame(name, palette):
    canvas = Image.new('RGBA', (25, 25))
    pen = ImageDraw.Draw(canvas)
    dark, base, bronze, light, glint = palette
    # Each rim drops a whole pixel at each corner. The middle remains open.
    for inset, cut, top, bottom in [(0, 3, dark, dark), (1, 2, light, base),
                                     (2, 2, bronze, dark), (3, 1, base, bronze)]:
        edge = 24 - inset
        pen.line([(inset, edge-cut), (inset, inset+cut), (inset+cut, inset), (edge-cut, inset)], fill=top)
        pen.line([(edge-cut, inset), (edge, inset+cut), (edge, edge-cut),
                  (edge-cut, edge), (inset+cut, edge), (inset, edge-cut)], fill=bottom)
    for x, y, dx, dy in [(4,4,1,1),(20,4,-1,1),(4,20,1,-1),(20,20,-1,-1)]:
        pen.line((x,y,x+dx*3,y), fill=bronze)
        pen.line((x,y,x,y+dy*3), fill=bronze)
        pen.point((x+dx,y+dy), fill=glint)
    canvas.save(DEST / (name + '.png'))

for key, colors in PALETTES.items():
    frame(key, colors)

caret = Image.new('RGBA',(9,5))
pen = ImageDraw.Draw(caret)
for row in range(5):
    pen.line((row,row,8-row,row),fill='#e4c394' if row == 0 else '#b89674')
caret.save(DEST / 'caret.png')
