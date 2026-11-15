import './ui/style.css';
import { Game } from './game';
import { div, h } from './ui/dom';
import { mainMenu } from './ui/screens';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const hud = document.getElementById('hud') as HTMLElement;
const game = new Game(canvas, ui, hud);
game.showBackdrop();
game.screen(mainMenu(game));
// Exposed for automated tests and debugging.
(window as any).__game = game;

// Title splash with key art; the first click or key press also unlocks audio.
if (!new URLSearchParams(location.search).has('nosplash')) {
  const splash = div('splash', div('', h('h1', { class: 'logo' }, h('small', null, 'ULTIMATE'), 'Football', h('br'), h('em', null, 'Simulator')), div('press', 'PRESS ANY KEY')));
  splash.style.backgroundImage = `url(${import.meta.env.BASE_URL}keyart.jpg), radial-gradient(circle at 70% 30%, #12305a, #05070d 70%)`;
  document.body.appendChild(splash);
  const close = () => { splash.style.opacity = '0'; setTimeout(() => splash.remove(), 800); window.removeEventListener('keydown', close); };
  splash.addEventListener('click', close); splash.addEventListener('touchend', close); window.addEventListener('keydown', close);
  splash.querySelector('.press')!.textContent = 'ontouchstart' in window ? 'TAP TO START' : 'PRESS ANY KEY';
}
