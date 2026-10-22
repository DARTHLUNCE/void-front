"""Masked least-squares normal integration with a small drift-suppressing screen.
Normals are the exact packed shader input; heights are in source texels, not
per-sprite normalized. Alpha holes are free boundaries, never ground planes.
"""
from pathlib import Path
import argparse
import json
import numpy as np
from PIL import Image


def integrate(gradient: np.ndarray, mask: np.ndarray, screen: float = 0.001) -> tuple[np.ndarray, dict]:
    if not mask.any(): raise ValueError('Cannot integrate an empty surface')
    if not np.isfinite(gradient).all(): raise ValueError('Nonfinite normal gradient')
    h,w=mask.shape
    ex=mask[:,:-1]&mask[:,1:]; ey=mask[:-1]&mask[1:]
    gx=(gradient[:,:-1,0]+gradient[:,1:,0])*.5*ex
    gy=(gradient[:-1,:,1]+gradient[1:,:,1])*.5*ey
    rhs=np.zeros((h,w)); rhs[:,:-1]-=gx; rhs[:,1:]+=gx; rhs[:-1]-=gy; rhs[1:]+=gy
    degree=np.full((h,w),screen); degree[:,:-1]+=ex; degree[:,1:]+=ex; degree[:-1]+=ey; degree[1:]+=ey
    def apply(v):
        out=degree*v
        out[:,:-1]-=ex*v[:,1:]; out[:,1:]-=ex*v[:,:-1]
        out[:-1]-=ey*v[1:]; out[1:]-=ey*v[:-1]
        return out
    height=np.zeros((h,w)); residual=rhs.copy(); z=residual/degree; direction=z.copy(); rz=float(np.sum(residual*z))
    tolerance=max(1e-22,float(np.sum(rhs*rhs))*1e-10)
    iterations=0
    for iterations in range(2400):
        if float(np.sum(residual*residual))<=tolerance: break
        ad=apply(direction); denominator=float(np.sum(direction*ad))
        if denominator<=0: raise RuntimeError('Normal integration lost positive definiteness')
        alpha=rz/denominator; height+=alpha*direction; residual-=alpha*ad
        z=residual/degree; next_rz=float(np.sum(residual*z)); direction=z+(next_rz/max(rz,1e-30))*direction; rz=next_rz
    error=float(np.linalg.norm(apply(height)-rhs)/max(np.linalg.norm(rhs),1e-20))
    if error>0.0001: raise RuntimeError(f'Normal solve did not converge: {error}')
    dx=np.diff(height,axis=1)[ex]-gx[ex]; dy=np.diff(height,axis=0)[ey]-gy[ey]
    rmse=float(np.sqrt((np.sum(dx*dx)+np.sum(dy*dy))/max(1,ex.sum()+ey.sum())))
    height-=height[mask].min(); height[~mask]=0
    return height,dict(relativeResidual=error,iterations=iterations,gradientFitRMSE=rmse,heightSpanTexels=float(height[mask].max()))


def prepare(directory: Path) -> list[dict]:
    normal=np.array(Image.open(directory/'packed-normal-atlas.png').convert('RGBA')); result=np.zeros_like(normal); preview=np.zeros_like(normal); reports=[]
    for entry in json.loads((directory/'manifest.json').read_text(encoding='utf-8')):
        height_range=entry.get('heightRange',128)
        x,y,w,h=entry['box']; rgba=normal[y:y+h,x:x+w]; mask=rgba[:,:,3]>0
        # Match shader decode and uNormalStrength=2, including its minimum z.
        xy=rgba[:,:,:2].astype(float)/127.5-1
        nz=np.sqrt(np.maximum(.02,1-np.sum(xy*xy,axis=2)))
        gradients=-xy/nz[:,:,None]*2
        height,report=integrate(gradients,mask)
        if report['heightSpanTexels']>=height_range: raise RuntimeError(f"Height exceeds RG16 range: {entry['id']}")
        packed=np.rint(height/height_range*65535).astype(np.uint16)
        r=result[y:y+h,x:x+w]; r[:,:,0]=(packed>>8).astype('uint8'); r[:,:,1]=(packed&255).astype('uint8'); r[:,:,3]=rgba[:,:,3]
        v=preview[y:y+h,x:x+w]; v[:,:,:3]=np.rint(np.clip(height/max(report['heightSpanTexels'],1e-9),0,1)*255).astype('uint8')[:,:,None]; v[:,:,3]=rgba[:,:,3]
        report['id']=entry['id']; reports.append(report)
        print(entry['id'], 'span',round(report['heightSpanTexels'],2),'fit RMSE',round(report['gradientFitRMSE'],3),'iterations',report['iterations'],flush=True)
    Image.fromarray(result).save(directory/'normal-derived-relief-atlas.png')
    Image.fromarray(preview).save(directory/'normal-derived-height-preview.png')
    (directory/'normal-integration-report.json').write_text(json.dumps(reports,indent=2),encoding='utf-8')
    return reports

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('directories',nargs='+',type=Path)
    for directory in parser.parse_args().directories: prepare(directory)
