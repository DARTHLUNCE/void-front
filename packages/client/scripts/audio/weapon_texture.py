"""Offline, transient-preserving damping of pitched modes in short weapons.

Keep the physical attack and broad pressure body. Only unusually prominent
midrange modes in the body receive bounded cuts; no added noise or modulation.
"""
import numpy as np
from scipy import signal
from scipy.ndimage import median_filter


def damp_weapon_modes(x, rate):
    if len(x) < rate * .04 or np.max(np.abs(x)) < 1e-8:
        return x
    body = x[round(.012 * rate):min(len(x), round(.13 * rate))]
    size = min(4096, len(body))
    frequencies, power = signal.welch(body, rate, nperseg=size, noverlap=size // 2)
    db = 10 * np.log10(np.maximum(power, 1e-16))
    excess = db - median_filter(db, size=17, mode='nearest')
    peaks, _ = signal.find_peaks(excess, height=7, distance=3)
    peaks = [i for i in peaks if 140 < frequencies[i] < 5200 and db[i] > db.max() - 28]
    peaks = sorted(peaks, key=lambda i: excess[i], reverse=True)[:6]
    wet = x.copy()
    for i in peaks:
        frequency = frequencies[i]
        # Partial notches remove the bell's dominance, not all metal character.
        b, a = signal.iirnotch(frequency, np.clip(frequency / 95, 3, 16), fs=rate)
        cut_db = min(10, (excess[i] - 4) * .85)
        depth = 1 - 10 ** (-cut_db / 20)
        wet += depth * (signal.lfilter(b, a, wet) - wet)
    t = np.clip((np.arange(len(x)) / rate - .006) / .018, 0, 1)
    blend = t * t * (3 - 2 * t)
    return x + blend * (wet - x)
