"""Distinct supporting mechanisms, hull branches, feedback and fleet commands."""
from identities import L

EVENTS={
 'weapon.secondary':('Secondary battery',.34,[L('shutter',0,.14,.8,.5,'iron'),L('steel',.02,.28,.6,.6,'fracture')]),
 'weapon.turret':('Structure turret',.75,[L('slam',0,.3,.9,.4,'iron'),L('transformer',.02,.48,.75,[.6,.2],'magnetic>plasma'),L('ratchet',.21,.4,.3,.5,'grain')]),
 'weapon.drone':('Drone gun',.29,[L('spring-handle',0,.18,.8,[1.8,.7],'coil>ceramic'),L('shutter',.012,.1,.5,1,'iron')]),
 'weapon.ordnance':('Ordnance tube',.95,[L('slide',0,.23,.6,.5,'iron'),L('starter',.03,.64,.9,[.35,.7,.2],'plasma'),L('slam',.045,.26,.65,.45,'iron')]),
 'weapon.flyby':('Projectile flyby',.5,[L('spring',0,.42,.7,[1.1,.85,.3],'shear>coil',amp=[0,.4,1,.4,0]),L('dryice',.06,.38,.32,[.6,.23],'vacuum',amp=[0,.5,1,0])]),
 'impact.shield':('Shield contact',.6,[L('glass-knock',0,.21,.7,.5,'glass',hit=True),L('spring',.008,.4,.95,[.9,.3,.6],'coil>magnetic'),L('neon',.04,.32,.35,[1.2,.5],'radio')]),
 'impact.armor':('Armor penetration',.69,[L('steel|steel-double',0,.28,1,.43,'iron>fracture',hit=True),L('chain',.025,.48,.55,.55,'grain>iron'),L('pan',.07,.43,.5,.36,'pressure')]),
 'impact.ricochet':('Armor glance',.73,[L('anvil',0,.2,.6,.7,'ceramic',hit=True),L('spring-handle',.015,.62,1,[1.3,.5,.3],'shear>glass'),L('steel',.09,.4,.25,.9,'fracture')]),
 'impact.shieldBreak':('Shield collapse',.7,[L('mirror',0,.32,.9,.5,'glass>fracture'),L('transformer',.01,.6,.9,[.75,.3,.12],'magnetic>radio',amp=[1,.45,.18,.1,0]),L('weld-burst',.08,.19,.6,.8,'fracture'),L('weld-burst',.23,.18,.4,.5,'fracture'),L('breaker',.4,.17,.5,.45,'iron')]),
 'impact.explosion':('Warhead detonation',2.15,[L('slam',0,.24,.7,.25,'iron'),L('thunder',.009,1.9,1,.62,'pressure',amp=[1,.7,.35,.1,0]),L('steel-double',.02,.9,.65,.3,'fracture>iron'),L('mirror',.17,.9,.3,.6,'grain'),L('pan',.25,1.3,.4,.23,'iron')]),
 'impact.death':('Ship breakup',3.0,[L('steel-double',0,.65,1,.21,'iron'),L('thunder',.018,2.6,.9,.42,'pressure'),L('dryice',.09,1.6,.68,[.3,.13,.2],'shear>plasma'),L('pan',.28,1.35,.6,.28,'fracture'),L('chain',.65,1.65,.45,.37,'grain')]),
 'impact.structure':('Capital structure collapse',4.3,[L('slam',0,.5,.95,.18,'iron'),L('steel-double',.08,1.5,.9,.13,'iron>magnetic'),L('thunder',.1,3.85,1,.28,'pressure'),L('dryice',.42,2.8,.7,[.2,.12,.24],'shear>plasma'),L('chain',.7,2.5,.45,.23,'grain>iron'),L('pan',1.8,1.7,.5,.18,'fracture')]),
 'impact.strike':('Orbital impact',3.7,[L('spring',0,.35,.8,[1.5,.2],'shear'),L('steel',.08,.9,1,.15,'magnetic>iron'),L('thunder',.09,3.3,1,.3,'pressure'),L('welding',.17,1.7,.65,[.3,.12],'plasma'),L('glass',.42,1.2,.4,.25,'grain>fracture')]),
 'status.shieldRestored':('Shield restored',1.1,[L('spring',0,.7,.65,[.3,.5,.4],'glass>coil',amp=[0,.7,1,.3,0]),L('switch',.19,.15,.4,.65,'ceramic'),L('glass-knock',.25,.5,.45,.6,'glass')]),
 'status.healed':('Repair received',1.2,[L('bubbles',0,.9,.7,[.5,.8,.65],'glass>magnetic',amp=[0,1,.5,0]),L('water',.05,.4,.4,.5,'warm'),L('shutter',.24,.12,.3,.75,'ceramic')]),
 'status.critical':('Critical hull',.8,[L('neon',0,.19,.7,.3,'radio>plasma'),L('neon',.28,.22,.65,.27,'radio>plasma'),L('breaker',.56,.18,.4,.4,'iron')]),
 'status.overheat':('Weapon overheated',1.1,[L('compressor',0,.65,.8,[.6,.25],'plasma>pressure'),L('weld-burst',.04,.35,.5,.6,'fracture'),L('breaker',.53,.22,.5,.48,'iron')]),
 'status.ready':('Ability ready',.41,[L('autofocus',0,.22,.6,[.7,1.5,.9],'servo>ceramic'),L('shutter',.13,.13,.6,.9,'ceramic')]),
 'status.upgradeReady':('Upgrade available',.65,[L('film',0,.27,.6,[.7,1.3],'radio'),L('switch',.12,.12,.55,.7,'ceramic'),L('switch',.29,.15,.5,.9,'ceramic')]),
 'status.upgrade':('Upgrade installed',.95,[L('ratchet-small',0,.4,.8,[.65,1.1,.7],'iron'),L('servo',.18,.47,.65,[.45,.95,.6],'coil'),L('slam',.48,.32,.5,.7,'iron')]),
 'status.kill':('Kill confirmation',.42,[L('breaker',0,.12,.5,.75,'iron'),L('steel',.05,.3,.6,.8,'ceramic>radio')]),
 'status.damage':('Cockpit impact',.44,[L('pan',0,.35,.7,.24,'pressure'),L('shutter',.015,.12,.4,.3,'iron')]),
 'status.jam':('Systems jammed',.9,[L('printer',0,.65,.75,[.9,.2,.6],'radio>grain'),L('neon',.17,.6,.55,[.6,.3],'coil>radio')]),
 'status.pickup':('Shard collection',.25,[L('glass-knock',0,.16,.55,1.3,'ceramic'),L('bubbles',.03,.17,.25,1.5,'glass')]),
 'movement.charge':('Drive priming',.7,[L('switch',0,.12,.55,.5,'iron'),L('drill',.035,.64,.85,[.2,.27,.44,.75],'coil>plasma',amp=[.2,.45,.8,1,.35]),L('starter',.07,.6,.55,[.25,.4,.6],'pressure')]),
 'movement.engage':('Sublight ignition',1.15,[L('steel',0,.3,.8,.3,'iron'),L('dryice',.01,.7,.85,[.25,.7,.3],'vacuum>plasma'),L('drill-load',.08,.95,.9,[.3,.85,.55],'coil>pressure')]),
 'movement.disengage':('Sublight bleed-off',1.2,[L('compressor',0,.8,.8,[.6,.4,.15],'plasma>pressure'),L('spring',.05,.65,.6,[.7,.23],'shear'),L('ratchet',.47,.5,.4,.6,'iron')]),
 'movement.abort':('Drive charge aborted',.58,[L('drill',0,.35,.7,[.6,.16],'coil'),L('breaker',.17,.22,.65,.5,'iron')]),
 'movement.brake':('Retro brake',.6,[L('water',0,.4,.7,.3,'vacuum>pressure'),L('servo',.025,.48,.8,[.8,.33,.5],'plasma>coil'),L('switch',.04,.1,.35,.45,'iron')]),
 'movement.reverse':('Reverse gear shunt',.6,[L('ratchet',0,.27,.65,.5,'iron'),L('servo',.06,.36,.65,[.6,.3],'servo'),L('slam',.21,.24,.6,.65,'iron')]),
 'movement.power':('Reactor shunt',.7,[L('breaker',0,.2,.65,.5,'iron'),L('transformer',.035,.55,.75,[.4,.65,.48],'magnetic>coil')]),
 'movement.launch':('Hull deployment',1.8,[L('slide',0,.45,.65,.4,'iron'),L('ratchet',.17,.57,.65,.48,'grain'),L('servo',.29,1.2,.8,[.3,.8,.5],'coil>plasma'),L('slam',.41,.4,.6,.35,'iron')]),
 'world.capture':('Node secured',1.2,[L('ratchet-small',0,.37,.55,.7,'ceramic'),L('spring',.12,.8,.65,[.3,.6,.45],'glass>coil'),L('switch',.4,.15,.5,.8,'iron')]),
 'world.lost':('Node lost',1.05,[L('neon',0,.55,.7,[.65,.2],'radio>magnetic'),L('breaker',.29,.24,.6,.4,'iron'),L('hinge',.4,.55,.3,.5,'shear')]),
 'world.contested':('Node contested',.85,[L('printer',0,.28,.55,.5,'radio'),L('breaker',.13,.18,.6,.65,'ceramic'),L('printer',.34,.35,.5,.7,'radio')]),
 'world.ping':('Fleet ping',.54,[L('glass-knock',0,.18,.55,.85,'glass'),L('spring-handle',.04,.4,.5,[.85,.55],'coil>radio')]),
 'world.strikeWarning':('Incoming strike',1.3,[L('neon',0,.24,.7,.35,'radio>plasma'),L('neon',.34,.28,.65,.4,'radio>plasma'),L('spring',.56,.65,.6,[.3,.8],'coil')]),
 'world.deploy':('Deployment mechanism',1.15,[L('ratchet',0,.55,.7,.65,'iron'),L('servo',.12,.7,.75,[.5,.9,.4],'servo'),L('slam',.57,.4,.6,.5,'iron')]),
 'world.victory':('Victory power-down',2.3,[L('film',0,.7,.6,[.7,.4],'warm'),L('spring-handle',.13,1.6,.65,[.4,.65,.5],'glass'),L('compressor',.4,1.7,.5,[.5,.15],'pressure'),L('switch',1.42,.2,.4,.7,'iron')]),
 'world.defeat':('Defeat systems collapse',2.4,[L('transformer',0,1.6,.8,[.5,.25,.12],'plasma>radio'),L('breaker',.21,.22,.6,.5,'iron'),L('breaker',.62,.27,.5,.3,'iron'),L('washer',.38,1.9,.6,[.3,.12],'pressure')]),
 'ui.hover':('Console focus',.1,[L('shutter',0,.09,.6,1.1,'ceramic',hit=True)]),
 'ui.select':('Console select',.2,[L('switch',0,.1,.8,.9,'iron',hit=True),L('shutter',.04,.12,.4,.65,'ceramic')]),
 'ui.back':('Console close',.27,[L('autofocus',0,.19,.5,[.9,.4],'servo>radio'),L('switch',.12,.12,.5,.7,'iron')]),
 'ui.toggle':('Switch relay',.22,[L('breaker',0,.12,.7,.85,'iron'),L('shutter',.07,.1,.5,.8,'iron')]),
 'ui.deny':('Command rejected',.37,[L('printer',0,.17,.7,.8,'radio>grain'),L('printer',.17,.17,.5,.6,'radio>grain')]),
 'ui.open':('Screen opens',.42,[L('autofocus',0,.29,.7,[.4,1.1,.75],'servo>coil'),L('glass-knock',.16,.22,.3,.8,'ceramic')]),
}

