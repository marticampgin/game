"""Paint six 64px pixel cels for each public combat effect and eight projectiles."""
from math import cos, pi, sin
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / 'public' / 'assets' / 'skins'
EFFECTS = {
    'slash': ('#87491d','#ffbb50','#fff5c7'), 'cleave': ('#852943','#fd624c','#ffdb90'),
    'bastion': ('#8b5570','#f6bb58','#fffaad'), 'arcane': ('#494297','#62dcff','#e6ffff'),
    'venom': ('#35613e','#94dd42','#e9ffc3'), 'fire': ('#a4332f','#ff993a','#fff385'),
    'frost': ('#32739e','#70d9ee','#edffff'), 'doom': ('#623583','#c583ea','#ffe5f7'),
    'heal': ('#417653','#7be5ab','#edffe2'), 'guard': ('#4e709a','#86cfe3','#e9fcff'),
    'shock': ('#55539d','#9cf1ff','#fffecd'), 'loot': ('#93592c','#ffce62','#fff9b0'),
    'revival': ('#985c66','#ffc687','#fff9ca'), 'fracture': ('#4f6593','#9ce8f2','#f1ffff'),
}
PROJECTILES = ('arcane','venom','fire','frost','doom','shock')
SIZE = 64

def tip(center, angle, radius):
    return tuple(round(c + v*radius) for c,v in zip(center,(cos(angle),sin(angle))))

