"""Regression tests for complete recorded attack selection (no source downloads)."""
import unittest
import numpy as np
from weapon_attacks import find_impulse_starts

RATE=48000

class ImpulseSelectionTests(unittest.TestCase):
    def test_keeps_early_crack_when_pressure_crest_is_later_than_twenty_ms(self):
        x=np.zeros(RATE//2)
        t=np.arange(round(.1*RATE))/RATE
        body=(.16+.6*np.exp(-((t-.035)/.007)**2))*np.exp(-t/ .09)
        x[480:480+len(t)]=body*np.sin(2*np.pi*1733*t)
        starts=find_impulse_starts(x,RATE)
        self.assertEqual(len(starts),1)
        self.assertLess(starts[0],480)
        self.assertGreater(starts[0],400)

    def test_rejects_loud_tail_peak_without_a_new_quiet_boundary(self):
        x=np.zeros(RATE//2);t=np.arange(round(.4*RATE))/RATE
        amplitude=.15+.6*np.exp(-((t-.025)/.008)**2)+.5*np.exp(-((t-.26)/.008)**2)
        x[480:480+len(t)]=amplitude*np.sin(2*np.pi*1733*t)
        self.assertEqual(len(find_impulse_starts(x,RATE)),1)

    def test_selects_each_independent_attack_and_preserves_preroll(self):
        x=np.zeros(RATE);t=np.arange(round(.04*RATE))/RATE
        burst=np.sin(2*np.pi*1901*t)*np.exp(-t/.009)
        for at in [480,18000,36000]:x[at:at+len(burst)]=burst
        starts=find_impulse_starts(x,RATE)
        self.assertEqual(len(starts),3)
        for start,at in zip(starts,[480,18000,36000]):
            self.assertLess(start,at);self.assertLess(at-start,100)

    def test_fails_instead_of_silently_slicing_continuous_material(self):
        with self.assertRaises(ValueError):find_impulse_starts(np.ones(RATE),RATE)
        with self.assertRaises(ValueError):find_impulse_starts(np.zeros(RATE),RATE)

if __name__=='__main__':unittest.main()
