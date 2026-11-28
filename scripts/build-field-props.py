"""Paint stage-scale field equipment and the hinged coffer, lit from upper left."""
from math import cos, radians, sin
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / 'public/assets/skins'
INK = '#302331'
DEEP = '#473038'
LEATHER = '#805548'
HIDE = '#a97b62'
BRASS = '#ac8658'
EDGE = '#d0ae77'
IRON = '#5e5963'
STEEL = '#91868a'

def coffer(angle):
    im = Image.new('RGBA', (52, 40))
    d = ImageDraw.Draw(im)
    d.ellipse((4, 26, 49, 37), fill=(35, 24, 39, 86))
    d.ellipse((8, 27, 47, 35), fill=(35, 24, 39, 106))
    # Front board and its unlit right end. Both sets of bands follow the grain.
    d.polygon([(7,21),(35,24),(47,17),(47,28),(35,35),(7,32)], fill=INK)
    d.polygon([(8,22),(35,25),(35,33),(8,30)], fill=LEATHER)
    d.polygon([(36,25),(46,19),(46,27),(36,33)], fill='#59414a')
    for a,b,c in [(9,24,'#956753'),(11,27,'#65464a'),(19,30,'#9f7056')]:
        d.line([(a,b),(a+8,b+1)],fill=c)
    # Split planks and short, broken grain highlights keep the close-up readable.
    d.line([(8,26),(17,27),(24,27),(34,29)],fill='#69464a')
    d.line([(8,27),(17,28),(23,28)],fill='#91664f')
    for x,y in [(14,25),(24,25),(9,29),(17,30),(27,31),(32,28)]:
        d.line([(x,y),(x+2,y)],fill='#ae8060')
    d.line([(37,28),(45,24)],fill='#70545a')
    d.line([(38,30),(45,26)],fill='#493740')
    d.line([(8,30),(35,33),(46,27)],fill='#745757')
    d.line([(8,31),(35,34),(46,28)],fill=DEEP)
    for x,y in [(10,23),(29,25)]:
        d.polygon([(x,y),(x+3,y),(x+3,y+8),(x,y+8)], fill=IRON)
        d.line([(x,y),(x,y+7)],fill=STEEL)
        d.point((x+1,y+6),fill=EDGE)
        d.point((x+2,y+3),fill='#4b414a')
    for x,y in [(7,21),(33,24),(45,18)]:
        d.line([(x,y),(x+2,y),(x+2,y+2)],fill='#b19e8e')
        d.point((x,y+3),fill=IRON)
    d.line([(41,22),(41,26),(43,25),(43,21)],fill=INK)
    d.line([(41,23),(42,23)],fill=BRASS)
    # Hinges run along the far side of the opening. The near edge lifts
    # through five elevations and reveals the lid's timber lining.
    d.polygon([(7,21),(19,14),(47,17),(35,24)], fill=HIDE)
    d.polygon([(10,21),(20,16),(43,18),(34,22)], fill='#302730')
    d.line([(12,21),(20,17),(40,19)],fill=DEEP)
    dx = round(-12*cos(radians(angle)))
    dy = round(7*cos(radians(angle))-13*sin(radians(angle)))
    def plane(u, v):
        return (round(19 + 28*u + dx*v), round(14 + 3*u + dy*v))
    lid = [plane(0,0),plane(1,0),plane(1,1),plane(0,1)]
    d.polygon(lid, fill=LEATHER if angle < 28 else '#795948', outline=INK)
    if angle < 28:
        for u in [.12,.78]:
            d.polygon([plane(u,0),plane(u+.11,0),plane(u+.11,1),plane(u,1)], fill=IRON)
            d.line([plane(u,.18),plane(u,.9)],fill=STEEL)
    else:
        for v in [.22,.57]:
            d.line([plane(.02,v),plane(.98,v)],fill='#5f4244')
            d.line([plane(.19,v+.10),plane(.62,v+.10)],fill='#956950')
        d.line([plane(.02,.12),plane(.02,.94),plane(.96,.94)],fill='#b08465')
        d.line([plane(.09,.83),plane(.38,.83)],fill='#9d7054')
        d.line([plane(.50,.43),plane(.72,.46),plane(.79,.44)],fill='#a1765c')
        for u in [.13,.82]:
            d.line([plane(u,.05),plane(u,.90)],fill='#4d414a',width=2)
            d.line([plane(u,.13),plane(u,.87)],fill=STEEL)
            d.point(plane(u,.83),fill=EDGE)
    d.line([plane(0,1),plane(1,1)],fill=HIDE if angle < 45 else EDGE)
    d.line([plane(.04,1),plane(.22,1)],fill=EDGE)
    d.line([plane(0,.85),plane(0,.19)],fill=BRASS)
    # A fixed latch catches a little light as the lid clears it.
    d.rectangle((19,23,23,26),fill=DEEP)
    d.line((20,23,22,23),fill=EDGE); d.point((21,25),fill=BRASS)
    d.point((22,26),fill='#85654e')
    return im