COMMANDS={
 'orbitalStrike':('spring','steel',[0,.12,.36],'coil>shear'),
 'blackHoleBomb':('dryice','washer',[0,.31,.79],'shear>plasma'),
 'aBomb':('thunder','transformer',[0,.2,.54],'pressure>magnetic'),
 'empBomb':('welding','breaker',[0,.08,.3,.61],'coil>radio'),
 'radarJammer':('printer','neon',[0,.13,.22,.48],'radio>grain'),
 'reconSweep':('autofocus','glass-knock',[0,.27,.63],'glass>coil'),
 'defensePlatform':('ratchet','steel-double',[0,.19,.44,.75],'iron'),
 'fleetOvercharge':('drill','spring',[0,.09,.26,.52],'plasma>coil'),
 'fighterWing':('servo','shutter',[0,.08,.19,.32],'servo>coil'),
 'interceptorWing':('reel','film',[0,.045,.13,.24,.38],'grain>magnetic'),
 'bomberWing':('starter','slam',[0,.2,.49],'plasma>pressure'),
 'reconDrones':('autofocus','spring-handle',[0,.35],'radio>glass'),
 'defenseDrones':('compressor','chain',[0,.11,.29,.52],'iron>magnetic'),
 'forwardBeacon':('spring-handle','switch',[0,.14,.37],'glass>coil'),
 'rapidDeployment':('film','ratchet-small',[0,.06,.16,.32],'grain>servo'),
 'rallyOrder':('reel','shutter',[0,.12,.42],'radio>coil'),
 'hullReinforcement':('bubbles','tensioner',[0,.18,.47],'warm>magnetic'),
 'breakthrough':('drill-load','steel',[0,.11,.38,.7],'iron>plasma'),
}

