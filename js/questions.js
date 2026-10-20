// questions.js — figuropgaver til mellemtrinnet (4.-6. klasse).
//
// Omkreds og areal af fem figurer: cirkel, kvadrat, rektangel, parallelogram og
// trekant. Alle mål er hele centimeter, og trekanterne er valgt så siderne også
// går op (pythagoræiske tal) — så tegningen og tallene altid passer sammen.
// Der regnes med π = 3,14.

export const PI = 3.14;
const TOLERANCE = 0.051;   // rummer afrunding til 2 decimaler
export const MAX_TRIES = 3;

export const SHAPES = ['cirkel', 'kvadrat', 'rektangel', 'parallelogram', 'trekant'];

const NAME = {
  cirkel: 'Cirkel', kvadrat: 'Kvadrat', rektangel: 'Rektangel',
  parallelogram: 'Parallelogram', trekant: 'Trekant',
};
const DEFINITE = {
  cirkel: 'cirklen', kvadrat: 'kvadratet', rektangel: 'rektanglet',
  parallelogram: 'parallelogrammet', trekant: 'trekanten',
};

/** Skriver tal på dansk: 18.84 -> "18,84" (og uden efterfølgende nuller). */
export function formatDa(n, decimals = 2) {
  let s = n.toFixed(decimals);
  s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
}

const int = (a, b, rnd) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

/** 0 de første to portaler, 1 indtil femte, 2 derefter. */
export function levelFor(index) {
  return index < 2 ? 0 : index < 5 ? 1 : 2;
}

function skeleton(shape, kind, index) {
  return {
    index, shape, kind,
    tag: NAME[shape],
    unit: kind === 'omkreds' ? 'cm' : 'cm²',
    title: `Find ${kind === 'omkreds' ? 'omkredsen' : 'arealet'} af ${DEFINITE[shape]}`,
    usesPi: shape === 'cirkel',
  };
}
const ask = (kind) => (kind === 'omkreds' ? 'Hvad er omkredsen?' : 'Hvad er arealet?');

// ---- de fem figurer -------------------------------------------------------

function cirkel(kind, level, rnd, index) {
  const pool = level === 0 ? [2, 3, 4, 5]
    : level === 1 ? [2, 3, 4, 5, 6, 7, 8, 10]
    : [4, 6, 7, 8, 9, 10, 12, 15, 20];
  const r = pick(pool, rnd);
  const d = 2 * r;
  // fra femte portal får man nogle gange diameteren i stedet for radius
  const useD = level >= 2 && rnd() < 0.35;
  const q = skeleton('cirkel', kind, index);
  q.figure = { type: 'cirkel', r, d, useD };
  q.prompt = `${useD ? `Cirklen har diameteren d = ${d} cm.` : `Cirklen har radius r = ${r} cm.`} ${ask(kind)}`;

  if (kind === 'omkreds') {
    q.exact = 2 * PI * r;
    if (useD) {
      q.formula = 'O = π · d';
      q.worked = `O = 3,14 · ${d} = ${formatDa(q.exact)} cm`;
      q.steps = [`Sæt ind i formlen: O = 3,14 · ${d}`, `Gang sammen: 3,14 · ${d} = ${formatDa(q.exact)}`];
      q.mistakes = [
        [PI * r, 'Du har brugt radius. Med diameteren er omkredsen bare π · d.'],
        [2 * PI * d, 'Du har ganget med 2 for meget – diameteren er allerede 2 · r.'],
        [PI * r * r, 'Det er arealet. Omkredsen er vejen hele vejen rundt.'],
      ];
    } else {
      q.formula = 'O = 2 · π · r';
      q.worked = `O = 2 · 3,14 · ${r} = ${formatDa(q.exact)} cm`;
      q.steps = [`Sæt ind i formlen: O = 2 · 3,14 · ${r}`, `Gang sammen: 6,28 · ${r} = ${formatDa(q.exact)}`];
      q.mistakes = [
        [PI * r * r, 'Det er arealet. Her skal du finde omkredsen – vejen hele vejen rundt.'],
        [PI * r, 'Tæt på! Du glemte at gange med 2. Omkredsen er 2 · π · r.'],
        [2 * r, 'Du har fundet diameteren (2 · r). Gang den med π for at få omkredsen.'],
        [2 * PI * r * r, 'Du har ganget med r én gang for meget. Omkredsen bruger kun r, ikke r².'],
      ];
    }
  } else {
    q.exact = PI * r * r;
    q.formula = useD ? 'A = π · r²   (r = d : 2)' : 'A = π · r²';
    q.worked = `A = 3,14 · ${r} · ${r} = ${formatDa(q.exact)} cm²`;
    q.steps = useD
      ? [`Find radius: r = ${d} : 2 = ${r}`, `Kvadrér radius: ${r} · ${r} = ${r * r}`, `Gang med π: 3,14 · ${r * r} = ${formatDa(q.exact)}`]
      : [`Kvadrér radius: ${r} · ${r} = ${r * r}`, `Gang med π: 3,14 · ${r * r} = ${formatDa(q.exact)}`];
    q.mistakes = [
      [2 * PI * r, 'Det er omkredsen. Her skal du finde arealet – fladen inde i cirklen.'],
      [PI * r, 'Husk at radius skal kvadreres: A = π · r · r.'],
      [r * r, `Godt regnet: r² = ${r * r}. Nu mangler du bare at gange med π (3,14).`],
      [2 * PI * r * r, 'Du har ganget med 2 for meget. Arealet er π · r², uden 2-tallet.'],
    ];
    if (useD) {
      q.mistakes.unshift(
        [PI * d * d, 'Du har brugt diameteren som radius. Radius er det halve: r = d : 2.'],
        [PI * d, 'Det er omkredsen. Arealet bruger radius i anden: π · r².'],
      );
    }
  }
  return q;
}

