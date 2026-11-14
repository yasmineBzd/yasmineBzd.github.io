"""Original soundtrack for the portfolio video: a synthesized track plus sound effects synced to
what happens on screen. Everything is generated here (no samples), so there is nothing to license.
Usage: python audio.py <out.wav>"""
import sys
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
DUR = 48.3
N = int(SR * DUR)
rng = np.random.default_rng(20261109)

# ---- timeline (seconds), measured from the captured frames and the capture storyboard ----
T_TICKS = (0.05, 1.72)        # loader: reads stream, name decodes
T_DONE = 1.75                 # 100 %
T_SPLIT = (2.50, 2.95)        # loader opens like a strand
T_ZIP = (2.97, 4.85)          # helix zips shut from the top
T_HOVER = (5.2, 8.3)          # pointer unzips the helix
T_CLICKS = [8.6, 9.5]         # bursts
SCROLLS = [(9.8, 11.4), (13.2, 14.4), (16.2, 17.0), (19.0, 19.8), (22.0, 22.8), (24.6, 26.0), (30.6, 31.6), (33.0, 36.0), (37.0, 37.9), (39.9, 41.0)]
DECODES = [10.75, 13.45, 25.0, 33.7, 34.7, 35.6, 38.3, 41.4]
STEPS = [13.95, 16.6, 19.4, 22.4]  # process view changes
TYPING = [(25.45, 26.15), (27.75, 28.5)]
CODON_POPS = (27.75, 28.5)
UI_CLICKS = [27.7, 43.2]
T_COPIED = 43.25
T_END = 44.1                  # end card

# ---- music grid: 16 bars from the hero's entrance to the end card ----
T0 = 3.2
BAR = (T_END - T0) / 16       # 2.38 s -> 100.8 BPM
BEAT = BAR / 4
S16 = BEAT / 4


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(n):
    return np.arange(n) / SR


def pan_st(x, pan):
    a = (pan + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1)


def add(buf, t, x, gain=1.0, pan=0.0):
    if x.ndim == 1:
        x = pan_st(x, pan)
    i = int(round(t * SR))
    if i >= len(buf):
        return
    if i < 0:
        x = x[-i:]
        i = 0
    n = min(len(x), len(buf) - i)
    buf[i:i + n] += x[:n] * gain


def sos(kind, f, order=2):
    return signal.butter(order, f, kind, fs=SR, output='sos')


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x)


def sweep(x, kind, f0, f1, block=256, order=2, curve=1.0):
    """Filter whose cutoff glides from f0 to f1 (log scale) across the signal."""
    out = np.zeros_like(x)
    nb = int(np.ceil(len(x) / block))
    zi = None
    for b in range(nb):
        u = (b / max(1, nb - 1)) ** curve
        f = f0 * (f1 / f0) ** u
        if kind == 'band':
            f = (max(30, f * 0.7), min(SR / 2 - 100, f * 1.4))
        s = sos(kind, f, order)
        if zi is None:
            zi = np.zeros((s.shape[0], 2))
        seg = x[b * block:(b + 1) * block]
        y, zi = signal.sosfilt(s, seg, zi=zi)
        out[b * block:b * block + len(seg)] = y
    return out


def noise(n):
    return rng.standard_normal(n)


def env(n, a=0.005, d=0.2):
    t = tt(n)
    e = np.exp(-t / d)
    na = max(1, int(a * SR))
    e[:na] *= np.linspace(0, 1, na)
    return e


def saw(f, n, ph=0.0):
    return 2 * ((f * tt(n) + ph) % 1.0) - 1


def reverb_ir(seconds, damp, seed):
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = tt(n)
    ir = np.zeros((n, 2))
    for c in range(2):
        x = r.standard_normal(n) * np.exp(-t / (seconds / 6.5))
        ir[:, c] = filt(x, 'low', damp)
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))[:, None]
    return ir / np.sqrt((ir ** 2).sum(axis=0))[None, :]


def reverb(x, ir):
    y = np.zeros((len(x) + len(ir) - 1, 2))
    for c in range(2):
        y[:, c] = signal.fftconvolve(x[:, c], ir[:, c])
    return y[: len(x)]


# =========================================================================================
# MUSIC
# =========================================================================================
music = np.zeros((N, 2))
pads = np.zeros((N, 2))
bass_bus = np.zeros((N, 2))
arp_bus = np.zeros((N, 2))
drums = np.zeros((N, 2))

