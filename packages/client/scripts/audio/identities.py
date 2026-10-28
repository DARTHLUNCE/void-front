"""Individually edited sound identities, defined against real game content.

L(source, onset, length, level, performed playback-speed curve, processing chain).
Chained processors print into the next stage. Every ability has its own material
selection and phrasing; variants replace takes without erasing that phrase.
"""
def L(source,at,length,gain,speed=1,fx='iron',**kw):
    return [source,at,length,gain,speed,fx,kw]

WEAPONS={
 'patrol':('Twin clipped induction snaps, ceramic spring recoil',.36,[
   L('spring',0,.16,.8,[1.7,.55,.8],'coil>fracture',hit=True),L('shutter',.012,.085,.65,.62,'iron',hit=True),
   L('weld-burst',.035,.23,.28,[.9,.35],'magnetic',amp=[1,.4,.1,0])]),
 'corvette':('Hollow phase bite with reversed metal suction and a split tail',.52,[
   L('hinge',0,.11,.7,[1.1,.32],'vacuum>shear',reverse=True),L('dryice',.027,.32,.8,[.85,.24,.43],'shear>coil'),
   L('glass-knock',.055,.17,.5,.48,'ceramic',hit=True),L('autofocus',.14,.3,.18,[.4,.9,.3],'servo>radio')]),
 'frigate':('Tensile liquid nanite lance; fine ratchet and surgical glass',.58,[
   L('reel',0,.08,.5,1.4,'ceramic',hit=True),L('bubbles',.015,.39,.85,[.62,1.3,.43],'magnetic>glass'),
   L('spring-handle',.025,.3,.48,[.83,.47],'glass>coil'),L('glass',.18,.32,.22,.8,'grain>ceramic')]),
 'destroyer':('Twin interlocked heavy breeches, thick iron punch and case rattle',.68,[
   L('slam',0,.24,1,.63,'iron>pressure',hit=True),L('anvil',.006,.27,.65,.42,'iron',hit=True),
   L('steel',.033,.26,.7,.74,'fracture',hit=True),L('ratchet',.13,.31,.35,[.8,.43,.8],'iron>grain'),
   L('thunder',.015,.55,.5,.65,'pressure',amp=[1,.65,.12,0])]),
 'cruiser':('Triple accelerator contacts followed by a tearing charged-metal chord',.8,[
   L('breaker',0,.1,.48,.74,'iron',hit=True),L('breaker',.029,.11,.4,.6,'iron',hit=True),L('breaker',.061,.12,.36,.49,'iron',hit=True),
   L('dryice',.012,.48,1,[.45,.83,.24],'coil>magnetic'),L('spring',.085,.5,.52,[.39,.24],'shear>glass'),
   L('steel-double',.15,.3,.3,.5,'fracture')]),
 'battlecruiser':('Coarse plasma combustion tearing through a pressurised chamber',1.0,[
   L('starter',0,.2,.8,.38,'iron',hit=True),L('welding',.015,.66,1,[.27,.5,.16],'plasma>magnetic',print=[1.3,.5,1.2,.6]),
   L('compressor',.04,.63,.6,[.31,.23,.4],'pressure>plasma'),L('pan',.095,.5,.52,.32,'iron>fracture')]),
 'battleship':('Two massive gauss armatures, a compressed coil growl and brittle recoil',1.14,[
   L('steel',0,.39,.95,.27,'iron',hit=True),L('steel-double',.042,.38,.85,.24,'magnetic',hit=True),
   L('transformer',.012,.61,.85,[.58,.31,.16],'coil>plasma'),L('spring-handle',.13,.62,.48,.27,'shear>iron'),
   L('thunder',.021,.9,.55,.5,'pressure')]),
 'dreadnought':('Spinal rail rupture: razor attack, huge falling metal resonance, ejector',1.55,[
   L('glass',0,.095,.72,1.35,'fracture',hit=True),L('steel-double',.004,.63,1,.18,'iron>magnetic',hit=True),
   L('dryice',.008,.95,.9,[.65,.23,.12],'shear>coil',print=[1.6,.8,.3]),
   L('thunder',.025,1.3,.65,.38,'pressure'),L('tensioner',.29,.56,.31,.42,'grain>iron')]),
 'carrier':('Precision command designator: pinched electromagnetic chatter and glass lock',.39,[
   L('autofocus',0,.2,.75,[1.8,.7,1.1],'radio>coil'),L('neon',.015,.28,.65,[.7,1.4,.58],'magnetic>ceramic'),
   L('glass-knock',.04,.14,.3,1.3,'glass',hit=True)]),
}

