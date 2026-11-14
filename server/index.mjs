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
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages: [{ role: 'user', content }] }),
  });
  if (!r.ok) {
    const detail = await r.text();
    throw Object.assign(new Error(`Upstream ${r.status}: ${detail.slice(0, 300)}`), { status: 502 });
  }
  const data = await r.json();
  const text = (data.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('');
  return extractJson(text);
}

http
  .createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, model: MODEL });
    if (req.method !== 'POST' || req.url !== '/analyze-plate') return send(res, 404, { error: 'Not found' });
    if (APP_TOKEN && req.headers.authorization !== `Bearer ${APP_TOKEN}`) {
      return send(res, 401, { error: 'Unauthorized' });
    }
    try {
      const body = await readJson(req);
      if (typeof body.imageBase64 !== 'string' || body.imageBase64.length < 100) {
        return send(res, 400, { error: 'imageBase64 is required' });
      }
      const started = Date.now();
      const result = await analyzePlate(body);
      console.log(`analyze-plate: ${result.items?.length ?? 0} items in ${Date.now() - started} ms`);
      send(res, 200, result);
    } catch (e) {
      console.error(e);
      send(res, e.status ?? 500, { error: e.message });
    }
  })
  .listen(PORT, () => console.log(`NutriLens AI proxy on http://localhost:${PORT} (model: ${MODEL})`));
