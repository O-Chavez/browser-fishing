import './style.css';
import { Game } from './game/game';

const game = new Game();
if (import.meta.env.DEV) (window as unknown as { __game: ReturnType<Game['debug']> }).__game = game.debug();

// Touch-only devices get a "made for desktop" notice (shown by CSS); "Try touch controls" dismisses it
// for this tab and turns on the on-screen controls. `?touch` forces touch mode, for testing on desktop.
const notice = document.getElementById('desktop-only')!;
const ANYWAY = 'desktop-anyway';
const touchOnly = matchMedia('(pointer: coarse) and (hover: none)').matches;
const tryTouch = () => {
  notice.classList.add('hidden');
  if (touchOnly) game.enableTouch();
};
try {
  if (sessionStorage.getItem(ANYWAY)) tryTouch();
} catch {}
if (new URLSearchParams(location.search).has('touch')) {
  notice.classList.add('hidden');
  game.enableTouch();
}
document.getElementById('desktop-anyway')!.addEventListener('click', () => {
  tryTouch();
  try {
    sessionStorage.setItem(ANYWAY, '1');
  } catch {}
});