HULLS={
 'striker':('drill-load','film',.51,'coil>plasma'), 'comet':('servo','spring',.69,'servo>magnetic'),
 'wraith':('dryice','autofocus',.23,'shear>radio'), 'specter':('spring-handle','neon',.36,'glass>coil'),
 'fortress':('compressor','ratchet',.28,'iron>pressure'), 'warden':('water','spring',.4,'glass>magnetic'),
 'hunter':('starter','servo',.46,'plasma>coil'), 'escort':('film','drill',.34,'grain>iron'),
 'strikecruiser':('drill-load','welding',.32,'plasma>magnetic'), 'commandcruiser':('neon','reel',.4,'radio>coil'),
 'raider':('servo','dryice',.38,'shear>plasma'), 'ironclad':('starter','chain',.21,'iron>pressure'),
 'bastion':('compressor','spring-handle',.19,'magnetic>pressure'), 'juggernaut':('drill-load','steel',.18,'iron>plasma'),
 'railstorm':('transformer','film',.27,'coil>grain'), 'eclipse':('dryice','washer',.15,'shear>pressure'),
 'hive':('reel','autofocus',.74,'grain>coil'), 'overlord':('washer','neon',.24,'magnetic>plasma'),
}
SECONDARY={
 'frigate':('spring-handle','water',.72,'glass>coil'), 'destroyer':('shutter','steel',.6,'iron>fracture'),
 'cruiser':('spring','neon',.81,'magnetic>coil'), 'battlecruiser':('slam','ratchet',.48,'iron'),
 'battleship':('steel','transformer',.44,'magnetic'), 'dreadnought':('film','weld-burst',.95,'grain>coil'),
 'carrier':('shutter','reel',1.1,'iron>grain'),
}

