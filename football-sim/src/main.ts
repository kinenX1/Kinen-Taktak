import './ui/style.css';
import { Game } from './game';
import { mainMenu } from './ui/screens';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const hud = document.getElementById('hud') as HTMLElement;
const game = new Game(canvas, ui, hud);
game.showBackdrop();
game.screen(mainMenu(game));
// Exposed for automated tests and debugging.
(window as any).__game = game;
