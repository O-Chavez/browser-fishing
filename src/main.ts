import './style.css';
import { Game } from './game/game';

const game = new Game();
if (import.meta.env.DEV) (window as unknown as { __game: ReturnType<Game['debug']> }).__game = game.debug();

// Touch-only devices get a "made for desktop" notice (shown by CSS); "Try anyway" dismisses it for this tab.
const notice = document.getElementById('desktop-only')!;
const ANYWAY = 'desktop-anyway';
try {
  if (sessionStorage.getItem(ANYWAY)) notice.classList.add('hidden');
} catch {}
document.getElementById('desktop-anyway')!.addEventListener('click', () => {
  notice.classList.add('hidden');
  try {
    sessionStorage.setItem(ANYWAY, '1');
  } catch {}
});