CHORDS = [  # A minor: Am(add9) - Fmaj7 - C/E - G(add9)
    {'pad': [57, 60, 64, 71], 'bass': 45},
    {'pad': [53, 57, 60, 64], 'bass': 41},
    {'pad': [52, 55, 60, 64], 'bass': 40},
    {'pad': [55, 59, 62, 69], 'bass': 43},
]


def section(bar):
    if bar < 3:
        return 'verse'
    if bar < 9:
        return 'full'
    if bar < 12:
        return 'break'
    return 'full2'


def pad_voice(m, n, bright):
    f = midi(m)
    x = sum(saw(f * 2 ** (d / 1200), n, ph) for d, ph in ((-7, 0.0), (0, 0.33), (7, 0.66))) / 3
    return filt(x, 'low', bright)


# intro pad: Am, filter opening while the loader runs
n = int((T0 + 0.6) * SR)
x = sum(pad_voice(m, n, 4000) for m in CHORDS[0]['pad']) / 4
x = sweep(x, 'low', 260, 1800, curve=1.6)
e = np.minimum(1, tt(n) / 1.2) * np.clip((T0 + 0.6 - tt(n)) / 0.6, 0, 1)
add(pads, 0, x * e * 0.55, pan=0)

for bar in range(16):
    t = T0 + bar * BAR
    ch = CHORDS[bar % 4]
    sec = section(bar)
    # pad, held a little past the bar so chords overlap
    n = int((BAR + 0.7) * SR)
    bright = {'verse': 1500, 'full': 2600, 'break': 1300, 'full2': 3200}[sec]
    x = sum(pad_voice(m, n, bright) for m in ch['pad']) / 4
    tn = tt(n)
    e = np.minimum(1, tn / 0.25) * np.clip((BAR + 0.7 - tn) / 0.7, 0, 1)
    add(pads, t, x * e * (0.5 if sec != 'break' else 0.62), pan=0)

    # bass: eighth-note pulse (quarter notes in the break)
    step = BEAT / 2 if sec != 'break' else BEAT
    k = 0
    while k * step < BAR - 1e-6:
        nn = int(min(step, 0.5) * SR)
        f = midi(ch['bass'])
        b = filt(saw(f, nn), 'low', 620) * 0.6 + np.sin(2 * np.pi * f * tt(nn)) * 0.55
        acc = 1.0 if k % 2 == 0 else 0.7
        add(bass_bus, t + k * step, b * env(nn, 0.004, 0.22) * acc * (0.5 if sec == 'break' else 0.62))
        k += 1

    # arpeggio: sixteenths over the chord, an octave up
    tones = [m + 12 for m in ch['pad']]
    order = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 0, 3, 1]
    if bar >= 1:
        vol = {'verse': 0.16, 'full': 0.2, 'break': 0.26, 'full2': 0.22}[sec]
        for s in range(16):
            m = tones[order[s] % 4]
            nn = int(0.32 * SR)
            f = midi(m)
            v = np.sin(2 * np.pi * f * tt(nn)) + 0.28 * np.sin(4 * np.pi * f * tt(nn)) + 0.08 * filt(saw(f, nn), 'low', 3000)
            add(arp_bus, t + s * S16, v * env(nn, 0.002, 0.11) * vol * (1.0 if s % 4 == 0 else 0.75), pan=0.35 if s % 2 else -0.35)


# drums
def kick(n=int(0.45 * SR)):
    t = tt(n)
    f = 46 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.17)
    click = filt(noise(n), 'high', 2500) * np.exp(-t / 0.004) * 0.35
    return body + click


def clap():
    n = int(0.5 * SR)
    t = tt(n)
    x = filt(noise(n), 'band', (900, 5200))
    e = np.exp(-t / 0.14) * 0.8
    for off in (0.0, 0.011, 0.022):
        e += np.where(t >= off, np.exp(-(t - off) / 0.006), 0)
    return x * e * 0.5


def hat(open_=False):
    n = int((0.35 if open_ else 0.08) * SR)
    return filt(noise(n), 'high', 7200) * env(n, 0.001, 0.12 if open_ else 0.025) * 0.35


