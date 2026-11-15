import type { FoodEntry, Nutrients, ParsedLabel, PlateItem } from '../types';
import { scaleNutrients } from './nutrition';

/** An entry's nutrients for ONE serving/portion (entries store the total eaten). */
export function perServingOf(entry: FoodEntry): Nutrients {
  return entry.servings > 0 ? scaleNutrients(entry.nutrients, 1 / entry.servings) : entry.nutrients;
}

/**
 * What the label review page needs to reopen a logged food. Entries logged since
 * this feature store the page as it was saved; older ones are rebuilt from their totals.
 */
export function labelFromEntry(entry: FoodEntry): ParsedLabel {
  if (entry.label) return { ...entry.label, productName: entry.name };
  const nutrients = perServingOf(entry);
  return {
    productName: entry.name,
    barcode: entry.barcode,
    servingSize: entry.servingDescription,
    nutrients,
    rawText: '',
    // Everything shown was entered or confirmed by the user, so nothing is flagged as "not found".
    detectedFields: (Object.keys(nutrients) as (keyof Nutrients)[]).filter(k => nutrients[k] !== undefined),
  };
}

/** One plate-photo item as the plate review page shows it, at one portion. */
export function plateItemFromEntry(entry: FoodEntry): PlateItem {
  return {
    name: entry.name,
    portion: entry.servingDescription ?? '1 portion',
    nutrients: perServingOf(entry),
    confidence: entry.confidence ?? 1,
  };
}