function kvadrat(kind, level, rnd, index) {
  const s = level === 0 ? int(2, 9, rnd) : level === 1 ? int(3, 12, rnd) : int(6, 15, rnd);
  const q = skeleton('kvadrat', kind, index);
  q.figure = { type: 'kvadrat', s };
  q.prompt = `Kvadratet har siden s = ${s} cm. ${ask(kind)}`;
  if (kind === 'omkreds') {
    q.exact = 4 * s;
    q.formula = 'O = 4 · s';
    q.worked = `O = 4 · ${s} = ${q.exact} cm`;
    q.steps = [`Et kvadrat har fire lige lange sider på ${s} cm`, `Læg dem sammen: 4 · ${s} = ${q.exact}`];
    q.mistakes = [
      [s * s, 'Det er arealet (s · s). Omkredsen er vejen rundt – alle fire sider.'],
      [2 * s, 'Du har kun talt to sider med. Et kvadrat har fire lige lange sider.'],
      [3 * s, 'Du mangler en side. Et kvadrat har fire sider.'],
      [s + 4, 'Husk at gange: 4 · s, ikke 4 + s.'],
    ];
  } else {
    q.exact = s * s;
    q.formula = 'A = s · s';
    q.worked = `A = ${s} · ${s} = ${q.exact} cm²`;
    q.steps = ['Arealet af et kvadrat er side gange side', `${s} · ${s} = ${q.exact}`];
    q.mistakes = [
      [4 * s, 'Det er omkredsen. Arealet er fladen indeni: s · s.'],
      [2 * s, 'Arealet er siden ganget med sig selv – ikke med 2.'],
    ];
  }
  return q;
}

function rektangel(kind, level, rnd, index) {
  let l, b;
  if (level === 0) { l = int(3, 9, rnd); b = int(2, l - 1, rnd); }
  else if (level === 1) { l = int(4, 12, rnd); b = int(2, l - 1, rnd); }
  else { l = int(6, 15, rnd); b = int(3, l - 1, rnd); }
  const q = skeleton('rektangel', kind, index);
  q.figure = { type: 'rektangel', l, b };
  q.prompt = `Rektanglet har længden l = ${l} cm og bredden b = ${b} cm. ${ask(kind)}`;
  if (kind === 'omkreds') {
    q.exact = 2 * l + 2 * b;
    q.formula = 'O = 2 · l + 2 · b';
    q.worked = `O = 2 · ${l} + 2 · ${b} = ${q.exact} cm`;
    q.steps = [
      `To lange sider: 2 · ${l} = ${2 * l}`,
      `To korte sider: 2 · ${b} = ${2 * b}`,
      `Læg sammen: ${2 * l} + ${2 * b} = ${q.exact}`,
    ];
    q.mistakes = [
      [l * b, 'Det er arealet (l · b). Omkredsen er siderne hele vejen rundt.'],
      [l + b, 'Du har kun lagt to sider sammen. Der er to af hver: 2 · l + 2 · b.'],
      [2 * l + b, 'Du mangler den sidste korte side.'],
      [l + 2 * b, 'Du mangler den sidste lange side.'],
    ];
  } else {
    q.exact = l * b;
    q.formula = 'A = l · b';
    q.worked = `A = ${l} · ${b} = ${q.exact} cm²`;
    q.steps = ['Arealet af et rektangel er længde gange bredde', `${l} · ${b} = ${q.exact}`];
    q.mistakes = [
      [2 * l + 2 * b, 'Det er omkredsen. Arealet er fladen indeni: l · b.'],
      [l + b, 'Arealet får du ved at gange – ikke lægge sammen: l · b.'],
    ];
  }
  return q;
}