# Full explicit phrases: sources, timings and processing are independently authored.
ABILITIES={
 'patrol.phaseDash':('A tensile spring aperture snaps into a vacuum wake',.85,[L('spring',0,.25,.8,[1.4,.3],'vacuum>coil'),L('dryice',.025,.56,1,[.8,.25,.4],'shear>grain'),L('autofocus',.12,.3,.4,[.6,1.2,.4],'servo>coil')]),
 'patrol.blinkStrike':('Suction fracture, empty beat, displaced heavy arrival',.9,[L('glass',0,.15,.8,.63,'vacuum>glass',reverse=True),L('hinge',.03,.22,.6,[1.4,.35],'shear'),L('steel',.155,.28,1,.34,'iron>fracture',hit=True),L('dryice',.185,.62,.65,[.6,.22],'magnetic>coil')]),
 'patrol.kineticRam':('Three piston restraints release into a compact mass impulse',.88,[L('ratchet',0,.1,.8,.64,'iron',hit=True),L('slam',.026,.2,.8,.42,'iron',hit=True),L('starter',.062,.55,1,[.35,.7,.29],'plasma>pressure'),L('steel-double',.11,.42,.7,.4,'fracture')]),
 'patrol.stormRun':('Staggered current couplers accelerating into a serrated rotor',1.4,[L('switch',0,.12,.5,.65,'iron'),L('drill',.035,.95,1,[.3,.39,.8,1.3],'coil>plasma',print=[.3,.7,1.2,1.6]),L('weld-burst',.15,.29,.45,.7,'fracture'),L('weld-burst',.47,.34,.6,.45,'magnetic'),L('reel',.8,.43,.5,.8,'grain')]),
 'patrol.microPods':('Eight dry launch-cell latches with staggered miniature exhaust growls',1.32,[L('shutter',0,.09,.7,.8,'iron',hit=True),L('shutter',.06,.1,.6,.75,'iron',hit=True),L('shutter',.13,.11,.6,.7,'iron',hit=True),L('ratchet-small',.21,.48,.7,[1.3,.7,1.5],'grain>iron'),L('servo',.1,1.1,.9,[.4,.85,.56],'plasma>coil')]),
 'corvette.ambush':('Serrated hinge folded backwards through a swallowed servo',1.15,[L('hinge',0,.54,.8,[.55,.24,.7],'vacuum>shear',reverse=True),L('autofocus',.04,.48,.65,[.8,.32,.12],'coil>radio'),L('mirror',.25,.65,.45,.28,'glass>grain',reverse=True)]),
 'corvette.ghostStep':('A very short mirror fold with a dry offset ceramic lock',.62,[L('mirror',0,.24,.8,[1.2,.39],'glass>vacuum',reverse=True),L('glass-knock',.11,.25,.7,.56,'ceramic',hit=True),L('spring',.13,.4,.44,[.5,1.1,.2],'shear')]),
 'corvette.wraithAmbush':('Deep frictional throat folds beneath two detached phase clicks',1.6,[L('dryice',0,1.2,1,[.33,.14,.23],'shear>plasma',reverse=True,print=[.4,1.4,.5,1.2]),L('breaker',.09,.17,.5,.45,'magnetic',hit=True),L('breaker',.38,.16,.42,.35,'magnetic',hit=True),L('hinge',.59,.8,.4,.25,'vacuum')]),
 'corvette.specterAmbush':('Three independently opening glass-metal apparition mechanisms',1.75,[L('spring-handle',0,.45,.65,[.4,.9],'vacuum>glass'),L('mirror',.16,.55,.65,[.42,.83],'glass>coil',reverse=True),L('dryice',.43,.7,.82,[.28,.55,.2],'shear>grain'),L('servo',.71,.7,.65,[.37,.9,.3],'radio>magnetic'),L('glass',1.02,.5,.3,.6,'grain')]),
 'corvette.guillotine':('Massive negative-pressure cut and jagged shear-plane recoil',1.4,[L('slam',0,.19,.9,.28,'vacuum',reverse=True),L('steel-double',.12,.43,1,.2,'iron>fracture',hit=True),L('dryice',.13,.9,1,[.9,.18,.3],'shear>plasma'),L('mirror',.24,.7,.45,.4,'grain>fracture')]),
 'corvette.blackout':('Irregular electrical latches fail into a choking radio throat',1.8,[L('breaker',0,.17,.6,.55,'iron'),L('neon',.04,1.35,.95,[.7,.44,.18],'coil>radio',print=[1.5,.3,1.1,.2]),L('weld-burst',.19,.23,.5,.45,'fracture'),L('weld-burst',.52,.28,.4,.33,'fracture'),L('transformer',.71,.8,.5,[.5,.12],'pressure')]),
 'frigate.repairPulse':('Fluid microvalves bloom into a warm tensile nanite wash',1.7,[L('water',0,.25,.5,.65,'warm'),L('bubbles',.045,1.15,1,[.4,.7,.46],'glass>magnetic',amp=[.1,.85,1,.55,0]),L('spring-handle',.18,1.15,.55,[.48,.68,.42],'glass>coil'),L('ratchet-small',.2,.46,.25,.7,'ceramic')]),
 'frigate.sentry':('Tripod unfolds, servo hunts, heavy targeting latch seats',1.25,[L('ratchet',0,.23,.6,.6,'iron'),L('servo',.1,.68,.9,[.33,.9,.45],'servo>coil'),L('steel',.56,.35,.8,.5,'iron',hit=True),L('shutter',.69,.12,.5,.7,'ceramic')]),
 'frigate.mines':('Small magnetic detents and a brief pinched induction lock',.88,[L('ratchet-small',0,.26,.8,[1.1,.7],'iron>grain'),L('switch',.13,.12,.6,.6,'ceramic'),L('neon',.22,.5,.7,[1.1,.4,.75],'coil>radio')]),
 'frigate.fortressPulse':('Industrial repair pump drives a low liquid resonance through emitter clamps',2.05,[L('compressor',0,.68,.85,[.34,.6,.42],'warm>pressure'),L('tensioner',.07,.45,.5,.5,'iron'),L('bubbles',.24,1.5,.9,[.25,.45,.32],'magnetic>glass',amp=[.2,1,.8,.5,0]),L('spring',.45,1.25,.4,.3,'glass')]),
 'frigate.wardenTether':('Cable capture clack, sliding tensile metal, surging liquid current',1.55,[L('tensioner',0,.19,.8,.72,'iron',hit=True),L('spring-handle',.03,1.05,1,[.9,.36,.55],'coil>glass'),L('water',.1,.6,.45,.37,'magnetic'),L('welding',.31,.95,.5,[.38,.6,.3],'magnetic>radio')]),
 'frigate.citadel':('Five staggered anchor mechanisms with a massive resonating foundation',2.4,[L('slam',0,.4,.9,.31,'iron'),L('chain',.09,.7,.55,.4,'grain>iron'),L('ratchet',.35,.7,.75,[.34,.65,.4],'iron'),L('steel-double',.8,.5,.9,.23,'magnetic'),L('compressor',.9,1.4,.65,.23,'pressure>plasma')]),
 'frigate.sanctuary':('Wide liquid protective bloom settles into a resonating glass shelter',2.5,[L('glass-knock',0,.4,.5,.42,'glass',hit=True),L('bubbles',.1,1.9,.9,[.2,.45,.25],'warm>magnetic',amp=[0,.7,1,.6,0]),L('dryice',.2,1.85,.5,[.3,.45,.27],'glass>vacuum',amp=[0,.6,.8,.5,0]),L('compressor',.3,1.7,.35,.3,'pressure')]),
 'destroyer.heavyTorpedo':('Heavy tube door, hard ejector, then delayed throaty ignition',1.65,[L('slide',0,.27,.6,.48,'iron'),L('slam',.08,.3,.95,.37,'iron',hit=True),L('starter',.17,.7,.85,[.27,.55,.4],'plasma'),L('drill-load',.35,1.15,.75,[.22,.5,.3],'pressure>plasma')]),
 'destroyer.evasiveBurn':('Asymmetric retro-jets answer a hard pressure valve',1.0,[L('switch',0,.13,.6,.55,'iron'),L('welding',.018,.4,.8,[.45,.24],'plasma'),L('water',.15,.42,.6,.3,'vacuum>pressure'),L('servo',.25,.6,.55,[.5,.27],'coil')]),
 'destroyer.torpedoSpread':('Three clearly staggered tube releases followed by interleaved motor growls',1.8,[L('slam',0,.27,.9,.4,'iron'),L('slam',.08,.27,.82,.33,'iron'),L('slam',.17,.29,.76,.29,'iron'),L('starter',.14,.8,.7,[.4,.7,.3],'plasma'),L('drill-load',.34,1.3,.65,[.3,.54,.4],'coil>pressure')]),
 'destroyer.flakCurtain':('Dry metal canisters chatter, followed by granular shrapnel punctuation',1.4,[L('shutter',0,.14,.6,.4,'iron'),L('ratchet',.03,.72,.95,[.85,.4,1.2],'grain>iron'),L('steel',.12,.36,.65,.7,'fracture'),L('mirror',.22,.81,.5,[.7,.4],'grain>fracture'),L('weld-burst',.48,.6,.4,.55,'coil')]),
 'destroyer.tubeSalvo':('Tube bank unlocks in a descending four-step mechanical ratchet',.95,[L('tensioner',0,.45,.8,[.85,.4,.7],'iron>grain'),L('switch',.13,.12,.6,.58,'iron'),L('breaker',.29,.18,.56,.4,'magnetic'),L('servo',.33,.5,.42,[.55,.28],'servo')]),
 'destroyer.empWarhead':('Capacitor contact is punctured by a rasping electromagnetic rupture',1.9,[L('breaker',0,.15,.7,.5,'iron'),L('transformer',.04,1.2,1,[.7,.25,.13],'magnetic>plasma'),L('weld-burst',.07,.5,.7,[.6,.25],'fracture>coil'),L('dryice',.4,1.3,.6,[.3,.12],'shear')]),
 'cruiser.shieldBattery':('Dense coil contactor closes into a loaded crystalline field',1.55,[L('breaker',0,.15,.85,.45,'iron'),L('spring',.03,.8,.75,[.25,.55,.34],'magnetic>glass'),L('glass-knock',.09,.5,.5,.37,'glass'),L('transformer',.22,1.1,.55,[.3,.55,.4],'coil')]),
 'cruiser.vlsPod':('Four rising cell lids and hot segmented motor catches',1.65,[L('shutter',0,.14,.6,.5,'iron'),L('shutter',.06,.13,.55,.64,'iron'),L('ratchet',.14,.45,.75,[.6,.9],'grain'),L('servo',.12,1.15,.85,[.3,.65,.4],'plasma>coil'),L('steel',.37,.35,.5,.43,'fracture')]),
 'cruiser.aegisPulse':('Distributed glass ribs unfurl around a rolling magnetic pulse',2.15,[L('glass-knock',0,.4,.65,.45,'glass'),L('spring-handle',.08,1.5,.85,[.3,.6,.37],'magnetic>glass',amp=[.15,1,.8,.4,0]),L('mirror',.25,1.3,.48,[.25,.5,.33],'glass>grain',reverse=True),L('neon',.5,1.3,.35,.4,'warm')]),
 'cruiser.overclock':('A mechanical escapement accelerates and locks into a searing coil',1.8,[L('film',0,1.2,.9,[.35,.6,1.4,1.8],'grain>coil'),L('drill',.13,1.3,.65,[.3,.9,1.4],'plasma'),L('breaker',.78,.17,.55,.5,'iron'),L('welding',.86,.7,.45,.43,'magnetic')]),
 'cruiser.ionLance':('Wire-like ionization rip with a sharp corona tear and electric recoil',1.55,[L('spring',0,.65,1,[1.3,.35,.2],'coil>fracture'),L('weld-burst',.013,.72,.75,[.55,.26],'magnetic>plasma'),L('glass',.085,.62,.45,.6,'glass>grain'),L('ratchet',.31,.8,.3,.33,'iron')]),
 'battlecruiser.ramBurn':('Heavy locking piston drives a sustained exhaust compression',1.5,[L('slam',0,.4,1,.25,'iron'),L('starter',.04,.9,.9,[.23,.55,.3],'plasma>pressure'),L('chain',.09,.5,.65,.38,'iron'),L('drill-load',.2,1.1,.55,[.25,.4,.2],'plasma')]),
 'battlecruiser.microJump':('Massive aperture inhales, rips open and reseats with two iron jaws',1.7,[L('dryice',0,.6,.9,[.2,.65],'vacuum>shear',reverse=True),L('steel',.22,.45,1,.23,'iron>magnetic'),L('steel-double',.29,.6,.72,.18,'fracture'),L('hinge',.31,1.1,.65,[.6,.18],'shear>coil')]),
 'battlecruiser.ironcladRam':('Interlocking armor slabs step into a huge rough piston impulse',1.7,[L('steel-double',0,.48,1,.18,'iron'),L('slam',.06,.5,.9,.21,'iron>pressure'),L('ratchet',.13,.65,.72,.28,'grain>iron'),L('starter',.2,1.25,.8,[.19,.43,.2],'plasma')]),
 'battlecruiser.devastator':('Dense segmented breeches fire under a tearing plasma throat',1.95,[L('ratchet',0,.84,.85,[.4,1.1,.5],'grain>iron'),L('pan',.045,.7,.85,.27,'iron>fracture'),L('welding',.1,1.4,1,[.24,.5,.18],'plasma>shear'),L('steel',.48,.6,.5,.3,'magnetic')]),
 'battlecruiser.overload':('Reactor restraints successively release as bearings climb into saturation',2.35,[L('tensioner',0,.8,.75,[.32,.7],'iron'),L('washer',.07,1.9,1,[.18,.4,.85],'plasma>coil',print=[.3,.6,1,1.5]),L('breaker',.55,.21,.6,.34,'iron'),L('welding',.8,1.25,.65,[.2,.65,.3],'magnetic')]),
 'battleship.bulwark':('A segmented armor wall clamps shut and pressurises',1.85,[L('chain',0,.57,.65,.32,'iron'),L('slam',.11,.5,1,.21,'iron'),L('steel-double',.29,.6,.8,.2,'magnetic'),L('compressor',.4,1.3,.65,[.26,.4,.2],'pressure')]),
 'battleship.aegisMirror':('Faceted mirror segments reverse into a hard singing metallic seal',2.0,[L('mirror',0,.66,.75,.4,'glass>coil',reverse=True),L('glass-knock',.13,.4,.7,.3,'magnetic'),L('spring-handle',.2,1.4,.9,[.38,.65,.27],'glass>shear'),L('steel',.43,.55,.35,.33,'iron')]),
 'battleship.thermalOverdrive':('Cooling plant violently vents and a loaded industrial rotor bites',2.15,[L('water',0,.51,.6,.19,'pressure'),L('compressor',.06,1.25,.8,[.23,.6,.38],'plasma'),L('drill-load',.27,1.65,1,[.23,.75,.42],'coil>plasma'),L('weld-burst',.69,.72,.5,.28,'fracture')]),
 'battleship.siege':('Grounding anchors thump in sequence; a giant breech rotates and locks',2.6,[L('steel',0,.42,1,.16,'iron'),L('steel-double',.23,.46,.9,.2,'iron'),L('ratchet',.34,1.1,.8,[.2,.45,.25],'iron>grain'),L('servo',.68,1.2,.8,[.15,.37,.2],'magnetic'),L('slam',1.5,.65,.8,.18,'iron')]),
 'battleship.aegisDome':('Deep distributed field ribs inflate beneath resonating crystalline skin',2.75,[L('spring',0,1.9,.8,[.16,.3,.2],'glass>magnetic',amp=[0,.7,1,.4,0]),L('transformer',.1,2.3,.7,[.17,.33,.23],'coil>pressure'),L('dryice',.4,1.9,.75,[.2,.4,.24],'glass>vacuum'),L('breaker',.28,.26,.5,.24,'iron')]),
 'dreadnought.railBeam':('Huge spinal acceleration rip and receding serrated iron resonance',1.95,[L('glass',0,.12,.7,.9,'fracture'),L('steel-double',.014,.8,1,.15,'iron>magnetic'),L('dryice',.025,1.35,1,[.7,.22,.12],'shear>coil',print=[1.5,.5,.7,.2]),L('thunder',.06,1.65,.75,.35,'pressure')]),
 'dreadnought.railstorm':('Three unmistakable asymmetric rail ruptures with interleaving recoil',2.1,[L('steel',0,.49,.9,.24,'magnetic>fracture'),L('steel',.09,.55,.85,.2,'magnetic>fracture'),L('steel-double',.23,.64,1,.16,'iron>magnetic'),L('dryice',.02,1.5,.85,[.65,.3,.2],'shear>coil'),L('thunder',.17,1.7,.5,.45,'pressure')]),
 'dreadnought.eventHorizon':('A collapsing industrial throat draws metallic fragments inward',3.3,[L('washer',0,2.8,.9,[.35,.2,.12],'pressure>plasma',amp=[.1,.8,1,.4,0]),L('dryice',.13,2.65,1,[.38,.16,.23,.12],'shear>magnetic',reverse=True,print=[.2,.6,1.4,.4]),L('chain',.35,1.4,.6,.2,'grain>vacuum',reverse=True),L('steel-double',1.35,.8,.6,.15,'iron')]),
 'dreadnought.orbitalLance':('Targeting clamps step into a long high-tension orbital coupling',2.0,[L('breaker',0,.2,.6,.35,'iron'),L('reel',.09,.8,.65,[.3,.7],'grain>radio'),L('spring',.18,1.5,.9,[.19,.5,.3],'coil>glass'),L('neon',.6,1.1,.45,[.3,.6,.3],'magnetic')]),
 'dreadnought.gravityWave':('A reversed pressure front folds into a broad downward metal whip',2.45,[L('thunder',0,.65,.6,.4,'vacuum>pressure',reverse=True),L('spring-handle',.15,1.7,1,[.53,.2,.12],'shear>magnetic'),L('steel',.2,.65,.8,.2,'iron'),L('dryice',.43,1.7,.65,[.38,.13],'plasma')]),
 'carrier.scramble':('Four hangar latch releases and uneven turbine departures',1.95,[L('shutter',0,.17,.5,.6,'iron'),L('ratchet-small',.07,.6,.75,[.5,1.2,.6],'grain'),L('servo',.2,1.3,.9,[.4,.85,.5],'coil>servo'),L('film',.4,1.15,.65,[.5,1,.7],'grain>magnetic'),L('slam',.12,.3,.45,.4,'iron')]),
 'carrier.hiveSwarm':('Seven clustered induction insects emerge in a rough expanding chatter',2.2,[L('film',0,1.4,.8,[.75,1.6,.9],'grain>coil'),L('reel',.08,1.2,.75,[.4,.95,.6],'grain>radio'),L('autofocus',.28,1.65,.95,[.5,1.5,.75],'coil>plasma'),L('spring',.61,.8,.4,.7,'glass')]),
 'carrier.empPulse':('A fleet-scale relay cascade empties into a torn magnetic front',2.4,[L('breaker',0,.22,.75,.4,'iron'),L('transformer',.04,1.85,1,[.4,.2,.12],'plasma>magnetic'),L('weld-burst',.15,.5,.65,.3,'fracture'),L('neon',.49,1.5,.7,[.4,.23,.15],'radio>coil'),L('glass',.84,.7,.4,.3,'grain')]),
 'carrier.bastionDeck':('Flight deck panels unlock, defensive mounts ratchet, rotors stagger away',2.75,[L('slide',0,.45,.65,.3,'iron'),L('chain',.14,.9,.65,.3,'grain'),L('ratchet',.36,1.1,.8,[.25,.7,.4],'iron'),L('servo',.7,1.7,.85,[.23,.8,.4],'magnetic>plasma'),L('steel-double',1.4,.55,.7,.22,'iron')]),
 'carrier.valkyrie':('Remote volley synchronizer and a sharply staggered pair of launch swarms',1.8,[L('autofocus',0,.35,.65,[1.1,.5],'radio'),L('shutter',.09,.17,.6,.5,'iron'),L('film',.18,.9,.85,[.5,1.4,.7],'grain>coil'),L('servo',.4,1.2,.9,[.6,.95,.3],'plasma>magnetic')]),
}

