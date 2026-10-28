"""Pressure-driven, atonal firing identities. Recorded impulses, no bell body.

Each tuple specifies attack material, pressure material, quiet mechanism,
attack speed, body speed, body band, crack band and articulation. Pitch within
an identity is fixed offline; live playback adds at most +/-3 cents.
"""
from functools import lru_cache
import numpy as np
from scipy import signal
from scipy.ndimage import uniform_filter1d
from identities import L

# weapon: attack, pressure, mechanical detail, attack rate, body rate,
# body high cutoff, crack high cutoff, pressure weight, paired-barrel delay.
DESIGNS={
 'weapon.patrol':('blast-auto','blast-rifle-b','shutter',1.16,.72,1900,10500,.66,.005),
 'weapon.corvette':('blast-rifle-b','blast-cracker-a','film',1.02,.64,1400,8300,.83,.007),
 'weapon.frigate':('blast-pop','blast-auto','weld-burst',1.22,.8,2300,11800,.63,0),
 'weapon.destroyer':('blast-magnum','blast-rifle-a','ratchet',.86,.46,1150,8600,1.05,.008),
 'weapon.cruiser':('blast-cracker-b','blast-rifle-b','welding',1.04,.51,1600,9900,.94,.006),
 'weapon.battlecruiser':('blast-rifle-a','blast-cracker-b','breaker',.78,.36,1050,7300,1.16,.01),
 'weapon.battleship':('blast-magnum','blast-rifle-b','tensioner',.69,.29,850,6500,1.24,.011),
 'weapon.dreadnought':('blast-rifle-b','blast-cracker-a','slide',.73,.25,1050,9600,1.35,0),
 'weapon.carrier':('blast-pop','blast-cracker-b','autofocus',1.34,.91,2500,11000,.57,0),
 'weapon.secondary':('blast-auto','blast-rifle-a','shutter',1.18,.78,1800,9200,.67,0),
 'weapon.turret':('blast-rifle-a','blast-magnum','ratchet-small',.94,.57,1300,8000,.91,0),
 'weapon.drone':('blast-pop','blast-auto','film',1.4,.95,2400,12000,.52,0),
 'weapon.ordnance':('blast-cracker-b','blast-rifle-a','slide',.81,.39,950,7000,1.1,0),
 'secondary.frigate':('blast-pop','blast-auto','shutter',1.35,.86,2100,11600,.55,0),
 'secondary.destroyer':('blast-auto','blast-cracker-a','ratchet',1.09,.68,1700,9500,.78,.004),
 'secondary.cruiser':('blast-cracker-b','blast-magnum','weld-burst',1.23,.86,2300,10900,.64,0),
 'secondary.battlecruiser':('blast-magnum','blast-rifle-a','breaker',.97,.55,1350,8800,.98,.006),
 'secondary.battleship':('blast-rifle-b','blast-auto','tensioner',1.02,.63,1500,9100,.83,0),
 'secondary.dreadnought':('blast-auto','blast-rifle-a','film',1.32,.91,2100,11500,.58,.003),
 'secondary.carrier':('blast-pop','blast-cracker-b','shutter',1.45,.98,2600,12400,.49,.003),
 'turret.mothership.standard':('blast-magnum','blast-rifle-b','ratchet',.76,.35,1000,7800,1.18,.009),
 'turret.mothership.rocket':('blast-cracker-a','blast-rifle-a','slide',.79,.32,850,6600,1.2,.007),
 'turret.mothership.laser':('blast-rifle-b','blast-cracker-b','weld-burst',.87,.44,1600,11400,1.03,0),
 'turret.fob.standard':('blast-auto','blast-magnum','breaker',1.01,.55,1400,8400,.89,0),
 'turret.fob.rocket':('blast-cracker-b','blast-rifle-b','ratchet',.91,.4,1050,7500,1.04,0),
 'turret.fob.laser':('blast-pop','blast-cracker-a','welding',1.21,.78,2200,11700,.67,0),
 'turret.node':('blast-cracker-b','blast-auto','switch',1.12,.83,1900,10300,.71,0),
 'turret.deployable':('blast-auto','blast-rifle-b','shutter',1.25,.84,2100,9400,.61,0),
 'turret.platform':('blast-rifle-a','blast-magnum','ratchet-small',.92,.48,1250,8100,1.02,0),
 'drone.orbit':('blast-pop','blast-auto','autofocus',1.42,.96,2500,12300,.5,0),
 'drone.swarm':('blast-cracker-b','blast-rifle-a','film',1.5,1.06,2900,12500,.45,0),
 'drone.guard':('blast-auto','blast-cracker-a','breaker',1.15,.73,1750,9600,.73,0),
 'drone.bomber':('blast-cracker-a','blast-rifle-b','slide',.9,.42,1100,7700,.98,0),
 'drone.interceptor':('blast-pop','blast-auto','shutter',1.54,1.04,2700,12900,.44,.003),
 'drone.fighter':('blast-auto','blast-cracker-b','ratchet-small',1.32,.88,2300,10800,.56,0),
}

