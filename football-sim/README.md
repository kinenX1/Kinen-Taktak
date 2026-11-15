# Ultimate Football Simulator

A standalone 3D football game for the browser, written in TypeScript on Three.js. No game engine, no downloaded art:
stadiums, players, kits, animations, textures and all audio are generated procedurally at run time, so the game runs from a
static build with nothing else to host.

All clubs and players are **fictional**. National teams use real country names with generated squads.

## Run it

```bash
cd football-sim
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build on :4173
```

`dist/` is a plain static site (relative asset paths), so it can be hosted anywhere.

## Controls

| Action | Player 1 | Player 2 | Gamepad |
| --- | --- | --- | --- |
| Move | W A S D | Arrow keys | Left stick / D-pad |
| Sprint | Left Shift | Right Shift | RT |
| Pass · standing tackle | J | Numpad 1 | A / Cross |
| Shoot · slide tackle (hold for power) | K | Numpad 2 | B / Circle |
| Through ball · team-mate press | L | Numpad 3 | Y / Triangle |
| Cross / long pass (hold for power) | I | Numpad 5 | X / Square |
| Switch player | Space | Numpad 0 | LB |
| Skill move (direction picks the move) | E | Numpad 4 | LT |
| Modifier: finesse shot, shield, jockey | Q | Numpad 6 | RB |
| Pause | Esc / P | | Start |

Every key can be rebound in **Settings → Controls**. One gamepad drives Player 1 (Player 2 in local multiplayer); two gamepads
drive one player each. Menus can be navigated with a gamepad (stick / D-pad, A to confirm, B to go back).

## What is in the game

- **Match engine**: ball physics with drag, Magnus curve, bounce, rolling friction, posts, crossbar and nets; momentum-based
  player movement, first touches, dribbling, ground passes, through balls, lofted passes, crosses, shots, finesse shots,
  headers, volleys, standing and sliding tackles, shielding, four skill moves, stamina and fatigue.
- **Rules**: goals, throw-ins, corners, goal kicks, direct and indirect free kicks with walls, penalties, offside, fouls,
  yellow and red cards, five substitutions, stoppage time, and penalty shoot-outs in knockout ties.
- **AI**: formation shape that shifts with the ball, pressing, marking, interceptions, support runs held onside, lane-aware
  passing, crossing, shooting and clearing decisions, goalkeepers that position, dive, parry, claim and distribute.
  Five difficulty levels change decision speed, accuracy, pressing range, marking tightness and goalkeeper reactions.
- **Modes**: Quick Match, Career (transfers, finances, youth academy, tactics, league seasons, trophies), Player Career
  (create a player, earn trust, spend skill points, transfer offers), Tournaments (knockout or groups + knockout),
  Training (shooting, passing, dribbling, free kicks, penalties) and two-player Local Multiplayer.
- **Presentation**: five stadiums, four weather/time settings with rain and a wet pitch, animated crowds, LED boards,
  five camera modes, match intro with line-ups, goal celebrations and slow-motion replays, half-time and full-time stats,
  commentary ticker, radar, synthesised crowd, whistle, kick, post and net sounds.
- **Data**: 84 teams (five 12-club leagues and 24 national teams) and 1,848 generated players with seven attributes,
  twelve positions, personalities and play styles.

## Project layout

```
src/
  core/      math, seeded RNG, event bus, settings, keyboard + gamepad input
  data/      types, formations, name pools, team/player database, stadium definitions
  match/     simulation only (no rendering)
             ball.ts (BallPhysics), player.ts, team.ts (TeamManager), actions.ts, ai.ts (FootballAI),
             gk.ts, controller.ts (PlayerController), match.ts (MatchManager)
  engine/    renderer.ts, stadium.ts (StadiumManager), environment.ts, camera.ts (CameraManager),
             playerModel.ts, animation.ts (AnimationManager), matchView.ts, textures.ts
  audio/     audio.ts (AudioManager, Web Audio synthesis)
  modes/     league.ts, career.ts (CareerManager), playerCareer.ts, tournament.ts (TournamentManager), training.ts
  ui/        dom.ts, hud.ts, screens.ts, modeScreens.ts, style.css (UIManager layer)
  game.ts    game shell and frame loop
tests/
  sim.test.ts   headless AI-vs-AI matches (npm run test:sim)
  summary.ts    aggregate match statistics for tuning
  e2e.cjs       drives the real game in headless Chromium (npm run test:e2e, needs `npm run preview`)
```

## Known limits

Stated plainly so nothing here is taken for more than it is:

- Players are procedural low-poly models with painted faces, not scanned likenesses, and animation is procedural
  (blended poses), not motion capture. It reads well from broadcast distance and is clearly stylised in close-ups.
- Knockout ties go straight to penalties; there is no extra time. There is no advantage rule and no handball.
- Commentary is a text ticker driven by the match event stream; there is no recorded voice.
- "Exit" cannot close a browser tab the page did not open; it shows a closing screen instead.
- Saves live in this browser's localStorage only.
