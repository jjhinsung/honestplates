/**
 * Calorie extraction for Nutrition Facts panels.
 *
 * Calories are the hardest value to OCR reliably because the number is printed
 * in a much larger font than the rest of the panel. Google ML Kit therefore
 * often returns it as its own text block, out of reading order (after the
 * "% Daily Value" header, or even before "Calories"), and large digits are
 * frequently misread (0→O, 5→S, 1→l/I, 8→B).
 *
 * Strategy, in priority order:
 *   1. Layout: use ML Kit's bounding boxes to find the number printed on the
 *      same row as the word "Calories", to its right (tallest wins).
 *   2. Explicit "kcal" values (EU/international labels that also show kJ).
 *   3. Text: the first bare number after "Calories" (numbers with g/mg/%/kJ
 *      units are skipped), then any standalone number line.
 *   4. Cross-check every candidate against calories implied by the macros
 *      (4·protein + 4·carbs + 9·fat) and prefer the one that agrees.
 */

export interface OcrBox {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface OcrWord {
  text: string;
  frame?: OcrBox;
}
export interface OcrLine {
  text: string;
  frame?: OcrBox;
  words?: OcrWord[];
}

export type CaloriesStatus =
  | 'ok' // read from the label and consistent with the macros
  | 'unverified' // read from the label; not enough macros to cross-check
  | 'mismatch' // read from the label but disagrees with the macros
  | 'estimated'; // not readable; estimated from the macros

export interface CaloriesResult {
  value?: number;
  status?: CaloriesStatus;
  macroEstimate?: number;
  /** Diagnostics for the "Scanned text" panel. */
  candidates?: number[];
  rejected?: number[];
  maxPlausible?: number;
  servingGrams?: number;
}

const MAX_CALORIES = 3000;

/** "Calories" and common OCR misreads of it ("Calorles", "Calones", "Caiories", "CALORIES"). */
const CAL_WORD = /^ca[l1i][o0](?:r|n|ri|rl)[a-z1]{0,3}[:.]?$/i;
const CAL_IN_TEXT = /\bca[l1i][o0](?:r|n|ri|rl)[a-z1]{0,3}\b/gi;

/**
 * Fix letter-for-digit misreads inside tokens that start with a digit:
 * "23O" → "230", "1S0" → "150", "2l0" → "210", "1B0" → "180".
 * Tokens that start with a letter (e.g. "B12", "D3") are left alone.
 */
export function fixDigitTokens(s: string): string {
  return s.replace(/\b\d[0-9OoSsIlB]{1,5}\b/g, tok =>
    tok.replace(/[Oo]/g, '0').replace(/[Ss]/g, '5').replace(/[Il]/g, '1').replace(/B/g, '8'),
  );
}

const toNumber = (raw: string): number | undefined => {
  const t = fixDigitTokens(raw.trim()).replace(/^(\d{1,3}),(\d{3})$/, '$1$2');
  if (!/^\d{1,4}$/.test(t)) return undefined;
  const v = parseInt(t, 10);
  return v <= MAX_CALORIES ? v : undefined;
};

/** True if this "calories" mention is not the Calories row (e.g. "Calories from Fat", footnote "2,000 calories a day"). */
function isExcludedMention(before: string, after: string): boolean {
  return (
    /^\s*from\b/i.test(after) ||
    /^\s*(a\s*day|per\s*day|diet)\b/i.test(after) ||
    /\b\d[,.]?\d{3}\s*$/.test(before) // footnote "2,000 calories" / "2500 calories"
  );
}

// ---------------- 1. Layout ----------------

export function caloriesFromLayout(lines: OcrLine[]): number | undefined {
  let label: OcrBox | undefined;

  outer: for (const line of lines) {
    const words: OcrWord[] = line.words?.length ? line.words : [{ text: line.text, frame: line.frame }];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (!w.frame || !CAL_WORD.test(w.text.trim())) continue;
      const before = words.slice(0, i).map(x => x.text).join(' ');
      const after = words.slice(i + 1).map(x => x.text).join(' ');
      if (isExcludedMention(before, after)) continue;
      label = w.frame;
      break outer;
    }
  }
  if (!label) return undefined;

  const labelCy = label.top + label.height / 2;
  const labelRight = label.left + label.width;
  const candidates: { value: number; height: number; dx: number }[] = [];

  for (const line of lines) {
    const words: OcrWord[] = line.words?.length ? line.words : [{ text: line.text, frame: line.frame }];
    words.forEach((w, i) => {
      if (!w.frame) return;
      const value = toNumber(w.text);
      if (value === undefined) return;
      if (/^\s*%/.test(words[i + 1]?.text ?? '')) return; // "10 %" split into two words
      const f = w.frame;
      if (f.left < label!.left + label!.width * 0.6) return; // must be to the right of "Calories"
      const cy = f.top + f.height / 2;
      if (Math.abs(cy - labelCy) > Math.max(label!.height, f.height) * 0.75) return; // same row
      candidates.push({ value, height: f.height, dx: Math.max(0, f.left - labelRight) });
    });
  }
  if (!candidates.length) return undefined;

  // The calorie number is the tallest text on its row; on dual-column labels
  // (per serving / per container) the nearest column is the per-serving one.
  const tallest = Math.max(...candidates.map(c => c.height));
  return candidates
    .filter(c => c.height >= tallest * 0.85)
    .sort((a, b) => a.dx - b.dx)[0].value;
}

// ---------------- 2–3. Text ----------------