ENGINES={
 'patrol':('Tight brush motor with spring-like induction texture','drill','spring',[.39,.43,.4], 'coil',.27),
 'corvette':('Stealth servo throat with low frictional phase modulation','autofocus','hinge',[.24,.33,.26],'shear>radio',.17),
 'frigate':('Liquid pump circulation and fine winding bearings','compressor','bubbles',[.43,.47,.4],'warm>magnetic',.32),
 'destroyer':('Loaded combustion-like rotor and chattering mechanical bearings','starter','drill-load',[.35,.4,.33],'iron>pressure',.35),
 'cruiser':('Coherent induction turbine with resonating tension coils','drill','transformer',[.23,.3,.26],'magnetic>coil',.39),
 'battlecruiser':('Rough lower plasma furnace and stressed drive train','welding','washer',[.23,.29,.2],'plasma>pressure',.44),
 'battleship':('Heavy pulsed compressor pistons and large resonating rotor','compressor','starter',[.2,.23,.19],'iron>pressure',.46),
 'dreadnought':('Substantial magnetic mass, slow stator modulation and metal stress','washer','dryice',[.15,.18,.14],'pressure>magnetic',.5),
 'carrier':('Multiple small uneven rotors above a large deck generator','film','servo',[.4,.55,.46],'servo>coil',.3),
}

