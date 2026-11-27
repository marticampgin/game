"""Paint the shared 16-cel status strips and the tiny matching battlefield seals."""
import math
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / 'public' / 'assets' / 'skins'
PHASES = 16
TAU = math.tau
# Outline, shadow, body, glint and core from the same dusk palette as the arena.
INK = {
    'burn': ('#57283b','#a23d40','#ec6945','#ffac50','#fff2a8'),
    'poison': ('#303644','#44674f','#82ab54','#c4e77b','#f2ffd7'),
    'bleed': ('#4d2238','#862c49','#bb4557','#ea7773','#ffc4a6'),
    'shock': ('#57395c','#936b4b','#e3ab55','#ffe47b','#fffac9'),
    'chill': ('#374360','#506e98','#74abca','#a7dded','#ecffff'),
    'freeze': ('#344a70','#4d7193','#7aa9c4','#a9d8e4','#e3fcff'),
    'curse': ('#4a2b53','#724778','#a268aa','#d18ccd','#f4c3e7'),
    'doom': ('#382839','#65465c','#9e617a','#d7929a','#ffe0b2'),
}

def roundpts(points):
    return [(round(x),round(y)) for x,y in points]

def line(d, points, fill, width=1):
    d.line(roundpts(points), fill=fill, width=width)

def gem(d, x, y, w, h, c):
    edge, shade, mid, light, core = c
    points = [(x,y-h),(x+w,y),(x,y+h),(x-w,y)]
    d.polygon(roundpts(points),fill=shade,outline=edge)
    d.polygon(roundpts([(x,y-h+1),(x,y+h-1),(x-w+1,y)]),fill=mid)
    line(d,[(x-w+1,y),(x,y-h+1)],light)
    d.point((round(x), round(y-h+1)), fill=core)

def burn(d,t,c):
    edge,shade,mid,light,core=c
    # Two waves of tongues shear in different directions along the near boot line.
    for n,(x,delay,height,lean) in enumerate([(11,.10,21,-5),(19,.00,33,6),(37,.06,20,4),(45,.15,30,6),(53,.02,18,-2)]):
        a=max(0,min(1,(t-delay)*1.26))
        heat=math.sin(math.pi*a)**.7
        h=height*heat
        if h<2: continue
        base=46+4*math.sin(n*2.7)-6*a
        w=3+3*heat; bend=lean*heat+2*math.sin(8*a+n)
        d.polygon(roundpts([(x-w,base-2),(x-w+1,base-.42*h),(x+bend-3,base-.68*h),(x+bend,base-h),
                            (x+bend+2,base-.52*h),(x+w-1,base-.65*h),(x+w,base-.22*h),(x+w-2,base+1),(x-1,base+3)]),fill=shade,outline=edge)
        d.polygon(roundpts([(x-w+2,base),(x-2,base-h*.47),(x+bend-1,base-h*.70),(x,base-h*.33),(x+w-1,base-h*.39),(x+2,base+1)]),fill=mid)
        line(d,[(x,base),(x+1,base-h*.22),(x+bend,base-h*.37)],light,2)
        if heat>.55: d.point((x,round(base-2)),fill=core)
    for i in range(7):
        x=10+(i*19)%42+t*(2+i%3); y=39-((t*33+i*9)%36)
        line(d,[(x,y),(x+1,y-2)],light if i%2 else mid)

def poison(d,t,c):
    edge,shade,mid,light,core=c
    # Vapor curls around the torso; independent bubbles pass in front of each curl.
    for side in [-1,1]:
        pts=[]
        for i in range(27):
            u=i/26
            a=u*5.7-1.4+t*1.6
            x=32+side*(9+u*11+math.sin(a)*5)
            y=50-u*(22+12*math.sin(math.pi*t))-8*t+math.cos(a)*3
            pts.append((x,y))
        line(d,pts,edge,5);line(d,pts,shade,3)
        line(d,pts[4:20],mid,2)
        line(d,pts[11:16],light)
    for n,(x,offset,r) in enumerate([(12,.17,4),(21,.50,3),(48,.18,5),(39,.66,3),(56,.85,2),(27,.05,2)]):
        age=(t*.83+offset)%1
        x+=math.sin(age*6+n)*3; y=51-37*age
        r=max(1,round(r*(.65+.35*math.sin(math.pi*age))))
        d.ellipse(roundpts([(x-r,y-r),(x+r,y+r)]),fill=mid,outline=edge)
        d.arc(roundpts([(x-r+1,y-r+1),(x+r-1,y+r-1)]),15,125,fill=shade,width=2)
        d.arc(roundpts([(x-r+1,y-r+1),(x+r-1,y+r-1)]),150,290,fill=light)
        line(d,[(x-1,y-r+1),(x-2,y-r+2)],core)

