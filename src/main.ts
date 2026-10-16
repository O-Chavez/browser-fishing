import './style.css';
import { Game } from './game/game';

const game = new Game();
if (import.meta.env.DEV) (window as unknown as { __game: ReturnType<Game['debug']> }).__game = game.debug();
