// geometry.js — proceduelle former. Alt i verden er bygget af cirkler: kugler, ringe og cylindre.

/** Hjælper der samler positions/normals/colors/indices. */
export function emptyGeo() {
  return { pos: [], nor: [], col: [], idx: [] };
}

export function pushVert(g, x, y, z, nx, ny, nz, r = 1, gr = 1, b = 1) {
  g.pos.push(x, y, z);
  g.nor.push(nx, ny, nz);
  g.col.push(r, gr, b);
  return g.pos.length / 3 - 1;
}

export function finish(g) {
  return {
    pos: new Float32Array(g.pos),
    nor: new Float32Array(g.nor),
    col: new Float32Array(g.col),
    idx: g.idx.length > 65535 ? new Uint32Array(g.idx) : new Uint16Array(g.idx),
  };
}

/** UV-kugle. */
export function sphere(radius = 1, segs = 24, rings = 16) {
  const g = emptyGeo();
  for (let y = 0; y <= rings; y++) {
    const v = y / rings, phi = v * Math.PI;
    for (let x = 0; x <= segs; x++) {
      const u = x / segs, theta = u * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      pushVert(g, nx * radius, ny * radius, nz * radius, nx, ny, nz);
    }
  }
  const row = segs + 1;
  for (let y = 0; y < rings; y++) {
    for (let x = 0; x < segs; x++) {
      const a = y * row + x, b = a + row;
      g.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return finish(g);
}

/** Torus — spillets signaturform. R = ringens radius, r = rørets radius. */
export function torus(R = 3, r = 0.5, segs = 48, rSegs = 12) {
  const g = emptyGeo();
  for (let i = 0; i <= segs; i++) {
    const u = (i / segs) * Math.PI * 2;
    const cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= rSegs; j++) {
      const v = (j / rSegs) * Math.PI * 2;
      const cv = Math.cos(v), sv = Math.sin(v);
      const nx = cu * cv, ny = su * cv, nz = sv;
      pushVert(g, (R + r * cv) * cu, (R + r * cv) * su, r * sv, nx, ny, nz);
    }
  }
  const row = rSegs + 1;
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < rSegs; j++) {
      const a = i * row + j, b = a + row;
      g.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return finish(g);
}

/** Cylinder med låg, stående langs Y, centreret i (0,0,0). */
export function cylinder(radius = 1, height = 2, segs = 20) {
  const g = emptyGeo();
  const h = height / 2;
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    const nx = Math.cos(t), nz = Math.sin(t);
    pushVert(g, nx * radius, h, nz * radius, nx, 0, nz);
    pushVert(g, nx * radius, -h, nz * radius, nx, 0, nz);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    g.idx.push(a, b, c, c, b, d);
  }
  // låg
  for (const [y, ny] of [[h, 1], [-h, -1]]) {
    const center = pushVert(g, 0, y, 0, 0, ny, 0);
    const start = g.pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const t = (i / segs) * Math.PI * 2;
      pushVert(g, Math.cos(t) * radius, y, Math.sin(t) * radius, 0, ny, 0);
    }
    for (let i = 0; i < segs; i++) {
      if (ny > 0) g.idx.push(center, start + i, start + i + 1);
      else g.idx.push(center, start + i + 1, start + i);
    }
  }
  return finish(g);
}

/** Flad skive i XZ-planet — bruges som "måne", markør og platform. */
export function disc(radius = 1, segs = 32) {
  const g = emptyGeo();
  const center = pushVert(g, 0, 0, 0, 0, 1, 0);
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    pushVert(g, Math.cos(t) * radius, 0, Math.sin(t) * radius, 0, 1, 0);
  }
  for (let i = 0; i < segs; i++) g.idx.push(center, 1 + i, 1 + i + 1);
  return finish(g);
}

/** Boks — bruges til rækværk og sjældne kantdetaljer. */
export function box(w = 1, h = 1, d = 1) {
  const g = emptyGeo();
  const x = w / 2, y = h / 2, z = d / 2;
  const faces = [
    [[ x,-y,-z],[ x, y,-z],[ x, y, z],[ x,-y, z], [ 1, 0, 0]],
    [[-x,-y, z],[-x, y, z],[-x, y,-z],[-x,-y,-z], [-1, 0, 0]],
    [[-x, y,-z],[-x, y, z],[ x, y, z],[ x, y,-z], [ 0, 1, 0]],
    [[-x,-y, z],[-x,-y,-z],[ x,-y,-z],[ x,-y, z], [ 0,-1, 0]],
    [[-x,-y, z],[ x,-y, z],[ x, y, z],[-x, y, z], [ 0, 0, 1]],
    [[ x,-y,-z],[-x,-y,-z],[-x, y,-z],[ x, y,-z], [ 0, 0,-1]],
  ];
  for (const f of faces) {
    const n = f[4];
    const base = g.pos.length / 3;
    for (let i = 0; i < 4; i++) pushVert(g, f[i][0], f[i][1], f[i][2], n[0], n[1], n[2]);
    g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return finish(g);
}