def bleed(d,t,c):
    edge,shade,mid,light,core=c
    # Three offset diagonal cuts contract while drops fall with gravity.
    for i in range(3):
        x=15+i*10+8*t; y=19+i*2
        u=max(0,min(1,t*4-i*.22)); tail=max(0,(t-.38)*1.55)
        head=(x+14*u,y-10*u); back=(x-3+14*tail,y+6-9*tail)
        line(d,[back,head],edge,4);line(d,[back,head],mid,2)
        if t<.55: line(d,[(head[0]-4,head[1]+2),head],core)
        age=max(0,(t-.19-i*.025)*1.24)
        if age:
            dx=x-1-i+age*2; dy=y+5+33*age**1.6
            d.polygon(roundpts([(dx,dy-5),(dx+3,dy),(dx+2,dy+3),(dx-1,dy+4),(dx-3,dy+1)]),fill=mid,outline=edge)
            d.point((round(dx-1),round(dy)),fill=light)

def shock(d,t,c):
    edge,shade,mid,light,core=c
    # Electricity forks inward. The branches travel along the outline without a screen flash.
    for i in range(3):
        side=(-1 if i%2 else 1); x=32+side*(19+i*2); y=9+i*5+15*t
        a=3*math.sin(t*15+i)
        pts=[(x,y),(x-side*8+a,y+9),(x+side*2,y+8),(x-side*6,y+16),(x-side*2,y+16),(x-side*13,y+28)]
        line(d,pts,edge,5);line(d,pts,mid,3);line(d,pts,core)
        line(d,[pts[2],(x+side*6,y+14),(x+side*5,y+20)],light,2)

def chill(d,t,c):
    edge,shade,mid,light,core=c
    for i in range(4):
        angle=t*1.9+i*TAU/4
        x=32+math.cos(angle)*20; y=31+math.sin(angle)*12-t*6
        r=4+(i%2)*2+2*math.sin(t*math.pi)
        for k in range(6):
            a=math.pi*k/3+.22*t
            co,si=math.cos(a),math.sin(a)
            tip=(x+r*co,y+r*si); join=(x+.6*r*co,y+.6*r*si)
            line(d,[(x,y),tip],shade,3);line(d,[(x,y),tip],light)
            for sign in (-1,1):
                line(d,[join,(join[0]+.35*r*math.cos(a+sign*1.05),join[1]+.35*r*math.sin(a+sign*1.05))],mid)
        d.point((round(x),round(y)),fill=core)

def freeze(d,t,c):
    edge,shade,mid,light,core=c
    # Angular crystal collar encloses the lower legs, leaving the upper body unobstructed.
    for n,(x,b,h,lean) in enumerate([(12,38,21,-7),(21,42,29,-4),(40,39,20,5),(50,39,27,7),(32,47,17,2)]):
        rise=max(.03,min(1,(t-n*.025)*4))
        y=b; tip=(x+lean, y-h*rise)
        d.polygon(roundpts([(x-5,y-2),(x-4,y-8*rise),tip,(x+6,y-6*rise),(x+4,y+2),(x,y+4)]),fill=shade,outline=edge)
        d.polygon(roundpts([(x-3,y-2),tip,(x+1,y+2)]),fill=mid)
        line(d,[tip,(x-3,y-3)],core)
        line(d,[(x+1,y-1),(x+5,y-6*rise)],light)
        if t>.58:
            line(d,[(x-2,y-9),(x+1,y-6),(x-1,y-4)],shade)