def add_support(bank,inventory):
    def put(id,label,group,duration,layers,**opts):
        bank[id]=dict(label=label,group=group,duration=duration,layers=layers,description=label+' — '+', '.join(dict.fromkeys(l[0] for l in layers))+' transformed with '+', '.join(dict.fromkeys(l[5] for l in layers)),bus='world',gain=.62,priority=50,range=6500,variants=5,rms=.14)
        bank[id].update(opts)
    for id,(label,duration,layers) in EVENTS.items():
        group={'weapon':'Weapons','impact':'Impacts','status':'Pilot feedback','movement':'Movement','world':'Objectives','ui':'Interface'}[id.split('.')[0]]
        put(id,label,group,duration,layers)
        if group in ('Pilot feedback','Interface','Objectives'):bank[id].update(bus='ui',gain=.26,priority=95,range=0,variants=3,rms=.09)
        if group=='Impacts':bank[id].update(variants=9,range=8000)
        if id in ('impact.explosion','impact.death','impact.structure','impact.strike'):bank[id].update(range=12500,priority=75)
        if id in ('world.deploy','world.strikeWarning'):bank[id].update(bus='world',range=9000)
        if id in {'ui.hover':10,'ui.select':25,'ui.toggle':25,'ui.open':35,'ui.back':35,'ui.deny':55}:
            bank[id]['priority']={'ui.hover':10,'ui.select':25,'ui.toggle':25,'ui.open':35,'ui.back':35,'ui.deny':55}[id]
        if id=='ui.hover':bank[id]['gain']=.09
        if id=='status.pickup':bank[id]['gain']=.13
    for c in inventory['commands']:
        lead,detail,offsets,fx=COMMANDS[c['id']]
        layers=[L(lead,0,1.55,.85,[.35,.67,.26],fx,print=[.5,1.4,.6])]
        layers += [L(detail,t,.35,.6/(1+i*.13),.45+i*.1,'iron' if detail not in ('neon','spring','spring-handle','transformer') else 'magnetic',hit=True) for i,t in enumerate(offsets)]
        put('command.'+c['id'],c['name'],'Fleet commands',1.85,layers,priority=72,range=9500)
    for id,(lead,detail,speed,fx) in HULLS.items():
        put('engine.'+id,id.title()+' drive','Continuous',6.8,[L(lead,0,6.8,1,[speed,speed*1.1,speed*.93],fx,amp=[1,.9,1,.95,1],attack=.001,release=.001),L(detail,0,6.8,.35,speed*.83,'warm>coil',amp=[1,1,1,1,1],attack=.001,release=.001)],loop=True,variants=2,bus='engines',gain=.33,priority=24,range=3200,rms=.1)
    for cls in inventory['classes']:
        if not cls.get('secondary'):continue
        lead,detail,speed,fx=SECONDARY[cls['id']]
        put('secondary.'+cls['id'],cls['secondary']['name'],'Secondary weapons',.43,[L(lead,0,.23,.8,speed,fx,hit=True),L(detail,.027,.35,.55,[speed,speed*.65],'coil' if cls['id'] in ('frigate','cruiser','dreadnought') else 'iron')],gain=.38,range=4400,priority=42,variants=6)
    loop_specs={
      'drive':('drill-load','dryice',.4,'plasma>coil'), 'spool':('drill','reel',.6,'servo>coil'),
      'charge':('transformer','spring',.5,'magnetic>coil'), 'missile':('starter','welding',.6,'plasma'),
      'drone':('film','autofocus',.9,'servo>grain'), 'field':('dryice','bubbles',.28,'glass>magnetic'),
      'tether':('spring-handle','water',.5,'coil>glass'), 'cloak':('hinge','neon',.25,'shear>radio'),
      'hangar':('compressor','washer',.24,'pressure>iron'),
    }
    for id,(lead,detail,speed,fx) in loop_specs.items():
        put('loop.'+id,id.title()+' sustain','Continuous',6.5,[L(lead,0,6.5,1,[speed,speed*1.13,speed*.91],fx,amp=[1,1,1,1,1],attack=.001,release=.001),L(detail,0,6.5,.3,speed*.7,'warm',amp=[1,.8,1,.9,1],attack=.001,release=.001)],loop=True,variants=2,bus='engines' if id in ('drive','spool','missile','drone') else 'ambience',gain=.25,range=2800,priority=30,rms=.1)
