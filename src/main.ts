import './style.css';
import { Game } from './game/game';
import { touchOnly } from './game/touch';
import { clientLog, watchErrors } from './game/clientlog';

watchErrors();

// The start-error panel (#desktop-only, named for the "made for desktop" notice it used to be): shown only when the
// game can't start.
const notice = document.getElementById('desktop-only')!;

/**
 * The game can't run without WebGL. Chromium blocks it for a site after a GPU crash (on Android until
 * the browser restarts), so say what happened on the notice panel instead of leaving a dead page.
 */
function showStartError(e: unknown): void {
  const webgl = String(e).includes('WebGL');
  clientLog('failed', `start: ${String(e)}`);
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

// Phones and tablets play with the on-screen controls (GAME_DESIGN.md §39); `?touch` turns them on for testing on desktop.
if (touchOnly || new URLSearchParams(location.search).has('touch')) game.enableTouch();
