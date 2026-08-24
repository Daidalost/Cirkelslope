// highscore.js — to lister side om side.
//
//  · Den lokale ligger i browserens localStorage og virker altid, også uden net.
//  · Den fælles ligger bag /api/scores. Er databasen ikke sat op, melder den
//    pænt fra, og spillet viser bare den lokale liste.

const LOCAL_KEY = 'cirkelslisken.highscore';
const NAME_KEY = 'cirkelslisken.navn';
export const TOP = 10;
export const NAME_MAX = 14;

/** Samme filter som på serveren — så eleven får besked med det samme. */
const BLOCKED = [
  'fuck', 'shit', 'bitch', 'pik', 'fisse', 'kusse', 'luder', 'røvhul', 'rovhul',
  'spasser', 'retard', 'nigger', 'hitler', 'nazi', 'penis', 'sex', 'møgso',
];

/** Meter først, portaler som tiebreak, ældste tur først ved fuldstændig lighed. */
export function compare(a, b) {
  if (b.distance !== a.distance) return b.distance - a.distance;
  if (b.portals !== a.portals) return b.portals - a.portals;
  return (a.ts || 0) - (b.ts || 0);
}

export function cleanName(input) {
  return String(input == null ? '' : input)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/[^\p{L}\p{N} .\-_'!]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

export function isBlocked(name) {
  const flat = name.toLowerCase().replace(/[^\p{L}]/gu, '');
  return BLOCKED.some((w) => flat.includes(w));
}

// ---- lokal liste ----------------------------------------------------

export function loadLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .map((e) => ({
        name: String(e.name || 'Anonym').slice(0, NAME_MAX),
        distance: Number(e.distance) || 0,
        portals: Number(e.portals) || 0,
        ts: Number(e.ts) || 0,
      }))
      .sort(compare)
      .slice(0, TOP);
  } catch {
    return [];
  }
}

function saveLocal(list) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch { /* privat browsing */ }
}

/** Er turen god nok til at komme på en liste med TOP pladser? */
export function qualifies(list, entry) {
  if (entry.distance <= 0) return false;
  if (list.length < TOP) return true;
  return compare(entry, list[TOP - 1]) < 0;
}

export function addLocal(entry) {
  const list = loadLocal();
  list.push(entry);
  list.sort(compare);
  const trimmed = list.slice(0, TOP);
  saveLocal(trimmed);
  return trimmed;
}

export function loadName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}

export function rememberName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* privat browsing */ }
}

// ---- fælles liste ---------------------------------------------------

/** Sidste svar fra serveren, så spillet ikke skal hente igen ved hver død. */
export const online = { state: 'ukendt', scores: [], reason: null };

async function call(options) {
  const res = await fetch('/api/scores', {
    cache: 'no-store',
    ...options,
  });
  if (!res.ok && res.status !== 400) throw new Error('HTTP ' + res.status);
  return res.json();
}

function apply(data) {
  if (data && data.ok) {
    online.state = 'klar';
    online.scores = (data.scores || []).sort(compare);
    online.reason = null;
  } else {
    online.state = data && data.reason === 'not_configured' ? 'fra' : 'fejl';
    online.reason = (data && data.reason) || 'unavailable';
    if (online.state === 'fra') online.scores = [];
  }
  return online;
}

export async function fetchOnline() {
  if (online.state === 'henter') return online;
  online.state = 'henter';
  try {
    return apply(await call({ method: 'GET' }));
  } catch {
    online.state = 'fejl';
    online.reason = 'network';
    return online;
  }
}

export async function submitOnline(entry) {
  try {
    const data = await call({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: entry.name,
        distance: Math.floor(entry.distance),
        portals: entry.portals,
      }),
    });
    apply(data);
    return data;
  } catch {
    online.state = 'fejl';
    online.reason = 'network';
    return { ok: false, reason: 'network' };
  }
}
