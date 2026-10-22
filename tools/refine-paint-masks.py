"""Reviewed material masks in original atlas pixels; no albedo/map resampling."""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
ROOT=Path(__file__).resolve().parents[1]/'packages/client/public/ship-test'


def annulus(draw, center, outer, inner, spans=((0,360),)):
    cx,cy=center
    for start,end in spans:
        theta=np.linspace(np.radians(start),np.radians(end),max(8,round((end-start)*2)))
        pts=[(cx+outer*np.cos(t),cy+outer*np.sin(t)) for t in theta]
        pts += [(cx+inner*np.cos(t),cy+inner*np.sin(t)) for t in theta[::-1]]
        draw.polygon(pts,fill=255)


def refine_props():
    folder=ROOT/'props';src=Image.open(folder/'original-cutout-atlas.png').convert('RGBA');paint=Image.open(folder/'armor-mask-atlas.png').convert('RGBA')
    for rec in json.loads((folder/'manifest.json').read_text(encoding='utf-8')):
        key=rec['id'];x,y,w,h=rec['box'];col=round(x/(src.width/4));row=round(y/(src.height/4));ox=col*src.width/4;oy=row*src.height/4
        # Coordinates below are measured within each 313.5px source cell.
        mask=Image.new('L',src.size);d=ImageDraw.Draw(mask)
        def polygon(points):d.polygon([(ox+px,oy+py) for px,py in points],fill=255)
        def rectangle(box):d.rectangle((ox+box[0],oy+box[1],ox+box[2],oy+box[3]),fill=255)
        def ring(center,outer,inner,spans=((0,360),)):annulus(d,(ox+center[0],oy+center[1]),outer,inner,spans)
        if key=='fob':
            ring((162,147),92,85,((15,76),(104,165),(195,256),(284,345)))
            polygon([(131,133),(145,117),(158,117),(158,126),(145,128),(140,137)])
            polygon([(168,117),(180,120),(192,133),(186,139),(175,128),(168,126)])
            polygon([(132,158),(139,156),(146,168),(158,170),(158,178),(145,177)])
            polygon([(169,170),(180,165),(186,155),(193,160),(183,174),(169,178)])
        elif key=='fuel':
            ring((106,105),36,31,((15,165),(195,345)))
            ring((106,184),28,23,((15,165),(195,345)))
            rectangle((168,76,181,91));rectangle((168,114,181,128))
        elif key=='manpower':
            for yy in (78,119,160):rectangle((77,yy,113,yy+7))
        elif key=='research':
            ring((155,136),80,74,((30,52),(93,145),(205,246),(290,332)))
            for cx,cy,r in [(77,136,32),(201,73,32),(199,205,32)]:d.ellipse((ox+cx-r,oy+cy-r,ox+cx+r,oy+cy+r),fill=0)
        elif key in ('turret','mine','emitter'):
            centers={'turret':(154,132),'mine':(156,133),'emitter':(155,132)}
            radii={'turret':(105,96),'mine':(99,92),'emitter':(107,100)}
            outer,inner=radii[key];ring(centers[key],outer,inner,((12,78),(102,168),(192,258),(282,348)))
        elif key=='platform':
            polygon([(100,17),(185,17),(191,23),(96,23)])
            polygon([(79,35),(85,39),(48,102),(41,98)])
            polygon([(42,132),(49,128),(84,194),(78,198)])
            polygon([(98,214),(185,214),(191,220),(94,220)])
            polygon([(204,186),(210,190),(225,163),(218,160)])
        else:continue
        rgba=np.array(src.crop((x,y,x+w,y+h)));rgb=rgba[:,:,:3].astype(float);lum=rgb.mean(2)
        weight=np.array(mask.crop((x,y,x+w,y+h)).filter(ImageFilter.GaussianBlur(.45)))/255
        weight*=np.clip((lum-25)/50,0,1)*np.clip((245-lum)/45,0,1)*np.clip(1-np.ptp(rgb,axis=2)/45,0,1)
        a=np.zeros_like(rgba);a[:,:,0]=np.rint(weight*255).astype('uint8');a[:,:,3]=rgba[:,:,3];a[rgba[:,:,3]==0,0]=0
        paint.paste(Image.fromarray(a),(x,y))
    paint.save(folder/'armor-mask-atlas.png')


def protect_ship_fixtures():
    path=ROOT/'armor-mask-atlas.png';im=Image.open(path).convert('RGBA');a=np.array(im);mask=Image.fromarray(a[:,:,0]);d=ImageDraw.Draw(mask)
    # Warden medical emblem and nose cap, Railstorm's raised central cap,
    # Fortress weapon mounts: these are not paintable armor plates.
    d.rectangle((1640,677,1680,714),fill=0);d.ellipse((1684,681,1725,713),fill=0)
    d.ellipse((1048,405,1093,441),fill=0)
    for cx,cy,r in [(1604,417,20),(1647,417,23),(1698,417,25)]:d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=0)
    a[:,:,0]=np.asarray(mask);Image.fromarray(a).save(path)


if __name__=='__main__':
    refine_props();protect_ship_fixtures();print('Refined 8 station masks and protected 3 ship fixture groups.')
