"""Fill dark nozzle recesses bounded by the visible casing; preserve original RGB."""
from PIL import Image, ImageDraw

def restore_nozzles(crop, original, box, nozzles, large=False):
    def hull(points):
        points=sorted(set(points))
        def cross(o,a,b): return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
        lower=[];upper=[]
        for p in points:
            while len(lower)>=2 and cross(lower[-2],lower[-1],p)<=0: lower.pop()
            lower.append(p)
        for p in reversed(points):
            while len(upper)>=2 and cross(upper[-2],upper[-1],p)<=0: upper.pop()
            upper.append(p)
        return lower[:-1]+upper[:-1]
    alpha=crop.getchannel('A'); pixels=alpha.load()
    for nx,ny in nozzles:
        nx-=box[0];ny-=box[1]
        left,right,half=(-10,42,29) if large else (-8,20,12)
        x0=max(0,nx+left);x1=min(crop.width,nx+right);y0=max(0,ny-half);y1=min(crop.height,ny+half)
        points=[(x,y) for y in range(y0,y1) for x in range(x0,x1) if pixels[x,y]>200]
        if len(points)<3: continue
        ImageDraw.Draw(alpha).polygon(hull(points),fill=255)
    restored=original.convert('RGBA');restored.putalpha(alpha)
    return restored