atlas = Image.new('RGBA',(52*6,40))
for i,a in enumerate([0,12,32,57,78,99]):
    atlas.paste(coffer(a),(52*i,0))
atlas.save(OUT/'field-coffer.png')

def prop(name,size,paint):
    img = Image.new('RGBA',size)
    paint(ImageDraw.Draw(img))
    img.save(OUT/(name+'.png'))

def parcel(d):
    # Waxed olive canvas with a loop of cord. A reveal can represent any draw.
    d.polygon([(1,5),(6,2),(12,3),(14,5),(13,10),(8,12),(2,10),(0,8)],fill=INK)
    d.polygon([(1,5),(6,3),(12,4),(8,7)],fill='#99906d')
    d.polygon([(2,6),(8,8),(8,11),(2,9)],fill='#766e57')
    d.polygon([(9,7),(13,5),(12,9),(9,11)],fill='#57584d')
    d.line([(4,4),(10,6),(10,10)],fill='#c3a780')
    d.line([(10,4),(5,6),(5,9)],fill='#b99770')
    d.line([(6,6),(7,4),(9,5),(7,6)],fill='#e4c391')
    d.point((5,4),fill='#b0a183')

def lantern(d):
    d.arc((6,0,13,10),180,360,fill=EDGE,width=2)
    d.line((6,4,6,8),fill=IRON); d.line((13,4,13,8),fill=INK)
    d.polygon([(3,10),(7,7),(12,7),(16,10),(15,13),(14,21),(10,24),(5,22),(4,13)],fill=INK)
    d.polygon([(4,10),(7,8),(12,8),(15,10),(10,11)],fill=BRASS)
    d.line((6,9,10,8),fill=EDGE)
    d.polygon([(5,12),(9,13),(10,20),(6,19)],fill='#c7834a')
    d.polygon([(10,13),(14,12),(13,19),(10,20)],fill='#925b43')
    d.polygon([(7,17),(8,15),(9,16),(10,14),(10,19),(7,18)],fill='#f1bc70')
    d.line([(5,20),(10,22),(14,20)],fill=BRASS)
    d.point((9,17),fill='#ffe4a1')

def bell(d):
    d.polygon([(9,0),(12,0),(13,2),(11,3),(11,7),(13,8),(13,10),(7,10),(7,8),(9,7)],fill=INK)
    d.line((10,2,10,7),fill=BRASS)
    d.polygon([(6,9),(12,9),(15,12),(16,17),(19,20),(18,22),(13,23),(4,22),(1,21),(1,19),(4,16),(4,12)], fill=INK)
    d.polygon([(6,11),(10,10),(13,11),(14,16),(16,19),(11,20),(3,19),(6,16)], fill=BRASS)
    d.polygon([(11,11),(13,12),(14,17),(16,19),(12,20),(11,17)],fill='#79604f')
    d.line([(7,11),(6,15),(5,17)],fill='#d9bb87')
    d.line([(3,20),(9,21),(16,20)],fill=EDGE)
    d.line((10,22,10,24),fill=INK); d.point((11,23),fill=BRASS)

def watch(d):
    d.ellipse((6,0,12,6),outline=BRASS,width=2)
    d.line([(14,5),(15,2),(18,1)],fill=HIDE)
    d.ellipse((1,5,17,22),fill=INK)
    d.ellipse((2,6,16,20),fill=BRASS)
    d.ellipse((4,8,14,18),fill='#51424d')
    d.line([(5,11),(6,9),(11,9)],fill='#817284')
    d.line([(8,10),(9,14),(12,12)],fill=EDGE);d.point((9,14),fill='#e1d9ba')
    d.line([(3,17),(5,19),(9,20)],fill=EDGE)

def buckler(d):
    d.polygon([(1,6),(10,3),(15,0),(24,4),(23,14),(19,22),(12,27),(6,22),(2,15)],fill=INK)
    d.polygon([(3,7),(11,5),(15,2),(22,5),(21,13),(17,21),(12,24),(8,20),(4,14)],fill=IRON)
    d.line([(3,7),(11,5),(15,2),(21,5)],fill='#c2b3a0')
    d.polygon([(6,9),(13,6),(16,5),(20,7),(18,15),(13,21),(9,17)],fill='#63515a')
    d.line([(14,5),(12,21)],fill=BRASS)
    d.ellipse((10,9,16,15),fill=INK)
    d.ellipse((10,9,15,14),fill=STEEL)
    d.point((12,10),fill='#d4c6b4')
    d.line([(4,13),(7,19),(11,23)],fill=STEEL)

prop('field-parcel',(15,13),parcel)
prop('held-lantern',(20,25),lantern)
prop('held-bell',(20,25),bell)
prop('held-clock',(19,23),watch)
prop('held-shield',(25,28),buckler)