def curse(d,t,c):
    edge,shade,mid,light,core=c
    # A broken chain tightens into an X, in contrast to Doom's circular seal.
    for side in [-1,1]:
        for i in range(5):
            u=i/4
            x=32+side*(u-.5)*(40-6*t); y=15+33*u-4*math.sin(math.pi*t)
            pts=[(x-4,y-3),(x-1,y-5),(x+4,y-1),(x+4,y+3),(x+1,y+5),(x-4,y+1),(x-4,y-3)]
            if side<0: pts=[(2*x-px,py) for px,py in pts]
            line(d,pts,edge,4);line(d,pts,mid,2);line(d,pts[:3],light)
    gem(d,32,32-4*math.sin(t*math.pi),4,6,c)

def doom(d,t,c):
    edge,shade,mid,light,core=c
    r=round(24-9*t); y=30
    for i in range(4):
        a=i*90+int(t*65)
        b=(32-r,y-r,32+r,y+r)
        d.arc(b,a,a+62,fill=edge,width=4);d.arc(b,a+2,a+56,fill=mid,width=2)
        gem(d,32+r*math.cos(a*math.pi/180),y+r*math.sin(a*math.pi/180),2,3,c)
    # Falling sand in an hourglass makes the pending time limit explicit.
    w=6; h=9
    frame=[(32-w,y-h),(32+w,y-h),(32+w-1,y-h+4),(30,y+2),(32-w+1,y+h-2),
           (32+w-1,y+h-2),(34,y+1),(32-w+1,y-h+4),(32-w,y-h)]
    line(d,frame,edge,4);line(d,frame,light,2)
    line(d,[(29,y-6),(35,y-6)],shade,2)
    line(d,[(32,y),(32,y+3+t*2)],core)
    line(d,[(29,y+6),(35,y+6)],mid,2)

PAINT = [burn,poison,bleed,shock,chill,freeze,curse,doom]

# Hex masks are hand-drawn at HUD scale, so outlines stay legible at one device pixel.
SEALS = [
    ['.....1..','....21..','..1.231.','..123321','.1234331','.2344431','.123431.','..1221..'],
    ['..2222..','.234332.','23333332','23123132','23123132','.233332.','..2322..','..2.2...'],
    ['....1...','...12...','..1231..','.123321.','.234321.','.234321.','..2321..','...11...'],
    ['...1111.','..12321.','.12321..','1234431.','..1231..','..121...','.121....','.1......'],
    ['1..21..1','.213212.','..2121..','12344321','12344321','..2121..','.213212.','1..21..1'],
    ['...1....','..232..1','..232.12','1.243.23','21243232','23243321','.223321.','..1111..'],
    ['..111...','.12341..','1231321.','121.121.','.121.121','.1231321','..14321.','...111..'],
    ['.122221.','.134431.','..1231..','...21...','...21...','..1231..','.134431.','.122221.'],
]

def build():
    sheet=Image.new('RGBA',(64*PHASES,64*len(PAINT)))
    icons=Image.new('RGBA',(10,10*len(PAINT)))
    for row, (kind, palette) in enumerate(INK.items()):
        for frame in range(PHASES):
            image=Image.new('RGBA',(64,64)); t=(frame+.5)/PHASES
            PAINT[row](ImageDraw.Draw(image),t,palette)
            gain=min(1,.42+t*5,(1-t)*4)
            image.putalpha(image.getchannel('A').point(lambda px:round(px*gain)))
            sheet.paste(image,(frame*64,row*64))
        seal=ImageDraw.Draw(icons)
        for y, strip in enumerate(SEALS[row]):
            for x, px in enumerate(strip):
                if px!='.':
                    seal.point((x+1,y+1+row*10),fill=palette[{'1':0,'2':2,'3':3,'4':4}[px]])
    sheet.save(OUT/'status-effects.png',optimize=True)
    icons.save(OUT/'status-icons.png',optimize=True)

if __name__=='__main__':
    build()
