// figures.js — tegner opgavens figur som SVG med målene skrevet på.
//
// Tegningerne er målfaste: et rektangel på 12 × 3 ser også langt og smalt ud.
// Kun meget flade figurer får en minimumshøjde, så de stadig kan ses.

const W = 240, H = 200;
const SHAPE = 'fill="url(#fg)" stroke="#5ef2c8" stroke-width="3" stroke-linejoin="round"';

function frame(body, aria) {
  return `
  <svg viewBox="0 0 ${W} ${H}" class="q-fig" role="img" aria-label="${aria}">
    <defs>
      <linearGradient id="fg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#5ef2c8" stop-opacity="0.36"/>
        <stop offset="100%" stop-color="#7b6bff" stop-opacity="0.14"/>
      </linearGradient>
    </defs>
    ${body}
  </svg>`;
}

const f = (n) => Math.round(n * 10) / 10;

function text(x, y, label, { anchor = 'middle', rotate = 0, cls = 'q-flabel' } = {}) {
  const tr = rotate ? ` transform="rotate(${rotate} ${f(x)} ${f(y)})"` : '';
  return `<text x="${f(x)}" y="${f(y)}" text-anchor="${anchor}" class="${cls}"${tr}>${label}</text>`;
}

function dashed(x1, y1, x2, y2) {
  return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="#ffd166" stroke-width="2.5" stroke-dasharray="6 4"/>`;
}

/** Lille vinkel-firkant i hjørnet (x, y) med benene i retningerne sx og sy. */
function rightAngle(x, y, sx, sy, size = 11) {
  const a = x + sx * size, b = y + sy * size;
  return `<path d="M ${f(a)} ${f(y)} L ${f(a)} ${f(b)} L ${f(x)} ${f(b)}" fill="none" stroke="#ffd166" stroke-width="2"/>`;
}

/** Lille streg midt på en side — viser at sider er lige lange. */
function tick(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  return `<line x1="${f(mx - nx * 7)}" y1="${f(my - ny * 7)}" x2="${f(mx + nx * 7)}" y2="${f(my + ny * 7)}" stroke="#5ef2c8" stroke-width="2.5"/>`;
}

/**
 * Sætter en mål-tekst ud for midten af en side, på den side der vender væk fra
 * figurens midte, så teksten aldrig ligger oven i figuren.
 */
function sideLabel(x1, y1, x2, y2, cx, cy, label, gap = 16) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  let nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  if (nx * (mx - cx) + ny * (my - cy) < 0) { nx = -nx; ny = -ny; }
  const x = mx + nx * gap, y = my + ny * gap + 5;
  const anchor = nx < -0.35 ? 'end' : nx > 0.35 ? 'start' : 'middle';
  return text(x, y, label, { anchor });
}

// ---- figurerne ---------------------------------------------------------

function cirkel({ r, d, useD }) {
  const cx = 120, cy = 100, R = 74;
  if (useD) {
    return frame(`
      <circle cx="${cx}" cy="${cy}" r="${R}" ${SHAPE}/>
      <line x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}" stroke="#ffd166" stroke-width="3" stroke-dasharray="6 4"/>
      <circle cx="${cx}" cy="${cy}" r="3.5" fill="#ffd166"/>
      ${text(cx, cy - 12, `d = ${d} cm`)}`, `Cirkel med diameter ${d} cm`);
  }
  return frame(`
    <circle cx="${cx}" cy="${cy}" r="${R}" ${SHAPE}/>
    <line x1="${cx}" y1="${cy}" x2="${cx + R}" y2="${cy}" stroke="#ffd166" stroke-width="3" stroke-dasharray="6 4"/>
    <circle cx="${cx}" cy="${cy}" r="3.5" fill="#ffd166"/>
    ${text(cx + R / 2, cy - 12, `r = ${r} cm`)}`, `Cirkel med radius ${r} cm`);
}

function kvadrat({ s }) {
  const S = 124, x0 = (W - S) / 2, y0 = 22;
  const pts = [[x0, y0], [x0 + S, y0], [x0 + S, y0 + S], [x0, y0 + S]];
  const ticks = pts.map((p, i) => {
    const q = pts[(i + 1) % 4];
    return tick(p[0], p[1], q[0], q[1]);
  }).join('');
  return frame(`
    <rect x="${x0}" y="${y0}" width="${S}" height="${S}" ${SHAPE}/>
    ${ticks}
    ${text(W / 2, y0 + S + 26, `s = ${s} cm`)}`, `Kvadrat med siden ${s} cm`);
}

function rektangel({ l, b }) {
  const k = Math.min(176 / l, 122 / b);
  const RW = l * k, RH = Math.max(b * k, 38);
  const x0 = (W - RW) / 2 + 10, y0 = 18 + (124 - RH) / 2;
  return frame(`
    <rect x="${f(x0)}" y="${f(y0)}" width="${f(RW)}" height="${f(RH)}" ${SHAPE}/>
    ${text(x0 + RW / 2, y0 + RH + 26, `l = ${l} cm`)}
    ${text(x0 - 14, y0 + RH / 2, `b = ${b} cm`, { rotate: -90 })}`, `Rektangel ${l} gange ${b} cm`);
}

function parallelogram({ g, h, s, show }) {
  const dxCm = Math.sqrt(Math.max(s * s - h * h, 0));
  const k = Math.min(184 / (g + dxCm), 124 / h);
  const G = g * k, DX = dxCm * k, HH = Math.max(h * k, 44);
  const x0 = (W - (G + DX)) / 2, yb = 150, yt = yb - HH;
  const P = [[x0, yb], [x0 + G, yb], [x0 + G + DX, yt], [x0 + DX, yt]];
  const cx = x0 + (G + DX) / 2, cy = (yb + yt) / 2;
  let body = `<polygon points="${P.map(p => `${f(p[0])},${f(p[1])}`).join(' ')}" ${SHAPE}/>`;
  if (show.includes('g')) body += text(x0 + G / 2, yb + 26, `g = ${g} cm`);
  if (show.includes('s')) body += sideLabel(P[0][0], P[0][1], P[3][0], P[3][1], cx, cy, `s = ${s} cm`);
  if (show.includes('h')) {
    const hx = x0 + DX;
    body += dashed(hx, yt, hx, yb) + rightAngle(hx, yb, 1, -1);
    body += text(hx + 9, yb - Math.min(HH * 0.3, 22) + 4, `h = ${h} cm`, { anchor: 'start' });
  }
  return frame(body, `Parallelogram med grundlinje ${g} cm`);
}

function trekant({ g, h, p, a, b, show }) {
  const k = Math.min(178 / g, 126 / h);
  const G = g * k, HH = Math.max(h * k, 44), PP = p * k;
  const x0 = (W - G) / 2, yb = 152;
  const A = [x0, yb], B = [x0 + G, yb], C = [x0 + PP, yb - HH];
  const cx = (A[0] + B[0] + C[0]) / 3, cy = (A[1] + B[1] + C[1]) / 3;
  let body = `<polygon points="${[A, B, C].map(q => `${f(q[0])},${f(q[1])}`).join(' ')}" ${SHAPE}/>`;

  if (show.includes('c')) {
    // omkreds: kun siderne
    body += sideLabel(A[0], A[1], C[0], C[1], cx, cy, `a = ${a} cm`);
    body += sideLabel(B[0], B[1], C[0], C[1], cx, cy, `b = ${b} cm`);
    body += text(x0 + G / 2, yb + 26, `c = ${g} cm`);
    if (p === 0) body += rightAngle(A[0], A[1], 1, -1);
    if (p === g) body += rightAngle(B[0], B[1], -1, -1);
    return frame(body, `Trekant med siderne ${a}, ${b} og ${g} cm`);
  }

  // areal: grundlinje og højde — og eventuelt de skrå sider som lokkemad
  body += text(x0 + G / 2, yb + 26, `g = ${g} cm`);
  const hLabel = `h = ${h} cm`;
  if (p === 0) {
    body += rightAngle(A[0], A[1], 1, -1);
    body += sideLabel(A[0], A[1], C[0], C[1], cx, cy, hLabel);
  } else if (p === g) {
    body += rightAngle(B[0], B[1], -1, -1);
    body += sideLabel(B[0], B[1], C[0], C[1], cx, cy, hLabel);
  } else {
    const right = PP <= G / 2;                    // mærket på den side, hvor trekanten er bredest
    body += dashed(C[0], C[1], C[0], yb) + rightAngle(C[0], yb, right ? 1 : -1, -1);
    body += text(C[0] + (right ? 8 : -8), yb - Math.min(HH * 0.28, 22) + 4, hLabel, { anchor: right ? 'start' : 'end' });
  }
  if (show.includes('sides')) {
    if (p !== 0) body += sideLabel(A[0], A[1], C[0], C[1], cx, cy, `${a} cm`);
    if (p !== g) body += sideLabel(B[0], B[1], C[0], C[1], cx, cy, `${b} cm`);
  }
  return frame(body, `Trekant med grundlinje ${g} cm og højde ${h} cm`);
}

const DRAW = { cirkel, kvadrat, rektangel, parallelogram, trekant };

export function figureSvg(fig) {
  return (DRAW[fig.type] || cirkel)(fig);
}
