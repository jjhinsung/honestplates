//
//  barcodeLookup.ts
//  
//
//  Created by laptop on 14/11/26.
//

import type { Nutrients, ParsedLabel } from '../types';

/**
 Adds Barcode reading functionality to the app
 */

// OPEN FOOD asks apps to identify themselves
const OFF_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product';
export const USER_AGENT = 'NutriLens/0.1 (iOS; contact: https://github.com/jjhinsung/honestplates)';
const FIELDS = [
    'code', 'product_name', 'brands', 'serving_size', 'serving_quantity',
    'nutriments', 'ingredients_text', 'ingredients_text_en', 'allergens_tags', 'nutriments', 'ingredients_text', 'ingredients_text_en', 'allergens_tags', 'additives_tags',
  ].join(',');

export type BarcodeLookupResult =
  | { status: 'found'; parsed: ParsedLabel }
  | { status: 'no-nutrition'; productName?: string }
  | { status: 'not-found' };

const cache = new Map<string, BarcodeLookupResult>();

/** iOS reports US UPC-A (12 digits) as EAN-13 with a leading 0, so try both. */
export function barcodeVariants(code: string): string[] {
    const d = code.replace(/\D/g, '');
    const v = [d];
    if (d.length === 13 && d.startsWith('0')) v.push(d.slice(1));
    if (d.length === 12) v.push(`0${d}`);
    return Array.from(new Set(v)).filter(x => x.length >= 8);
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(() => resolve(), ms));

/**
 * Fetches one product from Open Food Facts. Returns undefined when the barcode
 * isn't in the database. Open Food Facts is sometimes slow or briefly
 * overloaded, so a timeout, network hiccup or busy reply (429/5xx) is retried
 * once before giving up.
 */
export async function fetchOffProduct(
  code: string,
  fields: string,
  timeoutMs = 20000,
  attempts = 2,
): Promise<any | undefined> {
  let lastError = new Error('No internet connection.');
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${OFF_PRODUCT_URL}/${code}.json?fields=${fields}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (res.status === 404) return undefined;
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`The product database is busy (${res.status}). Try again in a moment.`);
      } else if (!res.ok) {
        throw Object.assign(new Error(`Product database error (${res.status}).`), { final: true });
      } else {
        const json = await res.json();
        return json?.status === 1 && json.product ? json.product : undefined;
      }
    } catch (e: any) {
      if (e?.final) throw e;
      lastError = new Error(
        e?.name === 'AbortError'
          ? 'The product database took too long to respond. Check your internet connection.'
          : 'No internet connection.',
      );
    } finally {
      clearTimeout(timer);
    }
    if (attempt < attempts) await sleep(800);
  }
  throw lastError;
}

export async function lookupBarcode(code: string, timeoutMs = 20000):  Promise<BarcodeLookupResult> {
    for (const c of barcodeVariants(code)) {
        const cached = cache.get(c);
        if (cached) return cached;

        const product = await fetchOffProduct(c, FIELDS, timeoutMs);
        if (!product) continue; // unknown → try the other spelling
        const result = productToParsedLabel(product, c);
        cache.set(c, result);
        return result;
    }
    return { status: 'not-found' };
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Maps an Open Food Facts product to the app's ParsedLabel. */
export function productToParsedLabel(product: any, barcode: string): BarcodeLookupResult {
  const n = product.nutriments ?? {};
  const servingG = num(product.serving_quantity);
  const hasServingValues = Object.keys(n).some(k => k.endsWith('_serving'));
  const perServing = hasServingValues || servingG !== undefined; // else use per-100 g

  const get = (key: string): number | undefined => {
    if (perServing) {
      const s = num(n[`${key}_serving`]);
      if (s !== undefined) return s;
      const h = num(n[`${key}_100g`]);
      return h !== undefined && servingG ? (h * servingG) / 100 : undefined;
    }
    return num(n[`${key}_100g`]);
  };

    const kj = get('energy-kj') ?? get('energy');
    const kcal = get('energy-kcal') ?? (kj !== undefined ? kj / 4.184 : undefined);
    // Open Food Facts stores sodium/cholesterol in GRAMS; the app uses mg. Salt = sodium × 2.5.
    const sodiumG = get('sodium') ?? (get('salt') !== undefined ? get('salt')! / 2.5 : undefined);

    const values: Partial<Nutrients> = {
        calories: kcal !== undefined ? Math.round(kcal) : undefined,
        protein: get('proteins'),
        carbs: get('carbohydrates'),
        fat: get('fat'),
        fiber: get('fiber'),
        sugar: get('sugars'),
        addedSugar: get('added-sugars'),
        saturatedFat: get('saturated-fat'),
        transFat: get('trans-fat'),
        sodium: sodiumG !== undefined ? sodiumG * 1000 : undefined,
        cholesterol: get('cholesterol') !== undefined ? get('cholesterol')! * 1000 : undefined,
      };

      const detectedFields = (Object.keys(values) as (keyof Nutrients)[]).filter(k => values[k] !== undefined);
      const productName = [product.brands?.split(',')[0]?.trim(), product.product_name?.trim()]
        .filter(Boolean)
        .join(' ');

      if (!detectedFields.includes('calories') && detectedFields.length < 2) {
        return { status: 'no-nutrition', productName: productName || undefined };
      }

      const nutrients: Nutrients = { calories: 0, protein: 0, carbs: 0, fat: 0 };
      for (const k of detectedFields) {
        const v = values[k]!;
        nutrients[k] = k === 'calories' ? v : k === 'sodium' || k === 'cholesterol' ? Math.round(v) : r1(v);
      }

      const allergens: string[] = (product.allergens_tags ?? []).map((t: string) =>
        t.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase()),
      );

      return {
        status: 'found',
        parsed: {
        source: 'barcode',
        barcode,
        productName: productName || undefined,
        servingSize: perServing ? product.serving_size || (servingG ? `${servingG} g` : undefined) : '100 g',
        nutrients,
        ingredients: product.ingredients_text_en || product.ingredients_text || undefined,
        additiveTags: Array.isArray(product.additives_tags) ? product.additives_tags : undefined,
        labelTags: Array.isArray(product.labels_tags) ? product.labels_tags : undefined,
        allergens,
        rawText: '',
        detectedFields,
        },
    };
  }

