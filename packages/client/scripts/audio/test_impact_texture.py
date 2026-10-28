import unittest
import numpy as np
from impact_texture import damp_armor_ring


class ArmorRingTests(unittest.TestCase):
    def test_reduces_sustained_note_while_preserving_initial_crack(self):
        rate=48000
        t=np.arange(round(.29*rate))/rate
        rng=np.random.default_rng(7)
        x=.5*np.sin(2*np.pi*430*t)*np.exp(-t/0.07)
        x+=rng.normal(0,.12,len(t))*np.exp(-t/.012)
        wet=damp_armor_ring(x,rate)
        np.testing.assert_array_equal(wet[:144],x[:144])
        body=slice(round(.025*rate),round(.13*rate))
        self.assertLess(np.sum(wet[body]**2),np.sum(x[body]**2)*.12)
        self.assertEqual(wet.shape,x.shape)
        self.assertTrue(np.isfinite(wet).all())

    def test_silence_and_short_transients_are_unchanged(self):
        for x in (np.zeros(4800),np.array([.1,-.2,.1])):
            np.testing.assert_array_equal(damp_armor_ring(x,48000),x)

    def test_broadband_contact_keeps_its_body(self):
        rng=np.random.default_rng(19)
        t=np.arange(12000)/48000
        x=rng.normal(0,.1,len(t))*np.exp(-t/.07)
        wet=damp_armor_ring(x,48000)
        self.assertGreater(np.sum(wet*wet)/np.sum(x*x),.45)


if __name__=='__main__':
    unittest.main()
