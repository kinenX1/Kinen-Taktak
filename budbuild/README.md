# The BudBuild

An online multiplayer browser game. You and your friends start on an empty island. Everyone has their own AI builder: you type the piece you want ("a big red sail with a skull", "steam engine with a chimney", "wooden hull section") and your AI makes **that one piece**, never a whole boat. You put the pieces together on your shipyard slip, launch the boat when it floats, and sail across the sea to six cities. You can talk by voice or text the whole time.

- **3D world** (three.js): an ocean with waves, a sky, the empty Driftwood Isle with 8 shipyard slips, and 6 cities (Port Coral, Ironhaven, Sunspire, Frostholm, Lantern Bay, Verdant Reach), each with its own look, a landmark and a lighthouse beam you can follow from far away.
- **Your own AI builder**: Claude designs each piece from 3D shapes (hulls, floats, decks, sails, masts, engines, oars, rudders, cabins, cannons, lights, flags, crates, decorations). Whole-boat requests get one key piece and a tip about what to ask for next. Without an API key the game uses a built-in offline workshop, which understands English, French and Spanish, and typos.
- **Building**: a 9 × 15 grid. Pieces stack, rotate and can be removed. The stats panel shows weight against buoyancy, push, sail area, turning and top speed. You can only launch a boat that floats.
- **Sailing**: waves, wind (sails pull best with the wind behind or beside you), engines, rudders and running aground. Friends can ride on your boat, walk on its deck and go ashore in cities. Cannons fire harmless salutes.
- **Multiplayer**: islands have 5-letter codes and invite links (`?room=CODE`), with up to 8 players each. Refreshing the page puts you back where you were, with your boat and pieces.
- **Voice chat** (WebRTC, peer to peer), with mute, a "nearby only" mode and speaking indicators. There's also text chat.
- Works with a mouse and keyboard, and on phones and tablets with an on-screen joystick.

## Controls

| Key | What it does |
| --- | --- |
| W A S D / arrows | Walk, or throttle and steer at the helm |
| Shift / Space | Run / jump |
| E | Use: open your shipyard, board a boat, take or leave the helm, go ashore |
| B | Shipyard (near your slip) |
| R | Rotate a piece while building, or raise / lower the sails |
| X | Remove mode while building (or Shift+click) |
| F | Fire cannons |
| H (twice) | Bring your boat and yourself back to the shipyard |
| Enter / T | Chat |
| M / L / ? | Sea chart / logbook / help |
| Drag, wheel | Look around, zoom |

The ✨ button switches the graphics between Pretty (bloom and soft shadows), Balanced (the default on phones) and Fast. The resolution also lowers itself on slow devices to keep the game smooth.

## Deploy on Render

The repository has a `render.yaml` Blueprint at its root that deploys this folder as one web service. The game page and the multiplayer server run on the same port.

1. Push this branch, or merge it into your default branch.
2. In the Render dashboard choose **New → Blueprint**, pick this repository and the branch that has `render.yaml`, and confirm.
3. When Render asks for `ANTHROPIC_API_KEY`, paste your key from the [Claude Console](https://platform.claude.com/). You can also leave it empty to use the offline workshop.
4. When the deploy finishes, Render gives you a link like `https://the-budbuild.onrender.com`. Open it, create an island, and send the invite link to your friends.

Notes:

- On Render's free plan the service sleeps after about 15 minutes with nobody connected. The next visit wakes it up, which takes about a minute. Islands live in memory, so a restart clears them (an invite link still works and opens a fresh island with the same code). A paid plan keeps it awake.
- Voice chat connects players directly. For most home networks the built-in STUN servers are enough. On strict networks (some schools, offices and mobile carriers) you need a TURN server: set `TURN_URL` (comma-separated `turn:` URLs), `TURN_USERNAME` and `TURN_CREDENTIAL`.

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3001` | Render sets this for you |
| `ANTHROPIC_API_KEY` | (none) | Turns on the Claude AI builder. Without it, the offline workshop makes the pieces |
| `AI_MODEL` | `claude-opus-5-5` | Claude model that designs the pieces |
| `AI_HOURLY_LIMIT` | `300` | Most AI requests per hour for the whole server. Beyond that, the workshop takes over |
| `AI_MAX_CONCURRENT` | `4` | AI requests running at once. The rest wait in a queue |
| `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | (none) | Optional TURN relay for voice chat |

Each player can ask for 40 pieces per 30 minutes, one at a time, with a few seconds between requests. The AI uses structured JSON output at low effort for speed. If Claude declines a request, the API retries it on a fallback model (`fallbacks: "default"`). If the AI fails for any reason, the offline workshop builds the piece instead, so players always get one.

## Run it locally

Requirements: Node 20.9 or later.

```bash
cd budbuild
npm install
npm run dev          # game server on :3001 + Vite on http://localhost:5173
```

To use the AI locally, put `ANTHROPIC_API_KEY=...` in your environment before `npm run dev`. While the dev server runs, `http://localhost:5173/dev/world.html?at=sunspire` lets you fly around the world without joining (`at` can be `home`, `slip` or any city id), and `/dev/avatar.html` shows the sailors walking, running and swimming.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Server (auto-reload) and client dev server together |
| `npm run build` | Builds the client into `dist/client` and bundles the server into `dist/server` |
| `npm start` | Runs the production build (what Render runs) |
| `npm test` | Shared rules, workshop, AI request and multiplayer server tests |
| `npm run typecheck` | TypeScript |

## How it's built

```
shared/          rules used by both sides: pieces, boat physics, world map, waves, wind, network protocol
server/          Express + Socket.IO game server
  app.ts         rooms, players, validation, snapshots, building, chat, voice signalling
  ai.ts          Claude piece designer (structured JSON output)
  workshop.ts    offline procedural piece maker
  forge.ts       picks the AI or the workshop, with limits
client/src/      three.js + plain DOM
  scene/         renderer, world (ocean, sky, islands, cities), boats, pieces, avatars, effects
  systems/       input, camera, local player and sailing, build mode
  ui/            lobby, HUD, minimap, workshop panel, chat and voice
  net/           socket and WebRTC voice
test/            node:test suites
```

- The server owns everything that lasts: players, inventories, piece definitions, boat layouts, discoveries and chat. Every client message is validated with zod. Each client simulates its own avatar and boat and sends its position 12 times a second. The server sends everyone 12 snapshots a second, and clients draw other players 150 ms in the past so they move smoothly.
- AI output always goes through `normalizePiece`. It clamps numbers, re-centres the shape, fits it to at most 5 × 5 cells and 10 m tall, and works out the footprint from the geometry. Gameplay stats come from the piece's role, size and power, so an oddly drawn piece can't break the game.
- Each boat's parts are merged into a few meshes, one per material, so even big boats are cheap to draw.