def effect(kind, frame, colors):
    image=Image.new('RGBA',(SIZE,SIZE))
    d=ImageDraw.Draw(image)
    dark, mid, light=colors
    cx,cy=32,32
    expansion=(.39,.65,.9,1,.91,.75)[frame]
    def p(x,y):
        return (round(cx+x*expansion),round(cy+y*expansion))
    def shape(points, fill=mid, outline=dark):
        d.polygon([p(x,y) for x,y in points],fill=fill,outline=outline)
    def stroke(points, fill=light, width=2):
        d.line([p(x,y) for x,y in points],fill=fill,width=width)
    if kind in ('slash','cleave'):
        # A tapered curved blade trail. Draw the cleave's second, lower arc separately.
        for shift in ([0,7] if kind=='cleave' else [0]):
            shape([(-27,-21+shift),(-16,-19+shift),(0,-11+shift),(17,1+shift),
                   (26,15+shift),(30,25+shift),(13,6+shift),(-5,-6+shift),(-19,-15+shift)])
            stroke([(-22,-19+shift),(-5,-12+shift),(14,1+shift),(23,11+shift)])
    elif kind=='bastion':
        shape([(-27,-15),(-9,-10),(-13,-24),(0,-12),(12,-24),(10,-10),(27,-15),
               (18,0),(27,7),(11,9),(12,23),(0,15),(-11,24),(-9,10),(-27,9),(-18,0)])
        shape([(-9,-7),(1,-14),(12,-5),(8,7),(0,13),(-8,7)],light,mid)
    elif kind=='arcane':
        for radius,color in [(22,mid),(17,dark),(10,light)]:
            d.arc([p(-radius,-radius),p(radius,radius)],frame*18,frame*18+300,fill=color,width=2)
        for k in range(8):
            a=k*pi/4+frame*.13
            d.line([tip((cx,cy),a,18*expansion),tip((cx,cy),a,24*expansion)],fill=light,width=2)
        stroke([(0,-12),(0,0),(9,5)],light,3)
    elif kind=='venom':
        # Liquid splash with hollow bubbles hanging over the pool.
        shape([(-26,12),(-18,9),(-23,-8),(-15,-4),(-11,5),(-8,-18),(-3,-13),(2,3),
               (12,-12),(16,-9),(13,5),(24,0),(20,9),(27,13),(19,17),(-15,18)])
        stroke([(-18,12),(-7,11),(1,14),(14,12)])
        for x,y,r in [(-18,-14,4),(3,-23,3),(21,-12,4)]:
            d.ellipse([p(x-r,y-r),p(x+r,y+r)],fill=mid,outline=dark);d.point(p(x-1,y-1),fill=light)
    elif kind=='fire':
        shape([(-19,16),(-23,4),(-16,-12),(-14,1),(-6,-9),(-4,-26),(4,-19),(9,-4),
               (17,-13),(15,1),(22,-2),(20,12),(13,21),(0,25),(-13,22)])
        shape([(-11,12),(-12,2),(-6,5),(0,-14),(5,-6),(7,5),(13,2),(11,14),(2,21)],light,mid)
    elif kind=='frost':
        for a in [k*pi/3+frame*.045 for k in range(6)]:
            center=(cx,cy)
            points=[center,tip(center,a-.23,14*expansion),tip(center,a,28*expansion),tip(center,a+.23,15*expansion)]
            d.polygon(points,fill=mid,outline=dark);d.line([center,points[2]],fill=light,width=1)
    elif kind=='doom':
        shape([(-16,-11),(-11,-19),(0,-22),(12,-19),(17,-10),(17,1),(10,7),
               (9,15),(4,13),(0,18),(-4,13),(-9,16),(-10,8),(-17,2)])
        for x in [-7,7]:
            shape([(x-4,-5),(x+4,-7),(x+3,0),(x-3,1)],dark,dark)
        stroke([(-2,5),(0,2),(2,5)],dark)
    elif kind=='heal':
        shape([(-5,-19),(5,-19),(5,-5),(19,-5),(19,5),(5,5),(5,19),
               (-5,19),(-5,5),(-19,5),(-19,-5),(-5,-5)])
        stroke([(-2,-15),(-2,-3),(-15,-3)]);stroke([(2,15),(2,3),(15,3)],'#abecc1')
    elif kind in ('guard','fracture'):
        shape([(-19,-14),(-7,-16),(0,-22),(8,-16),(20,-14),(18,2),(13,13),
               (0,24),(-13,13),(-18,3)],mid,dark)
        shape([(-14,-11),(0,-16),(14,-11),(12,3),(8,10),(0,18),(-9,10),(-13,2)],dark,light)
        if kind=='guard':
            stroke([(0,-13),(0,13)],light);stroke([(-7,-5),(7,-5)])
        else:
            stroke([(4,-19),(-3,-7),(3,-6),(-6,4),(0,5),(-5,17)],light,3)
    elif kind=='shock':
        shape([(7,-27),(-14,2),(-2,1),(-9,27),(21,-9),(6,-7)],light,mid)
        stroke([(-19,-12),(-22,-3),(-17,-4),(-20,3)],mid)
    elif kind=='loot':
        for x,y in [(-13,8),(0,4),(13,8),(0,-8)]:
            d.ellipse([p(x-8,y-4),p(x+8,y+4)],fill=mid,outline=dark)
            stroke([(x-4,y-1),(x+3,y-2)],light)
    elif kind=='revival':
        for sign in (-1,1):
            shape([(sign*x,y) for x,y in [(2,9),(5,-5),(23,-24),(22,-13),(17,-4),
                  (23,-8),(16,3),(9,6),(14,5),(6,13)]])
        stroke([(0,-12),(0,15)],light,3);stroke([(-5,-3),(5,-3)])
    # The silhouette settles into distinct residual particles rather than blinking out.
    if frame>=2:
        for k in range(7):
            angle=k*2*pi/7+frame*.16
            x,y=tip((cx,cy),angle,11+frame*3.4)
            d.rectangle((x-1,y-1,x+1,y+1),fill=mid if k%2 else light)
    if frame==5:
        image.putalpha(image.getchannel('A').point(lambda a:a//2))
    return image

def projectile(kind):
    image=Image.new('RGBA',(32,32)); d=ImageDraw.Draw(image)
    dark,mid,light=EFFECTS[kind]
    if kind=='venom':
        d.polygon([(12,3),(19,3),(19,6),(17,7),(18,11),(24,16),(25,23),(21,27),
                   (12,27),(7,23),(7,17),(13,10),(14,7),(12,6)],fill='#a7d5c8',outline=dark)
        d.polygon([(9,19),(15,17),(19,19),(23,17),(23,23),(19,25),(13,25),(9,22)],fill=mid,outline=dark)
        d.rectangle((12,3,19,5),fill='#bc8254',outline=dark);d.line([(11,17),(14,14)],fill=light,width=2)
    elif kind=='arcane':
        d.ellipse((8,7,26,25),fill=dark,outline=mid,width=2)
        d.ellipse((13,12,21,20),fill=light); d.arc((1,10,29,24),140,368,fill=mid,width=2)
    elif kind=='doom':
        d.polygon([(1,19),(8,13),(8,7),(14,5),(21,7),(27,14),(24,22),(18,24),(13,21),(7,24)],fill=mid,outline=dark)
        d.rectangle((15,12,17,15),fill=dark);d.rectangle((21,12,23,15),fill=dark)
    elif kind=='shock':
        d.polygon([(0,19),(13,9),(12,14),(30,10),(15,23),(17,17)],fill=light,outline=mid)
    else:
        points=[(1,10),(12,13),(10,6),(24,12),(30,16),(24,21),(8,24),(12,18),(1,20)]
        if kind=='frost':points=[(1,19),(7,14),(22,11),(31,15),(22,19),(7,21)]
        d.polygon(points,fill=mid,outline=dark);d.line([(7,17),(23,15),(27,16)],fill=light,width=2)
    return image

if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    sheet=Image.new('RGBA',(6*SIZE,len(EFFECTS)*SIZE))
    for row,(kind,colors) in enumerate(EFFECTS.items()):
        for col in range(6):
            sheet.paste(effect(kind,col,colors),(col*SIZE,row*SIZE))
    sheet.save(OUT/'arena-effects.png',optimize=True)
    sheet=Image.new('RGBA',(32*len(PROJECTILES),32))
    for col,kind in enumerate(PROJECTILES):sheet.paste(projectile(kind),(32*col,0))
    sheet.save(OUT/'arena-projectiles.png',optimize=True)
