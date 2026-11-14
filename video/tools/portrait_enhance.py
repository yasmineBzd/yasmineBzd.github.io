"""Professional finish for the cut-out portrait. No retouching of facial features: only
edge clean-up, tone, clarity, sharpening, a cool shadow grade and a soft rim light in the site's colours."""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
arr = np.asarray(im).astype(np.float64) / 255.0
rgb, a = arr[..., :3], arr[..., 3]
# 0. a clean studio edge: smooth the matte's fuzz, keep it crisp with a smoothstep
a = ndi.gaussian_filter(a, 1.8)
a = np.clip((a - 0.32) / 0.36, 0, 1)
a = a * a * (3 - 2 * a)

# 1. edge decontamination: semi-transparent edge pixels take the colour of the nearby subject,
#    so no beige wall fringe shows on the dark page
solid = (a > 0.97).astype(np.float64)
num = np.stack([ndi.gaussian_filter(rgb[..., c] * solid, 4) for c in range(3)], -1)
den = ndi.gaussian_filter(solid, 4)[..., None] + 1e-6
inner = num / den
edge = ((a > 0.01) & (a <= 0.97))[..., None]
rgb = np.where(edge, inner, rgb)

# 2. tone: gentle S-curve on luminance, slight lift of deep shadows
L = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
k = 0.22
L2 = L * (1 - k) + k * (3 * L ** 2 - 2 * L ** 3)
L2 = L2 + 0.025 * (1 - L2) ** 4
# 3. clarity: local contrast at a large radius, weighted toward mid-tones
blur = ndi.gaussian_filter(L2, 22)
mid = 1 - np.abs(L2 - 0.5) * 1.6
L3 = L2 + 0.22 * (L2 - blur) * np.clip(mid, 0.2, 1)
ratio = np.clip(L3 / (L + 1e-6), 0.6, 1.6)[..., None]
rgb = np.clip(rgb * ratio, 0, 1)

# 4. colour: neutralise a touch of the warm cast, gentle vibrance, cool the deep shadows
rgb[..., 0] *= 0.985
rgb[..., 2] *= 1.012
mx, mn = rgb.max(-1), rgb.min(-1)
sat = (mx - mn) / (mx + 1e-6)
grey = rgb.mean(-1, keepdims=True)
vib = (0.10 * (1 - sat))[..., None]
rgb = np.clip(grey + (rgb - grey) * (1 + vib), 0, 1)
Ln = (0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2])[..., None]
rgb = np.clip(rgb + (1 - Ln) ** 4 * np.array([-0.012, 0.004, 0.018]), 0, 1)

# 5. rim light: mint from the right (the hero helix side), blue from the left, inside the edge only
ab = ndi.gaussian_filter(a, 7)
gx = ndi.sobel(ab, axis=1)
gy = ndi.sobel(ab, axis=0)
mag = np.hypot(gx, gy) + 1e-6
band = np.clip(mag / np.percentile(mag[a > 0.5], 99.5), 0, 1)
band = ndi.gaussian_filter(band, 3) * a
right = np.clip(-gx / mag, 0, 1) * band
left = np.clip(gx / mag, 0, 1) * band
top = 1 - np.clip(np.arange(a.shape[0]) / a.shape[0] * 1.1, 0, 1)  # stronger on the hijab, fading down the blazer
top = (0.35 + 0.65 * top)[:, None]
mint = np.array([79, 227, 193]) / 255
blue = np.array([90, 169, 255]) / 255
light = right[..., None] * mint * 0.8 * top[..., None] + left[..., None] * blue * 0.55 * top[..., None]
rgb = 1 - (1 - rgb) * (1 - light)  # screen blend

out_img = Image.fromarray(np.dstack([rgb, a]).__mul__(255).round().astype(np.uint8), 'RGBA')

# 6. detail: fine sharpening on the colour, alpha untouched
r, g, b, al = out_img.split()
sharp = Image.merge('RGB', (r, g, b)).filter(ImageFilter.UnsharpMask(radius=1.3, percent=65, threshold=2))
out_img = Image.merge('RGBA', (*sharp.split(), al))
out_img.save(out)
print('ok', out_img.size)
