/**
 * Gets a product's ingredient list for the Ingredients tab, either from
 * Open Food Facts (barcode) or from a photo of the ingredient list (on-device OCR).
 * Read-only: nothing here logs food or changes calorie tracking.
 */
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { barcodeVariants, fetchOffProduct } from './barcodeLookup';
import { toFileUri } from './imageUtils';
import { extractIngredients } from './ingredientParser';

const FIELDS = ['code', 'product_name', 'brands', 'ingredients_text', 'ingredients_text_en', 'additives_tags'].join(',');

export type IngredientLookupResult =
  | { status: 'found'; barcode: string; productName?: string; ingredientsText: string; additiveTags: string[] }
  | { status: 'no-ingredients'; barcode: string; productName?: string }
  | { status: 'not-found' };

const cache = new Map<string, IngredientLookupResult>();

export async function lookupIngredients(code: string, timeoutMs = 20000): Promise<IngredientLookupResult> {
  for (const c of barcodeVariants(code)) {
    const cached = cache.get(c);
    if (cached) return cached;

    const product = await fetchOffProduct(c, FIELDS, timeoutMs);
    if (!product) continue; // unknown → try the other spelling
    const result = productToIngredients(product, c);
    cache.set(c, result);
    return result;
  }
  return { status: 'not-found' };
}

export function productToIngredients(product: any, barcode: string): IngredientLookupResult {
  const productName =
    [product.brands?.split(',')[0]?.trim(), product.product_name?.trim()].filter(Boolean).join(' ') || undefined;
  const text: string = (product.ingredients_text_en || product.ingredients_text || '').trim();
  if (text.length < 3) return { status: 'no-ingredients', barcode, productName };
  const additiveTags: string[] = Array.isArray(product.additives_tags) ? product.additives_tags : [];
  return { status: 'found', barcode, productName, ingredientsText: text, additiveTags };
}

/**
 * Reads an ingredient list from a photo. If there's no "Ingredients:" heading
 * (e.g. the photo shows only the list), the whole recognized text is used.
 */
export async function scanIngredientList(photoPath: string): Promise<string | undefined> {
  const result = await TextRecognition.recognize(toFileUri(photoPath));
  const text = result.blocks.map(b => b.lines.map(l => l.text).join('\n')).join('\n') || result.text;
  const extracted = extractIngredients(text).ingredients;
  if (extracted) return extracted;
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.includes(',') && flat.length > 10 ? flat : undefined;
}
