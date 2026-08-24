// game.js — spillets kerne: fysik, kamera, portaler og tegneløkke.

import { Renderer } from './gl.js';
import { Track, VIEW_AHEAD, mulberry32 } from './track.js';
import { World, PALETTE, createAssets } from './world.js';
import { makeQuestion } from './questions.js';
import { mat4, perspective, lookAt, compose, clamp, damp } from './mat.js';
import { initAudio, sfx } from './audio.js';

const BALL_R      = 0.95;
const GRAVITY     = 34;
const JUMP_V      = 12.6;
const LAT_ACC     = 52;
const LAT_MAX     = 21;
const FALL_DEATH  = 26;      // hvor langt under banen man er "væk"
const PILLAR_H    = 3.2;
const PORTAL_LEAD = 17;      // opgaven dukker op lige før portalen, så man kan se den forfra

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
    };
    this.camX = s.x;
    this.camY = s.y + 7;
    this.lookX = s.x;
    this.portalsSolved = 0;
    this.attemptsTotal = 0;
    this.currentPortal = null;
    this.track.update(0);
  }

  start() {
    initAudio();
    this.reset(Date.now());
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
    return 17 + 15 * this.track.difficulty(z);
  }

  update(dt) {
    this.time += dt;
    if (this.state !== 'playing') {
      this.world.update(this.ball.z, this.time);
      return;
    }

    const b = this.ball;
    const speed = this.speedAt(b.z);
    const prevZ = b.z;
    b.z += speed * dt;

    // styring til siderne
    const input = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    if (input !== 0) b.vx += input * LAT_ACC * dt;
    else b.vx = damp(b.vx, 0, 7, dt);
    b.vx = clamp(b.vx, -LAT_MAX, LAT_MAX);
    b.x += b.vx * dt;

    const s = this.track.sample(b.z);
    const groundY = s.y + BALL_R;
    const onTrack = !s.gap && Math.abs(b.x - s.x) <= s.half;

    // hop
    if (this.wantJump && b.grounded && onTrack) {
      b.vy = JUMP_V;
      b.grounded = false;
      sfx.jump();
    }
    this.wantJump = false;

    if (b.grounded && onTrack) {
      b.y = groundY;
      b.vy = 0;
    } else {
      b.vy -= GRAVITY * dt;
      b.y += b.vy * dt;
      if (onTrack && b.vy <= 0 && b.y <= groundY) {
        if (!b.grounded) sfx.land();
        b.y = groundY; b.vy = 0; b.grounded = true;
      } else {
        b.grounded = false;
      }
    }

    // rotation, så kuglen ser ud til at rulle
    b.rollX += (speed * dt) / BALL_R;
    b.rollZ -= (b.vx * dt) / BALL_R;

    // faldet ud over kanten eller ned i et hul?
    if (b.y < s.y - FALL_DEATH) {
      return this.die(s.gap ? 'Du faldt ned i hullet.' : 'Du røg ud over kanten.');
    }

    // ramte en søjle?
    for (const o of this.track.obstacles) {
      if (o.z < prevZ - 4) continue;
      if (o.z > b.z + 4) break;
      if (Math.abs(o.z - b.z) < o.r + BALL_R * 0.9 &&
          Math.abs(o.x - b.x) < o.r + BALL_R * 0.9 &&
          b.y - BALL_R < this.track.height(o.z) + PILLAR_H) {
        return this.die('Du ramte en søjle.');
      }
    }

    // nåede vi en portal?
    for (const p of this.track.portals) {
      if (!p.passed && b.z >= p.z - PORTAL_LEAD) {
        p.passed = true;
        this.enterPortal(p);
        break;
      }
    }

    this.track.update(b.z);
    this.world.update(b.z, this.time);

    const next = this.track.portals.find(p => !p.passed);
    this.ui.updateHud({
      distance: b.z,
      portals: this.portalsSolved,
      speed,
      nextPortal: next ? next.z - b.z : null,
    });
  }

  enterPortal(p) {
    this.state = 'question';
    this.currentPortal = p;
    sfx.portal();
    const q = makeQuestion(p.index, this.rnd);
    this.ui.showQuestion(q, ({ attempts }) => {
      p.solved = true;
      this.portalsSolved++;
      this.attemptsTotal += attempts;
      // sæt kuglen midt på banen igen, så man ikke dør i samme sekund man fortsætter –
      // og så ruller man selv igennem den nu åbne portal
      const b = this.ball;
      b.x = this.track.centerX(b.z);
      b.y = this.track.height(b.z) + BALL_R;
      b.vx = 0; b.vy = 0; b.grounded = true;
      this.track.update(b.z);
      this.state = 'playing';
      this.ui.showPlaying();
    });
  }

  die(cause) {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    sfx.death();
    const dist = this.ball.z;
    const newBest = dist > this.best;
    if (newBest) { this.best = dist; this.saveBest(dist); }
    this.ui.showGameOver({
      distance: dist, portals: this.portalsSolved, cause,
      best: this.best, newBest,
    });
  }

  // ---- tegning ------------------------------------------------------

  render(dt) {
    const r = this.renderer;
    const gl = r.gl;
    const aspect = r.resize();
    const b = this.ball;

    r.drawSky(PALETTE.skyTop, PALETTE.skyMid, PALETTE.skyBottom, this.time);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    // kamera: bagved og lidt over kuglen, kigger ned ad slisken.
    // Udglatningen bruger den rigtige dt, så den føles ens ved 30 og 144 fps.
    this.camX = damp(this.camX, b.x * 0.72, 5, dt);
    this.camY = damp(this.camY, b.y + 6.2, 6, dt);
    this.lookX = damp(this.lookX, b.x * 0.9, 6, dt);
    const eye = [this.camX, this.camY, b.z - 13.5];
    const target = [this.lookX, this.track.height(b.z + 22) + 3.0, b.z + 22];
    // smallere skærm (portrættelefon) får bredere synsfelt, så banen stadig kan overskues
    const fov = aspect < 0.85 ? 76 : 62;
    perspective(this.proj, (fov * Math.PI) / 180, aspect, 0.5, 620);
    lookAt(this.view, eye, target, [0, 1, 0]);

    r.beginScene({
      proj: this.proj, view: this.view, camPos: eye,
      lightDir: [0.35, 0.86, -0.35],
      fogColor: PALETTE.fog, fogNear: 90, fogFar: 330,
    });

    // baggrundsverden
    this.world.draw(r, this.assets);

    // banen
    for (const c of this.track.chunks.values()) {
      if (c.surface) r.draw(c.surface, null, PALETTE.track);
      if (c.rail) r.draw(c.rail, null, PALETTE.rail, 0.75);
    }

    // søjler
    for (const o of this.track.obstacles) {
      if (o.z < b.z - 25 || o.z > b.z + VIEW_AHEAD) continue;
      const y = this.track.height(o.z);
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

    // skygge under kuglen
    const gs = this.track.sample(b.z);
    if (!gs.gap && Math.abs(b.x - gs.x) <= gs.half) {
      const drop = clamp((b.y - BALL_R - gs.y) / 6, 0, 1);
      const sc = BALL_R * (1.5 - 0.5 * drop);
      compose(this.model, [b.x, gs.y + 0.06, b.z], [0, 0, 0], [sc, sc, sc]);
      r.setBlend(true);
      r.draw(this.assets.disc, this.model, [0.05, 0.02, 0.10], 1, 0.35 * (1 - drop * 0.7));
      r.setBlend(false);
    }

    this.drawPortals(r);
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