def find_impulse_starts(x, rate):
    """Find complete attacks, not arbitrary slices before a loud body peak.

    Require a quiet lead-in to distinguish independent shots from reverberant
    peaks. A blast can build for much longer than 20 ms before its loudest point.
    Keep a small pre-roll so the layer's anti-click fade precedes the attack.
    """
    if not len(x) or not np.isfinite(x).all() or np.max(np.abs(x)) < 1e-8:
        raise ValueError('No usable impulse material')
    energy=uniform_filter1d(x*x,max(3,round(.001*rate)))
    peaks,_=signal.find_peaks(energy,height=energy.max()*.28,distance=round(.12*rate),prominence=energy.max()*.18)
    if not len(peaks):peaks=np.array([np.argmax(energy)])
    starts=[]
    for peak in peaks:
        lo=max(0,peak-round(.15*rate))
        quiet=energy[lo:peak+1] < energy[peak]*.01
        edges=np.diff(np.r_[False,quiet,False].astype(np.int8))
        begins=np.flatnonzero(edges==1);ends=np.flatnonzero(edges==-1)
        ends=ends[ends-begins>=round(.002*rate)]
        # No quiet boundary means a body/echo peak, not a new attack. Never
        # silently manufacture a variant by cutting into that material.
        if not len(ends):continue
        start=max(0,lo+int(ends[-1])-round(.0005*rate))
        if not starts or start>starts[-1]:starts.append(start)
    if not starts:raise ValueError('Impulse recording has no complete attack with a quiet lead-in')
    return tuple(starts)


@lru_cache(maxsize=32)
def impulse_starts(materials,key,rate):
    return find_impulse_starts(materials.read(key),rate)


def take_impulse(materials,key,length,speed,variant,rate,skip=0):
    materials.used.add(key)
    x=materials.read(key)
    starts=impulse_starts(materials,key,rate)
    start=starts[variant%len(starts)]+round(skip*rate)
    n=round(length*rate)
    positions=start+np.arange(n)*speed
    # Never tile an attack; missing tail is silence, not a second gunshot.
    return np.interp(positions,np.arange(len(x)),x,left=0,right=0)

def apply_weapon_attacks(bank):
    expected={k for k in bank if k.startswith(('weapon.','secondary.','turret.','drone.')) and k!='weapon.flyby'}
    if expected!=set(DESIGNS):raise ValueError(f'Firing identity coverage mismatch: {expected ^ set(DESIGNS)}')
    for cue, (crack,body,mechanism,crack_speed,body_speed,body_hi,crack_hi,weight,pair) in DESIGNS.items():
        r=bank[cue];d=r['duration'];heavy=weight>1
        crack_len=min(d*.43,.05 if heavy else .035)
        body_len=min(d*.79,.16 if heavy else .105)
        impulse=dict(impulse=True,attack=.00018,release=.006,speedVariation=0,gainVariation=.018,timeVariation=.00015)
        layers=[
            L(crack,0,crack_len,1.15,crack_speed,'iron',lo=180 if heavy else 380,hi=crack_hi,
              amp=[1,.67,.16,.015,0],**impulse),
            # Pressure uses the blast just after its crack. Otherwise peak
            # normalization spends all its level on a second tiny click.
            L(body,.001,body_len,weight,body_speed,'iron',lo=42 if heavy else 95,hi=body_hi,
              amp=[.36,1,.55,.08,0],impulseSkip=.0025,**impulse),
            L(mechanism,.011,min(.065,d*.42),.085,crack_speed,'raw',hit=True,lo=1300,hi=6200,
              amp=[1,.34,.04,0],attack=.001,release=.009,speedVariation=0,gainVariation=.025,timeVariation=.0005),
        ]
        if pair:
            layers.append(L(crack,pair,crack_len*.72,.22,crack_speed,'raw',lo=650,hi=crack_hi*.85,
                            amp=[1,.45,.025,0],**impulse))
        r.update(layers=layers,rms=.165,attack=.0003,release=.012,shotAttack=True,dampWeaponModes=True,
                 envelope=[(0,0),(.0004/d,1),(.025/d,.94),(.065/d,.53),(.12/d if d>.15 else .8,.09),(1,0)],
                 description=r['label']+' — atonal recorded pressure crack, compact blast body and restrained '+mechanism+' recoil; stable pitch across firing variations.')
        r.pop('bodyContour',None)
