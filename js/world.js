// world.js — den cirkulære verden omkring slisken: svævende ringe, planeter og måner.

import { Mesh } from './gl.js';
import { sphere, torus, cylinder, disc } from './geometry.js';
import { compose, mat4 } from './mat.js';

export const PALETTE = {
  track:     [0.30, 0.24, 0.52],
  rail:      [0.42, 0.92, 1.00],
  ball:      [1.00, 0.62, 0.30],
  ballRing:  [1.00, 0.95, 0.80],
  obstacle:  [1.00, 0.36, 0.62],
  portal:    [0.45, 1.00, 0.85],
  portalOff: [1.00, 0.80, 0.35],
  skyTop:    [0.05, 0.04, 0.14],
  skyMid:    [0.16, 0.09, 0.32],
  skyBottom: [0.42, 0.18, 0.42],
  fog:       [0.22, 0.12, 0.36],
};

const DECOR_COLORS = [
  [0.45, 0.90, 1.00],
  [1.00, 0.45, 0.75],
  [0.65, 0.55, 1.00],
  [1.00, 0.80, 0.40],
  [0.50, 1.00, 0.75],
];

/** Alle delte geometrier, uploadet én gang. */
export function createAssets(gl) {
  return {
    ball:      new Mesh(gl, sphere(1, 28, 20)),
    ballBand:  new Mesh(gl, torus(1.0, 0.13, 36, 8)),
    planet:    new Mesh(gl, sphere(1, 20, 14)),
    ring:      new Mesh(gl, torus(1, 0.07, 56, 8)),
    ringFat:   new Mesh(gl, torus(1, 0.16, 48, 10)),
    portalRing:new Mesh(gl, torus(1, 0.055, 72, 10)),
    pillar:    new Mesh(gl, cylinder(1, 1, 20)),
    disc:      new Mesh(gl, disc(1, 40)),
    speck:     new Mesh(gl, sphere(1, 8, 6)),
  };
}

export class World {
  constructor(track, rnd) {
    this.track = track;
    this.rnd = rnd;
    this.items = [];
    this.specks = [];
    this.m = mat4();
    for (let i = 0; i < 34; i++) this.items.push(this.spawnItem(60 + i * 26));
    for (let i = 0; i < 70; i++) this.specks.push(this.spawnSpeck(40 + i * 12));
  }

  spawnItem(z) {
    const r = this.rnd;
    const side = r() < 0.5 ? -1 : 1;
    const kinds = ['ring', 'ring', 'planet', 'ringed', 'moon'];
    return {
      kind: kinds[Math.floor(r() * kinds.length)],
      z,
      x: side * (34 + r() * 95),
      dy: -18 + r() * 60,
      scale: 5 + r() * 16,
      spin: (r() - 0.5) * 0.5,
      tilt: r() * Math.PI,
      phase: r() * Math.PI * 2,
      color: DECOR_COLORS[Math.floor(r() * DECOR_COLORS.length)],
    };
  }

  spawnSpeck(z) {
    const r = this.rnd;
    return {
      z,
      x: (r() - 0.5) * 220,
      dy: -25 + r() * 80,
      scale: 0.25 + r() * 0.7,
      phase: r() * Math.PI * 2,
      color: DECOR_COLORS[Math.floor(r() * DECOR_COLORS.length)],
    };
  }

  update(ballZ, time) {
    this.time = time;
    const ahead = 420;
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].z < ballZ - 70) this.items[i] = this.spawnItem(ballZ + ahead + this.rnd() * 60);
    }
    for (let i = 0; i < this.specks.length; i++) {
      if (this.specks[i].z < ballZ - 50) this.specks[i] = this.spawnSpeck(ballZ + ahead + this.rnd() * 80);
    }
  }

  draw(r, assets) {
    const t = this.time || 0;
    for (const it of this.items) {
      const y = this.track.height(it.z) + it.dy + Math.sin(t * 0.35 + it.phase) * 1.6;
      const rot = [it.tilt, t * it.spin + it.phase, it.tilt * 0.4];
      const s = it.scale;
      switch (it.kind) {
        case 'ring':
          compose(this.m, [it.x, y, it.z], rot, [s, s, s]);
          r.draw(assets.ring, this.m, it.color, 0.45);
          compose(this.m, [it.x, y, it.z], [rot[0], rot[1] + 0.6, rot[2]], [s * 0.62, s * 0.62, s * 0.62]);
          r.draw(assets.ring, this.m, it.color, 0.3);
          break;
        case 'planet':
          compose(this.m, [it.x, y, it.z], rot, [s * 0.7, s * 0.7, s * 0.7]);
          r.draw(assets.planet, this.m, it.color, 0.08);
          break;
        case 'ringed':
          compose(this.m, [it.x, y, it.z], rot, [s * 0.55, s * 0.55, s * 0.55]);
          r.draw(assets.planet, this.m, it.color, 0.08);
          compose(this.m, [it.x, y, it.z], [1.2 + it.tilt * 0.3, t * it.spin, 0.4], [s * 1.05, s * 1.05, s * 1.05]);
          r.draw(assets.ringFat, this.m, it.color, 0.35);
          break;
        case 'moon':
          compose(this.m, [it.x, y, it.z], [Math.PI / 2 + it.tilt * 0.15, 0, 0], [s * 0.8, s * 0.8, s * 0.8]);
          r.draw(assets.disc, this.m, it.color, 0.55);
          break;
      }
    }
    for (const sp of this.specks) {
      const y = this.track.height(sp.z) + sp.dy + Math.sin(t * 0.8 + sp.phase) * 0.8;
      compose(this.m, [sp.x, y, sp.z], [0, 0, 0], [sp.scale, sp.scale, sp.scale]);
      r.draw(assets.speck, this.m, sp.color, 0.7);
    }
  }
}
