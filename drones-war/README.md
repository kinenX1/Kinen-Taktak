# Drones War

An online team battle you play in the browser with your friends. Two teams fight over a city:

- **Defenders** (blue) protect their **HQ** until the timer runs out.
- **Attackers** (red) try to blow up the HQ before time is up.

Everyone picks a loadout, and AI **tankers** fill out both armies.

| Unit | What it is | Fire (click) | Special (right-click / Space) |
| --- | --- | --- | --- |
| **Commando** | Soldier in a military suit | Assault rifle | Rocket launcher |
| **Jeep** | Fast armored car | Machine gun | 3-rocket pod |
| **Tank** | Heavy armor, slow | Cannon (splash damage) | Coaxial machine gun |
| **Drone** | Flies over walls and buildings | Minigun | Bomb drop |

## How a game works

1. Open the game, type a callsign and press **Create a lobby**.
2. Press **Copy invite link** (or **Share** on a phone) and send it to your friends. They open the link, type a callsign and press **Join**. They can also type the 5-letter lobby code.
3. Everyone chooses a team (**Join Defenders** / **Join Attackers**) and a unit. New players are put on the smaller team automatically.
4. The host picks the number of **AI tankers per team** (0–15) and the match length, then presses **Start battle**.
5. If you get destroyed, you respawn after 5 seconds and can switch units while you wait. Friends can also join a battle that's already running.
6. When the match ends you see the results, and then everyone goes back to the lobby for a rematch.

### Controls

| | Keyboard and mouse | Phone / tablet |
| --- | --- | --- |
| Move | WASD or arrow keys | Left stick |
| Aim and fire | Mouse and left click | Right stick (push it out to fire) |
| Special weapon | Right click or Space | SPECIAL button |
| Switch unit (next respawn) | 1–4 | Buttons on the "Destroyed" screen |
| Scoreboard | Hold Tab | |
| Chat | Enter | |
| Sound on/off | M | Sound button |

## Run it

You need Node.js 20 or later.

```bash
cd drones-war
npm install
npm start          # http://localhost:3000
```

Set `PORT` to use another port. `npm run dev` restarts the server whenever you change it, and `npm test` runs the tests.

Two longer checks run outside `npm test`:

- `npm run soak` plays whole 3-minute matches (seeds 1-6, 4 and 15 bots per team, two scripted players cycling every unit type, plus one full 46-unit match) at full speed without sockets and checks for errors, the tick budget (under 4 ms on average) and the snapshot size (under 12 KB).
- `npm run e2e:protocol` starts the real server with `NODE_ENV=test` on a free port and plays two matches in a row with two WebSocket clients, checking the whole lobby and battle protocol.

### Play with friends

- **Same Wi-Fi:** run `npm start` on one computer. Friends on the same network open `http://<that computer's IP>:3000` (for example `http://192.168.1.20:3000`). The invite link in the lobby uses whatever address you opened the game on, so open it by IP address before you copy the link.
- **Over the internet:** deploy the `drones-war` folder to any host that runs a long-lived Node server with WebSockets, such as Render, Railway or Fly.io. Use `npm install` as the build command and `npm start` as the start command, and the host provides `PORT`. Serverless platforms like Vercel won't work, because the battle runs in a live server process.

## How it's built

- `server.mjs` serves the page (and three.js under `/vendor`) and runs a WebSocket server on `/ws`. It handles lobbies, invite codes, teams, the host's settings and chat, and runs each room's match loop at 60 ticks a second with 30 snapshots a second.
- `match.mjs` is the battle simulation: units, spawns, damage, kills and scores, the HQ and the win conditions. `combat.mjs` handles weapons, projectiles, splash damage and missile lock-on, `bots.mjs` drives the AI units and `nav.mjs` finds their paths through `city.mjs`'s generated city. Clients only send their inputs, so nobody can cheat by editing the page.
- `public/` holds the client: the lobby UI and a canvas renderer that smooths movement between server snapshots, with particle explosions, a minimap, a kill feed and synthesized sound effects (no asset files).
- `test/` holds the simulation tests (`npm test`).

The dependencies are [`ws`](https://github.com/websockets/ws) and [`three`](https://threejs.org/).