def build_identities(inventory):
    bank={}
    def add(id,label,group,definition,**opts):
        desc,duration,layers=definition
        bank[id]=dict(label=label,group=group,description=desc,duration=duration,layers=layers,
          bus='world',gain=.62,priority=50,range=6400,variants=5,rms=.14,**opts)
    for cls in inventory['classes']:
        id=cls['id'];add('weapon.'+id,cls['gun']['name'],'Weapons',WEAPONS[id]);bank['weapon.'+id]['variants']=7
        bank['weapon.'+id]['range']=dict(patrol=4800,corvette=4500,frigate=4500,destroyer=6800,cruiser=7200,battlecruiser=8500,battleship=9500,dreadnought=11000,carrier=4800)[id]
    for a in inventory['abilities']:
        add('ability.'+a['id'],a['name'],'Ship abilities',ABILITIES[a['id']]);bank['ability.'+a['id']].update(priority=72,gain=.7,range=8000)
    for id,(desc,lead,detail,speed,fx,gain) in ENGINES.items():
        layers=[L(lead,0,6.6,1,speed,fx,amp=[1,1,1,1,1],attack=.001,release=.001),L(detail,0,6.6,.34,[s*.8 for s in speed],'coil' if id in ('patrol','cruiser','carrier') else 'warm',amp=[1,.85,1,.88,1],attack=.001,release=.001)]
        add('engine.'+id,id.title()+' drive','Continuous',(desc,6.6,layers),loop=True);bank['engine.'+id].update(variants=2,bus='engines',gain=gain,range=3000,priority=24,rms=.1)
    return bank
