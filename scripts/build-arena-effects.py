"""Draw combat VFX at the arena's native pixel scale. Run with Python and Pillow."""
import math
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / 'public' / 'assets' / 'skins'
# Each strip follows a physical effect from first contact to scattered residue.
PALETTES = {
    'slash': ('#875660', '#ffc491', '#fff1c6'), 'cleave': ('#8b435a', '#ed7953', '#ffda96'),
    'bastion': ('#8a6263', '#dbac69', '#fff1bc'), 'arcane': ('#626097', '#87dacf', '#e9ffe9'),
    'venom': ('#466449', '#add361', '#e7efa8'), 'fire': ('#a7474c', '#f28a48', '#ffe399'),
    'frost': ('#62668e', '#93ccd9', '#e6f4f5'), 'doom': ('#5c3c68', '#b273ab', '#eac9e3'),
    'heal': ('#52694b', '#9cd399', '#f0efd1'), 'guard': ('#697794', '#9cc5c8', '#f0e5b0'),
    'shock': ('#766d9a', '#adbce5', '#fff3bd'), 'loot': ('#896241', '#e5ae65', '#fff0b1'),
    'revival': ('#957785', '#f2c390', '#fff7d9'), 'fracture': ('#596785', '#a8c9d3', '#ffefc1'),
    'dust': ('#605063', '#ac8275', '#d4ac83'), 'bleed': ('#6a3353', '#b75763', '#e99a86'),
    'thorns': ('#55434e', '#a18265', '#d9b687'), 'eclipse': ('#50446a', '#ba85ba', '#eed4cc'),
    'ward': ('#7a6649', '#e7ba72', '#fff0be'), 'echo': ('#6f6a9b', '#aec2e4', '#eaeae1'),
    'miasma': ('#466449', '#add361', '#e7efa8'),
}
MISSILES = ['arcane', 'venom', 'fire', 'frost', 'doom', 'shock']
TAU = 2 * math.pi
CELLS = 16


def polar(x, y, radius, angle, height=1):
    return round(x + radius * math.cos(angle)), round(y + radius * height * math.sin(angle))


def star(draw, x, y, reach, color):
    if reach > 0:
        draw.line((x-reach, y, x+reach, y), fill=color)
        draw.line((x, y-reach, x, y+reach), fill=color)


def blade(draw, phase, colors, heavy):
    dark, mid, light = colors
    head = -.58 + phase * (3.2 if heavy else 2.65)
    tail = head - math.sin(math.pi * phase) * (2.4 if heavy else 1.55) - .16
    center = (33, 29)
    for radius, width, ink in [(25, 5.8, dark), (25, 4.6, mid), (26, 1.8, light)]:
        outer, inner = [], []
        for i in range(22):
            u = i / 21
            angle = tail + (head - tail) * u
            taper = max(.06, math.sin(math.pi*u)**.72)
            outer.append(polar(*center, radius, angle, .70))
            inner.append(polar(*center, radius-width*taper, angle, .70))
        draw.polygon(outer + inner[::-1], fill=ink)
    if phase > .24:
        for i in range(5):
            angle = head - i*.31
            x,y = polar(*center, 25 + phase * (5+i%2), angle, .73)
            draw.line([(x,y), polar(x,y,1 + (1-phase)*5,angle+.2)], fill=mid if i%2 else light)


def strike(draw, phase, colors, breaking):
    dark, mid, light = colors
    radius = 3 + 24*(1-(1-phase)**1.9)
    # The narrow fan travels out of the point of impact, leaving the defender visible.
    for k in range(13):
        angle = (k*2.399963 + .35)
        length = max(0, 12*(1-phase) * (.48+(k%5)*.14))
        r = radius*(.66+(k%4)*.11)
        x,y = polar(32,34,r,angle,.83)
        if breaking and k%2:
            tip = polar(x,y,4,angle)
            draw.polygon([(x-1,y+2),tip,(x+2,y-2)],fill=mid,outline=dark)
        else:
            draw.line([polar(32,34,r-length,angle,.83),(x,y)],fill=mid,width=2 if k%3 else 1)
            draw.point((x,y), fill=light)
    if phase < .26:
        star(draw,32,34,round(6*(1-phase/.26)),light)
    if .13 < phase < .86:
        for left in [-1,1]:
            x=32+left*(4+phase*18)
            draw.arc((x-3,19-phase*4,x+3,46+phase*3),84 if left<0 else 264,256 if left<0 else 444,fill=dark,width=2)
            draw.line([(x,23),(x+left,30),(x,36)],fill=light)


