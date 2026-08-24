// ui.js — alt DOM-overlay: menu, portalopgave, HUD og game over.

import { parseAnswer, isCorrect, diagnose } from './questions.js';

const $ = (id) => document.getElementById(id);

/** Tegner cirklen i opgaven med radius markeret. */
function circleSvg(r) {
  const R = 74;
  return `
  <svg viewBox="0 0 200 200" class="q-circle" role="img" aria-label="Cirkel med radius ${r} cm">
    <defs>
      <radialGradient id="cg" cx="38%" cy="32%">
        <stop offset="0%" stop-color="#5ef2c8" stop-opacity="0.42"/>
        <stop offset="100%" stop-color="#7b6bff" stop-opacity="0.14"/>
      </radialGradient>
    </defs>
    <circle cx="100" cy="100" r="${R}" fill="url(#cg)" stroke="#5ef2c8" stroke-width="3"/>
    <line x1="100" y1="100" x2="${100 + R}" y2="100" stroke="#ffd166" stroke-width="3" stroke-dasharray="6 4"/>
    <circle cx="100" cy="100" r="3.5" fill="#ffd166"/>
    <text x="${100 + R / 2}" y="90" text-anchor="middle" class="q-rlabel">r = ${r} cm</text>
  </svg>`;
}

export class UI {
  constructor() {
    this.el = {
      menu: $('menu'),
      question: $('question'),
      gameover: $('gameover'),
      hud: $('hud'),
      hudDist: $('hud-dist'),
      hudPortals: $('hud-portals'),
      hudNext: $('hud-next'),
      hudSpeed: $('hud-speed'),
      qBody: $('q-body'),
      goBody: $('go-body'),
      touch: $('touch'),
    };
    this.onStart = null;
    this.onRestart = null;
    this.onContinue = null;

    $('btn-start').addEventListener('click', () => this.onStart && this.onStart());
    $('btn-restart').addEventListener('click', () => this.onRestart && this.onRestart());
  }

  showMenu() {
    this.el.menu.hidden = false;
    this.el.question.hidden = true;
    this.el.gameover.hidden = true;
    this.el.hud.hidden = true;
    this.el.touch.hidden = true;
  }

  showPlaying() {
    this.el.menu.hidden = true;
    this.el.question.hidden = true;
    this.el.gameover.hidden = true;
    this.el.hud.hidden = false;
    if (this.touchEnabled) this.el.touch.hidden = false;
  }

  updateHud({ distance, portals, speed, nextPortal }) {
    this.el.hudDist.textContent = Math.max(0, Math.floor(distance)) + ' m';
    this.el.hudPortals.textContent = portals;
    this.el.hudSpeed.textContent = Math.round(speed * 3.6) + ' km/t';
    this.el.hudNext.textContent = nextPortal === null ? '–' : Math.max(0, Math.ceil(nextPortal)) + ' m';
  }

  /** Viser portalopgaven. `done()` kaldes når spilleren trykker Fortsæt. */
  showQuestion(q, done) {
    this.el.question.hidden = false;
    this.el.touch.hidden = true;
    let attempts = 0;
    let solved = false;

    this.el.qBody.innerHTML = `
      <div class="q-tag">Portal ${q.index + 1}</div>
      <h2 class="q-title">${q.title}</h2>
      <div class="q-grid">
        <div class="q-figure">${circleSvg(q.r)}</div>
        <div class="q-right">
          <p class="q-prompt">${q.prompt}</p>
          <div class="q-formula"><span>Formel</span><strong>${q.formula}</strong><em>π = 3,14</em></div>
          <form class="q-form" autocomplete="off">
            <label for="q-input">Dit svar</label>
            <div class="q-inputrow">
              <input id="q-input" type="text" inputmode="decimal" placeholder="skriv tallet" aria-describedby="q-feedback">
              <span class="q-unit">${q.unit}</span>
              <button type="submit" class="btn btn-check" id="q-check">Tjek</button>
            </div>
            <p class="q-hint">Du må gerne bruge komma, fx 18,84. Rund af til 2 decimaler.</p>
          </form>
          <p id="q-feedback" class="q-feedback" role="status" aria-live="polite"></p>
          <div class="q-steps" id="q-steps" hidden></div>
          <button class="btn btn-continue" id="q-continue" disabled>Fortsæt ▸</button>
        </div>
      </div>`;

    const input = $('q-input');
    const feedback = $('q-feedback');
    const cont = $('q-continue');
    const steps = $('q-steps');
    const form = this.el.qBody.querySelector('.q-form');

    const check = () => {
      if (solved) return;
      const value = parseAnswer(input.value);
      if (value === null) {
        feedback.className = 'q-feedback bad';
        feedback.textContent = 'Skriv et tal – fx 31,4 eller 31.4.';
        this.onWrong && this.onWrong();
        return;
      }
      attempts++;
      if (isCorrect(q, value)) {
        solved = true;
        feedback.className = 'q-feedback good';
        feedback.textContent = `Rigtigt! ${q.worked}`;
        input.disabled = true;
        $('q-check').disabled = true;
        cont.disabled = false;
        cont.focus();
        this.onCorrect && this.onCorrect();
      } else {
        feedback.className = 'q-feedback bad';
        feedback.textContent = diagnose(q, value);
        this.onWrong && this.onWrong();
        // hjælpen kommer i to trin: først et skub, så hele udregningen
        if (attempts >= 2) {
          const shown = attempts >= 4 ? q.steps : q.steps.slice(0, 1);
          steps.hidden = false;
          steps.innerHTML = `<span>${attempts >= 4 ? 'Sådan gør du' : 'Kom i gang'}</span>`
            + `<ol>${shown.map(s => `<li>${s}</li>`).join('')}</ol>`;
        }
        input.select();
      }
    };

    form.addEventListener('submit', (e) => { e.preventDefault(); check(); });
    cont.addEventListener('click', () => {
      this.el.question.hidden = true;
      done({ attempts });
    });
    setTimeout(() => input.focus(), 60);
  }

  showGameOver({ distance, portals, cause, best, newBest }) {
    this.el.hud.hidden = true;
    this.el.touch.hidden = true;
    this.el.gameover.hidden = false;
    this.el.goBody.innerHTML = `
      <p class="go-cause">${cause}</p>
      <div class="go-stats">
        <div><strong>${Math.floor(distance)}</strong><span>meter</span></div>
        <div><strong>${portals}</strong><span>portaler klaret</span></div>
        <div><strong>${Math.floor(best)}</strong><span>bedste tur</span></div>
      </div>
      ${newBest ? '<p class="go-best">Ny rekord!</p>' : ''}`;
  }

  enableTouch() { this.touchEnabled = true; }
}
