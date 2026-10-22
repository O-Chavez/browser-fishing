import './style.css';
import { Game } from './game/game';
import { touchOnly } from './game/touch';

// Touch-only devices get a "made for desktop" notice (shown by CSS); "Try touch controls" dismisses it
// for this tab and turns on the on-screen controls. `?touch` forces touch mode, for testing on desktop.
const notice = document.getElementById('desktop-only')!;
const ANYWAY = 'desktop-anyway';

/**
 * The game can't run without WebGL. Chromium blocks it for a site after a GPU crash (on Android until
 * the browser restarts), so say what happened on the notice panel instead of leaving a dead page.
 */
function showStartError(e: unknown): void {
  const webgl = String(e).includes('WebGL');
  const panel = notice.querySelector('.panel')!;
  panel.innerHTML = webgl
    ? `<img src="/apple-touch-icon.png" alt="" /><h2>Lakeside couldn't start its 3D graphics</h2>
       <p>Your browser may have turned 3D graphics off for this site after a graphics crash.</p>
       <p>Close the browser completely (not just this tab), open it again and come back. On a computer, also check that hardware acceleration is on.</p>`
    : `<img src="/apple-touch-icon.png" alt="" /><h2>Lakeside couldn't start</h2><p>Something went wrong while loading: <b></b></p>`;
  if (!webgl) panel.querySelector('b')!.textContent = String(e);
  const reload = document.createElement('button');
  reload.className = 'linklike';
  reload.textContent = 'Reload';
  reload.addEventListener('click', () => location.reload());
  panel.append(reload);
  notice.classList.remove('hidden');
  notice.classList.add('error');
}

let game: Game;
try {
  game = new Game();
} catch (e) {
  showStartError(e);
  throw e;
}
if (import.meta.env.DEV) (window as unknown as { __game: ReturnType<Game['debug']> }).__game = game.debug();

const tryTouch = () => {
  notice.classList.add('hidden');
  game.setCovered(false);
  if (touchOnly) game.enableTouch();
};
// Nothing to see behind the notice, so phones don't draw the world (or load the GPU) until the player opts in.
if (touchOnly) game.setCovered(true);
try {
  if (sessionStorage.getItem(ANYWAY)) tryTouch();
} catch {}
if (new URLSearchParams(location.search).has('touch')) {
  notice.classList.add('hidden');
  game.setCovered(false);
  game.enableTouch();
}
document.getElementById('desktop-anyway')!.addEventListener('click', () => {
  tryTouch();
  try {
    sessionStorage.setItem(ANYWAY, '1');
  } catch {}
});