def dial(draw, phase, colors, kind):
    dark,mid,light=colors
    radius=round(4+22*(1-(1-phase)**1.8))
    angle=phase*230
    squash=.65 if kind in ('ward','guard') else 1
    high=round(radius*squash)
    for n in range(3):
        start=angle+120*n
        draw.arc((32-radius,32-high,32+radius,32+high),start,start+max(9,86-45*phase),fill=mid,width=2)
        draw.arc((33-radius,33-high,31+radius,31+high),start,start+36,fill=light)
    if kind in ('arcane','echo'):
        for i in range(12):
            a=i*TAU/12+.35*phase
            draw.line([polar(32,32,radius-3,a),polar(32,32,radius,a)],fill=light if i%3==0 else dark)
        if phase<.60:
            for hand, size in [(angle*.014, .66),(-angle*.027,.4)]:
                draw.line([(32,32),polar(32,32,radius*size,hand)],fill=light,width=2)
    elif kind in ('doom','eclipse'):
        r=max(0,round(8*math.sin(phase*math.pi)))
        draw.ellipse((32-r,32-r,32+r,32+r),fill=dark)
        draw.arc((32-r,32-r,32+r,32+r),10,168,fill=light,width=2)
    else:
        for i in range(4):
            a=i*math.pi/2-angle/160
            x,y=polar(32,32,radius,a,squash)
            star(draw,x,y,round(2*(1-phase)),light)


def plume(draw, phase, colors, kind):
    dark,mid,light=colors
    for i in range(11):
        t = min(1, max(0, (phase - (i%3)*.045)*1.14))
        side = (-1 if i%2 else 1)
        x=32 + side*(3 + (i%5)*5)*t
        if kind=='miasma':
            y=42 - math.sin(t*math.pi)*((i%4)*5+9) + t*4
            r=max(1,round((1-t)*3))
            draw.ellipse((x-r,y-r,x+r,y+r),fill=mid,outline=dark)
            draw.point((round(x),round(y-r)),fill=light)
        elif kind=='fire':
            y = 45 - t*(18 + i%4*6)
            w = max(1,round((3+i%3)*(1-t)))
            draw.polygon([(x-w,y),(x-w/2,y-w*1.9),(x+side*w,y-w*3.6),(x+w,y-w),(x+w/2,y+w)],fill=mid,outline=dark)
            if t<.55: draw.line((x,y,x+side,y-w*2),fill=light,width=2)
        elif kind=='dust':
            y=46-math.sin(t*math.pi)*5-t*(i%3)*2
            w=max(1,round(3*(1-t)))
            draw.line((x-w,y,x+w,y),fill=mid if i%3 else dark,width=w)
        elif kind in ('heal','revival'):
            y=51-t*(19 + (i%5)*5)
            x+=math.sin(t*5+i)*3
            if kind=='heal':
                draw.polygon([(x-2,y),(x+2,y-4),(x+2,y-1),(x,y+1)],fill=mid)
            else:
                draw.line((x-2,y+2,x+side*3,y-5),fill=mid,width=2)
            if i%3==0: star(draw,round(x),round(y),max(1,round(2*(1-t))),light)
        elif kind=='loot':
            y=47-math.sin(t*math.pi)*(11 + i%4*4)
            w=max(1,round(3*abs(math.cos(t*9+i))))
            draw.ellipse((x-w,y-3,x+w,y+3),outline=dark,fill=mid)
            draw.point((round(x),round(y-2)), fill=light)
        else:
            y=32+math.sin(t*math.pi)*-9+t*(9+i%4)
            draw.line((x,y,x+side*2,y-3),fill=mid,width=2)


def shattered_flask(draw, phase, colors):
    dark,mid,light=colors
    # The belly of the bottle breaks sideways at the chest. A raised sheet of
    # liquid opens into droplets and three bright glass shards fall across it.
    spread=min(1,phase/.30)
    if phase < .53:
        profile=[(-24,-10),(-17,-5),(-21,-18),(-13,-14),(-8,-6),(-6,-19),(-1,-12),
                 (3,-2),(9,-14),(12,-12),(12,-4),(25,-15),(22,-5),(17,4),(26,2),
                 (21,11),(13,16),(0,13),(-9,16),(-20,11),(-16,6),(-25,4)]
        scale=.24+.75*math.sin(spread*math.pi/2)
        base=27+phase*15
        pts=[(round(32+x*scale),round(base+y*scale)) for x,y in profile]
        draw.polygon(pts,fill=(105,151,65,168),outline=dark)
        # Thin films of liquid let the target steel and cloth show through.
        # Gaps between the lobes break up the mass before it flies apart.
        def facet(points, ink):
            path=[(round(32+x*scale),round(base+y*scale)) for x,y in points]
            draw.polygon(path,fill=ink)
        facet([(-19,-11),(-12,-6),(-5,9),(-12,6)],(188,213,109,202))
        facet([(-12,11),(-7,5),(-3,9),(2,4),(8,6),(14,2),(11,11),(5,13),(-3,11)],(71,118,61,173))
        facet([(4,-1),(10,-11),(9,-3),(5,6)],(217,228,132,205))
        facet([(12,2),(21,-7),(18,-1),(13,6)],(204,224,123,211))
        if phase>.14:
            facet([(-15,0),(-11,1),(-8,7),(-12,5)],(0,0,0,0))
            facet([(7,2),(11,-2),(9,5),(6,8)],(0,0,0,0))
        rim=[(round(32+x*scale),round(base+y*scale)) for x,y in profile[:15]]
        draw.line(rim,fill=light,width=1)
        if phase<.22: star(draw,32,round(base),round(5*(1-phase/.22)),light)
    for i in range(13):
        side=1 if i%2 else -1
        x=32+side*(12+(i*7)%19)*phase
        t=phase*1.06
        y=28+38*t*t-(15+(i*11)%40)*t
        size=max(1,round((3.4-(i%3)*.55)*(1-.58*phase)))
        if i in (2,7,9):
            draw.polygon([(x-2,y-2),(x+side*4,y-4+7*t),(x,y+3)],fill='#e3c68e',outline='#827f79')
            draw.point((round(x),round(y-1)),fill='#fff1c6')
        else:
            draw.ellipse((x-size,y-size*1.25,x+size,y+size),fill=mid,outline=dark)
            draw.point((round(x),round(y-size)),fill=light)


