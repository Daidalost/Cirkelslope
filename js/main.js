// main.js — starter spillet og håndterer fejl pænt.

import { Game } from './game.js';
import { UI } from './ui.js';
import { setMuted, isMuted, initAudio } from './audio.js';

function fail(msg) {
  const menu = document.getElementById('menu');
  if (menu) {
    menu.innerHTML = `<div class="panel panel-menu">
      <h1>Ups</h1>
      <p class="tagline">${msg}</p>
      <p class="fineprint">Cirkelslisken bruger WebGL2. Prøv en opdateret Chrome, Edge, Firefox eller Safari.</p>
    </div>`;
    menu.hidden = false;
  }
  console.error(msg);
}

try {
  const canvas = document.getElementById('scene');
  const ui = new UI();
  const game = new Game(canvas, ui);

  const sound = document.getElementById('btn-sound');
  sound.addEventListener('click', () => {
    initAudio();
    setMuted(!isMuted());
    sound.textContent = isMuted() ? '🔇' : '🔊';
    sound.setAttribute('aria-label', isMuted() ? 'Slå lyd til' : 'Slå lyd fra');
    sound.blur();
  });

  window.game = game;   // praktisk når man vil finpudse i konsollen
} catch (err) {
  fail(err && err.message ? err.message : 'Spillet kunne ikke starte.');
}
