"""Offline removal of the ringing partials in the armor-contact recording.

Keeps the recorded impact and debris, rather than replacing them with noise.
The early crack is retained; only narrow, dominant body resonances are damped.
This processor is deliberately opt-in for the armor cue, never the global mix.
"""
import numpy as np
from scipy import signal
from scipy.ndimage import gaussian_filter1d, median_filter


def damp_armor_ring(x, rate):
    if len(x) < round(rate * .045) or np.max(np.abs(x)) < 1e-9:
        return x.copy()
    size = round(rate * 2048 / 48000)
    hop = size // 8
    frequencies, _, spectrum = signal.stft(x, rate, nperseg=size, noverlap=size-hop)
    magnitude = np.abs(spectrum)
    # A local spectral floor distinguishes sustained plate notes from the broad
    # mechanical crack. Follow moving partials instead of notching fixed notes.
    floor = median_filter(magnitude, size=(17, 1), mode='reflect')
    gain = np.clip((floor * 1.5 + 1e-12) / np.maximum(magnitude, 1e-12), .025, 1)
    gain[(frequencies < 200) | (frequencies > 6500)] = 1
    gain = gaussian_filter1d(gain, .55, axis=1, mode='nearest')
    _, wet = signal.istft(spectrum * gain, rate, nperseg=size, noverlap=size-hop)
    wet = wet[:len(x)]
    u = np.clip((np.arange(len(x))/rate - .003)/.009, 0, 1)
    blend = u*u*(3-2*u)
    return x + (wet-x)*blend
