# Builds the film plates from source/key-visual.webp: removes the baked headline, cuts out the watch,
# extends the plate for 9:16 and 16:9 reframing, and picks crystal glint points.
# Run from this folder: python3 prepare_plates.py
import os
os.makedirs('build', exist_ok=True)

# ---------- 1. inpaint the headline
import cv2, numpy as np
src = cv2.imread('source/key-visual.webp', cv2.IMREAD_COLOR)
H, W = src.shape[:2]
gray = cv2.cvtColor(src, cv2.COLOR_BGR2GRAY).astype(np.float32)
# --- 1. remove the baked-in headline (FOSSIL / tagline / rule) so the film can animate it
mask = np.zeros((H, W), np.uint8)
region = np.zeros((H, W), np.uint8)
region[205:320, 130:600] = 1   # FOSSIL
region[348:392, 95:615] = 1    # tagline
region[415:436, 285:400] = 1   # hairline
bg = cv2.GaussianBlur(gray, (0, 0), 25)
text = ((gray - bg) > 18) & (region > 0)
mask[text] = 255
mask = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=2)
clean = cv2.inpaint(src, mask, 12, cv2.INPAINT_TELEA)
# soften the patched zone so no letter ghosts remain, keep grain
soft = cv2.GaussianBlur(clean, (0, 0), 6)
feather = cv2.GaussianBlur((region * 255).astype(np.uint8), (0, 0), 10).astype(np.float32)[..., None] / 255.0
clean = (clean * (1 - feather) + soft * feather).astype(np.uint8)
rng = np.random.default_rng(7)
noise = rng.normal(0, 2.2, clean.shape).astype(np.float32)
clean = np.clip(clean.astype(np.float32) + noise * feather, 0, 255).astype(np.uint8)
cv2.imwrite('build/clean.png', clean)
print('masked px', int((mask > 0).sum()))

# ---------- 2. watch matte
import cv2, numpy as np
im = cv2.imread('build/clean.png')
H, W = im.shape[:2]
# --- watch matte (GrabCut) for the end card float and the light sweep
mask = np.full((H, W), cv2.GC_BGD, np.uint8)
rect = (580, 190, 1120 - 580, 1105 - 190)
mask[180:1105, 540:1125] = cv2.GC_PR_BGD
# probable foreground: an ellipse on the head + a band on the bracelets
head = np.zeros((H, W), np.uint8)
cv2.ellipse(head, (832, 598), (218, 215), 0, 0, 360, 1, -1)
cv2.rectangle(head, (730, 215), (1000, 400), 1, -1)
cv2.rectangle(head, (730, 800), (990, 1095), 1, -1)
mask[head > 0] = cv2.GC_PR_FGD
core = np.zeros((H, W), np.uint8)
cv2.ellipse(core, (816, 600), (238, 220), 0, 0, 360, 1, -1)
cv2.rectangle(core, (700, 330), (760, 420), 1, -1)
mask[core > 0] = cv2.GC_FGD
bgd = np.zeros((H, W, 1), np.float64); fgd = np.zeros((1, 65), np.float64); bgm = np.zeros((1, 65), np.float64)
cv2.grabCut(im, mask, None, bgm, fgd, 6, cv2.GC_INIT_WITH_MASK)
m = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
# keep largest component, close holes
n, lab, stats, _ = cv2.connectedComponentsWithStats(m)
if n > 1:
    big = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA]); m = np.where(lab == big, 255, 0).astype(np.uint8)
m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
# fade the bottom where the bracelet meets its reflection
ys = np.arange(H)[:, None].astype(np.float32)
fade = np.clip((1100 - ys) / 90.0, 0, 1)
mf = cv2.GaussianBlur(m, (0, 0), 2.2).astype(np.float32) / 255 * fade
cv2.imwrite('build/matte.png', (mf * 255).astype(np.uint8))

