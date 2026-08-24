// track.js — den procedurelle sliske: form, huller, forhindringer og portaler.

import { Mesh } from './gl.js';
import { emptyGeo, pushVert, finish } from './geometry.js';
import { clamp } from './mat.js';

export const DZ = 2;                  // afstand mellem banepunkter
export const CHUNK_NODES = 32;        // 64 enheder pr. mesh-klump
export const VIEW_AHEAD = 300;        // hvor langt frem banen bygges
export const VIEW_BEHIND = 70;

export const PORTAL_FIRST = 230;
export const PORTAL_SPACING = 330;

/** Lille deterministisk tilfældighedsgenerator, så en bane kan gentages. */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Track {
  constructor(gl, seed = Date.now()) {
    this.gl = gl;
    this.rnd = mulberry32(seed);
    // faseforskydninger giver hver runde sin egen slyngning
    this.p1 = this.rnd() * Math.PI * 2;
    this.p2 = this.rnd() * Math.PI * 2;
    this.p3 = this.rnd() * Math.PI * 2;

    this.chunks = new Map();
    this.gaps = [];        // {z0, z1}
    this.obstacles = [];   // {z, x, r}
    this.portals = [];     // {z, index, solved}
    this.featuresUpTo = 0;
    this.nextGapZ = 320;
    this.nextObstacleZ = 170;
    this.ensureFeatures(VIEW_AHEAD + 400);
  }

  /** 0 i starten, 1 når banen er på sit sværeste. */
  difficulty(z) { return clamp(z / 2600, 0, 1); }

  centerX(z) {
    const d = this.difficulty(z);
    return Math.sin(z * 0.0115 + this.p1) * (4.5 + 8.5 * d)
         + Math.sin(z * 0.0041 + this.p2) * (6.0 + 11 * d);
  }

  height(z) {
    const d = this.difficulty(z);
    return -(0.095 * z + 0.000032 * z * z)
         + Math.sin(z * 0.019 + this.p3) * 1.5 * (0.4 + d);
  }

  halfWidth(z) {
    const d = this.difficulty(z);
    return 8.4 - 3.5 * d;
  }

  isGap(z) {
    for (const g of this.gaps) {
      if (z >= g.z0 && z <= g.z1) return true;
      if (g.z0 > z + 30) break;
    }
    return false;
  }

  /** Punktprøve af banen på en vilkårlig z. */
  sample(z) {
    return {
      x: this.centerX(z),
      y: this.height(z),
      half: this.halfWidth(z),
      gap: this.isGap(z),
    };
  }

  portalNear(z, range = 40) {
    return this.portals.some(p => Math.abs(p.z - z) < range);
  }

  /** Udlægger portaler, huller og forhindringer frem til en given afstand. */
  ensureFeatures(untilZ) {
    if (untilZ <= this.featuresUpTo) return;

    // 1) portaler først — resten skal holde sig væk fra dem
    while (PORTAL_FIRST + this.portals.length * PORTAL_SPACING < untilZ) {
      const z = PORTAL_FIRST + this.portals.length * PORTAL_SPACING;
      this.portals.push({ z, index: this.portals.length, solved: false });
    }

    // 2) huller man skal hoppe over
    while (this.nextGapZ < untilZ) {
      const z0 = this.nextGapZ;
      const d = this.difficulty(z0);
      const len = 6 + 5 * d + this.rnd() * 3;
      if (!this.portalNear(z0, 50) && !this.portalNear(z0 + len, 50)) {
        this.gaps.push({ z0, z1: z0 + len });
      }
      this.nextGapZ += 120 - 35 * d + this.rnd() * 60;
    }

    // 3) runde søjler man skal styre udenom
    while (this.nextObstacleZ < untilZ) {
      const z = this.nextObstacleZ;
      const d = this.difficulty(z);
      if (!this.portalNear(z, 32) && !this.isGap(z) && !this.isGap(z + 4)) {
        const half = this.halfWidth(z);
        const side = this.rnd() < 0.5 ? -1 : 1;
        this.obstacles.push({ z, x: this.centerX(z) + side * half * (0.30 + this.rnd() * 0.45), r: 1.5 });
        if (d > 0.45 && this.rnd() < 0.45) {
          // en ekstra søjle på den anden side danner en port man skal ramme
          this.obstacles.push({ z: z + 4, x: this.centerX(z + 4) - side * half * (0.55 + this.rnd() * 0.30), r: 1.4 });
        }
      }
      this.nextObstacleZ += 78 - 30 * d + this.rnd() * 40;
    }

    this.featuresUpTo = untilZ;
  }

  // ---- mesh-bygning -------------------------------------------------

  buildChunk(index) {
    const startNode = index * CHUNK_NODES;
    const surf = emptyGeo();
    const rail = emptyGeo();
    const COLS = [-1, -0.34, 0.34, 1];

    const nodeAt = (i) => {
      const z = i * DZ;
      return { z, x: this.centerX(z), y: this.height(z), half: this.halfWidth(z), gap: this.isGap(z) };
    };

    let prev = nodeAt(startNode);
    for (let i = startNode; i < startNode + CHUNK_NODES; i++) {
      const a = prev;
      const b = nodeAt(i + 1);
      prev = b;
      if (a.gap || b.gap) continue;

      const stripe = (i % 4 < 2) ? 1.0 : 0.87;

      // overflade i tre bånd, hvor midterbåndet er lysere (kørebane)
      for (let c = 0; c < COLS.length - 1; c++) {
        const shade = (c === 1 ? 1.20 : 0.94) * stripe;
        const u0 = COLS[c], u1 = COLS[c + 1];
        const base = surf.pos.length / 3;
        pushVert(surf, a.x + u0 * a.half, a.y, a.z, 0, 1, 0, shade, shade, shade);
        pushVert(surf, a.x + u1 * a.half, a.y, a.z, 0, 1, 0, shade, shade, shade);
        pushVert(surf, b.x + u1 * b.half, b.y, b.z, 0, 1, 0, shade, shade, shade);
        pushVert(surf, b.x + u0 * b.half, b.y, b.z, 0, 1, 0, shade, shade, shade);
        surf.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }

      // sider (skørt) så slisken har tykkelse
      for (const side of [-1, 1]) {
        const sh = 0.55 * stripe;
        const base = surf.pos.length / 3;
        const ax = a.x + side * a.half, bx = b.x + side * b.half;
        pushVert(surf, ax, a.y, a.z, side, 0, 0, sh, sh, sh);
        pushVert(surf, ax, a.y - 3.0, a.z, side, 0, 0, sh * 0.5, sh * 0.5, sh * 0.6);
        pushVert(surf, bx, b.y - 3.0, b.z, side, 0, 0, sh * 0.5, sh * 0.5, sh * 0.6);
        pushVert(surf, bx, b.y, b.z, side, 0, 0, sh, sh, sh);
        if (side > 0) surf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        else surf.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }

      // lysende kantliste — gør kanten tydelig i fart
      for (const side of [-1, 1]) {
        const ax = a.x + side * a.half, bx = b.x + side * b.half;
        const inset = -side * 0.55;
        const base = rail.pos.length / 3;
        const h = 0.42;
        pushVert(rail, ax, a.y + h, a.z, 0, 1, 0);
        pushVert(rail, ax + inset, a.y + h, a.z, 0, 1, 0);
        pushVert(rail, bx + inset, b.y + h, b.z, 0, 1, 0);
        pushVert(rail, bx, b.y + h, b.z, 0, 1, 0);
        rail.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
        const base2 = rail.pos.length / 3;
        pushVert(rail, ax + inset, a.y + h, a.z, -side, 0, 0, 0.7, 0.7, 0.7);
        pushVert(rail, ax + inset, a.y, a.z, -side, 0, 0, 0.5, 0.5, 0.5);
        pushVert(rail, bx + inset, b.y, b.z, -side, 0, 0, 0.5, 0.5, 0.5);
        pushVert(rail, bx + inset, b.y + h, b.z, -side, 0, 0, 0.7, 0.7, 0.7);
        if (side < 0) rail.idx.push(base2, base2 + 1, base2 + 2, base2, base2 + 2, base2 + 3);
        else rail.idx.push(base2, base2 + 2, base2 + 1, base2, base2 + 3, base2 + 2);
      }
    }

    const out = { surface: null, rail: null };
    if (surf.idx.length) out.surface = new Mesh(this.gl, finish(surf));
    if (rail.idx.length) out.rail = new Mesh(this.gl, finish(rail));
    return out;
  }

  /** Bygger nye klumper foran spilleren og smider dem bag ud igen. */
  update(ballZ) {
    this.ensureFeatures(ballZ + VIEW_AHEAD + 200);
    const chunkLen = CHUNK_NODES * DZ;
    const first = Math.floor((ballZ - VIEW_BEHIND) / chunkLen);
    const last = Math.floor((ballZ + VIEW_AHEAD) / chunkLen);
    for (let i = first; i <= last; i++) {
      if (!this.chunks.has(i)) this.chunks.set(i, this.buildChunk(i));
    }
    for (const [i, c] of this.chunks) {
      if (i < first - 1 || i > last + 1) {
        c.surface?.dispose();
        c.rail?.dispose();
        this.chunks.delete(i);
      }
    }
  }

  dispose() {
    for (const c of this.chunks.values()) { c.surface?.dispose(); c.rail?.dispose(); }
    this.chunks.clear();
  }
}
