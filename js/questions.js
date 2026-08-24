// questions.js — cirkelopgaver til mellemtrinnet (4.-6. klasse).
// Der regnes med π = 3,14, og der svares i cm eller cm².

export const PI = 3.14;
const TOLERANCE = 0.051;   // rummer afrunding til 2 decimaler

/** Skriver tal på dansk: 18.84 -> "18,84" (og uden efterfølgende nuller). */
export function formatDa(n, decimals = 2) {
  let s = n.toFixed(decimals);
  s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
}

/** Radier bliver gradvist større, men bliver ved med at være hele tal. */
function radiusFor(index, rnd) {
  let pool;
  if (index < 2)      pool = [2, 3, 4, 5];
  else if (index < 4) pool = [2, 3, 4, 5, 6, 7, 8];
  else if (index < 7) pool = [3, 4, 5, 6, 7, 8, 9, 10, 12];
  else                pool = [4, 6, 7, 8, 9, 10, 11, 12, 14, 15, 20];
  return pool[Math.floor(rnd() * pool.length)];
}

/**
 * Bygger opgaven til portal nr. `index`.
 * De to første portaler er altid omkreds, så man lige varmer op.
 */
export function makeQuestion(index, rnd = Math.random) {
  const r = radiusFor(index, rnd);
  const type = index < 1 ? 'omkreds' : (rnd() < 0.5 ? 'omkreds' : 'areal');
  const exact = type === 'omkreds' ? 2 * PI * r : PI * r * r;

  return {
    index, r, type, exact,
    unit: type === 'omkreds' ? 'cm' : 'cm²',
    title: type === 'omkreds' ? 'Find omkredsen' : 'Find arealet',
    prompt: type === 'omkreds'
      ? `Cirklen har radius r = ${r} cm. Hvad er omkredsen?`
      : `Cirklen har radius r = ${r} cm. Hvad er arealet?`,
    formula: type === 'omkreds' ? 'O = 2 · π · r' : 'A = π · r²',
    worked: type === 'omkreds'
      ? `O = 2 · 3,14 · ${r} = ${formatDa(exact)} cm`
      : `A = 3,14 · ${r} · ${r} = ${formatDa(exact)} cm²`,
    steps: type === 'omkreds'
      ? [`Sæt ind i formlen: O = 2 · 3,14 · ${r}`, `Gang sammen: 6,28 · ${r} = ${formatDa(exact)}`]
      : [`Kvadrér radius: ${r} · ${r} = ${r * r}`, `Gang med π: 3,14 · ${r * r} = ${formatDa(exact)}`],
  };
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
  const near = (a) => Math.abs(value - a) <= 0.06;
  const r = q.r;
  const omkreds = 2 * PI * r;
  const areal = PI * r * r;

  if (q.type === 'omkreds') {
    if (near(areal))       return 'Det er arealet. Her skal du finde omkredsen — altså vejen hele vejen rundt.';
    if (near(PI * r))      return 'Tæt på! Du glemte at gange med 2. Omkredsen er 2 · π · r.';
    if (near(2 * r))       return 'Du har fundet diameteren (2 · r). Gang den med π for at få omkredsen.';
    if (near(PI * 2 * r * r)) return 'Du har ganget med r én gang for meget. Omkredsen bruger kun r, ikke r².';
  } else {
    if (near(omkreds))     return 'Det er omkredsen. Her skal du finde arealet — altså fladen inde i cirklen.';
    if (near(PI * r))      return 'Husk at radius skal kvadreres: A = π · r · r.';
    if (near(r * r))       return `Godt regnet: r² = ${r * r}. Nu mangler du bare at gange med π (3,14).`;
    if (near(2 * PI * r * r)) return 'Du har ganget med 2 for meget. Arealet er π · r², uden 2-tallet.';
  }
  if (value > q.exact * 1.5) return 'Svaret er for stort. Tjek om du har ganget med noget ekstra.';
  if (value < q.exact * 0.6) return 'Svaret er for lille. Tjek om du har fået alle faktorer med.';
  return 'Ikke helt. Tjek din udregning — og husk at π = 3,14.';
}
