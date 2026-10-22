# Spartans V1

An online 3D war game for the browser and phones. Two teams fight through a ruined city:

- **Defenders** hold their HQ until the timer runs out.
- **Attackers** try to destroy the HQ first.

Pick your unit: **Operator** (first-person soldier in your own custom suit), **Jeep**, **Tank**, **Rocket Truck**, **Drone**, **Attack Helicopter** or **Fighter Jet**. AI bots fill both teams.

## Playing

1. Enter a callsign and a lobby name, then press **Create lobby**. You get a random 5-letter code.
2. Press **Copy invite link** and send it to friends, or they can find your lobby in the public list.
3. Design your soldier in the **Armory**: camo, colors, helmet, mask, vest and backpack.
4. Pick a team and a unit. The host sets the number of AI and the match length, then presses **Start battle**.

| Action | Keyboard and mouse |
| --- | --- |
| Move / sprint / jump / crouch | WASD / Shift / Space / C |
| Aim and fire | Mouse, left click |
| Aim down sights / zoom | Right click |
| Reload, grenade, switch weapon | R, G, Q or 1/2 |
| Vehicle secondary weapon | F |
| Fly up / down | Space / Shift |
| Change camera view | V (first person, third person, inside the tank, cockpit) |
| Scores, chat, pause | Tab, Enter, Esc |

Phones get on-screen sticks and buttons.

### Install it as an app

It installs on phones without an app store:

- **Android (Chrome):** open the game and tap **Install app** at the top.
- **iPhone (Safari):** tap **Share**, then **Add to Home Screen**.

## Running it

Requires Node.js 20 or later.

```bash
cd drones-war
npm install
npm start          # http://localhost:3000
npm test           # simulation, physics and server tests
```

`render.yaml` in the repository root deploys it to Render.com: create a Blueprint from this repository and branch.

## How it's built

- `server.mjs` serves the client and runs lobbies over WebSockets at `/ws`.
- `game.mjs` runs the server-side battle simulation at 60 ticks a second, with AI from `bots.mjs`, the city from `city.mjs` and path finding from `nav.mjs`.
- `public/js/shared/` contains code shared by server and client: unit definitions, physics and suit options.
- `public/js/` contains the three.js client: world rendering, models, effects, audio, camera, input, HUD, client-side prediction and the menus.
- Everything is procedural (no image, model or sound files). The only dependencies are `three` and `ws`.

The folder is still named `drones-war` because the Render deployment points at it.
