// track.js — den procedurelle sliske: form, huller, brudte baner, søjler,
// ildringe, pickups, portaler — og alternative dæk over og under grundbanen.
//
// Banen er tre kørebaner bred. Et "lanebrud" lukker en eller to af dem over en
// strækning, og alle brud og huller er snappet til banens knudepunkter, så det
// man ser er præcis det man kan køre på.
//
// Et alternativt dæk ("alt") ligger lige over eller under grundbanen ("main"):
//
//   Over:  rampe op i én kørebane  →  dæk i fuld bredde  →  dækket ender, man falder ned
//   Under: rampe ned i én kørebane →  dæk i fuld bredde  →  rampe op i fuld bredde
//
// Ved dækket under er grundbanen åben for rampen, og over hele rampen op til
// sidst, så alle — også dem der blev oppe — lander på den og kører med op.

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
const ALL_CLOSED = [false, false, false];
const ONLY = [[true, false, false], [false, true, false], [false, false, true]];
const ALL_BUT = [[false, true, true], [true, false, true], [true, true, false]];

/** Ildringene: radius, rørtykkelse og højde over banen. */
export const HOOP_R = 2.9;
export const HOOP_TUBE = 0.32;
export const HOOP_Y = 5.25;
export const HOOP_BONUS = 40;

/** Pickups svæver i kuglehøjde. */
export const PICKUP_TYPES = ['turbo', 'bullet', 'lowg'];
export const PICKUP_Y = 1.35;
export const PICKUP_R = 0.85;