# ---------- 3. plate, cut-out, marble, glints
import cv2, numpy as np, json
im = cv2.imread('build/clean.png'); H, W = im.shape[:2]
m = cv2.imread('build/matte.png', 0)
PT, PB, PL, PR = 380, 240, 660, 660
# --- extended plate: reflect, blur the pads hard, feather into the photo, darken towards the far edges
big = cv2.copyMakeBorder(im, PT, PB, PL, PR, cv2.BORDER_REFLECT)
blur = cv2.GaussianBlur(big, (0, 0), 45)
inner = np.zeros(big.shape[:2], np.float32); inner[PT:PT+H, PL:PL+W] = 1
inner = cv2.GaussianBlur(inner, (0, 0), 28)
inner[PT+60:PT+H-60, PL+60:PL+W-60] = 1
out = big * inner[..., None] + blur * (1 - inner[..., None])
BH, BW = big.shape[:2]
yy, xx = np.mgrid[0:BH, 0:BW].astype(np.float32)
dx = np.maximum(0, np.maximum(PL - xx, xx - (PL + W))) / PL
dy = np.maximum(0, np.maximum(PT - yy, yy - (PT + H))) / PT
dark = np.clip(1 - 0.55 * np.sqrt(dx**2 + dy**2), 0.35, 1)
out = np.clip(out * dark[..., None], 0, 255).astype(np.uint8)
cv2.imwrite('assets/plate.jpg', out, [cv2.IMWRITE_JPEG_QUALITY, 90])
# --- watch cut-out (RGBA), cropped
x0, y0, x1, y1 = 540, 180, 1125, 1105
rgba = cv2.cvtColor(im, cv2.COLOR_BGR2BGRA); rgba[..., 3] = m
cv2.imwrite('assets/watch.png', rgba[y0:y1, x0:x1])
# --- marble texture for the end card
mar = im[880:1254, 380:1254]
mar = cv2.GaussianBlur(mar, (0, 0), 3)
cv2.imwrite('assets/marble.jpg', mar, [cv2.IMWRITE_JPEG_QUALITY, 85])
# --- crystal highlight points (for glints): top-hat on luminance inside the matte
g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
th = cv2.morphologyEx(g, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
th = cv2.GaussianBlur(th, (3, 3), 0)
dil = cv2.dilate(th, np.ones((9, 9), np.uint8))
peaks = (th == dil) & (th > 38) & (m > 200) & (g > 200)
ys, xs = np.nonzero(peaks)
pts = sorted([[int(x), int(y), int(th[y, x])] for x, y in zip(xs, ys)], key=lambda p: -p[2])
json.dump({'plate': {'w': BW, 'h': BH, 'padL': PL, 'padT': PT}, 'watch': {'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0}, 'glints': pts}, open('build/meta.json', 'w'))
print(BW, BH, len(pts))

# --- pick glint points for the bezel and the pavé links → assets/meta.min.json, meta.js
import math
g = pts
bz = [p for p in g if 0.84 < math.hypot((p[0] - 816) / 238, (p[1] - 600) / 220) < 1.06]
pv = [p for p in g if 770 <= p[0] <= 885 and 840 <= p[1] <= 1105]
pu = [p for p in g if 770 <= p[0] <= 900 and 200 <= p[1] <= 370]
out = {'plate': {'w': BW, 'h': BH, 'padL': PL, 'padT': PT}, 'watch': {'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0},
       'bezel': [p[:2] for p in sorted(bz, key=lambda p: -p[2])[:70]], 'pave': [p[:2] for p in sorted(pv, key=lambda p: -p[2])[:60]],
       'paveUp': [p[:2] for p in sorted(pu, key=lambda p: -p[2])[:30]]}
s = json.dumps(out, separators=(',', ':'))
open('assets/meta.min.json', 'w').write(s)
open('meta.js', 'w').write('window.FILM = { meta: ' + s + ' };\n')
