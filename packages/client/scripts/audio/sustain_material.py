"""Steady recorded texture, excluding the source's performed starts/stops.

Windowed overlap-add is done offline. Candidate grains are selected for stable
level AND spectrum; a zero-crossing loop join alone cannot remove a motor rev.
"""
from functools import lru_cache
import numpy as np
from scipy import signal
from scipy.ndimage import uniform_filter1d, gaussian_filter1d

RATE = 96000


class SustainMaterial:
    def __init__(self, materials):
        self.materials = materials

    @lru_cache(maxsize=64)
    def analysis(self, key):
        x = self.materials.read(key)
        low = signal.resample_poly(x, 1, 8)
        frequencies, times, spectrum = signal.stft(low, 12000, nperseg=512, noverlap=256, boundary=None)
        bands = np.array([np.sum(np.abs(spectrum[(frequencies >= lo) & (frequencies < hi)]) ** 2, axis=0)
                          for lo, hi in [(30, 180), (180, 650), (650, 2200), (2200, 5900)]])
        energy = np.sum(bands, axis=0)
        features = np.log(np.maximum(bands, 1e-12))
        return x, times, energy, features

    def take(self, key, duration, rng, speed):
        self.materials.used.add(key)
        x, times, energy, features = self.analysis(key)
        speed = float(np.clip(speed, .12, 3))
        # About half a second of output per grain. Never replay a full tool
        # operation. Slow playback must still select a steady source interval.
        grain = min(round(.52 * RATE), max(round(.07 * RATE), int(len(x) * .22 / speed)))
        need = round(grain * speed) + 4
        half_frames = max(2, round((need / RATE) / (256 / 12000)))
        mean = uniform_filter1d(features, half_frames, axis=1, mode='nearest')
        variance = np.maximum(0, uniform_filter1d(features ** 2, half_frames, axis=1, mode='nearest') - mean ** 2).mean(axis=0)
        valid = (times > need / RATE) & (times < len(x) / RATE - need / RATE) & (energy > np.quantile(energy, .55) * .45)
        choices = np.flatnonzero(valid)
        if not len(choices):
            raise ValueError(f'No steady interior material in {key}; use a different recording')
        choices = choices[np.argsort(variance[choices])[:max(4, len(choices) // 8)]]
        # Keep grains in one operating state; a mix of two stable but different
        # motor speeds still sounds like a periodically restarting engine.
        anchor = features[:, choices[0]]
        similarity = np.mean((features[:, choices] - anchor[:, None]) ** 2, axis=0)
        choices = choices[np.argsort(similarity)[:max(3, len(choices) // 3)]]
        n = round(duration * RATE)
        out = np.zeros(n + grain * 2); weight = np.zeros_like(out)
        window = np.hanning(grain)
        at = 0
        while at < n + grain:
            center = int(times[int(rng.choice(choices))] * RATE)
            start = max(0, min(len(x) - need, center - need // 2))
            positions = start + np.arange(grain) * speed
            block = np.interp(positions, np.arange(start, start + need), x[start:start + need])
            rms = max(1e-7, np.sqrt(np.mean(block * block)))
            block *= min(5, .16 / rms)
            out[at:at + grain] += block * window
            weight[at:at + grain] += window ** 2
            at += int(grain * rng.uniform(.27, .34))
        # Trim the construction entrance. This is a running texture, not a
        # repeated fade-in. Equal-energy normalization avoids grain pumping.
        a = grain
        result = out[a:a + n] / np.sqrt(np.maximum(.1, weight[a:a + n]))
        rms = np.sqrt(np.maximum(1e-8, uniform_filter1d(result ** 2, round(.12 * RATE))))
        control_at = np.arange(0, len(rms), 960)
        control = gaussian_filter1d(np.clip(np.median(rms) / rms[control_at], .6, 1.65), 2)
        gain = np.interp(np.arange(len(rms)), control_at, control)
        return result * gain


def process_sustain(x, kind):
    from foundry import filter_audio, multiband, resonances, comb_sweep
    # Keep each material's coloration, remove the long one-way filter and
    # pitch performances used by one-shots. Texture varies inside the source.
    if kind == 'pressure': return filter_audio(multiband(x, (1.5, 2, 1)), 24, 920)
    if kind == 'warm': return filter_audio(multiband(x, (1.4, 1.4, 1)), 40, 4200)
    if kind == 'iron': return filter_audio(multiband(x, (1.2, 3.5, 1.2)), 25, 7200)
    if kind == 'radio': return filter_audio(comb_sweep(x, 1.2, .2), 420, 3800)
    if kind == 'plasma': return resonances(multiband(x, (1.4, 4.6, 1.2)), (137, 413, 1291), .34)
    if kind == 'magnetic': return resonances(multiband(x, (1.2, 3.1, 1.3)), (79, 221, 701, 1387), .42)
    if kind == 'glass': return comb_sweep(resonances(x, (773, 1457, 2371), .28), 1.7, .18)
    if kind == 'coil': return comb_sweep(multiband(x, (1, 2.6, 1.2)), 1.35, .32)
    if kind == 'servo': return comb_sweep(multiband(x, (1, 2, 1.1)), .85, .23)
    if kind == 'shear': return resonances(filter_audio(x, 90, 7200), (181, 533, 1627), .4)
    if kind == 'grain': return multiband(comb_sweep(x, 2.1, .16), (1, 2.2, 1.5))
    if kind == 'raw': return x
    raise ValueError(f'Unreviewed sustain processor: {kind}')
