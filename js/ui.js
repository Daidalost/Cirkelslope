// ui.js — alt DOM-overlay: menu, portalopgave, HUD og game over.

import { parseAnswer, isCorrect, diagnose, MAX_TRIES } from './questions.js';
import { figureSvg } from './figures.js';
import * as hs from './highscore.js';

const $ = (id) => document.getElementById(id);

/** Navn og farve på de tidsbegrænsede effekter. */
export const FX_INFO = {
  turbo:  { name: 'Turbo',       cls: 'fx-turbo' },
  bullet: { name: 'Bullet time', cls: 'fx-bullet' },
  lowg:   { name: 'Lav tyngde',  cls: 'fx-lowg' },
};

export class UI {
  constructor() {
    this.el = {
      menu: $('menu'),
      question: $('question'),
      gameover: $('gameover'),
      hud: $('hud'),
      hudDist: $('hud-dist'),
      hudPortals: $('hud-portals'),
      hudHoops: $('hud-hoops'),
      hudNext: $('hud-next'),
      hudSpeed: $('hud-speed'),
      bonus: $('bonus'),
      fx: $('fx'),
      qBody: $('q-body'),
      goBody: $('go-body'),
      touch: $('touch'),
    };
    this.onStart = null;
    this.onRestart = null;
    this.onContinue = null;

    // et mærke pr. effekt med en bjælke der tæller ned
    this.fxBadges = {};
    for (const [key, info] of Object.entries(FX_INFO)) {
      const el = document.createElement('div');
      el.className = `fx-badge ${info.cls}`;
      el.hidden = true;
      el.innerHTML = `<span class="fx-name">${info.name}</span><span class="fx-bar"><i></i></span>`;
      this.el.fx.appendChild(el);
      this.fxBadges[key] = { el, bar: el.querySelector('i') };
    }

    $('btn-start').addEventListener('click', () => this.onStart && this.onStart());
    $('btn-restart').addEventListener('click', () => this.onRestart && this.onRestart());
  }

  /** Viser hvilke effekter der er aktive, og hvor lang tid der er tilbage af dem. */
  updateFx(fx, durations) {
    let any = false;
    for (const [key, badge] of Object.entries(this.fxBadges)) {
      const left = fx[key] || 0;
      const on = left > 0;
      any = any || on;
      if (badge.el.hidden === on) badge.el.hidden = !on;
      if (on) badge.bar.style.width = `${Math.max(0, Math.min(1, left / durations[key])) * 100}%`;
      document.body.classList.toggle(FX_INFO[key].cls, on);
    }
    if (this.el.fx.hidden === any) this.el.fx.hidden = !any;
  }

  clearFx() {
    for (const [key, badge] of Object.entries(this.fxBadges)) {
      badge.el.hidden = true;
      document.body.classList.remove(FX_INFO[key].cls);
    }
    this.el.fx.hidden = true;
  }

