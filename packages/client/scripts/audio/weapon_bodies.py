"""Short firing envelopes with an audible pressure body, not just a latch.

Physical source impulse, briefly rising excitation, then a fast settling recoil.
Pitch gestures are baked offline and never change projectile motion or cadence.
"""
from identities import L


def rise(low, high, settle):
    return {'points': [(0, low), (.055, high), (.18, high * .92), (1, settle)]}


def apply_weapon_bodies(bank):
    from weapon_attacks import apply_weapon_attacks
    apply_weapon_attacks(bank)

    r = bank['impact.armor']
    r.update(duration=.29, variants=12, rms=.15, gain=.6,
             layers=[L('steel|steel-double|pan', 0, .2, 1, rise(.26, .63, .35), 'iron>fracture', hit=True, amp=[1,.8,.3,0]),
                     L('slam|anvil|glass-knock', .004, .16, .6, .39, 'iron', hit=True, amp=[1,.65,.15,0]),
                     L('chain|mirror|ratchet', .021, .23, .4, .52, 'grain>iron', amp=[1,.6,.1,0])],
             envelope=[(0,0),(.01,1),(.16,.9),(.42,.36),(.75,.035),(1,0)],
             description='Twelve varied plate strikes: metal punch, brittle spall, short loose mechanical fragments.')
    bank['status.hitmarker'] = dict(label='Hit confirmed', group='Pilot feedback', description='Tiny dry detent click; confirms your hit without duplicating the world impact.',
        duration=.055, variants=5, loop=False, bus='ui', gain=.22, priority=68, range=0, rms=.075,
        attack=.001, release=.012, envelope=[(0,0),(.025,1),(.22,.45),(.65,.045),(1,0)],
        layers=[L('shutter|switch',0,.055,1,1.2,'iron',hit=True,lo=1100,hi=6200,amp=[1,.5,.05,0],release=.008)])
