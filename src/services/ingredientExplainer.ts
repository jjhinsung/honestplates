/**
 * Asks the NutriLens AI proxy (server/index.mjs → /explain-ingredient) to explain
 * an ingredient that isn't in the built-in library. The answer is shown with an
 * "AI explanation, not verified" label and is never stored in the library.
 */
import type { IngredientStatus } from '../data/ingredientLibrary';

export interface AiExplanation {
  what: string;
  why: string;
  from: string;
  status: IngredientStatus;
  statusNote: string;
}

export const MAX_FIELD_WORDS = 20;

const STATUSES: IngredientStatus[] = ['fine', 'note', 'limit', 'restricted'];

/** Keep at most `max` words, so a long answer can't slip through. */
export function capWords(value: unknown, max = MAX_FIELD_WORDS): string {
  const words = String(value ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length <= max) return words.join(' ');
  return `${words.slice(0, max).join(' ').replace(/[,;:]$/, '')}…`;
}

export function sanitizeExplanation(raw: any): AiExplanation {
  const status = STATUSES.includes(raw?.status) ? (raw.status as IngredientStatus) : 'note';
  return {
    what: capWords(raw?.what) || 'No explanation available.',
    why: capWords(raw?.why),
    from: capWords(raw?.from),
    // The AI may never label something "restricted": that needs a real regulator source.
    status: status === 'restricted' ? 'limit' : status,
    statusNote: capWords(raw?.statusNote),
  };
}

export async function explainIngredient(name: string, proxyUrl: string, timeoutMs = 30000): Promise<AiExplanation> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${proxyUrl}/explain-ingredient`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.slice(0, 120) }),
      signal: controller.signal,
    });
  } catch (e: any) {
    throw new Error(
      e?.name === 'AbortError'
        ? 'The AI took too long to respond. Try again.'
        : `Couldn't reach the AI server at ${proxyUrl}. Is it running? (Settings → AI plate recognition)`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`AI server error (${res.status}): ${msg.slice(0, 200)}`);
  }
  return sanitizeExplanation(await res.json());
}
