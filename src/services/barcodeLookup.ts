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
const USER_AGENT = 'NutriLens/0.1 (iOS; contact: you@example.com)';
const FIELDS = [
    'code', 'product_name', 'brands', 'serving_size', 'serving_quantity',
    'nutriments', 'ingredients_text', 'ingredients_text_en', 'allergens_tags',
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

export async function lookupBarcode(code: string, timeoutMs = 10000):  Promise<BarcodeLookupResult> {
    for (const c of barcodeVariants(code)) {
        const cached = cache.get(c);
        if (cached) return cached;
        
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let res: Response;
        try {
            res = await fetch(`${OFF_PRODUCT_URL}/${c}.json?fields=${FIELDS}`, {
                headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
                signal: controller.signal,
            });
        } catch (e: any) {
            throw new Error(e?.name === 'AbortError' ? 'The product database took too long to respond.' : 'No internet connection.');
        } finally {
            clearTimeout(timer);
        }
        if (res.status === 404) continue; // unknown → try the other spelling
        if (!res.ok) throw new Error(`Product database error (${res.status}).`);
        const json = await res.json();
        if (json?.status !== 1 || !json.product) continue;
        const result = productToParsedLabel(json.product, c);
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
          allergens,
          rawText: '',
          detectedFields,
        },
      };
    }

