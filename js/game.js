// game.js — spillets kerne: fysik, kamera, portaler, pickups og tegneløkke.

import { Renderer } from './gl.js';
import {
  Track, VIEW_AHEAD, mulberry32, HOOP_R, HOOP_TUBE, HOOP_BONUS, PICKUP_R, ALT_OFFSET,
} from './track.js';
import { World, PALETTE, createAssets } from './world.js';
import { makeQuestion } from './questions.js';
import { FX_INFO } from './ui.js';
import { mat4, perspective, lookAt, compose, clamp, damp } from './mat.js';
import { initAudio, sfx } from './audio.js';

const BALL_R      = 0.95;
const GRAVITY     = 34;
const JUMP_V      = 14;      // hoppet skal kunne nå op i ildringene
const LAT_ACC     = 52;
const LAT_MAX     = 21;
const FALL_DEATH  = 18;      // hvor langt under det laveste dæk man er "væk"
const PILLAR_H    = 3.2;
const PORTAL_LEAD = 17;      // opgaven dukker op lige før portalen, så man kan se den forfra
const STEP_UP     = 0.8;     // så meget kan underlaget stige på én frame, før det er en kant
const STEP_DOWN   = 1.6;     // og så meget kan det falde, før man flyver af

/** Pickups: hvor længe de varer (sekunder), og hvor kraftigt de virker. */
export const FX_DURATION = { turbo: 5, bullet: 5, lowg: 6 };
const TURBO_SCALE  = 1.45;   // fart
const BULLET_SCALE = 0.45;   // tid
const LOWG_SCALE   = 0.42;   // tyngdekraft
const PICKUP_TEXT  = { turbo: 'Turbo!', bullet: 'Bullet time!', lowg: 'Lav tyngde!' };

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ui = ui;
    this.renderer = new Renderer(canvas);
    this.assets = createAssets(this.renderer.gl);

    this.proj = mat4();
    this.view = mat4();
    this.model = mat4();

    this.state = 'menu';
    this.time = 0;
    this.keys = { left: false, right: false, jump: false };
    this.best = this.loadBest();

    this.bindInput();
    window.addEventListener('resize', () => this.renderer.resize());

    this.ui.onStart = () => this.start();
    this.ui.onRestart = () => this.start();
    this.ui.onCorrect = () => sfx.correct();
    this.ui.onWrong = () => sfx.wrong();

    this.reset(Date.now());
    this.ui.showMenu();
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  // ---- opsætning ----------------------------------------------------

  loadBest() {
    try { return parseFloat(localStorage.getItem('cirkelslisken.best') || '0') || 0; }
    catch { return 0; }
  }
  saveBest(v) {
    try { localStorage.setItem('cirkelslisken.best', String(v)); } catch { /* privat browsing */ }
  }

  reset(seed) {
    this.track?.dispose();
    this.rnd = mulberry32(seed >>> 0);
    this.track = new Track(this.renderer.gl, seed >>> 0);
    this.world = new World(this.track, mulberry32((seed * 7919) >>> 0));
    const s = this.track.sample(0);
    this.ball = {
      x: s.x, y: s.y + BALL_R, z: 0,
      vx: 0, vy: 0, grounded: true, rollX: 0, rollZ: 0,
      doomed: false, doomCause: null,
      deckOff: 0,                 // hvor højt over grundbanen det dæk ligger, man sidst stod på
    };
    this.camX = s.x;
    this.camY = s.y + 7;
    this.lookX = s.x;
    this.camDeck = 0;
    this.fovBoost = 0;
    this.fx = { turbo: 0, bullet: 0, lowg: 0 };
    this.portalsSolved = 0;
    this.hoopsTaken = 0;
    this.pickupsTaken = 0;
    this.bonus = 0;
    this.attemptsTotal = 0;
    this.currentPortal = null;
    this.lastShape = null;
    this.track.update(0);
  }

  /** Kørte meter plus bonus fra ildringene. */
  get score() { return this.ball.z + this.bonus; }

  /** `seed` er valgfrit og bruges kun når man vil gentage præcis samme bane. */
  start(seed) {
    initAudio();
    this.reset(seed === undefined ? Date.now() : seed);
    this.state = 'playing';
    this.ui.showPlaying();
  }

  bindInput() {
    const set = (code, down) => {
      if (code === 'ArrowLeft' || code === 'KeyA') this.keys.left = down;
      else if (code === 'ArrowRight' || code === 'KeyD') this.keys.right = down;
      else if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') {
        if (down && !this.keys.jump) this.wantJump = true;
        this.keys.jump = down;
      } else return false;
      return true;
    };

    window.addEventListener('keydown', (e) => {
      if (this.state === 'question') return;              // lad tastaturet tilhøre svarfeltet
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.repeat) { if (set(e.code, true)) e.preventDefault(); return; }
      if (set(e.code, true)) e.preventDefault();
      if ((e.code === 'Space' || e.code === 'Enter') && this.state !== 'playing') {
        e.preventDefault();
        this.start();
      }
    });
    window.addEventListener('keyup', (e) => { if (set(e.code, false)) e.preventDefault(); });
    window.addEventListener('blur', () => { this.keys.left = this.keys.right = this.keys.jump = false; });

    // touch-knapper til telefon og tablet
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      this.ui.enableTouch();
      const hook = (id, on, off) => {
        const el = document.getElementById(id);
        if (!el) return;
        const start = (e) => { e.preventDefault(); on(); };
        const end = (e) => { e.preventDefault(); off(); };
        el.addEventListener('touchstart', start, { passive: false });
        el.addEventListener('touchend', end);
        el.addEventListener('touchcancel', end);
      };
      hook('t-left',  () => this.keys.left = true,  () => this.keys.left = false);
      hook('t-right', () => this.keys.right = true, () => this.keys.right = false);
      hook('t-jump',  () => { this.wantJump = true; }, () => {});
    }
  }

  // ---- fysik --------------------------------------------------------

  speedAt(z) {
    // starter i 21 m/s (ca. 76 km/t) og stiger til 33 m/s, når banen er på sit sværeste
    return 21 + 12 * this.track.difficulty(z);
  }

  /** Den fart kuglen faktisk har lige nu — med turbo. */
  currentSpeed() {
    return this.speedAt(this.ball.z) * (this.fx.turbo > 0 ? TURBO_SCALE : 1);
  }

  update(dt) {
    this.time += dt;
    if (this.state !== 'playing') {
      this.world.update(this.ball.z, this.time);
      return;
    }

    // effekterne tæller ned i rigtig tid, så bullet time også varer 5 rigtige sekunder
    for (const k of Object.keys(this.fx)) {
      if (this.fx[k] > 0) this.fx[k] = Math.max(0, this.fx[k] - dt);
    }
    // ... men selve verden bevæger sig langsommere i bullet time
    const pdt = dt * (this.fx.bullet > 0 ? BULLET_SCALE : 1);
    const gravity = GRAVITY * (this.fx.lowg > 0 ? LOWG_SCALE : 1);

    const b = this.ball;
    const tr = this.track;
    const speed = this.currentSpeed();
    const prevZ = b.z;
    b.z += speed * pdt;

    // Styring. Kameraet kigger ned ad banen langs +z, og så peger verdens +x
    // mod venstre på skærmen. Derfor trækker højre pil fra x.
    const input = (this.keys.left ? 1 : 0) - (this.keys.right ? 1 : 0);
    if (input !== 0) b.vx += input * LAT_ACC * pdt;
    else b.vx = damp(b.vx, 0, 7, pdt);
    b.vx = clamp(b.vx, -LAT_MAX, LAT_MAX);
    b.x += b.vx * pdt;

    // Underlaget er den højeste faste flade under kuglen — grundbanen eller et af
    // de alternative dæk. Rampen op og ned følges blødt; falder fladen pludselig
    // meget (fx enden af et dæk), letter kuglen og falder ned på det næste.
    const bottom = b.y - BALL_R;
    const ground = tr.groundBelow(b.z, b.x, bottom + STEP_UP);
    const canStand = ground !== null && bottom - ground <= STEP_DOWN;

    if (this.wantJump && b.grounded && canStand) {
      b.vy = JUMP_V;
      b.grounded = false;
      sfx.jump();
    }
    this.wantJump = false;

    if (b.grounded && canStand) {
      b.y = ground + BALL_R;
      b.vy = 0;
      b.deckOff = ground - tr.height(b.z);
    } else {
      b.vy -= gravity * pdt;
      b.y += b.vy * pdt;
      if (!b.doomed && ground !== null && b.vy <= 0 && b.y - BALL_R <= ground) {
        if (!b.grounded) sfx.land();
        b.y = ground + BALL_R; b.vy = 0; b.grounded = true;
        b.deckOff = ground - tr.height(b.z);
      } else {
        b.grounded = false;
        // Fortabt: der er intet under kuglen, og den er allerede under det laveste dæk.
        // Indtil da kan den stadig nå over et hul eller lande på et dæk længere nede.
        if (!b.doomed &&
            tr.groundBelow(b.z, b.x, b.y - BALL_R + STEP_UP) === null &&
            b.y - BALL_R <= tr.lowestDeck(b.z) + 0.1) {
          b.doomed = true;
          b.doomCause = tr.isGap(b.z) ? 'Du faldt ned i hullet.'
            : tr.laneIndex(b.z, b.x) < 0 ? 'Du røg ud over kanten.'
            : 'Du kørte ud hvor kørebanen manglede.';
        }
      }
    }

    // rotation, så kuglen ser ud til at rulle
    b.rollX += (speed * pdt) / BALL_R;
    b.rollZ -= (b.vx * pdt) / BALL_R;

    if (b.doomed && b.y < tr.lowestDeck(b.z) - FALL_DEATH) {
      return this.die(b.doomCause || 'Du faldt ned.');
    }

    // ramte en søjle? (de står kun på grundbanen)
    for (const o of tr.obstacles) {
      if (o.z < prevZ - 4) continue;
      if (o.z > b.z + 4) break;
      const base = tr.height(o.z);
      if (Math.abs(o.z - b.z) < o.r + BALL_R * 0.9 &&
          Math.abs(o.x - b.x) < o.r + BALL_R * 0.9 &&
          b.y - BALL_R < base + PILLAR_H && b.y + BALL_R > base) {
        return this.die('Du ramte en søjle.');
      }
    }

    // hoppede vi gennem en ildring?
    for (const h of tr.hoops) {
      if (h.z < prevZ - 5) continue;
      if (h.z > b.z + 5) break;
      if (!h.taken && prevZ < h.z && b.z >= h.z) {
        const c = tr.hoopCenter(h);
        if (Math.hypot(b.x - c.x, b.y - c.y) < HOOP_R - HOOP_TUBE - BALL_R * 0.6) {
          h.taken = true;
          this.hoopsTaken++;
          this.bonus += HOOP_BONUS;
          sfx.hoop();
          this.ui.flashBonus(HOOP_BONUS);
        }
      }
    }

    // fangede vi en pickup?
    for (const p of tr.pickups) {
      if (p.z < prevZ - 5) continue;
      if (p.z > b.z + 5) break;
      if (!p.taken && prevZ <= p.z + 1.2 && b.z >= p.z - 1.2) {
        const c = tr.pickupCenter(p);
        if (Math.hypot(b.x - c.x, b.y - c.y) < PICKUP_R + BALL_R) {
          p.taken = true;
          this.pickupsTaken++;
          this.fx[p.type] = FX_DURATION[p.type];      // samme slags igen forlænger bare tiden
          sfx.pickup(p.type);
          this.ui.toast(PICKUP_TEXT[p.type], FX_INFO[p.type].cls);
        }
      }
    }

    // nåede vi en portal? (ikke hvis man allerede er ved at falde)
    for (const p of tr.portals) {
      if (!p.passed && !b.doomed && b.z >= p.z - PORTAL_LEAD) {
        p.passed = true;
        this.enterPortal(p);
        break;
      }
    }

    tr.update(b.z);
    this.world.update(b.z, this.time);

    const next = tr.portals.find(p => !p.passed);
    this.ui.updateHud({
      distance: this.score,
      portals: this.portalsSolved,
      hoops: this.hoopsTaken,
      speed,
      nextPortal: next ? next.z - b.z : null,
    });
    this.ui.updateFx(this.fx, FX_DURATION);
  }

  /**
   * Spillet fryser, mens man regner. Kuglen røres ikke — når man trykker
   * Fortsæt, kører den videre med præcis samme placering, retning og fart,
   * også hvis den var midt i et hop, og ruller selv igennem den åbne portal.
   */
  enterPortal(p) {
    this.state = 'question';
    this.currentPortal = p;
    sfx.portal();
    const q = makeQuestion(p.index, this.rnd, this.lastShape);
    this.lastShape = q.shape;
    this.currentQuestion = q;
    this.keys.left = this.keys.right = false;
    this.ui.showQuestion(q, {
      onSolved: ({ attempts }) => {
        p.solved = true;
        this.portalsSolved++;
        this.attemptsTotal += attempts;
        this.state = 'playing';
        this.ui.showPlaying();
      },
      onFailed: () => {
        this.state = 'playing';
        this.die(`Tre forkerte svar ved portal ${p.index + 1}.`);
      },
    });
  }

  die(cause) {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    sfx.death();
    const dist = this.score;
    const newBest = dist > this.best;
    if (newBest) { this.best = dist; this.saveBest(dist); }
    this.ui.showGameOver({
      distance: dist, portals: this.portalsSolved, hoops: this.hoopsTaken, cause,
      best: this.best, newBest,
    });
  }

  // ---- tegning ------------------------------------------------------

  render(dt) {
    const r = this.renderer;
    const gl = r.gl;
    const aspect = r.resize();
    const b = this.ball;
    const tr = this.track;

    r.drawSky(PALETTE.skyTop, PALETTE.skyMid, PALETTE.skyBottom, this.time);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    // Kamera: bagved og lidt over kuglen, kigger ned ad slisken. Sidelæns følger det
    // kuglen i forhold til banens midte, så det bliver over den rigtige kørebane,
    // når man kører ned under eller op over grundbanen.
    const cx = tr.centerX(b.z);
    this.camX = damp(this.camX, cx + (b.x - cx) * 0.72, 5, dt);
    this.camY = damp(this.camY, b.y + 6.2, 6, dt);
    this.lookX = damp(this.lookX, cx + (b.x - cx) * 0.9, 6, dt);
    this.camDeck = damp(this.camDeck, b.deckOff, 3.5, dt);
    const eye = [this.camX, this.camY, b.z - 13.5];
    const target = [this.lookX, tr.height(b.z + 22) + this.camDeck + 3.0, b.z + 22];
    // smallere skærm (portrættelefon) får bredere synsfelt, så banen stadig kan overskues
    this.fovBoost = damp(this.fovBoost, this.fx.turbo > 0 && this.state === 'playing' ? 9 : 0, 4, dt);
    const fov = (aspect < 0.85 ? 76 : 62) + this.fovBoost;
    perspective(this.proj, (fov * Math.PI) / 180, aspect, 0.5, 620);
    lookAt(this.view, eye, target, [0, 1, 0]);

    r.beginScene({
      proj: this.proj, view: this.view, camPos: eye,
      lightDir: [0.35, 0.86, -0.35],
      fogColor: PALETTE.fog, fogNear: 90, fogFar: 330,
    });

    // baggrundsverden
    this.world.draw(r, this.assets);

    // banen — grundbanen og de alternative dæk
    for (const c of tr.chunks.values()) {
      if (c.surface) r.draw(c.surface, null, PALETTE.track);
      if (c.rail) r.draw(c.rail, null, PALETTE.rail, 0.75);
      if (c.altSurface) r.draw(c.altSurface, null, PALETTE.altTrack);
      if (c.altRail) r.draw(c.altRail, null, PALETTE.altRail, 0.75);
    }
    this.drawSupports(r);

    // søjler
    for (const o of tr.obstacles) {
      if (o.z < b.z - 25 || o.z > b.z + VIEW_AHEAD) continue;
      const y = tr.height(o.z);
      compose(this.model, [o.x, y + PILLAR_H / 2, o.z], [0, this.time * 0.6, 0], [o.r, PILLAR_H, o.r]);
      r.draw(this.assets.pillar, this.model, PALETTE.obstacle, 0.15);
      compose(this.model, [o.x, y + 0.25, o.z], [Math.PI / 2, 0, 0], [o.r * 1.5, o.r * 1.5, o.r * 1.5]);
      r.draw(this.assets.ring, this.model, PALETTE.obstacle, 0.6);
    }

    // kuglen
    compose(this.model, [b.x, b.y, b.z], [b.rollX, 0, b.rollZ], [BALL_R, BALL_R, BALL_R]);
    r.draw(this.assets.ball, this.model, PALETTE.ball, 0.1);
    compose(this.model, [b.x, b.y, b.z], [b.rollX, 0, b.rollZ], [BALL_R, BALL_R, BALL_R]);
    r.draw(this.assets.ballBand, this.model, PALETTE.ballRing, 0.5);
    compose(this.model, [b.x, b.y, b.z], [b.rollX, Math.PI / 2, b.rollZ], [BALL_R, BALL_R, BALL_R]);
    r.draw(this.assets.ballBand, this.model, PALETTE.ballRing, 0.5);

    // skygge på den flade kuglen er over
    const gy = tr.groundBelow(b.z, b.x, b.y - BALL_R + 0.05);
    if (gy !== null) {
      const drop = clamp((b.y - BALL_R - gy) / 6, 0, 1);
      const sc = BALL_R * (1.5 - 0.5 * drop);
      compose(this.model, [b.x, gy + 0.1, b.z], [0, 0, 0], [sc, sc, sc]);
      r.setBlend(true);
      r.draw(this.assets.disc, this.model, [0.05, 0.02, 0.10], 1, 0.35 * (1 - drop * 0.7));
      r.setBlend(false);
    }

    this.drawPickups(r);
    this.drawHoops(r);
    this.drawPortals(r);
  }

  /** Tynde søjler uden for banens kanter, der binder de to dæk sammen. */
  drawSupports(r) {
    const b = this.ball;
    const tr = this.track;
    for (const seg of tr.altSegs) {
      if (seg.z1 < b.z - 30 || seg.z0 > b.z + VIEW_AHEAD) continue;
      const end = seg.dir < 0 ? seg.exitStart : seg.z1;
      for (let z = seg.rampEnd + 8; z < end - 4; z += 26) {
        const y0 = tr.height(z);
        const top = Math.max(y0, y0 + seg.dir * ALT_OFFSET) + 0.2;
        const bot = Math.min(y0, y0 + seg.dir * ALT_OFFSET) - 3.5;
        const h = top - bot;
        const cx = tr.centerX(z), half = tr.halfWidth(z);
        for (const side of [-1, 1]) {
          const x = cx + side * (half + 0.9);
          compose(this.model, [x, bot + h / 2, z], [0, 0, 0], [0.32, h, 0.32]);
          r.draw(this.assets.pillar, this.model, PALETTE.altRail, 0.35);
        }
      }
    }
  }

  /** Pickups: en glødende kugle med en ring om, farvet efter effekt. */
  drawPickups(r) {
    const b = this.ball;
    const t = this.time;
    for (const p of this.track.pickups) {
      if (p.taken || p.z < b.z - 10 || p.z > b.z + VIEW_AHEAD) continue;
      const c = this.track.pickupCenter(p);
      const col = PALETTE[p.type];
      const bob = Math.sin(t * (p.type === 'lowg' ? 2.2 : 3.4) + p.z) * (p.type === 'lowg' ? 0.38 : 0.16);
      const y = c.y + bob;
      compose(this.model, [c.x, y, p.z], [t * 0.9, t * 1.3, 0], [0.55, 0.55, 0.55]);
      r.draw(this.assets.planet, this.model, col, 0.75);

      // turbo snurrer hurtigt, bullet time langsomt med to ringe, lav tyngde vipper
      const spin = p.type === 'turbo' ? 5.5 : p.type === 'bullet' ? 0.7 : 1.6;
      compose(this.model, [c.x, y, p.z], [Math.PI / 2 + (p.type === 'lowg' ? 0.5 : 0), t * spin, 0], [1.05, 1.05, 1.05]);
      r.draw(this.assets.ringFat, this.model, col, 0.9);
      if (p.type === 'bullet') {
        compose(this.model, [c.x, y, p.z], [0, t * spin, Math.PI / 2], [1.05, 1.05, 1.05]);
        r.draw(this.assets.ringFat, this.model, col, 0.9);
      }
      r.setBlend(true);
      compose(this.model, [c.x, y, p.z], [0, 0, 0], [1.25, 1.25, 1.25]);
      r.draw(this.assets.planet, this.model, col, 1, 0.16 + 0.06 * Math.sin(t * 5 + p.z));
      r.setBlend(false);
    }
  }

  /** Ildringene: en flakkende ring man kan hoppe igennem. */
  drawHoops(r) {
    const b = this.ball;
    const t = this.time;
    for (const h of this.track.hoops) {
      if (h.z < b.z - 25 || h.z > b.z + VIEW_AHEAD) continue;
      const c = this.track.hoopCenter(h);
      // to usammenhængende svingninger giver et uroligt, flammeagtigt liv
      const flick = 1 + Math.sin(t * 13 + h.z) * 0.030 + Math.sin(t * 7.3 + h.z * 0.5) * 0.022;
      const s = HOOP_R * flick;

      if (h.taken) {
        compose(this.model, [c.x, c.y, h.z], [0, 0, t * 0.4], [s, s, s]);
        r.draw(this.assets.hoopRing, this.model, PALETTE.portal, 0.7);
        continue;
      }

      compose(this.model, [c.x, c.y, h.z], [0, 0, t * 1.5], [s, s, s]);
      r.draw(this.assets.hoopRing, this.model, PALETTE.fire, 1);

      r.setBlend(true);
      const g1 = s * 1.13, g2 = s * 1.28;
      compose(this.model, [c.x, c.y, h.z], [0, 0, -t * 2.1], [g1, g1, g1]);
      r.draw(this.assets.hoopGlow, this.model, PALETTE.fireGlow, 1, 0.42);
      compose(this.model, [c.x, c.y, h.z], [0, 0, t * 1.1], [g2, g2, g2]);
      r.draw(this.assets.hoopGlow, this.model, PALETTE.fireDeep, 1, 0.22);
      r.setBlend(false);
    }
  }

  drawPortals(r) {
    const b = this.ball;
    const t = this.time;
    for (const p of this.track.portals) {
      if (p.z < b.z - 40 || p.z > b.z + VIEW_AHEAD) continue;
      const cx = this.track.centerX(p.z);
      const cy = this.track.height(p.z);
      const R = this.track.halfWidth(p.z) + 3.8;
      const col = p.solved ? PALETTE.portal : PALETTE.portalOff;
      const pulse = 1 + Math.sin(t * 2.2 + p.index) * 0.02;
      const cyc = cy + R * 0.42;

      compose(this.model, [cx, cyc, p.z], [0, 0, t * 0.5], [R * pulse, R * pulse, R * pulse]);
      r.draw(this.assets.portalRing, this.model, col, 0.85);
      compose(this.model, [cx, cyc, p.z], [0, 0, -t * 0.32], [R * 1.16, R * 1.16, R * 1.16]);
      r.draw(this.assets.ring, this.model, col, 0.7);
      compose(this.model, [cx, cyc, p.z - 1.2], [0, 0, t * 0.22], [R * 1.34, R * 1.34, R * 1.34]);
      r.draw(this.assets.ring, this.model, col, 0.5);

      // gennemsigtig "membran" i portalen
      if (!p.solved) {
        r.setBlend(true);
        const a = 0.14 + 0.05 * Math.sin(t * 3 + p.index);
        compose(this.model, [cx, cyc, p.z], [-Math.PI / 2, 0, 0], [R * 0.97, R * 0.97, R * 0.97]);
        r.draw(this.assets.disc, this.model, col, 1, a);
        r.setBlend(false);
      }
    }
  }

  loop = (now) => {
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    if (!document.hidden) {
      this.update(dt);
      this.render(dt);
    }
    requestAnimationFrame(this.loop);
  };
}
