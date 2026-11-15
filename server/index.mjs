// NutriLens AI proxy — keeps your model API key off the phone.
//
//   ANTHROPIC_API_KEY=sk-ant-... node index.mjs
//
// Optional env: PORT (default 8787), MODEL (default claude-sonnet-5-5),
//               APP_TOKEN (if set, the app must send `Authorization: Bearer <APP_TOKEN>`).
// Requires Node 18+ (built-in fetch). No npm dependencies.

import http from 'node:http';

const PORT = Number(process.env.PORT ?? 8787);
const MODEL = process.env.MODEL ?? 'claude-sonnet-5-5';
const API_KEY = process.env.ANTHROPIC_API_KEY;
const APP_TOKEN = process.env.APP_TOKEN;
const MAX_BODY = 8 * 1024 * 1024; // 8 MB

if (!API_KEY) {
  console.error('Set ANTHROPIC_API_KEY before starting the proxy.');
  process.exit(1);
}

const PROMPT = `You are a nutrition estimation assistant. Identify every distinct food or drink on the plate in this photo and estimate its portion and nutrition.

Rules:
- Use visual cues (plate ~27 cm, utensils, hands) to estimate portion size in grams.
- Base estimates on USDA FoodData Central typical values for the food as prepared (include visible oils, sauces, dressings).
- If unsure what a food is, give your best guess and lower the confidence.
- If there is no food in the image, return an empty items array and explain in notes.

Respond with ONLY a JSON object, no markdown, matching exactly:
{
  "items": [
    {
      "name": string,
      "portion": string,           // human-readable, e.g. "1 cup" or "150 g"
      "grams": number,
      "nutrients": { "calories": number, "protein": number, "carbs": number, "fat": number, "fiber": number, "sugar": number, "sodium": number },  // grams except sodium in mg
      "confidence": number         // 0 to 1
    }
  ],
  "notes": string
}`;

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Image too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Model did not return JSON');
  return JSON.parse(text.slice(start, end + 1));
}

async function analyzePlate({ imageBase64, mediaType = 'image/jpeg', hint }) {
  const content = [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
    { type: 'text', text: hint ? `${PROMPT}\n\nUser note about this meal: ${String(hint).slice(0, 200)}` : PROMPT },
  ];
  const text = await callModel(content, 1500);
  return extractJson(text);
}

const EXPLAIN_PROMPT = `You explain food ingredients to ordinary shoppers in plain English.
Explain the ingredient named below. Be accurate and calm: most additives are safe, so do not exaggerate risk.

Respond with ONLY a JSON object, no markdown:
{
  "what": string,        // what it is, ONE sentence, max 15 words
  "why": string,         // why it's in food, ONE sentence, max 15 words
  "from": string,        // where it comes from (plant, animal, mineral, fermented or lab-made), ONE sentence, max 15 words
  "status": "fine" | "note" | "limit",
  "statusNote": string   // one sentence, max 15 words: who should care and why; mention FDA only if you are sure
}
Use "fine" for safe everyday ingredients, "note" for allergens, diet notes or mixed evidence,
and "limit" only when health authorities advise limiting it.
If the name is not a real food ingredient, set what to "Not a recognized food ingredient." and status "note".`;

/** Hard cap so the phone never gets a long answer, whatever the model returns. */
function capWords(value, max = 20) {
  const words = String(value ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  return words.length <= max ? words.join(' ') : `${words.slice(0, max).join(' ')}…`;
}

async function callModel(content, maxTokens) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
  });
  if (!r.ok) {
    const detail = await r.text();
    throw Object.assign(new Error(`Upstream ${r.status}: ${detail.slice(0, 300)}`), { status: 502 });
  }
  const data = await r.json();
  return (data.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('');
}

async function explainIngredient({ name }) {
  const clean = String(name).replace(/[\r\n]+/g, ' ').slice(0, 120);
  const text = await callModel([{ type: 'text', text: `${EXPLAIN_PROMPT}\n\nIngredient: ${clean}` }], 400);
  const raw = extractJson(text);
  const status = ['fine', 'note', 'limit'].includes(raw.status) ? raw.status : 'note';
  return {
    what: capWords(raw.what),
    why: capWords(raw.why),
    from: capWords(raw.from),
    status,
    statusNote: capWords(raw.statusNote),
  };
}

const ROUTES = {
  '/analyze-plate': async body => {
    if (typeof body.imageBase64 !== 'string' || body.imageBase64.length < 100) {
      throw Object.assign(new Error('imageBase64 is required'), { status: 400 });
    }
    const started = Date.now();
    const result = await analyzePlate(body);
    console.log(`analyze-plate: ${result.items?.length ?? 0} items in ${Date.now() - started} ms`);
    return result;
  },
  '/explain-ingredient': async body => {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      throw Object.assign(new Error('name is required'), { status: 400 });
    }
    const result = await explainIngredient(body);
    console.log(`explain-ingredient: "${body.name.slice(0, 60)}"`);
    return result;
  },
};

http
  .createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, model: MODEL });
    const route = req.method === 'POST' ? ROUTES[req.url] : undefined;
    if (!route) return send(res, 404, { error: 'Not found' });
    if (APP_TOKEN && req.headers.authorization !== `Bearer ${APP_TOKEN}`) {
      return send(res, 401, { error: 'Unauthorized' });
    }
    try {
      const body = await readJson(req);
      send(res, 200, await route(body));
    } catch (e) {
      console.error(e);
      send(res, e.status ?? 500, { error: e.message });
    }
  })
  .listen(PORT, () => console.log(`NutriLens AI proxy on http://localhost:${PORT} (model: ${MODEL})`));