function parallelogram(kind, level, rnd, index) {
  let g, h, s;
  if (level >= 2) { g = int(6, 14, rnd); h = int(3, 9, rnd); s = h + int(1, 4, rnd); }
  else { g = int(4, 10, rnd); h = int(2, 6, rnd); s = h + int(1, 3, rnd); }
  const q = skeleton('parallelogram', kind, index);
  // på arealopgaver står den skrå side der også — det er netop den man ikke skal bruge
  q.figure = { type: 'parallelogram', g, h, s, show: kind === 'omkreds' ? ['g', 's'] : ['g', 'h', 's'] };
  if (kind === 'omkreds') {
    q.prompt = `Parallelogrammet har grundlinjen g = ${g} cm og den skrå side s = ${s} cm. Hvad er omkredsen?`;
    q.exact = 2 * g + 2 * s;
    q.formula = 'O = 2 · g + 2 · s';
    q.worked = `O = 2 · ${g} + 2 · ${s} = ${q.exact} cm`;
    q.steps = [
      `To grundlinjer: 2 · ${g} = ${2 * g}`,
      `To skrå sider: 2 · ${s} = ${2 * s}`,
      `Læg sammen: ${2 * g} + ${2 * s} = ${q.exact}`,
    ];
    q.mistakes = [
      [g * s, 'Omkredsen får du ved at lægge siderne sammen – ikke gange.'],
      [g + s, 'Der er to af hver side: 2 · g + 2 · s.'],
      [g * h, 'Det er arealet. Omkredsen går langs siderne.'],
      [2 * g + 2 * h, 'Du har brugt højden. Omkredsen går langs siderne: 2 · g + 2 · s.'],
    ];
  } else {
    q.prompt = `Parallelogrammet har grundlinjen g = ${g} cm, højden h = ${h} cm og den skrå side s = ${s} cm. Hvad er arealet?`;
    q.exact = g * h;
    q.formula = 'A = g · h';
    q.worked = `A = ${g} · ${h} = ${q.exact} cm²`;
    q.steps = ['Arealet er grundlinje gange højde – brug højden h, ikke den skrå side', `${g} · ${h} = ${q.exact}`];
    q.mistakes = [
      [g * s, 'Du har ganget med den skrå side. Brug højden h – den stiplede linje, der står vinkelret på grundlinjen.'],
      [2 * g + 2 * s, 'Det er omkredsen. Arealet er grundlinje gange højde.'],
      [(g * h) / 2, 'Det er trekantens formel. Et parallelogram er g · h – uden at halvere.'],
      [g + h, 'Arealet får du ved at gange: g · h.'],
    ];
  }
  return q;
}

// Trekanter med hele sider: p er hvor højden rammer grundlinjen, målt fra venstre hjørne.
const TRI_EASY = [
  { g: 4, h: 3, p: 0 },   // 3-4-5, retvinklet
  { g: 6, h: 4, p: 3 },   // 5-5-6, ligebenet
  { g: 8, h: 3, p: 4 },   // 5-5-8
  { g: 8, h: 6, p: 0 },   // 6-8-10, retvinklet
  { g: 6, h: 8, p: 0 },   // 8-6-10, retvinklet
];
const TRI_HARD = [
  { g: 14, h: 12, p: 5 },  // 13-14-15
  { g: 12, h: 8, p: 6 },   // 10-10-12
  { g: 10, h: 12, p: 5 },  // 13-13-10
  { g: 16, h: 6, p: 8 },   // 10-10-16
  { g: 21, h: 8, p: 6 },   // 10-17-21
  { g: 12, h: 5, p: 0 },   // 5-12-13, retvinklet
  { g: 15, h: 8, p: 0 },   // 8-15-17, retvinklet
  { g: 24, h: 5, p: 12 },  // 13-13-24
];

