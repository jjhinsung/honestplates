import type { Nutrients, ParsedLabel } from '../types';
import { fixDigitTokens, resolveCalories, servingGramsFrom, type OcrLine } from './caloriesExtractor';

export type { OcrLine } from './caloriesExtractor';

/**
 * Turns raw OCR text from a US-style "Nutrition Facts" panel into structured,
 * per-serving nutrients. OCR output is noisy, so the parser:
 *  - normalizes common misreads (O→0 before units, "l" → "1", stray pipes),
 *  - ignores numbers immediately followed by "%" (those are %DV, not amounts),
 *  - reports which fields it actually found so the UI can ask the user to confirm.
 */

const MAJOR_ALLERGENS: [string, RegExp][] = [
  ['Milk', /\b(milk|whey|casein|butter|cream|cheese|lactose)\b/i],
  ['Eggs', /\beggs?\b|\balbumin\b/i],
  ['Fish', /\b(fish|anchov|cod|salmon|tuna|tilapia)\w*/i],
  ['Shellfish', /\b(shrimp|crab|lobster|shellfish|prawn)\w*/i],
  ['Tree nuts', /\b(almond|cashew|walnut|pecan|pistachio|hazelnut|macadamia)\w*/i],
  ['Peanuts', /\bpeanuts?\b/i],
  ['Wheat', /\bwheat\b/i],
  ['Soy', /\bsoy(bean|a)?\b/i],
  ['Sesame', /\bsesame\b/i],
];

function normalize(raw: string): string {
  return fixDigitTokens(raw)
    .replace(/\r/g, '')
    .replace(/[|]/g, ' ')
    .replace(/\bO(?=\s?(m?g|mcg)\b)/g, '0') // "Og" → "0g"
    .replace(/(\d)\s?[oO](?=\s?(m?g)\b)/g, '$10') // "1Og" → "10g"
    .replace(/(\d)[oO](?=\d)/g, '$10') // "1O5mg" → "105mg"
    .replace(/\bl(?=\d)/g, '1') // "l2g" → "12g"
    .replace(/(\d),(\d{3})(?!\d)/g, '$1$2') // thousands separator: "1,250" → "1250"
    .replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2') // EU decimal comma: "2,5g" → "2.5g"
    .replace(/[ \t]+/g, ' ');
}

/**
 * Find the first amount after `label`, skipping %DV values.
 * Looks up to `window` characters ahead (labels often wrap onto the next line).
 */
function findAmount(
  text: string,
  label: RegExp,
  unit: 'g' | 'mg' | 'none',
  window = 40,
): number | undefined {
  const m = label.exec(text);
  if (!m) return undefined;
  const after = text.slice(m.index + m[0].length, m.index + m[0].length + window);
  // A trailing "%" marks a %DV value — unless it's the "% Daily Value" column header.
  const num = /(<\s*)?(\d+(?:\.\d+)?)\s*(mcg|mg|g)?(\s*%(?!\s*d(aily)?\s*v))?/gi;
  let hit: RegExpExecArray | null;
  while ((hit = num.exec(after))) {
    if (hit[4]) continue; // a %DV number
    let value = parseFloat(hit[2]);
    const foundUnit = hit[3];
    if (hit[1]) value = value / 2; // "<1g" → 0.5g (conservative midpoint)
    // Convert if the label printed a different unit than we store.
    if (unit === 'g' && foundUnit === 'mg') value = value / 1000;
    if (unit === 'mg' && foundUnit === 'g') value = value * 1000;
    // Common OCR error: trailing "g" read as "9" (e.g. "8g" → "89"). If no unit was
    // read, the number ends in 9 and is implausibly large for a gram value, drop the 9.
    if (unit === 'g' && !foundUnit && /9$/.test(hit[2]) && value > 60) {
      value = parseFloat(hit[2].slice(0, -1)) || 0;
    }
    return value;
  }
  return undefined;
}

/**
 * @param rawText  OCR text in reading order.
 * @param layout   Optional OCR lines/words with bounding boxes (from ML Kit). Strongly
 *                 improves calorie detection, whose large digits are often out of order.
 */
// Label patterns tolerant of common OCR misreads ("Tota! Fat", "T0tal Carb.", "Prote1n").
const TOTAL = String.raw`t[o0]t[a@][l1i!|]?\s*`;
const RE_TOTAL_FAT = new RegExp(String.raw`\b${TOTAL}f[a@]t\b`, 'i');
const RE_TOTAL_CARBS = new RegExp(String.raw`\b${TOTAL}c[a@]rb(?:[o0]hydr[a@]te)?s?\.?`, 'i');
const RE_CARBS = /\bc[a@]rb[o0]hydr[a@]tes?\b/i;
const RE_PROTEIN = /\bpr[o0][tf]e[i1l!]n\b/i;

/**
 * Plain "Fat" (EU-style labels, or "Total" lost to OCR) — but not Saturated/Trans/
 * Poly-/Monounsaturated fat or "Calories from Fat".
 */