/** Values written as "250 kcal" (international labels showing kJ and kcal). */
export function caloriesFromKcal(flat: string): number | undefined {
  const m = /(\d{1,4})\s*kcal\b/i.exec(fixDigitTokens(flat));
  return m ? toNumber(m[1]) : undefined;
}

/** First bare number after a valid "Calories" mention (skips g/mg/mcg/%/kJ values). */
export function caloriesAfterLabel(flat: string, window = 45): number | undefined {
  return caloriesAfterLabelAll(flat, window)[0];
}

/** Up to 3 bare numbers after valid "Calories" mentions, in reading order (first = most likely). */
export function caloriesAfterLabelAll(flat: string, window = 45): number[] {
  const found: number[] = [];
  const text = fixDigitTokens(flat).replace(/(\d{1,3}),(\d{3})(?!\d)/g, '$1$2');
  CAL_IN_TEXT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CAL_IN_TEXT.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    const after = text.slice(m.index + m[0].length);
    if (isExcludedMention(before, after)) continue;
    // Match against the full remaining text so a unit just past the window edge is still seen.
    const num = /(\d+(?:\.\d+)?)(\s*(?:mcg|mg|g|kj|%)(?![a-z]))?/gi;
    let n: RegExpExecArray | null;
    while ((n = num.exec(after)) && n.index < window) {
      if (n[2]) {
        // "% Daily Value" header right after the number is not a %DV value.
        const isDvHeader = /%/.test(n[2]) && /^\s*d(aily)?\s*v/i.test(after.slice(n.index + n[0].length));
        if (!isDvHeader) continue;
      }
      const v = toNumber(n[1]);
      if (v !== undefined) found.push(v);
      if (found.length >= 3) return found;
    }
  }
  return found;
}

/** Lines that are only a number (the big calorie figure often lands on its own line). */
export function standaloneNumbers(text: string): number[] {
  return fixDigitTokens(text)
    .split('\n')
    .map(l => l.trim().replace(/^(\d{1,3}),(\d{3})$/, '$1$2'))
    .filter(l => /^\d{2,4}$/.test(l))
    .map(l => parseInt(l, 10))
    .filter(v => v >= 10 && v <= MAX_CALORIES);
}

// ---------------- 4. Resolve + cross-check ----------------

/** Grams (or ml) per serving from e.g. "1 Pack (28g)", "2/3 cup (55g)", "250 ml". */
export function servingGramsFrom(servingSize?: string): number | undefined {
  if (!servingSize) return undefined;
  const m =
    /\(\s*(\d+(?:\.\d+)?)\s*(?:g|ml)\s*\)/i.exec(servingSize) ??
    /(\d+(?:\.\d+)?)\s*(?:g|ml)\b/i.exec(servingSize);
  const v = m ? parseFloat(m[1]) : NaN;
  return v >= 1 && v <= 2000 ? v : undefined;
}

export function resolveCalories(opts: {
  text: string; // normalized multi-line text
  layout?: OcrLine[];
  macros: { protein?: number; carbs?: number; fat?: number };
  /** Serving weight in grams, if printed. Food can't exceed ~9 kcal per gram (pure fat). */
  servingGrams?: number;
}): CaloriesResult {
  const flat = opts.text.replace(/\n/g, ' ');
  const { protein, carbs, fat } = opts.macros;
  const knownMacros = [protein, carbs, fat].filter(v => v !== undefined).length;
  const macroEstimate =
    knownMacros >= 2 ? Math.round((protein ?? 0) * 4 + (carbs ?? 0) * 4 + (fat ?? 0) * 9) : undefined;
  const maxPlausible = opts.servingGrams ? Math.ceil(opts.servingGrams * 9) + 10 : MAX_CALORIES;

  const ordered = [
    opts.layout ? caloriesFromLayout(opts.layout) : undefined,
    caloriesFromKcal(flat),
    ...caloriesAfterLabelAll(flat),
    ...standaloneNumbers(opts.text),
  ].filter((v): v is number => v !== undefined);
  const all = Array.from(new Set(ordered));
  // Physically impossible for this serving size (e.g. 1570 kcal in a 28 g pack) → misread.
  const candidates = all.filter(v => v <= maxPlausible);
  const rejected = all.filter(v => v > maxPlausible);
  const diag = {
    candidates: all,
    rejected,
    maxPlausible: opts.servingGrams ? maxPlausible : undefined,
    servingGrams: opts.servingGrams,
  };

  if (!candidates.length) {
    return macroEstimate !== undefined
      ? { value: Math.min(macroEstimate, maxPlausible), status: 'estimated', macroEstimate, ...diag }
      : { ...diag };
  }
  if (macroEstimate === undefined) {
    return { value: candidates[0], status: 'unverified', ...diag };
  }
  // Labels round values and fiber/sugar alcohols carry fewer calories, so allow slack.
  const tolerance = Math.max(30, macroEstimate * 0.25);
  const agreeing = candidates.find(v => Math.abs(v - macroEstimate) <= tolerance);
  if (agreeing !== undefined) return { value: agreeing, status: 'ok', macroEstimate, ...diag };
  // Nothing agrees (often because a macro was misread): take the most plausible number,
  // i.e. the one closest to the macro estimate — not simply the first one found.
  const closest = [...candidates].sort((a, b) => Math.abs(a - macroEstimate) - Math.abs(b - macroEstimate))[0];
  return { value: closest, status: 'mismatch', macroEstimate, ...diag };
}
