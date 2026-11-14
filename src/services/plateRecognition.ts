import type { Nutrients, PlateAnalysis, PlateItem } from '../types';
import { photoToBase64Jpeg } from './imageUtils';

/**
 * Sends a plate photo to the NutriLens AI proxy (see /server/index.mjs), which
 * asks a vision model to identify each food, estimate the portion, and estimate
 * calories + macros. Returns validated, clamped data the UI can safely render.
 */
export async function analyzePlate(
  photoPath: string,
  proxyUrl: string,
  opts: { hint?: string; timeoutMs?: number } = {},
): Promise<PlateAnalysis> {
  const { base64, mediaType } = await photoToBase64Jpeg(photoPath);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45000);
  let res: Response;
  try {
    res = await fetch(`${proxyUrl}/analyze-plate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mediaType, hint: opts.hint }),
      signal: controller.signal,
    });
  } catch (e: any) {
    throw new Error(
      e?.name === 'AbortError'
        ? 'The AI took too long to respond. Try again.'
        : `Couldn't reach the AI service at ${proxyUrl}. Is the proxy running?`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`AI service error (${res.status}): ${msg.slice(0, 200)}`);
  }
  return sanitizeAnalysis(await res.json());
}

const num = (v: unknown, max: number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0;
};

/** Never trust model output blindly: coerce types and clamp to sane ranges. */
export function sanitizeAnalysis(raw: any): PlateAnalysis {
  const items: PlateItem[] = Array.isArray(raw?.items)
    ? raw.items.slice(0, 20).map((it: any): PlateItem => {
        const n = it?.nutrients ?? {};
        const nutrients: Nutrients = {
          calories: Math.round(num(n.calories, 3000)),
          protein: num(n.protein, 300),
          carbs: num(n.carbs, 500),
          fat: num(n.fat, 300),
          fiber: n.fiber !== undefined ? num(n.fiber, 100) : undefined,
          sugar: n.sugar !== undefined ? num(n.sugar, 300) : undefined,
          sodium: n.sodium !== undefined ? num(n.sodium, 10000) : undefined,
        };
        return {
          name: String(it?.name ?? 'Unknown food').slice(0, 80),
          portion: String(it?.portion ?? '1 serving').slice(0, 40),
          grams: it?.grams !== undefined ? num(it.grams, 3000) : undefined,
          nutrients,
          confidence: num(it?.confidence ?? 0.5, 1),
        };
      })
    : [];
  return {
    items,
    notes: typeof raw?.notes === 'string' ? raw.notes.slice(0, 300) : undefined,
  };
}