function findPlainFat(text: string): number | undefined {
  const re = /\bf[a@]t\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 18), m.index);
    if (/(sat(urated)?\.?|trans|poly\w*|mono\w*|from|unsat\w*)\s*$/i.test(before)) continue;
    const v = findAmount(text.slice(m.index), /^f[a@]t\b/i, 'g');
    if (v !== undefined) return v;
  }
  return undefined;
}

export function parseNutritionLabel(rawText: string, layout?: OcrLine[]): ParsedLabel {
  const text = normalize(rawText);
  const flat = text.replace(/\n/g, ' ');

  const detected: (keyof Nutrients)[] = [];
  const pick = (key: keyof Nutrients, v: number | undefined) => {
    if (v !== undefined && Number.isFinite(v)) {
      detected.push(key);
      return v;
    }
    return undefined;
  };

  const nutrients: Nutrients = {
    calories: 0, // resolved below, once the macros are known
    fat: pick('fat', findAmount(flat, RE_TOTAL_FAT, 'g') ?? findPlainFat(flat)) ?? 0,
    carbs:
      pick('carbs', findAmount(flat, RE_TOTAL_CARBS, 'g') ?? findAmount(flat, RE_CARBS, 'g')) ?? 0,
    protein: pick('protein', findAmount(flat, RE_PROTEIN, 'g')) ?? 0,
    saturatedFat: pick('saturatedFat', findAmount(flat, /\bsat(urated)?\.?\s*fat\b/i, 'g')),
    transFat: pick('transFat', findAmount(flat, /\btrans\s*fat\b/i, 'g')),
    cholesterol: pick('cholesterol', findAmount(flat, /\bcholesterol\b/i, 'mg')),
    sodium: pick('sodium', findAmount(flat, /\bsodium\b/i, 'mg')),
    fiber: pick('fiber', findAmount(flat, /\b(dietary\s*)?fib(er|re)\b/i, 'g')),
    sugar: pick('sugar', findAmount(flat, /\b(total\s*)?sugars?\b(?!\s*alcohol)/i, 'g')),
  };

  // "Includes 10g Added Sugars" — the number comes BEFORE the label.
  const added = /includes\s*(\d+(?:\.\d+)?)\s*g\s*added\s*sugars?/i.exec(flat);
  if (added) {
    nutrients.addedSugar = parseFloat(added[1]);
    detected.push('addedSugar');
  } else {
    nutrients.addedSugar = pick('addedSugar', findAmount(flat, /\badded\s*sugars?\b/i, 'g'));
  }

  const servingSize = /serving\s*size\s*:?\s*([^\n]{1,40})/i.exec(text)?.[1]?.trim();

  // Calories: layout-aware extraction, cross-checked against the macros and
  // bounded by the serving weight (≤ 9 kcal per gram).
  const cal = resolveCalories({
    text,
    layout,
    servingGrams: servingGramsFrom(servingSize),
    macros: {
      protein: detected.includes('protein') ? nutrients.protein : undefined,
      carbs: detected.includes('carbs') ? nutrients.carbs : undefined,
      fat: detected.includes('fat') ? nutrients.fat : undefined,
    },
  });
  if (cal.value !== undefined) {
    nutrients.calories = cal.value;
    if (cal.status !== 'estimated') detected.push('calories');
  }

  // Serving info
  const spc =
    /(\d+(?:\.\d+)?)\s*servings?\s*per\s*(container|package)/i.exec(flat)?.[1] ??
    /servings?\s*per\s*(container|package)\s*:?\s*(about\s*)?(\d+(?:\.\d+)?)/i.exec(flat)?.[3];

  // Ingredients (often printed below or beside the panel)
  const ingMatch =
    /ingredients?\s*[:.]?\s*([\s\S]+?)(?=\bcontains\b\s*:?|\ballergen|\bdistributed\b|\bmanufactured\b|\bmade in\b|\bkeep\b|$)/i.exec(
      text,
    );
  const ingredients = ingMatch?.[1]?.replace(/\s+/g, ' ').trim();

  const allergenText = `${ingredients ?? ''} ${/contains\s*:?\s*([^\n.]+)/i.exec(text)?.[1] ?? ''}`;
  const allergens = MAJOR_ALLERGENS.filter(([, re]) => re.test(allergenText)).map(
    ([name]) => name,
  );

  return {
    servingSize: servingSize?.replace(/\s+/g, ' '),
    servingsPerContainer: spc ? parseFloat(spc) : undefined,
    nutrients,
    ingredients: ingredients && ingredients.length > 3 ? ingredients : undefined,
    allergens,
    rawText,
    detectedFields: Array.from(new Set(detected)),
    caloriesCheck: {
      status: cal.status ?? 'unverified',
      macroEstimate: cal.macroEstimate,
      candidates: cal.candidates ?? [],
      rejected: cal.rejected ?? [],
      maxPlausible: cal.maxPlausible,
      servingGrams: cal.servingGrams,
      found: cal.value !== undefined,
    },
  };
}

/** True if the parse found enough to be worth showing (calories + at least 2 macros). */
export function isUsableParse(p: ParsedLabel): boolean {
  const macros = (['protein', 'carbs', 'fat'] as const).filter(k =>
    p.detectedFields.includes(k),
  );
  return p.detectedFields.includes('calories') && macros.length >= 2;
}
