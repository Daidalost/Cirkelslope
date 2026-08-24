// track.js — den procedurelle sliske: form, huller, brudte baner, søjler,
// ildringe og portaler.
//
// Banen er tre kørebaner bred. Et "lanebrud" lukker en eller to af dem over en
// strækning, og alle brud og huller er snappet til banens knudepunkter, så det
// man ser er præcis det man kan køre på.

import { Mesh } from './gl.js';
import { emptyGeo, pushVert, finish } from './geometry.js';
import { clamp } from './mat.js';

export const DZ = 2;                  // afstand mellem banepunkter
export const CHUNK_NODES = 32;        // 64 enheder pr. mesh-klump
export const VIEW_AHEAD = 300;        // hvor langt frem banen bygges
export const VIEW_BEHIND = 70;

export const PORTAL_FIRST = 230;
export const PORTAL_SPACING = 330;

/** Kørebanernes kanter som andel af den halve banebredde. */
export const LANE_U = [-1, -1 / 3, 1 / 3, 1];
/** Midten af hver kørebane, brugt når noget skal placeres i én bane. */
export const LANE_CENTER = [-2 / 3, 0, 2 / 3];
const ALL_OPEN = [true, true, true];

/** Ildringene: radius, rørtykkelse og højde over banen. */
export const HOOP_R = 2.9;
export const HOOP_TUBE = 0.32;
export const HOOP_Y = 5.25;
export const HOOP_BONUS = 40;

