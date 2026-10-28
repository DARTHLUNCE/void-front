"""World batteries, autonomous craft and signature contact sounds."""
from copy import deepcopy
from identities import L

GUNS={
 'turret.mothership.standard':('Titan twin battery',.95,[L('steel-double',0,.4,.9,.22,'iron'),L('thunder',.012,.8,.6,.5,'pressure'),L('tensioner',.13,.55,.45,.32,'grain>iron')]),
 'turret.mothership.rocket':('Titan rocket rack',1.2,[L('slam',0,.28,.6,.25,'iron'),L('starter',.06,.8,.9,[.22,.55,.28],'plasma>coil'),L('welding',.15,.85,.6,.33,'pressure>magnetic')]),
 'turret.mothership.laser':('Titan charged lance',.58,[L('spring',0,.34,.9,[.2,.45,.18],'magnetic>shear'),L('weld-burst',.027,.3,.65,.4,'coil>fracture'),L('steel',.04,.4,.4,.3,'iron')]),
 'turret.fob.standard':('Station defence gun',.7,[L('anvil',0,.22,.9,.45,'iron>fracture'),L('ratchet-small',.04,.3,.6,.5,'iron'),L('pan',.08,.5,.45,.32,'pressure')]),
 'turret.fob.rocket':('Station rocket tube',.85,[L('breaker',0,.15,.6,.6,'iron'),L('compressor',.035,.65,1,[.45,.22],'plasma'),L('spring-handle',.07,.6,.5,.35,'coil>shear')]),
 'turret.fob.laser':('Station rapid laser',.38,[L('neon',0,.24,.85,[1,.4],'coil>magnetic'),L('mirror',.018,.23,.5,.9,'glass>fracture'),L('shutter',.04,.1,.45,.65,'iron')]),
 'turret.node':('Node perimeter bolt',.43,[L('switch',0,.09,.6,.6,'ceramic'),L('weld-burst',.01,.29,.8,.7,'coil'),L('tensioner',.06,.3,.5,.85,'grain')]),
 'turret.deployable':('Deployable sentry',.32,[L('shutter',0,.1,.7,.8,'iron'),L('ratchet',.02,.23,.65,.85,'grain>fracture')]),
 'turret.platform':('Defence platform cannon',.56,[L('steel',0,.26,.85,.48,'iron'),L('starter',.025,.36,.6,.6,'plasma'),L('chain',.13,.3,.35,.7,'grain')]),
 'drone.orbit':('Escort drone emitter',.28,[L('autofocus',0,.18,.8,[1.3,.6],'servo>coil'),L('glass-knock',.02,.18,.35,1.3,'ceramic')]),
 'drone.swarm':('Swarm induction bite',.25,[L('film',0,.15,.8,1.45,'grain>magnetic'),L('spring',.03,.16,.5,1.2,'coil')]),
 'drone.guard':('Defender coil shot',.45,[L('pan',0,.2,.6,.75,'iron'),L('transformer',.015,.3,.85,[.8,.3],'coil>plasma')]),
 'drone.bomber':('Bomber torpedo ejection',.9,[L('slam',0,.3,.75,.5,'iron'),L('compressor',.035,.65,.85,[.65,.3],'pressure>plasma'),L('servo',.07,.53,.5,[.4,.8],'coil')]),
 'drone.interceptor':('Interceptor microflak',.21,[L('shutter',0,.08,.85,1.2,'iron'),L('mirror',.015,.14,.7,1.1,'fracture')]),
 'drone.fighter':('Fighter rapid pulse',.35,[L('breaker',0,.11,.65,1,'iron'),L('neon',.012,.22,.7,[.85,1.3,.6],'magnetic'),L('reel',.06,.18,.45,1.3,'grain')]),
}

CONTACTS=['patrol.phaseDash','patrol.blinkStrike','patrol.kineticRam','corvette.ambush','corvette.wraithAmbush','corvette.specterAmbush','frigate.repairPulse','frigate.fortressPulse','frigate.wardenTether','destroyer.heavyTorpedo','destroyer.torpedoSpread','destroyer.flakCurtain','cruiser.shieldBattery','cruiser.vlsPod','cruiser.aegisPulse','battlecruiser.ramBurn','battlecruiser.microJump','battlecruiser.ironcladRam','battleship.bulwark','battleship.aegisMirror','battleship.thermalOverdrive','dreadnought.railBeam','dreadnought.railstorm','dreadnought.eventHorizon','carrier.scramble','carrier.hiveSwarm','carrier.empPulse']

def add_extra(bank):
    for id,(name,duration,layers) in GUNS.items():
        bank[id]=dict(label=name,group='World weapons',description=name+' — '+', '.join(dict.fromkeys(l[0] for l in layers)),duration=duration,layers=layers,bus='world',gain=.42,priority=43,range=7000 if id.startswith('turret.mothership') else 5000,variants=6,rms=.14)
    # Contacts preserve each signature's material family but have their own
    # short, immediate attack and decaying fragments, never repeat the cast-up.
    for id in CONTACTS:
        cast=bank['ability.'+id]
        layers=[]
        for i,source in enumerate(cast['layers'][:3]):
            layer=deepcopy(source)
            layer[1]=i*.023
            layer[2]=min(.8,max(.2,source[2]*.55))
            layer[5]+='>fracture' if id.startswith(('patrol.','destroyer.','battlecruiser.','dreadnought.')) else '>glass'
            layer[6].update(amp=[1,.65,.16,0],attack=.002,release=.04,reverse=False)
            layer[6].pop('print',None)
            layers.append(layer)
        bank['contact.'+id]=dict(label=cast['label']+' contact',group='Ability contacts',description='Contact fragments of '+cast['description'],duration=.95,layers=layers,bus='world',gain=.48,priority=58,range=7500,variants=5,rms=.13)
