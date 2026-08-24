// api/scores.js — Vercel Serverless Function til den fælles highscore.
//
// Data ligger i et Redis sorted set hos Upstash (eller en anden Redis med REST-API).
// Vi taler med det via almindelig fetch, så projektet stadig ikke har én eneste
// npm-afhængighed og intet byggetrin.
//
//   GET  /api/scores          -> { ok, scores: [...] }
//   POST /api/scores          -> { ok, scores: [...], saved }
//        body: { name, distance, portals }
//
// Er databasen ikke sat op, svarer endpointet pænt med { ok:false, reason:"not_configured" },
// og spillet falder tilbage til den lokale liste. Se README.

const KEY = 'cirkelslisken:scores';
const MAX_STORED = 300;   // hvor mange rækker vi gemmer i databasen
const MAX_RETURN = 50;    // hvor mange vi sender tilbage
const NAME_MAX = 14;

/** Navne vi ikke gider have på storskærmen. Udvid listen som du vil. */
const BLOCKED = [
  'fuck', 'shit', 'bitch', 'pik', 'fisse', 'kusse', 'luder', 'røvhul', 'rovhul',
  'spasser', 'retard', 'nigger', 'hitler', 'nazi', 'penis', 'sex', 'møgso',
];

function credentials() {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: String(url).replace(/\/+$/, ''), token: String(token) };
}

async function pipeline(cred, commands) {
  const res = await fetch(cred.url + '/pipeline', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + cred.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    throw new Error('Databasen svarede ' + res.status);
  }
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Uventet svar fra databasen');
  return data.map((d) => d && d.result);
}

/** Meter vejer tungest; portaler afgør ved dødt løb. */
function rankScore(distance, portals) {
  return distance * 1000 + Math.min(portals, 999);
}

function cleanName(input) {
  let n = String(input == null ? '' : input);
  n = n.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');   // styretegn ud
  n = n.replace(/[^\p{L}\p{N} .\-_'!]/gu, '');                  // kun bogstaver, tal og lidt tegn
  n = n.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return n;
}

function isBlocked(name) {
  const flat = name.toLowerCase().replace(/[^\p{L}]/gu, '');
  return BLOCKED.some((w) => flat.includes(w));
}

function parseEntry(raw) {
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!o || typeof o.n !== 'string') return null;
    return {
      name: o.n,
      distance: Number(o.d) || 0,
      portals: Number(o.p) || 0,
      ts: Number(o.t) || 0,
    };
  } catch {
    return null;
  }
}

async function readTop(cred) {
  const [raw] = await pipeline(cred, [['ZRANGE', KEY, 0, MAX_RETURN - 1, 'REV']]);
  return (Array.isArray(raw) ? raw : []).map(parseEntry).filter(Boolean);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const cred = credentials();
  if (!cred) {
    return res.status(200).json({
      ok: false,
      reason: 'not_configured',
      hint: 'Tilføj en Redis fra Vercels Marketplace og sæt KV_REST_API_URL og KV_REST_API_TOKEN.',
      scores: [],
    });
  }

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, scores: await readTop(cred) });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

      const name = cleanName(body.name) || 'Anonym';
      const distance = Math.floor(Number(body.distance));
      const portals = Math.floor(Number(body.portals));

      if (!Number.isFinite(distance) || distance < 0 || distance > 200000) {
        return res.status(400).json({ ok: false, reason: 'bad_distance' });
      }
      if (!Number.isFinite(portals) || portals < 0 || portals > 600) {
        return res.status(400).json({ ok: false, reason: 'bad_portals' });
      }
      // portaler ligger ca. 330 m fra hinanden — flere end det er ikke muligt
      if (portals * 300 > distance + 400) {
        return res.status(400).json({ ok: false, reason: 'implausible' });
      }
      if (isBlocked(name)) {
        return res.status(200).json({ ok: false, reason: 'blocked_name', scores: await readTop(cred) });
      }

      const ts = Date.now();
      const member = JSON.stringify({
        n: name, d: distance, p: portals, t: ts,
        i: Math.random().toString(36).slice(2, 8),   // gør rækken unik
      });

      const results = await pipeline(cred, [
        ['ZADD', KEY, String(rankScore(distance, portals)), member],
        ['ZREMRANGEBYRANK', KEY, '0', String(-(MAX_STORED + 1))],
        ['ZRANGE', KEY, '0', String(MAX_RETURN - 1), 'REV'],
      ]);

      const scores = (Array.isArray(results[2]) ? results[2] : []).map(parseEntry).filter(Boolean);
      return res.status(200).json({
        ok: true,
        saved: { name, distance, portals, ts },
        scores,
      });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  } catch (err) {
    console.error('highscore-fejl:', err);
    return res.status(200).json({ ok: false, reason: 'unavailable', scores: [] });
  }
};