def crash():
    n = int(4.2 * SR)
    x = filt(noise(n), 'high', 3500) * env(n, 0.002, 1.4)
    ring = sum(np.sin(2 * np.pi * f * tt(n)) for f in (3520, 4687, 6211)) * env(n, 0.002, 0.9) * 0.05
    return (x + ring) * 0.45


kick_env = np.zeros(N)
K = kick()
CL = clap()
for bar in range(16):
    t = T0 + bar * BAR
    sec = section(bar)
    if sec == 'break':
        for s in range(16):
            if s % 4 == 2:
                add(drums, t + s * S16, hat(), 0.55, pan=0.25)
        continue
    kicks = [0, 2] if sec == 'verse' else [0, 1.75, 2, 3.5] if bar % 2 else [0, 2, 2.75]
    for b in kicks:
        add(drums, t + b * BEAT, K, 0.95)
        i = int((t + b * BEAT) * SR)
        m = min(N - i, int(0.3 * SR))
        if m > 0:
            kick_env[i:i + m] = np.maximum(kick_env[i:i + m], np.exp(-tt(m) / 0.12))
    if sec != 'verse':
        for b in (1, 3):
            add(drums, t + b * BEAT, CL, 0.85, pan=0.05)
    hats = range(0, 16, 2) if sec == 'verse' else range(16)
    for s in hats:
        acc = 0.9 if s % 4 == 2 else 0.55
        add(drums, t + s * S16, hat(open_=(s % 8 == 6 and sec != 'verse')), acc, pan=0.25 if s % 2 else -0.15)

# build into the end card: noise riser and a snare roll
t_r = T0 + 15 * BAR
n = int((T_END - t_r) * SR)
r = sweep(noise(n), 'band', 400, 9000, curve=1.4) * np.linspace(0, 1, n) ** 2 * 0.5
add(drums, t_r, r, 1.0)
t = t_r + BAR / 2
k = 0
while t < T_END - 0.02:
    add(drums, t, CL * 0.6, 0.3 + 0.7 * (t - t_r) / (T_END - t_r), pan=0.1 if k % 2 else -0.1)
    k += 1
    t += S16 if t < t_r + BAR * 0.8 else S16 / 2

# end hit: kick, crash, held Am(add9) with a long tail
add(drums, T_END, K, 1.1)
add(drums, T_END, crash(), 1.0)
n = int((DUR - T_END + 0.5) * SR)
x = sum(pad_voice(m, n, 2400) for m in [45, 57, 64, 71, 76]) / 5
add(pads, T_END, x * env(n, 0.01, 2.2) * 0.9)
n = int(3.5 * SR)
bell = sum(np.sin(2 * np.pi * midi(m) * tt(n)) * a for m, a in ((81, 0.5), (88, 0.3), (93, 0.2)))
add(arp_bus, T_END, bell * env(n, 0.003, 1.2) * 0.22)

# sidechain: pads and bass breathe with the kick
duck = (1 - 0.55 * kick_env)[:, None]
music = (pads * duck) + (bass_bus * (1 - 0.35 * kick_env)[:, None]) + drums

# arp ping-pong delay (dotted eighth)
dl = int(BEAT * 0.75 * SR)
arp_wet = np.zeros_like(arp_bus)
src = arp_bus.copy()
for i in range(1, 5):
    shifted = np.zeros_like(src)
    shifted[dl * i:] = src[:-dl * i]
    g = 0.42 ** i
    if i % 2:
        arp_wet[:, 0] += shifted[:, 1] * g
        arp_wet[:, 1] += shifted[:, 0] * g
    else:
        arp_wet += shifted * g
music += arp_bus + filt(arp_wet.T, 'low', 4500).T * 0.8

IR_M = reverb_ir(2.6, 5200, 1)
music = music + reverb(pads * 0.35 + arp_bus * 0.5 + drums * 0.12, IR_M) * 0.55

# =========================================================================================
# SOUND EFFECTS
# =========================================================================================
sfx = np.zeros((N, 2))
PENTA = [69, 72, 74, 76, 79]  # A minor pentatonic


def blip(f, d=0.025, shape='sine'):
    n = int((d + 0.02) * SR)
    x = np.sin(2 * np.pi * f * tt(n)) if shape == 'sine' else np.sign(np.sin(2 * np.pi * f * tt(n))) * 0.5
    return x * env(n, 0.001, d)


