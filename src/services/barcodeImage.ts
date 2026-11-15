import BarcodeScanning, { BarcodeFormat, type Barcode } from '@react-native-ml-kit/barcode-scanning';
import { toFileUri } from './imageUtils';

/** Retail food barcodes, matching the formats the live camera looks for. */
const FOOD_FORMATS = new Set<BarcodeFormat>([
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
]);

/** The first product barcode in the list (ignores QR codes, shipping codes, etc.). */
export function pickFoodBarcode(barcodes: Barcode[]): string | undefined {
  for (const b of barcodes) {
    const digits = b.value?.replace(/\D/g, '') ?? '';
    if (FOOD_FORMATS.has(b.format) && digits.length >= 8) return digits;
  }
  return undefined;
}

/**
 * Looks for a product barcode in a saved photo (on-device ML Kit, works offline).
 * Returns undefined when there isn't one or the scan fails — the caller then
 * reads the Nutrition Facts panel instead.
 */
export async function findBarcodeInPhoto(photoPath: string): Promise<string | undefined> {
  try {
    return pickFoodBarcode(await BarcodeScanning.scan(toFileUri(photoPath)));
  } catch {
    return undefined;
  }
}
