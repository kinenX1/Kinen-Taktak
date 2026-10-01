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

## Putting it on the web (Render)

`render.yaml` at the repo root tells Render how to host the game as a free static site.
`build.mjs` wraps `index.html` in a full HTML page and copies everything into `dist/`.

1. Sign in at https://render.com with GitHub.
2. Click **New** → **Blueprint**, pick `kinenX1/Kinen-Taktak` and the branch that has `render.yaml`.
3. Click **Deploy**. The game goes live at `https://legend-of-sephora.onrender.com`. Render picks a nearby name if that one is taken.

You can also add it by hand with **New** → **Static Site**. Use the build command `node games/legend-of-sephora/build.mjs` and the publish directory `games/legend-of-sephora/dist`.

Render rebuilds the site whenever this folder changes on that branch.

## Running it locally

```bash
node games/legend-of-sephora/build.mjs
cd games/legend-of-sephora/dist && python3 -m http.server 8000   # then open http://localhost:8000
```

Locally, workers understand the built-in commands (`/work`, `/build house`, `/eat`, `/sleep`, `/take 5 gold`, `/delete`, …). Free-form orders handled by Claude, and saves to your Claude account, only work in the version published on claude.ai. On Render and other hosts the game saves in the player's browser.