function trekant(kind, level, rnd, index) {
  const t = { ...pick(level >= 2 ? TRI_HARD : TRI_EASY, rnd) };
  if (rnd() < 0.5) t.p = t.g - t.p;                 // spejlvend for variationens skyld
  const { g, h, p } = t;
  const a = Math.round(Math.hypot(p, h));            // venstre side
  const b = Math.round(Math.hypot(g - p, h));        // højre side
  const q = skeleton('trekant', kind, index);

  if (kind === 'omkreds') {
    q.figure = { type: 'trekant', g, h, p, a, b, show: ['a', 'b', 'c'] };
    q.prompt = `Trekanten har siderne a = ${a} cm, b = ${b} cm og c = ${g} cm. Hvad er omkredsen?`;
    q.exact = a + b + g;
    q.formula = 'O = a + b + c';
    q.worked = `O = ${a} + ${b} + ${g} = ${q.exact} cm`;
    q.steps = ['En trekant har tre sider – læg dem alle sammen', `${a} + ${b} + ${g} = ${q.exact}`];
    q.mistakes = [
      [a + b, 'Du mangler en side – en trekant har tre sider.'],
      [a + g, 'Du mangler en side – en trekant har tre sider.'],
      [b + g, 'Du mangler en side – en trekant har tre sider.'],
      [(g * h) / 2, 'Det er arealet. Omkredsen er siderne lagt sammen.'],
    ];
  } else {
    // fra femte portal står de skrå sider også på tegningen — man skal selv vælge højden
    const distract = level >= 2;
    const slanted = [a !== h ? a : null, b !== h ? b : null].filter((v) => v !== null);
    q.figure = { type: 'trekant', g, h, p, a, b, show: distract ? ['g', 'h', 'sides'] : ['g', 'h'] };
    q.prompt = distract && slanted.length
      ? `Trekanten har grundlinjen g = ${g} cm og højden h = ${h} cm. ${slanted.length === 2 ? `De skrå sider er ${slanted[0]} cm og ${slanted[1]} cm.` : `Den skrå side er ${slanted[0]} cm.`} Hvad er arealet?`
      : `Trekanten har grundlinjen g = ${g} cm og højden h = ${h} cm. Hvad er arealet?`;
    q.exact = (g * h) / 2;
    q.formula = 'A = ½ · g · h';
    q.worked = `A = ½ · ${g} · ${h} = ${formatDa(q.exact)} cm²`;
    q.steps = [`Gang grundlinje og højde: ${g} · ${h} = ${g * h}`, `Halvér: ${g * h} : 2 = ${formatDa(q.exact)}`];
    q.mistakes = [
      [g * h, 'Du glemte at halvere. Arealet af en trekant er ½ · g · h.'],
      [a + b + g, 'Det er omkredsen. Arealet bruger grundlinje og højde.'],
      [g + h, 'Arealet får du ved at gange og halvere: ½ · g · h.'],
    ];
    for (const side of slanted) {
      q.mistakes.push([(g * side) / 2, 'Du har brugt en skrå side. Brug højden h – den står vinkelret på grundlinjen.']);
      q.mistakes.push([g * side, 'Du har brugt en skrå side og glemt at halvere. Det er ½ · g · h.']);
    }
  }
  return q;
}

const BUILD = { cirkel, kvadrat, rektangel, parallelogram, trekant };

/**
 * Bygger opgaven til portal nr. `index`.
 * De første to portaler holder sig til cirkler, kvadrater og rektangler;
 * derefter kommer parallelogrammer og trekanter med. Samme figur kommer
 * aldrig to gange i træk.
 */
export function makeQuestion(index, rnd = Math.random, prevShape = null) {
  const level = levelFor(index);
  const pool = level === 0 ? ['cirkel', 'kvadrat', 'rektangel'] : SHAPES;
  const choices = pool.filter((s) => s !== prevShape);
  const shape = pick(choices.length ? choices : pool, rnd);
  const kind = index === 0 ? 'omkreds' : (rnd() < 0.5 ? 'omkreds' : 'areal');
  return BUILD[shape](kind, level, rnd, index);
}

/** Bygger en bestemt figur og opgavetype — bruges af testene. */
export function buildQuestion(shape, kind, level = 1, rnd = Math.random, index = 0) {
  return BUILD[shape](kind, level, rnd, index);
}

/** Læser et tal skrevet med enten komma eller punktum. Returnerer null hvis det ikke er et tal. */
export function parseAnswer(input) {
  const s = String(input).trim().replace(/\s+/g, '').replace(/,/g, '.');
  if (s === '' || !/^\d*\.?\d+$/.test(s)) return null;
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
}

export function isCorrect(q, value) {
  return Math.abs(value - q.exact) <= TOLERANCE;
}

/**
 * Giver et målrettet vink ud fra hvilken klassisk fejl der er begået.
 * Meget mere brugbart end bare "forkert".
 */
export function diagnose(q, value) {
  for (const [v, msg] of q.mistakes || []) {
    if (Math.abs(value - v) <= 0.06) return msg;
  }
  if (value > q.exact * 1.5) return 'Svaret er for stort. Tjek om du har ganget med noget ekstra.';
  if (value < q.exact * 0.6) return 'Svaret er for lille. Tjek om du har fået alle mål med.';
  return q.usesPi
    ? 'Ikke helt. Tjek din udregning – og husk at π = 3,14.'
    : 'Ikke helt. Tjek din udregning en gang til.';
}