# 1. loader: data ticks and a rising carrier, then a chime at 100 %
t = T_TICKS[0]
while t < T_TICKS[1]:
    f = midi(rng.choice(PENTA) + 12 * rng.integers(1, 3))
    add(sfx, t, blip(f, 0.018), 0.12 + 0.1 * (t / T_TICKS[1]), pan=rng.uniform(-0.6, 0.6))
    t += rng.uniform(0.04, 0.075)
n = int((T_TICKS[1] - T_TICKS[0]) * SR)
f = np.linspace(220, 880, n)
add(sfx, T_TICKS[0], np.sin(2 * np.pi * np.cumsum(f) / SR) * np.linspace(0, 1, n) ** 1.5 * 0.05)
for i, m in enumerate((81, 88)):
    nn = int(1.2 * SR)
    add(sfx, T_DONE + i * 0.09, (np.sin(2 * np.pi * midi(m) * tt(nn)) + 0.3 * np.sin(4 * np.pi * midi(m) * tt(nn))) * env(nn, 0.002, 0.35), 0.18, pan=-0.2 + 0.4 * i)

# 2. the split: a whoosh opening upward, a low thump as the hero appears
n = int(0.9 * SR)
w = sweep(noise(n), 'band', 300, 6000, curve=0.8) * np.sin(np.linspace(0, np.pi, n)) ** 2
add(sfx, T_SPLIT[0] - 0.15, w, 0.45)
n = int(0.6 * SR)
tn = tt(n)
add(sfx, T_SPLIT[1], np.sin(2 * np.pi * np.cumsum(70 + 60 * np.exp(-tn / 0.05)) / SR) * np.exp(-tn / 0.25), 0.55)

# 3. the zip: fast teeth clicks whose pitch falls as the helix closes
t = T_ZIP[0]
while t < T_ZIP[1]:
    u = (t - T_ZIP[0]) / (T_ZIP[1] - T_ZIP[0])
    nn = int(0.012 * SR)
    tooth = filt(noise(nn), 'band', (1800 - 900 * u, 5200 - 2200 * u)) * env(nn, 0.0005, 0.003)
    add(sfx, t, tooth, 0.33 * (0.5 + 0.5 * np.sin(np.pi * u)), pan=-0.5 + u)
    t += 0.012 + 0.006 * u + rng.uniform(0, 0.003)

# 4. hovering: glassy notes as base pairs come apart, over a soft fizz
t = T_HOVER[0]
while t < T_HOVER[1]:
    m = rng.choice(PENTA) + 12 * rng.integers(1, 3)
    nn = int(0.9 * SR)
    f = midi(m)
    g = (np.sin(2 * np.pi * f * tt(nn)) + 0.35 * np.sin(2 * np.pi * f * 2.76 * tt(nn)) * np.exp(-tt(nn) / 0.08)) * env(nn, 0.002, 0.28)
    add(sfx, t, g, 0.15, pan=rng.uniform(-0.7, 0.7))
    t += rng.uniform(0.09, 0.17)
n = int((T_HOVER[1] - T_HOVER[0]) * SR)
fz = filt(noise(n), 'band', (3000, 9000)) * np.sin(np.linspace(0, np.pi, n)) * 0.04
add(sfx, T_HOVER[0], fz)

# 5. bursts: boom, crack, flying shards
for tc in T_CLICKS:
    n = int(0.9 * SR)
    tn = tt(n)
    boom = np.sin(2 * np.pi * np.cumsum(40 + 90 * np.exp(-tn / 0.06)) / SR) * np.exp(-tn / 0.35)
    crack = filt(noise(n), 'high', 1800) * np.exp(-tn / 0.05)
    add(sfx, tc, boom * 0.7 + crack * 0.35)
    for k in range(9):
        m = rng.choice(PENTA) + 24
        nn = int(0.6 * SR)
        f = midi(m) * rng.uniform(0.99, 1.01)
        s = np.sin(2 * np.pi * f * tt(nn)) * env(nn, 0.001, 0.12)
        add(sfx, tc + 0.02 + k * rng.uniform(0.02, 0.05), s, 0.09, pan=rng.uniform(-0.9, 0.9))

# 6. scroll whooshes, shaped to each scroll
for a, b in SCROLLS:
    d = b - a
    n = int((d + 0.3) * SR)
    up = rng.random() < 0.5
    w = sweep(noise(n), 'band', 500 if up else 3500, 3500 if up else 500, curve=1.0)
    shape = np.sin(np.linspace(0, np.pi, n)) ** 3
    st = np.stack([w * shape * np.linspace(1, 0.4, n), w * shape * np.linspace(0.4, 1, n)], axis=1)
    add(sfx, a - 0.05, st, 0.16 + 0.04 * min(d, 2))

