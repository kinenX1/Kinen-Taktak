# The Legend of Sephora

A pixel-art island builder that runs in the browser. You start on a bare island with a castle, a shop, 60 wood, 5 diamonds, 50 gold and a sword. You hire workers, buy a wheat farm, and give orders by typing `/` commands. Pirates and tornadoes show up every few minutes.

It is plain HTML, CSS and JavaScript with no build step. The art is drawn in code, so there are no image files.

| File | What it does |
| --- | --- |
| `index.html` | Page layout, styles and HUD markup |
| `js/util.js` | Constants, noise, colour and pixel-font helpers |
| `js/art.js` | Pixel-art generators for the island, buildings, characters, boats and icons |
| `js/world.js` | Random island generation and pathfinding |
| `js/game.js` | Economy, workers, fighters, raids, quests and saving |
| `js/ai.js` | Worker orders: built-in `/` commands, plus Claude for free-form orders |
| `js/render.js` | Draws the world into a low-res buffer and scales it up |
| `js/ui.js` | Menu, skin editor, castle and shop panels, worker chat, input |
| `js/main.js` | Boot and game loop |

## Running it locally

```bash
cd games/legend-of-sephora
python3 -m http.server 8000   # then open http://localhost:8000
```

Locally, workers understand the built-in commands (`/work`, `/build house`, `/eat`, `/sleep`, `/take 5 gold`, `/delete`, …). Free-form orders handled by Claude, and saves to your Claude account, only work in the published version on claude.ai.