def splinters(draw,phase,colors,kind):
    dark,mid,light=colors
    for i in range(8):
        a=i*TAU/8 + .3
        base=2+20*phase
        length=(1-phase)*13+2
        root=polar(32,33,base,a)
        left=polar(*root,2.7,a-1.55)
        right=polar(*root,2.7,a+1.55)
        end=polar(*root,length,a)
        if kind=='shock':
            elbow=polar(*root,length*.65,a-.6)
            draw.line([root,elbow,polar(*elbow,3,a+1.9),end],fill=mid,width=2)
            draw.point(end,fill=light)
        else:
            draw.polygon([root,left,end,right],fill=mid,outline=dark)
            draw.line([root,end],fill=light,width=1)


def impact(kind, frame, colors):
    image=Image.new('RGBA',(64,64))
    draw=ImageDraw.Draw(image)
    phase=(frame+.35)/CELLS
    if kind in ('slash','cleave'): blade(draw,phase,colors,kind=='cleave')
    elif kind=='venom': shattered_flask(draw,phase,colors)
    elif kind in ('bastion','fracture'): strike(draw,phase,colors,kind=='fracture')
    elif kind in ('arcane','guard','ward','doom','eclipse','echo'): dial(draw,phase,colors,kind)
    elif kind in ('shock','frost','thorns'): splinters(draw,phase,colors,kind)
    else: plume(draw,phase,colors,kind)
    if phase>.70:
        opacity=(1-phase)/.30
        image.putalpha(image.getchannel('A').point(lambda a: round(a*opacity)))
    return image


def projectile(kind, f):
    image=Image.new('RGBA',(32,32))
    d=ImageDraw.Draw(image)
    dark,mid,light=PALETTES[kind]
    phase=TAU*f/8
    if kind in ('venom','shock'):
        d.polygon([(13,3),(18,3),(18,8),(22,13),(25,16),(24,24),(20,27),(12,27),(7,23),(7,17),(14,8)], fill='#bfd1b6',outline='#483d50')
        surface=round(math.sin(phase)*2)
        d.polygon([(9,17+surface),(15,18),(23,17-surface),(22,23),(18,25),(13,25),(9,22)],fill=mid,outline=dark)
        d.rectangle((12,3,19,6),fill='#bc8254',outline='#573b41')
        d.line((10,15,13,11),fill='#f9e8d3',width=2)
    elif kind=='arcane':
        d.ellipse((12,7,27,24),outline=dark,width=3)
        d.arc((12,7,27,24),f*45,f*45+158,fill=mid,width=2)
        d.line([(1,20),(9,17),(6,14),(19,14)],fill=mid,width=2)
        star(d,20,15,3,light)
    elif kind=='fire':
        for x in (3,8,13):
            y=15+round(math.sin(phase+x*.6)*3)
            d.polygon([(x-2,y-3),(x+5,y-1),(x+1,y-6),(x+12,12),(x+12,21),(x+3,y+4)],fill=dark)
        d.ellipse((14,9,28,23),fill=mid,outline=dark)
        d.polygon([(11,16),(18,15),(17,11),(25,14),(26,18),(20,19)],fill=light)
    else:
        if kind=='frost':
            d.polygon([(1,18),(13,14),(21,11),(30,15),(21,19),(12,20)],fill=mid,outline=dark)
            d.line((10,17,26,15),fill=light)
        else:
            d.arc((7,6,27,25),f*45,f*45+280,fill=mid,width=2)
            star(d,18,15,4,light)
    return image


if __name__ == '__main__':
    sheet=Image.new('RGBA',(64*CELLS,64*len(PALETTES)))
    for row,(kind,colors) in enumerate(PALETTES.items()):
        for col in range(CELLS): sheet.paste(impact(kind,col,colors),(col*64,row*64))
    sheet.save(OUT/'arena-effects.png',optimize=True)
    sheet=Image.new('RGBA',(32*len(MISSILES),32*8))
    for col,kind in enumerate(MISSILES):
        for f in range(8): sheet.paste(projectile(kind,f),(col*32,f*32))
    sheet.save(OUT/'arena-projectiles.png',optimize=True)
