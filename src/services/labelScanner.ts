import TextRecognition from '@react-native-ml-kit/text-recognition';
import type { ParsedLabel } from '../types';
import { toFileUri } from './imageUtils';
import { parseNutritionLabel, type OcrLine } from './labelParser';

/**
 * On-device OCR (Google ML Kit) → Nutrition Facts parser.
 * Runs fully offline; nothing leaves the phone.
 */
export async function scanNutritionLabel(photoPath: string): Promise<ParsedLabel> {
  const result = await TextRecognition.recognize(toFileUri(photoPath));
  // ML Kit returns blocks in reading order; joining lines keeps label rows intact.
  const text = result.blocks
    .map(b => b.lines.map(l => l.text).join('\n'))
    .join('\n');
  // Pass word positions too: the big calorie number is often returned out of
  // reading order, and its position next to "Calories" is the reliable signal.
  const layout: OcrLine[] = result.blocks.flatMap(b =>
    b.lines.map(l => ({
      text: l.text,
      frame: l.frame,
      words: l.elements.map(e => ({ text: e.text, frame: e.frame })),
    })),
  );
  return parseNutritionLabel(text || result.text, layout);
}
