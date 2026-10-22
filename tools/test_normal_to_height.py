"""Check reconstructed gradients and free boundaries on known surfaces."""
import unittest
import numpy as np
from normal_to_height import integrate

class IntegrationTests(unittest.TestCase):
    def test_flat(self):
        h,r=integrate(np.zeros((24,32,2)),np.ones((24,32),bool))
        self.assertEqual(float(h.max()),0)
    def test_ramp_direction(self):
        g=np.zeros((24,32,2)); g[:,:,0]=.4; g[:,:,1]=-.2
        h,r=integrate(g,np.ones((24,32),bool),screen=1e-8)
        self.assertLess(np.max(np.abs(np.diff(h,axis=1)-.4)),.001)
        self.assertLess(np.max(np.abs(np.diff(h,axis=0)+.2)),.001)
    def test_dome_with_hole(self):
        y,x=np.mgrid[-24:25,-24:25]; h=5*np.exp(-(x*x+y*y)/180)
        g=np.stack((-x*h/90,-y*h/90),axis=2); mask=x*x+y*y<23**2; mask[10:15,20:25]=False
        recovered,r=integrate(g,mask,screen=1e-8); expected=h-h[mask].min()
        self.assertLess(np.sqrt(np.mean((recovered[mask]-expected[mask])**2)),.03)
        self.assertTrue(np.all(recovered[~mask]==0))
    def test_disconnected(self):
        mask=np.zeros((30,40),bool); mask[2:12,2:12]=True; mask[18:28,28:38]=True
        g=np.zeros((30,40,2)); g[:15,:,0]=.3; g[15:,:,1]=-.3
        h,r=integrate(g,mask,screen=1e-8)
        self.assertGreater(h[5,10],h[5,3]); self.assertGreater(h[20,30],h[26,30])
    def test_bad_input(self):
        with self.assertRaises(ValueError): integrate(np.zeros((3,3,2)),np.zeros((3,3),bool))
        with self.assertRaises(ValueError): integrate(np.full((3,3,2),np.nan),np.ones((3,3),bool))

if __name__=='__main__': unittest.main()