  showMenu() {
    this.clearFx();
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

  updateHud({ distance, portals, hoops, speed, nextPortal }) {
    this.el.hudDist.textContent = Math.max(0, Math.floor(distance)) + ' m';
    this.el.hudPortals.textContent = portals;
    this.el.hudHoops.textContent = hoops;
    this.el.hudSpeed.textContent = Math.round(speed * 3.6) + ' km/t';
    this.el.hudNext.textContent = nextPortal === null ? '–' : Math.max(0, Math.ceil(nextPortal)) + ' m';
  }

  /** Lille kvittering midt på skærmen — ildringe og pickups. */
  toast(text, cls = '') {
    const el = this.el.bonus;
    el.textContent = text;
    el.className = 'bonus' + (cls ? ' ' + cls : '');
    el.hidden = false;
    void el.offsetWidth;              // genstarter animationen
    el.classList.add('show');
    clearTimeout(this._bonusTimer);
    this._bonusTimer = setTimeout(() => {
      el.classList.remove('show');
      el.hidden = true;
    }, 900);
  }

  flashBonus(meters) { this.toast('+' + meters + ' m'); }

  /**
   * Viser portalopgaven.
   * `onSolved({attempts})` kaldes når spilleren trykker Fortsæt efter et rigtigt svar,
   * `onFailed()` når spilleren har brugt alle forsøg og trykker Afslut.
   */
  showQuestion(q, { onSolved, onFailed }) {
    this.el.question.hidden = false;
    this.el.touch.hidden = true;
    let wrong = 0;
    let attempts = 0;
    let finished = false;

    const dots = Array.from({ length: MAX_TRIES }, () => '<i></i>').join('');
    this.el.qBody.innerHTML = `
      <div class="q-head">
        <div class="q-tag">Portal ${q.index + 1} · ${q.tag}</div>
        <div class="q-tries" id="q-tries" aria-label="${MAX_TRIES} forsøg tilbage">
          <span>Forsøg</span>${dots}
        </div>
      </div>
      <h2 class="q-title">${q.title}</h2>
      <div class="q-grid">
        <div class="q-figure">${figureSvg(q.figure)}</div>
        <div class="q-right">
          <p class="q-prompt">${q.prompt}</p>
          <div class="q-formula"><span>Formel</span><strong>${q.formula}</strong>${q.usesPi ? '<em>π = 3,14</em>' : ''}</div>
          <form class="q-form" autocomplete="off">
            <label for="q-input">Dit svar</label>
            <div class="q-inputrow">
              <input id="q-input" type="text" inputmode="decimal" placeholder="skriv tallet" aria-describedby="q-feedback">
              <span class="q-unit">${q.unit}</span>
              <button type="submit" class="btn btn-check" id="q-check">Tjek</button>
            </div>
            <p class="q-hint">${q.usesPi
              ? 'Du må gerne bruge komma, fx 18,84. Rund af til 2 decimaler.'
              : 'Skriv bare tallet – enheden står der allerede.'}</p>
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
    const tries = $('q-tries');
    const form = this.el.qBody.querySelector('.q-form');

    const showSteps = (title, list) => {
      steps.hidden = false;
      steps.innerHTML = `<span>${title}</span><ol>${list.map(s => `<li>${s}</li>`).join('')}</ol>`;
    };

    const check = () => {
      if (finished) return;
      const value = parseAnswer(input.value);
      if (value === null) {
        // et svar der ikke er et tal, koster ikke et forsøg
        feedback.className = 'q-feedback bad';
        feedback.textContent = 'Skriv et tal – fx 31,4 eller 31.4.';
        this.onWrong && this.onWrong();
        return;
      }
      attempts++;
      if (isCorrect(q, value)) {
        finished = true;
        feedback.className = 'q-feedback good';
        feedback.textContent = `Rigtigt! ${q.worked}`;
        input.disabled = true;
        $('q-check').disabled = true;
        cont.disabled = false;
        cont.focus();
        this.onCorrect && this.onCorrect();
        return;
      }

      wrong++;
      tries.children[MAX_TRIES - wrong + 1]?.classList.add('spent');
      tries.setAttribute('aria-label', `${MAX_TRIES - wrong} forsøg tilbage`);
      this.onWrong && this.onWrong();

      if (wrong >= MAX_TRIES) {
        // tredje forkerte svar: vis løsningen, og lad spilleren afslutte turen
        finished = true;
        input.disabled = true;
        $('q-check').disabled = true;
        this.el.qBody.classList.add('failed');
        feedback.className = 'q-feedback bad';
        feedback.textContent = `Tre forkerte svar – turen slutter her. Det rigtige svar er ${q.worked}.`;
        showSteps('Sådan gør du', q.steps);
        cont.textContent = 'Afslut turen ▸';
        cont.classList.add('btn-fail');
        cont.disabled = false;
        cont.focus();
        return;
      }

      feedback.className = 'q-feedback bad';
      feedback.textContent = diagnose(q, value) + (wrong === MAX_TRIES - 1 ? ' Sidste forsøg!' : '');
      if (wrong === MAX_TRIES - 1) showSteps('Kom i gang', q.steps.slice(0, 1));
      input.select();
    };

    form.addEventListener('submit', (e) => { e.preventDefault(); check(); });
    cont.addEventListener('click', () => {
      this.el.question.hidden = true;
      this.el.qBody.classList.remove('failed');
      cont.blur();
      if (wrong >= MAX_TRIES) onFailed();
      else onSolved({ attempts });
    });
    setTimeout(() => input.focus(), 60);
  }

  showGameOver({ distance, portals, hoops = 0, cause, best, newBest }) {
    this.clearFx();
    this.el.question.hidden = true;
    this.el.hud.hidden = true;
    this.el.touch.hidden = true;
    this.el.gameover.hidden = false;

    this.go = {
      entry: { name: '', distance: Math.floor(distance), portals, ts: Date.now() },
      saved: null,
      busy: false,
      tab: 'local',
      draft: hs.loadName(),
      error: '',
    };

    this.el.goBody.innerHTML = `
      <p class="go-cause">${cause}</p>
      <div class="go-stats">
        <div><strong>${Math.floor(distance)}</strong><span>meter</span></div>
        <div><strong>${portals}</strong><span>portaler klaret</span></div>
        <div class="go-fire"><strong>${hoops}</strong><span>ildringe</span></div>
        <div><strong>${Math.floor(best)}</strong><span>bedste tur</span></div>
      </div>
      ${newBest ? '<p class="go-best">Ny rekord!</p>' : ''}
      <div id="go-name"></div>
      <section class="hs">
        <div class="hs-tabs" id="hs-tabs" role="tablist"></div>
        <ol class="hs-list" id="hs-list"></ol>
        <p class="hs-note" id="hs-note"></p>
      </section>`;

    this.renderHighscore();

    // hent den fælles liste i baggrunden og tegn igen når den lander
    hs.fetchOnline().then(() => {
      if (!this.el.gameover.hidden) this.renderHighscore();
    });
  }

  /** Tegner navnefelt, faneblade og selve listen. Kaldes igen når noget ændrer sig. */
  renderHighscore() {
    const go = this.go;
    if (!go) return;

    const local = hs.loadLocal();
    const onlineOn = hs.online.state !== 'fra' && hs.online.state !== 'ukendt';
    if (!onlineOn && go.tab === 'online') go.tab = 'local';

    const qualifies =
      hs.qualifies(local, go.entry) ||
      (hs.online.state === 'klar' && hs.qualifies(hs.online.scores, go.entry));

    // ---- navnefelt ----
    const nameBox = document.getElementById('go-name');
    if (go.saved || !qualifies) {
      nameBox.innerHTML = go.saved
        ? `<p class="hs-saved">Gemt som <strong></strong></p>`
        : '';
      if (go.saved) nameBox.querySelector('strong').textContent = go.saved.name;
    } else {
      nameBox.innerHTML = `
        <form class="hs-form" autocomplete="off">
          <label for="hs-name">Du kom på highscoren – skriv dit navn</label>
          <div class="hs-inputrow">
            <input id="hs-name" type="text" maxlength="${hs.NAME_MAX}" placeholder="dit navn"
                   enterkeyhint="done" aria-describedby="hs-error">
            <button type="submit" class="btn btn-save" ${go.busy ? 'disabled' : ''}>
              ${go.busy ? 'Gemmer…' : 'Gem'}
            </button>
          </div>
          <p class="hs-error" id="hs-error" role="status">${go.error}</p>
        </form>`;
      const input = nameBox.querySelector('#hs-name');
      input.value = go.draft;
      input.addEventListener('input', () => { go.draft = input.value; });
      nameBox.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveScore(input.value);
      });
      if (!go.busy && document.activeElement !== input) setTimeout(() => input.focus(), 40);
    }

    // ---- faneblade ----
    const tabs = document.getElementById('hs-tabs');
    tabs.innerHTML = '';
    const addTab = (id, label) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hs-tab' + (go.tab === id ? ' active' : '');
      b.textContent = label;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(go.tab === id));
      b.addEventListener('click', () => { go.tab = id; this.renderHighscore(); });
      tabs.appendChild(b);
    };
    addTab('local', 'Denne computer');
    if (onlineOn) addTab('online', 'Online');

    // ---- listen ----
    const list = go.tab === 'online' ? hs.online.scores.slice(0, hs.TOP) : local;
    const ol = document.getElementById('hs-list');
    ol.innerHTML = '';
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'hs-empty';
      li.textContent = hs.online.state === 'henter' && go.tab === 'online'
        ? 'Henter listen…'
        : 'Ingen på listen endnu – vær den første.';
      ol.appendChild(li);
    }
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const li = document.createElement('li');
      const isMine = go.saved && e.name === go.saved.name
        && e.distance === go.saved.distance && Math.abs((e.ts || 0) - go.saved.ts) < 5000;
      li.className = 'hs-row' + (isMine ? ' mine' : '');
      const pos = document.createElement('span');
      pos.className = 'hs-pos';
      pos.textContent = (i + 1) + '.';
      const nm = document.createElement('span');
      nm.className = 'hs-name';
      nm.textContent = e.name;                    // textContent: navne kan aldrig blive til markup
      const dist = document.createElement('span');
      dist.className = 'hs-dist';
      dist.textContent = e.distance + ' m';
      const por = document.createElement('span');
      por.className = 'hs-portals';
      por.textContent = e.portals + (e.portals === 1 ? ' portal' : ' portaler');
      li.append(pos, nm, dist, por);
      ol.appendChild(li);
    }

    // ---- fodnote ----
    const note = document.getElementById('hs-note');
    if (go.tab === 'online') {
      note.textContent = hs.online.state === 'klar'
        ? 'Fælles liste for alle der spiller.'
        : hs.online.state === 'henter'
          ? 'Henter …'
          : 'Kunne ikke nå online-listen lige nu. Den lokale liste virker stadig.';
    } else {
      note.textContent = 'Gemt i denne browser.';
    }
  }

  async saveScore(rawName) {
    const go = this.go;
    const name = hs.cleanName(rawName);
    if (!name) { go.error = 'Skriv et navn først.'; return this.renderHighscore(); }
    if (hs.isBlocked(name)) { go.error = 'Vælg et pænere navn.'; return this.renderHighscore(); }

    go.error = '';
    go.busy = true;
    this.renderHighscore();

    const entry = { ...go.entry, name };
    hs.rememberName(name);
    hs.addLocal(entry);

    if (hs.online.state === 'klar' || hs.online.state === 'fejl') {
      const res = await hs.submitOnline(entry);
      if (res && !res.ok && res.reason === 'blocked_name') {
        go.busy = false;
        go.error = 'Vælg et pænere navn.';
        return this.renderHighscore();
      }
    }

    go.busy = false;
    go.saved = entry;
    this.renderHighscore();
  }

  enableTouch() { this.touchEnabled = true; }
}