/** Alternative dæk: rampelængde og højdeforskel. */
export const ALT_RAMP = 44;
export const ALT_OFFSET = 12;
const ALT_RENDER_BIAS = 0.04;         // løfter det alternative dæk en anelse, så det ikke flimrer mod grundbanen

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
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

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
    this.altSegs = [];     // {z0, z1, dir, lane, rampEnd, exitStart}
    this.obstacles = [];   // {z, x, r}
    this.hoops = [];       // {z, lane, u, deck, taken}
    this.pickups = [];     // {z, lane, u, deck, type, taken}
    this.portals = [];     // {z, index, solved}

    this.featuresUpTo = 0;
    this.nextAltZ = PORTAL_FIRST + 60;                    // første gaffel lige efter første portal
    this.nextLaneZ = PORTAL_FIRST + 2 * PORTAL_SPACING;   // lanebrud først efter et par portaler
    this.nextGapZ = 320;
    this.nextObstacleZ = 170;
    this.nextHoopZ = 150;
    this.nextPickupZ = 280;
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

  /** Hvilke kørebaner lanebrud lader stå her (uden huller og dæk). */
  lanesAt(z) {
    for (const s of this.laneBreaks) {
      if (z >= s.z0 && z < s.z1) return s.open;
    }
    return ALL_OPEN;
  }

  altAt(z) {
    for (const s of this.altSegs) {
      if (z >= s.z0 && z < s.z1) return s;
    }
    return null;
  }

  /** Det alternative dæks højde over (+) eller under (−) grundbanen. */
  altOffset(z, seg) {
    const full = seg.dir * ALT_OFFSET;
    if (z < seg.rampEnd) return full * smooth((z - seg.z0) / ALT_RAMP);
    if (seg.dir < 0 && z >= seg.exitStart) return full * smooth((seg.z1 - z) / ALT_RAMP);
    return full;
  }

  /** Grundbanens kørebaner — med huller, lanebrud og plads til ramper. */
  mainLanesAt(z) {
    if (this.isGap(z)) return ALL_CLOSED;
    const seg = this.altAt(z);
    if (seg && seg.dir < 0) {
      if (z < seg.rampEnd) return ALL_BUT[seg.lane];     // rampen ned skærer igennem grundbanen
      if (z >= seg.exitStart) return ALL_CLOSED;          // rampen op fylder hele bredden
    }
    if (seg) return ALL_OPEN;
    return this.lanesAt(z);
  }

  /** Det alternative dæks kørebaner. */
  altLanesAt(z) {
    const seg = this.altAt(z);
    if (!seg) return ALL_CLOSED;
    if (z < seg.rampEnd) return ONLY[seg.lane];
    return ALL_OPEN;
  }

  laneIndex(z, x) {
    const t = (x - this.centerX(z)) / this.halfWidth(z);
    if (t < -1 || t > 1) return -1;
    return t < -1 / 3 ? 0 : (t < 1 / 3 ? 1 : 2);
  }

  /** Er der fast grund på grundbanen under punktet? */
  isSolid(z, x) {
    const lane = this.laneIndex(z, x);
    return lane >= 0 && this.mainLanesAt(z)[lane];
  }

  /** Overfladens højde på et dæk i en bestemt kørebane — eller null. */
  deckSurfaceY(deck, z, lane) {
    if (deck === 'main') return this.mainLanesAt(z)[lane] ? this.height(z) : null;
    const seg = this.altAt(z);
    if (!seg || !this.altLanesAt(z)[lane]) return null;
    return this.height(z) + this.altOffset(z, seg);
  }

  /** Højden af et dæk her, uanset om der lige er hul i det. */
  deckY(z, deck) {
    if (deck !== 'alt') return this.height(z);
    const seg = this.altAt(z);
    return this.height(z) + (seg ? this.altOffset(z, seg) : 0);
  }

  /** Den højeste faste flade under punktet, som ligger lavere end maxY — eller null. */
  groundBelow(z, x, maxY) {
    const lane = this.laneIndex(z, x);
    if (lane < 0) return null;
    let best = null;
    for (const deck of ['main', 'alt']) {
      const y = this.deckSurfaceY(deck, z, lane);
      if (y !== null && y <= maxY && (best === null || y > best)) best = y;
    }
    return best;
  }

  /** Det laveste dæk her. Er kuglen under det uden grund under sig, er den væk. */
  lowestDeck(z) {
    const y0 = this.height(z);
    const seg = this.altAt(z);
    if (seg && seg.dir < 0) return Math.min(y0, y0 + this.altOffset(z, seg));
    return y0;
  }

  /** Punktprøve af grundbanen på en vilkårlig z. */
  sample(z) {
    return {
      x: this.centerX(z),
      y: this.height(z),
      half: this.halfWidth(z),
      gap: this.isGap(z),
      lanes: this.mainLanesAt(z),
    };
  }

  portalNear(z, range = 40) {
    return this.portals.some(p => Math.abs(p.z - z) < range);
  }

  laneBreakNear(z, range = 8) {
    return this.laneBreaks.some(s => z + range > s.z0 && z - range < s.z1);
  }

  altNear(z, range = 10) {
    return this.altSegs.some(s => z + range > s.z0 && z - range < s.z1);
  }

  obstacleNear(z, range = 12) {
    return this.obstacles.some(o => Math.abs(o.z - z) < range);
  }

  hoopNear(z, range = 12) {
    return this.hoops.some(h => Math.abs(h.z - z) < range);
  }

  // ---- udlægning af banens indhold ------------------------------------

  ensureFeatures(untilZ) {
    if (untilZ <= this.featuresUpTo) return;

    // 1) portaler først — alt andet holder sig væk fra dem
    while (PORTAL_FIRST + this.portals.length * PORTAL_SPACING < untilZ + 700) {
      const z = PORTAL_FIRST + this.portals.length * PORTAL_SPACING;
      this.portals.push({ z, index: this.portals.length, solved: false });
    }

    // 2) alternative dæk over eller under grundbanen. De lægges ud et godt stykke
    // længere fremme end resten, så huller og søjler altid kan se dem og holde afstand.
    while (this.nextAltZ < untilZ + 400) {
      const z0 = snap(this.nextAltZ);
      const dir = this.rnd() < 0.5 ? 1 : -1;
      const mid = snap(70 + this.rnd() * 40);
      const len = dir > 0 ? ALT_RAMP + mid : ALT_RAMP * 2 + mid;
      const blocked = this.portals.some(p => p.z > z0 - 30 && p.z < z0 + len + 30);
      if (!blocked) {
        const seg = {
          z0, z1: z0 + len, dir,
          lane: Math.floor(this.rnd() * 3),
          rampEnd: z0 + ALT_RAMP,
          exitStart: dir < 0 ? z0 + len - ALT_RAMP : z0 + len,
        };
        this.altSegs.push(seg);
        this.placeAltRewards(seg);
        this.nextAltZ += len + 380 + this.rnd() * 300;
      } else {
        this.nextAltZ += 30;
      }
    }

    // 3) lanebrud: strækninger hvor en eller to kørebaner mangler
    while (this.nextLaneZ < untilZ) {
      const z0 = snap(this.nextLaneZ);
      const d = this.difficulty(z0);
      const len = snap(34 + 18 * this.rnd() + 14 * d);
      if (!this.portalNear(z0, 48) && !this.portalNear(z0 + len, 48) &&
          !this.altNear(z0, 24) && !this.altNear(z0 + len, 24)) {
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

    // 4) huller man skal hoppe over
    while (this.nextGapZ < untilZ) {
      const z0 = snap(this.nextGapZ);
      const d = this.difficulty(z0);
      const len = snap(6 + 5 * d + this.rnd() * 3);
      if (!this.portalNear(z0, 50) && !this.portalNear(z0 + len, 50) &&
          !this.laneBreakNear(z0, 14) && !this.laneBreakNear(z0 + len, 14) &&
          !this.altNear(z0, 26) && !this.altNear(z0 + len, 26)) {
        this.gaps.push({ z0, z1: z0 + len });
      }
      this.nextGapZ += 140 - 35 * d + this.rnd() * 60;
    }

    // 5) runde søjler man skal styre udenom — aldrig hvor banen er brudt eller deler sig
    while (this.nextObstacleZ < untilZ) {
      const z = this.nextObstacleZ;
      const d = this.difficulty(z);
      if (!this.portalNear(z, 32) && !this.isGap(z) && !this.isGap(z + 4) &&
          !this.laneBreakNear(z, 10) && !this.altNear(z, 14)) {
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

    // 6) ildringe man kan hoppe igennem — altid i en bane der findes.
    // Duer stedet ikke, rykker vi kun et lille stykke frem og prøver igen,
    // så ringene ikke bliver sjældne bare fordi der lige lå en søjle.
    while (this.nextHoopZ < untilZ) {
      const z = snap(this.nextHoopZ);
      const lanes = this.mainLanesAt(z);
      const open = [0, 1, 2].filter(L => lanes[L]);
      const fits = open.length && !this.portalNear(z, 40) && !this.altNear(z, 10) &&
        !this.isGap(z) && !this.isGap(z + 6) && !this.obstacleNear(z, 11);
      if (fits) {
        const lane = open[Math.floor(this.rnd() * open.length)];
        this.hoops.push({ z, lane, u: LANE_CENTER[lane], deck: 'main', taken: false });
        this.nextHoopZ += 95 + this.rnd() * 70;
      } else {
        this.nextHoopZ += 16;
      }
    }

    // 7) pickups på grundbanen
    while (this.nextPickupZ < untilZ) {
      const z = snap(this.nextPickupZ);
      const lanes = this.mainLanesAt(z);
      const open = [0, 1, 2].filter(L => lanes[L]);
      const fits = open.length && !this.portalNear(z, 40) && !this.altNear(z, 10) &&
        !this.isGap(z) && !this.isGap(z + 4) && !this.obstacleNear(z, 10) && !this.hoopNear(z, 14);
      if (fits) {
        const lane = open[Math.floor(this.rnd() * open.length)];
        this.pickups.push({
          z, lane, u: LANE_CENTER[lane], deck: 'main',
          type: PICKUP_TYPES[Math.floor(this.rnd() * PICKUP_TYPES.length)], taken: false,
        });
        this.nextPickupZ += 230 + this.rnd() * 170;
      } else {
        this.nextPickupZ += 14;
      }
    }

    // spillet løber listerne igennem i z-orden, og dækkets belønninger kom ind tidligere
    this.hoops.sort((a, b) => a.z - b.z);
    this.pickups.sort((a, b) => a.z - b.z);
    this.featuresUpTo = untilZ;
  }

  /** Det alternative dæk skal kunne betale sig: en pickup og en ildring. */
  placeAltRewards(seg) {
    const m0 = seg.rampEnd + 12;
    const m1 = (seg.dir < 0 ? seg.exitStart : seg.z1) - 14;
    if (m1 < m0 + 20) return;
    const lane1 = Math.floor(this.rnd() * 3);
    this.pickups.push({
      z: snap(m0 + (m1 - m0) * 0.3), lane: lane1, u: LANE_CENTER[lane1], deck: 'alt',
      type: PICKUP_TYPES[Math.floor(this.rnd() * PICKUP_TYPES.length)], taken: false,
    });
    const lane2 = Math.floor(this.rnd() * 3);
    this.hoops.push({ z: snap(m0 + (m1 - m0) * 0.78), lane: lane2, u: LANE_CENTER[lane2], deck: 'alt', taken: false });
  }

  /** Ildringens midtpunkt i verdenskoordinater. */
  hoopCenter(h) {
    return {
      x: this.centerX(h.z) + h.u * this.halfWidth(h.z),
      y: this.deckY(h.z, h.deck) + HOOP_Y,
    };
  }

  pickupCenter(p) {
    return {
      x: this.centerX(p.z) + p.u * this.halfWidth(p.z),
      y: this.deckY(p.z, p.deck) + PICKUP_Y,
    };
  }

  // ---- mesh-bygning ---------------------------------------------------

  /**
   * Bygger ét dæk mellem to knudepunkter: overflade for de åbne kørebaner,
   * skørter og lysende kantlister langs siderne, og endeflader dér hvor en bane
   * holder op eller begynder. Endefladen springes over, hvor det andet dæk
   * fortsætter i samme højde — fx hvor en rampe glider over i grundbanen.
   */
  emitDeck(geo, deck, A, B, ya, yb, lanes, nextLanes, stripe) {
    const { surf, rail } = geo;
    const other = deck === 'main' ? 'alt' : 'main';
    const ax = (u) => A.x + u * A.half;
    const bx = (u) => B.x + u * B.half;

    // overflade
    for (let L = 0; L < 3; L++) {
      if (!lanes[L]) continue;
      const shade = (L === 1 ? 1.20 : 0.94) * stripe;
      const u0 = LANE_U[L], u1 = LANE_U[L + 1];
      const base = surf.pos.length / 3;
      pushVert(surf, ax(u0), ya, A.z, 0, 1, 0, shade, shade, shade);
      pushVert(surf, ax(u1), ya, A.z, 0, 1, 0, shade, shade, shade);
      pushVert(surf, bx(u1), yb, B.z, 0, 1, 0, shade, shade, shade);
      pushVert(surf, bx(u0), yb, B.z, 0, 1, 0, shade, shade, shade);
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

      const sh = 0.55 * stripe;
      let base = surf.pos.length / 3;
      pushVert(surf, axu, ya, A.z, -dir, 0, 0, sh, sh, sh);
      pushVert(surf, axu, ya - 3.0, A.z, -dir, 0, 0, sh * 0.5, sh * 0.5, sh * 0.6);
      pushVert(surf, bxu, yb - 3.0, B.z, -dir, 0, 0, sh * 0.5, sh * 0.5, sh * 0.6);
      pushVert(surf, bxu, yb, B.z, -dir, 0, 0, sh, sh, sh);
      surf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);

      const h = 0.42;
      const inset = dir * 0.55;
      base = rail.pos.length / 3;
      pushVert(rail, axu, ya + h, A.z, 0, 1, 0);
      pushVert(rail, axu + inset, ya + h, A.z, 0, 1, 0);
      pushVert(rail, bxu + inset, yb + h, B.z, 0, 1, 0);
      pushVert(rail, bxu, yb + h, B.z, 0, 1, 0);
      rail.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);

      base = rail.pos.length / 3;
      pushVert(rail, axu + inset, ya + h, A.z, dir, 0, 0, 0.7, 0.7, 0.7);
      pushVert(rail, axu + inset, ya, A.z, dir, 0, 0, 0.5, 0.5, 0.5);
      pushVert(rail, bxu + inset, yb, B.z, dir, 0, 0, 0.5, 0.5, 0.5);
      pushVert(rail, bxu + inset, yb + h, B.z, dir, 0, 0, 0.7, 0.7, 0.7);
      rail.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    // endeflader ved B, hvor en bane holder op eller begynder
    for (let L = 0; L < 3; L++) {
      if (lanes[L] === nextLanes[L]) continue;
      const solidBehind = lanes[L];
      // fortsætter det andet dæk i samme højde, er der ingen kant at vise
      const oy = this.deckSurfaceY(other, solidBehind ? B.z : A.z, L);
      if (oy !== null && Math.abs(oy - yb) < 0.9) continue;
      this.emitCap(geo, B, yb, LANE_U[L], LANE_U[L + 1], solidBehind, stripe);
    }
  }

  /**
   * Tværgående endeflade + lysende tværbjælke dér hvor kørebanen slipper op.
   * Fladen vender hverken mod lyset eller mod himlen, så den får ekstra
   * lyshed med — ellers står bruddet som et sort hul.
   */
  emitCap(geo, node, y, u0, u1, solidBehind, stripe) {
    const { surf, rail } = geo;
    const X = (u) => node.x + u * node.half;
    const nz = solidBehind ? 1 : -1;
    const sh = 1.55 * stripe;
    let base = surf.pos.length / 3;
    pushVert(surf, X(u0), y, node.z, 0, 0, nz, sh, sh, sh);
    pushVert(surf, X(u1), y, node.z, 0, 0, nz, sh, sh, sh);
    pushVert(surf, X(u1), y - 3.0, node.z, 0, 0, nz, sh * 0.35, sh * 0.35, sh * 0.45);
    pushVert(surf, X(u0), y - 3.0, node.z, 0, 0, nz, sh * 0.35, sh * 0.35, sh * 0.45);
    surf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);

    const h = 0.42;
    const z0 = solidBehind ? node.z - 0.6 : node.z;
    const z1 = solidBehind ? node.z : node.z + 0.6;
    base = rail.pos.length / 3;
    pushVert(rail, X(u0), y + h, z0, 0, 1, 0);
    pushVert(rail, X(u1), y + h, z0, 0, 1, 0);
    pushVert(rail, X(u1), y + h, z1, 0, 1, 0);
    pushVert(rail, X(u0), y + h, z1, 0, 1, 0);
    rail.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  buildChunk(index) {
    const startNode = index * CHUNK_NODES;
    const main = { surf: emptyGeo(), rail: emptyGeo() };
    const alt = { surf: emptyGeo(), rail: emptyGeo() };

    const nodeAt = (i) => {
      const z = i * DZ;
      return { z, x: this.centerX(z), y: this.height(z), half: this.halfWidth(z) };
    };

    let prev = nodeAt(startNode);
    for (let i = startNode; i < startNode + CHUNK_NODES; i++) {
      const A = prev;
      const B = nodeAt(i + 1);
      prev = B;
      const stripe = (i % 4 < 2) ? 1.0 : 0.87;

      this.emitDeck(main, 'main', A, B, A.y, B.y, this.mainLanesAt(A.z), this.mainLanesAt(B.z), stripe);

      const seg = this.altAt(A.z) || this.altAt(B.z);
      if (seg) {
        const segA = this.altAt(A.z);
        const ya = A.y + (segA ? this.altOffset(A.z, segA) : 0) + ALT_RENDER_BIAS;
        const yb = B.y + this.altOffset(B.z, segA || seg) + ALT_RENDER_BIAS;
        this.emitDeck(alt, 'alt', A, B, ya, yb, this.altLanesAt(A.z), this.altLanesAt(B.z), stripe);
      }
    }

    const mk = (g) => (g.idx.length ? new Mesh(this.gl, finish(g)) : null);
    return {
      surface: mk(main.surf), rail: mk(main.rail),
      altSurface: mk(alt.surf), altRail: mk(alt.rail),
    };
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
        this.disposeChunk(c);
        this.chunks.delete(i);
      }
    }
  }

  disposeChunk(c) {
    c.surface?.dispose(); c.rail?.dispose();
    c.altSurface?.dispose(); c.altRail?.dispose();
  }

  dispose() {
    for (const c of this.chunks.values()) this.disposeChunk(c);
    this.chunks.clear();
  }
}