/** Lille deterministisk tilfældighedsgenerator, så en bane kan gentages. */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const snap = (z) => Math.round(z / DZ) * DZ;

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
    this.laneBreaks = [];  // {z0, z1, open:[bool,bool,bool]}
    this.obstacles = [];   // {z, x, r}
    this.hoops = [];       // {z, lane, u, taken}
    this.portals = [];     // {z, index, solved}

    this.featuresUpTo = 0;
    this.nextLaneZ = PORTAL_FIRST + 2 * PORTAL_SPACING;   // først efter et par portaler
    this.nextGapZ = 320;
    this.nextObstacleZ = 170;
    this.nextHoopZ = 150;
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

  // ---- hvad er der under kuglen? -------------------------------------

  isGap(z) {
    for (const g of this.gaps) {
      if (z >= g.z0 && z < g.z1) return true;
    }
    return false;
  }

  /** Hvilke af de tre kørebaner findes her? */
  lanesAt(z) {
    for (const s of this.laneBreaks) {
      if (z >= s.z0 && z < s.z1) return s.open;
    }
    return ALL_OPEN;
  }

  laneIndex(z, x) {
    const t = (x - this.centerX(z)) / this.halfWidth(z);
    if (t < -1 || t > 1) return -1;
    return t < -1 / 3 ? 0 : (t < 1 / 3 ? 1 : 2);
  }

  /** Er der fast grund under punktet? Tager både huller og lanebrud med. */
  isSolid(z, x) {
    if (this.isGap(z)) return false;
    const lane = this.laneIndex(z, x);
    if (lane < 0) return false;
    return this.lanesAt(z)[lane];
  }

  /** Punktprøve af banen på en vilkårlig z. */
  sample(z) {
    return {
      x: this.centerX(z),
      y: this.height(z),
      half: this.halfWidth(z),
      gap: this.isGap(z),
      lanes: this.lanesAt(z),
    };
  }

  portalNear(z, range = 40) {
    return this.portals.some(p => Math.abs(p.z - z) < range);
  }

  laneBreakNear(z, range = 8) {
    return this.laneBreaks.some(s => z + range > s.z0 && z - range < s.z1);
  }

  obstacleNear(z, range = 12) {
    return this.obstacles.some(o => Math.abs(o.z - z) < range);
  }

  // ---- udlægning af banens indhold ------------------------------------

  ensureFeatures(untilZ) {
    if (untilZ <= this.featuresUpTo) return;

    // 1) portaler først — alt andet holder sig væk fra dem
    while (PORTAL_FIRST + this.portals.length * PORTAL_SPACING < untilZ) {
      const z = PORTAL_FIRST + this.portals.length * PORTAL_SPACING;
      this.portals.push({ z, index: this.portals.length, solved: false });
    }

    // 2) lanebrud: strækninger hvor en eller to kørebaner mangler
    while (this.nextLaneZ < untilZ) {
      const z0 = snap(this.nextLaneZ);
      const d = this.difficulty(z0);
      const len = snap(34 + 18 * this.rnd() + 14 * d);
      if (!this.portalNear(z0, 48) && !this.portalNear(z0 + len, 48)) {
        const open = [true, true, true];
        // jo sværere, jo oftere er der kun én bane tilbage
        if (d > 0.4 && this.rnd() < 0.10 + 0.40 * d) {
          const keep = Math.floor(this.rnd() * 3);
          open[0] = open[1] = open[2] = false;
          open[keep] = true;
        } else {
          open[Math.floor(this.rnd() * 3)] = false;
        }
        this.laneBreaks.push({ z0, z1: z0 + len, open });
      }
      this.nextLaneZ += 190 - 70 * d + this.rnd() * 90;
    }

    // 3) huller man skal hoppe over
    while (this.nextGapZ < untilZ) {
      const z0 = snap(this.nextGapZ);
      const d = this.difficulty(z0);
      const len = snap(6 + 5 * d + this.rnd() * 3);
      if (!this.portalNear(z0, 50) && !this.portalNear(z0 + len, 50) &&
          !this.laneBreakNear(z0, 14) && !this.laneBreakNear(z0 + len, 14)) {
        this.gaps.push({ z0, z1: z0 + len });
      }
      this.nextGapZ += 140 - 35 * d + this.rnd() * 60;
    }

    // 4) runde søjler man skal styre udenom — aldrig hvor banen er brudt
    while (this.nextObstacleZ < untilZ) {
      const z = this.nextObstacleZ;
      const d = this.difficulty(z);
      if (!this.portalNear(z, 32) && !this.isGap(z) && !this.isGap(z + 4) &&
          !this.laneBreakNear(z, 10)) {
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

    // 5) ildringe man kan hoppe igennem — altid i en bane der findes.
    // Duer stedet ikke, rykker vi kun et lille stykke frem og prøver igen,
    // så ringene ikke bliver sjældne bare fordi der lige lå en søjle.
    while (this.nextHoopZ < untilZ) {
      const z = snap(this.nextHoopZ);
      const lanes = this.lanesAt(z);
      const open = [0, 1, 2].filter(L => lanes[L]);
      const fits = open.length && !this.portalNear(z, 40) &&
        !this.isGap(z) && !this.isGap(z + 6) && !this.obstacleNear(z, 11);
      if (fits) {
        const lane = open[Math.floor(this.rnd() * open.length)];
        this.hoops.push({ z, lane, u: LANE_CENTER[lane], taken: false });
        this.nextHoopZ += 95 + this.rnd() * 70;
      } else {
        this.nextHoopZ += 16;
      }
    }

    this.featuresUpTo = untilZ;
  }

  /** Ildringens midtpunkt i verdenskoordinater. */
  hoopCenter(h) {
    return {
      x: this.centerX(h.z) + h.u * this.halfWidth(h.z),
      y: this.height(h.z) + HOOP_Y,
    };
  }

  // ---- mesh-bygning ---------------------------------------------------

  buildChunk(index) {
    const startNode = index * CHUNK_NODES;
    const surf = emptyGeo();
    const rail = emptyGeo();

    const nodeAt = (i) => {
      const z = i * DZ;
      return { z, x: this.centerX(z), y: this.height(z), half: this.halfWidth(z), gap: this.isGap(z) };
    };

    /**
     * Tværgående endeflade + lysende tværbjælke dér hvor kørebanen slipper op.
     * Fladen vender hverken mod lyset eller mod himlen, så den får ekstra
     * lyshed med — ellers står bruddet som et sort hul.
     */
    const cap = (node, u0, u1, solidBehind, stripe) => {
      const X = (u) => node.x + u * node.half;
      const nz = solidBehind ? 1 : -1;
      const sh = 1.55 * stripe;
      let base = surf.pos.length / 3;
      pushVert(surf, X(u0), node.y, node.z, 0, 0, nz, sh, sh, sh);
      pushVert(surf, X(u1), node.y, node.z, 0, 0, nz, sh, sh, sh);
      pushVert(surf, X(u1), node.y - 3.0, node.z, 0, 0, nz, sh * 0.35, sh * 0.35, sh * 0.45);
      pushVert(surf, X(u0), node.y - 3.0, node.z, 0, 0, nz, sh * 0.35, sh * 0.35, sh * 0.45);
      surf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);

      const h = 0.42;
      const z0 = solidBehind ? node.z - 0.6 : node.z;
      const z1 = solidBehind ? node.z : node.z + 0.6;
      base = rail.pos.length / 3;
      pushVert(rail, X(u0), node.y + h, z0, 0, 1, 0);
      pushVert(rail, X(u1), node.y + h, z0, 0, 1, 0);
      pushVert(rail, X(u1), node.y + h, z1, 0, 1, 0);
      pushVert(rail, X(u0), node.y + h, z1, 0, 1, 0);
      rail.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    let prev = nodeAt(startNode);
    for (let i = startNode; i < startNode + CHUNK_NODES; i++) {
      const a = prev;
      const b = nodeAt(i + 1);
      prev = b;
      if (a.gap) continue;                       // hullet starter her

      const lanes = this.lanesAt(a.z);
      const nextLanes = this.lanesAt(b.z);
      const stripe = (i % 4 < 2) ? 1.0 : 0.87;
      const ax = (u) => a.x + u * a.half;
      const bx = (u) => b.x + u * b.half;

      // kørebanernes overflade
      for (let L = 0; L < 3; L++) {
        if (!lanes[L]) continue;
        const shade = (L === 1 ? 1.20 : 0.94) * stripe;
        const u0 = LANE_U[L], u1 = LANE_U[L + 1];
        const base = surf.pos.length / 3;
        pushVert(surf, ax(u0), a.y, a.z, 0, 1, 0, shade, shade, shade);
        pushVert(surf, ax(u1), a.y, a.z, 0, 1, 0, shade, shade, shade);
        pushVert(surf, bx(u1), b.y, b.z, 0, 1, 0, shade, shade, shade);
        pushVert(surf, bx(u0), b.y, b.z, 0, 1, 0, shade, shade, shade);
        surf.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }

      // lodrette kanter: overalt hvor en åben bane støder op til ingenting
      for (let k = 0; k <= 3; k++) {
        const leftOpen = k > 0 ? lanes[k - 1] : false;
        const rightOpen = k < 3 ? lanes[k] : false;
        if (leftOpen === rightOpen) continue;
        const dir = rightOpen ? 1 : -1;          // ind mod den åbne side
        const u = LANE_U[k];
        const axu = ax(u), bxu = bx(u);

        // skørt, så slisken har tykkelse
        const sh = 0.55 * stripe;
        let base = surf.pos.length / 3;
        pushVert(surf, axu, a.y, a.z, -dir, 0, 0, sh, sh, sh);
        pushVert(surf, axu, a.y - 3.0, a.z, -dir, 0, 0, sh * 0.5, sh * 0.5, sh * 0.6);
        pushVert(surf, bxu, b.y - 3.0, b.z, -dir, 0, 0, sh * 0.5, sh * 0.5, sh * 0.6);
        pushVert(surf, bxu, b.y, b.z, -dir, 0, 0, sh, sh, sh);
        surf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);

        // lysende kantliste — gør kanten tydelig i fart
        const h = 0.42;
        const inset = dir * 0.55;
        base = rail.pos.length / 3;
        pushVert(rail, axu, a.y + h, a.z, 0, 1, 0);
        pushVert(rail, axu + inset, a.y + h, a.z, 0, 1, 0);
        pushVert(rail, bxu + inset, b.y + h, b.z, 0, 1, 0);
        pushVert(rail, bxu, b.y + h, b.z, 0, 1, 0);
        rail.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);

        base = rail.pos.length / 3;
        pushVert(rail, axu + inset, a.y + h, a.z, dir, 0, 0, 0.7, 0.7, 0.7);
        pushVert(rail, axu + inset, a.y, a.z, dir, 0, 0, 0.5, 0.5, 0.5);
        pushVert(rail, bxu + inset, b.y, b.z, dir, 0, 0, 0.5, 0.5, 0.5);
        pushVert(rail, bxu + inset, b.y + h, b.z, dir, 0, 0, 0.7, 0.7, 0.7);
        rail.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }

      // hullets to kanter — hele banens bredde
      if (b.gap) {
        cap(b, -1, 1, true, stripe);
      } else if (this.isGap(a.z - DZ)) {
        cap(a, -1, 1, false, stripe);
      }

      // dér hvor en enkelt kørebane holder op eller begynder igen
      for (let L = 0; L < 3; L++) {
        if (lanes[L] === nextLanes[L]) continue;
        cap(b, LANE_U[L], LANE_U[L + 1], lanes[L], stripe);
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
