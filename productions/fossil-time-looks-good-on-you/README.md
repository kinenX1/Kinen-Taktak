# FOSSIL — "Time Looks Good On You" · 20 s motion ad

A cinematic motion-graphics spot for the FOSSIL women's crystal chronograph. It follows the 7-shot storyboard at 80 BPM and delivers 9:16 (master), 1:1 and 16:9 cuts with the same timing.

The design system for this spot (tokens, brand book, animated UI components and the three web cuts) is the **FOSSIL Motion** design system artifact.

## What's here

| File | What |
| --- | --- |
| `film.html`, `engine.js`, `film.css` | The film. `engine.js` is deterministic: `FossilFilm.render(t)` draws the exact frame for time `t`, so the same code plays live and exports masters. |
| `meta.js`, `assets/meta.min.json` | Plate geometry and the crystal glint points picked from the key visual. |
| `assets/plate.jpg` | The key visual with the baked headline removed, extended for 9:16 and 16:9. |
| `assets/watch.png` | The watch cut out, for the match-cut, the end-card float and the light sweeps. |
| `assets/marble.jpg` | End-card marble texture. |
| `assets/Montserrat-Variable.woff2` | Montserrat, SIL Open Font License. |
| `source/key-visual.webp` | The client key visual, the product truth. |
| `prepare_plates.py` | Rebuilds every file in `assets/` except the font from `source/key-visual.webp` (OpenCV). |
| `audio.py` | Synthesises the score to `out/score.wav`: ticks, pad, piano, shimmers and the logo boom (numpy). |
| `render.js` | Renders a format frame by frame with Playwright and pipes it to ffmpeg (H.264). |

## Render

```bash
cd productions/fossil-time-looks-good-on-you
python3 audio.py                                   # → out/score.wav
python3 -m http.server 8765 &                      # serve this folder
export FFMPEG=/path/to/ffmpeg                      # needs libx264 (pip install imageio-ffmpeg works)
node render.js 916 out/v916.mp4                    # 1080×1920, 24 fps; also: 11, 169
SCALE=2 node render.js 916 out/v916-4k.mp4         # 4K master (2160×3840)
$FFMPEG -i out/v916.mp4 -i out/score.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart out/FOSSIL_TimeLooksGood_9x16.mp4
```

Open `film.html?f=916&t=12.8` in a browser to see any single frame.

## Storyboard

| Shot | Time | Interface |
| --- | --- | --- |
| 1 · First light | 0.0–2.5 s | Line of light, slit opening, crystals igniting clockwise |
| 2 · The dial | 2.5–5.0 s | Rack focus, dial trace with ticks at 12/3/6/9 |
| 3 · Chronograph | 5.0–8.0 s | Sub-dial hands in sync, date flips to 18, counters 60/24/60, three callouts |
| 4 · Bracelet | 8.0–11.0 s | Light wave along the pavé, `PAVÉ CRYSTAL LINKS` |
| 5 · Hero | 11.0–14.0 s | Silver sweep, `FOSSIL` / `TIME LOOKS GOOD ON YOU` / rule |
| 6 · On you | 14.0–17.0 s | Frosted pill `Stainless Steel · Crystal Bezel · Chronograph` |
| 7 · End card | 17.0–20.0 s | Logo on the beat, tagline, `SHOP THE COLLECTION` shimmer, glint, fade to black |

## Known stand-ins

- **Shots 1–3** use a vector macro of the dial, built to the product spec, so the macro framing stays sharp. Replace it with the photoreal 3D macro render when one exists.
- **Shot 6** has no wrist plate. The watch turns toward camera over dark silk instead. Drop in live action or 3D at the same timing; the pill overlay is final.
- The `FOSSIL` wordmark is typeset in Montserrat. Swap in the brand's approved artwork for final delivery.