# 7. decoding headings: digital chirps
for td in DECODES:
    t = td
    while t < td + 0.8:
        f = rng.uniform(1800, 5200)
        add(sfx, t, blip(f, 0.012, 'square'), 0.05, pan=rng.uniform(-0.5, 0.5))
        t += rng.uniform(0.022, 0.05)

# 8. process steps: a tick and a bell, one note higher each step
for i, ts in enumerate(STEPS):
    add(sfx, ts, filt(noise(int(0.02 * SR)), 'band', (2000, 6000)) * env(int(0.02 * SR), 0.0005, 0.004), 0.4)
    nn = int(1.4 * SR)
    f = midi([76, 79, 81, 84][i])
    add(sfx, ts + 0.01, (np.sin(2 * np.pi * f * tt(nn)) + 0.2 * np.sin(2 * np.pi * f * 3.01 * tt(nn))) * env(nn, 0.002, 0.45), 0.14, pan=0.2)

# 9. the lab: keys while the Python types out, small pops as codons appear
def keyclick():
    nn = int(0.03 * SR)
    return filt(noise(nn), 'band', (1500, 7000)) * env(nn, 0.0003, 0.005) + np.sin(2 * np.pi * rng.uniform(380, 520) * tt(nn)) * env(nn, 0.0005, 0.008) * 0.4


for a, b in TYPING:
    t = a
    while t < b:
        add(sfx, t, keyclick(), 0.45, pan=rng.uniform(-0.3, 0.3))
        t += 0.055 + rng.uniform(-0.008, 0.008)
t = CODON_POPS[0]
i = 0
while t < CODON_POPS[1]:
    nn = int(0.05 * SR)
    tn = tt(nn)
    pop = np.sin(2 * np.pi * np.cumsum(500 + 900 * (tn / 0.05)) / SR) * env(nn, 0.0005, 0.012)
    add(sfx, t, pop, 0.08, pan=-0.6 + 1.2 * (i % 14) / 13)
    t += 0.036
    i += 1

# 10. button clicks
for tc in UI_CLICKS:
    nn = int(0.04 * SR)
    add(sfx, tc, filt(noise(nn), 'band', (1200, 6000)) * env(nn, 0.0003, 0.006) + np.sin(2 * np.pi * 1600 * tt(nn)) * env(nn, 0.0005, 0.01) * 0.5, 0.45)

# 11. address copied: two-note confirmation
for i, m in enumerate((88, 93)):
    nn = int(0.9 * SR)
    add(sfx, T_COPIED + i * 0.1, np.sin(2 * np.pi * midi(m) * tt(nn)) * env(nn, 0.002, 0.25), 0.16, pan=-0.15 + 0.3 * i)

IR_S = reverb_ir(1.7, 7000, 2)
sfx = sfx + reverb(sfx, IR_S) * 0.35

# =========================================================================================
# MIX
# =========================================================================================
music = filt(music.T, 'high', 38, order=4).T
def db(x):
    return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
for name, (a, b) in {'loader': (0.05, 2.4), 'hover': T_HOVER, 'burst': (8.55, 9.9), 'process': (14, 24.5), 'lab-typing': (27.7, 28.6), 'end': (41.3, 43)}.items():
    i, j = int(a * SR), int(b * SR)
    print(f'{name:11s} music {db(music[i:j] * 0.62):6.1f} dB   sfx {db(sfx[i:j]):6.1f} dB')
mix = music * 0.62 + sfx * 1.0
# fade in the first 40 ms and out over the last 1.4 s (the picture fades in its last 0.5 s)
fi = int(0.04 * SR)
mix[:fi] *= np.linspace(0, 1, fi)[:, None]
fo = int(1.4 * SR)
mix[-fo:] *= (np.linspace(1, 0, fo) ** 1.5)[:, None]
# gentle glue: soft saturation, then peak normalise
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix = mix / np.max(np.abs(mix)) * 0.9
wavfile.write(sys.argv[1], SR, (mix * 32767).astype(np.int16))
print('ok', f'bar={BAR:.4f}s bpm={60 / BEAT:.2f}')
