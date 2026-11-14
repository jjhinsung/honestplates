/**
 * Ingredient-list extraction from noisy OCR text.
 *
 * Label photos usually capture the ingredient list next to (or interleaved with)
 * the Nutrition Facts panel, so this:
 *  - finds the real "INGREDIENTS:" heading (OCR-tolerant, skips marketing copy
 *    like "made with simple ingredients"),
 *  - stops at the next label section (allergen statement, "Nutrition Facts",
 *    "Distributed by", storage text…) but NOT at "contains 2% or less of",
 *  - drops Nutrition Facts rows that OCR mixed into the list,
 *  - rejoins words hyphenated across line breaks and fixes digit-for-letter misreads.
 */

// "INGREDIENTS", tolerating I→l/1/|, E→é, D→cl, I→!/1/l and a missing plural.
const HEADING = /(?:^|[^a-z])([il1|][nm]gr[eé](?:d|cl)[il1!|]?[eé]n[tf]s?)\s*([:;.,]?)/gi;

/** Marketing copy that mentions "ingredients" without starting the list. */
const NOT_A_HEADING =
  /(simple|real|quality|natural|wholesome|clean|good|premium|finest|few|our|with|no|only|\d+)\s*$/i;

/**
 * Where the ingredient list ends. "Contains" only ends it when it starts an
 * allergen statement, not "contains 2% or less of" / "contains less than 2% of".
 */
const TERMINATOR = new RegExp(
  [
    String.raw`\bcontains\b(?!\s*:?\s*(?:\d|less\b|one\b|two\b|not\b|no\s+more\b|up\s+to\b|a\s+trivial\b))`,
    String.raw`\bmay\s+contain\b`,
    String.raw`\ballerg(?:en|y)`,
    String.raw`\bmanufactured\b`,
    String.raw`\bproduced\s+(?:in|on|by|for)\b`,
    String.raw`\bprocessed\s+(?:in|on)\s+(?:a|the)\b`,
    String.raw`\bpacked\s+(?:in|by|for)\b`,
    String.raw`\bdistributed\b`,
    String.raw`\bmade\s+(?:in|by|for)\b`,
    String.raw`\bproduct\s+of\b`,
    String.raw`\bkeep\s+(?:refrigerated|frozen|cool|dry|in)\b`,
    String.raw`\bstore\s+(?:in|at|below|refrigerated)\b`,
    String.raw`\brefrigerate\s+after\b`,
    String.raw`\b(?:best|use)\s+(?:by|before|if)\b`,
    String.raw`\bnutrition\s*facts\b`,
    String.raw`\bserving\s*size\b`,
    String.raw`\bservings?\s*per\b`,
    String.raw`\bamount\s*per\b`,
    String.raw`%\s*daily\s*value`,
    String.raw`\bnet\s*w(?:t|eight)\b`,
    String.raw`\bquestions\b`,
    String.raw`\bwww\.`,
    String.raw`\bwarning\b`,
    String.raw`©`,
  ].join('|'),
  'i',
);

/** A Nutrition Facts row that OCR put in the middle of the ingredient list. */
const NUTRIENT_WORD =
  /\b(calories|total\s*fat|sat(?:urated)?\.?\s*fat|trans\s*fat|cholesterol|sodium|total\s*carb\w*|carbohydrate|dietary\s*fib\w*|fib(?:er|re)|total\s*sugars?|added\s*sugars?|protein|vitamin\s*[a-z]\d*|calcium|iron|potassium)\b/i;

function isNutritionRow(line: string): boolean {
  const l = line.trim();
  if (!l) return true;
  if (/^[<>]?\s*\d+(?:\.\d+)?\s*(?:%|m?c?g)?$/i.test(l)) return true; // "10%", "8g", "230"
  if (l.includes(',')) return false; // real ingredient lines are comma-separated
  return NUTRIENT_WORD.test(l) && /\d+(?:\.\d+)?\s*(?:mcg|mg|g|%)(?![a-z])/i.test(l);
}

/** Left halves where a line-break hyphen is a real hyphen ("HIGH-\nFRUCTOSE"). */
const KEEP_HYPHEN = /(?:^|\s)(high|low|non|semi|mono|di|tri|pre|multi|whole|half|part|l|d|dl|alpha|beta|gamma|\d+)$/i;

function joinHyphenatedBreaks(text: string): string {
  return text.replace(/([A-Za-z0-9]+)-[ \t]*\n[ \t]*(?=[A-Za-z])/g, (_, left: string) =>
    KEEP_HYPHEN.test(left) ? `${left}-` : left,
  );
}

/** OCR digit-for-letter swaps inside words: "S0Y" → "SOY", "V1TAMIN" → "VITAMIN". */
function fixLetterDigits(text: string): string {
  return text.replace(/[A-Za-z]{1,}[015][A-Za-z]+/g, word => {
    const upper = word === word.toUpperCase();
    return word
      .replace(/(?<=[A-Za-z])0(?=[A-Za-z])/g, upper ? 'O' : 'o')
      .replace(/(?<=[A-Za-z])1(?=[A-Za-z])/g, upper ? 'I' : 'l')
      .replace(/(?<=[A-Za-z])5(?=[A-Za-z])/g, upper ? 'S' : 's');
  });
}

function tidy(list: string): string {
  let s = list
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;.)\]])/g, '$1')
    .replace(/([(\[])\s+/g, '$1')
    .replace(/,(?=\S)/g, ', ')
    .replace(/(,\s*){2,}/g, ', ')
    .replace(/^[\s,;:.\-]+/, '')
    .replace(/[\s,;:\-*]+$/, '')
    .replace(/\.$/, '')
    .trim();
  // Close brackets the list opened (the last ")" is often cut off by the frame).
  const open = (s.match(/\(/g) ?? []).length - (s.match(/\)/g) ?? []).length;
  if (open > 0) s += ')'.repeat(open);
  const openSq = (s.match(/\[/g) ?? []).length - (s.match(/\]/g) ?? []).length;
  if (openSq > 0) s += ']'.repeat(openSq);
  return s;
}

/** Pick the "INGREDIENTS" mention that starts the real list. */
function findHeading(text: string): { end: number } | undefined {
  let best: { end: number; score: number } | undefined;
  HEADING.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HEADING.exec(text))) {
    const wordStart = m.index + m[0].indexOf(m[1]);
    const before = text.slice(Math.max(0, wordStart - 24), wordStart);
    let score = 0;
    if (m[2] === ':' || m[2] === ';') score += 3;
    if (m[1] === m[1].toUpperCase()) score += 1;
    if (/(^|\n)\s*$/.test(before)) score += 1; // starts a line
    if (NOT_A_HEADING.test(before)) score -= 4;
    if (!best || score > best.score) best = { end: m.index + m[0].length, score };
  }
  return best && best.score >= 0 ? { end: best.end } : undefined;
}

export interface ExtractedIngredients {
  /** The cleaned ingredient list, e.g. "WHOLE GRAIN OATS, SUGAR, SALT". */
  ingredients?: string;
  /** The allergen statement, e.g. "MILK, SOY" from "CONTAINS: MILK, SOY." */
  containsStatement?: string;
}

export function extractIngredients(rawText: string): ExtractedIngredients {
  const text = joinHyphenatedBreaks(rawText.replace(/\r/g, '').replace(/[|]/g, ' '));

  const contains = /\bcontains\b(?!\s*:?\s*(?:\d|less\b|one\b|two\b|not\b|no\s+more\b|up\s+to\b))\s*:?\s*([^\n.]+)/i.exec(
    text,
  )?.[1];
  const containsStatement = contains ? tidy(fixLetterDigits(contains)) || undefined : undefined;

  const heading = findHeading(text);
  if (!heading) return { containsStatement };

  let body = text.slice(heading.end);
  const stop = TERMINATOR.exec(body);
  if (stop) body = body.slice(0, stop.index);

  const kept = body.split('\n').filter(line => !isNutritionRow(line));
  const ingredients = tidy(fixLetterDigits(kept.join(' ')));
  return {
    ingredients: ingredients.length > 3 ? ingredients : undefined,
    containsStatement,
  };
}

/**
 * Split an ingredient list into top-level items. Sub-ingredients stay attached
 * to their parent: "CHOCOLATE (SUGAR, COCOA BUTTER), SALT" → 2 items.
 */
export function splitIngredients(list: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let cur = '';
  const push = () => {
    const item = cur
      .replace(/^\s*(?:and\/or|and|or)\s+/i, '')
      .replace(/^\s*(?:contains\s+(?:\d+\s*%|less\s+than|one\s+or\s+more)[^:]*:)\s*/i, '')
      .replace(/[.\s]+$/, '')
      .trim();
    if (item) items.push(item);
    cur = '';
  };
  for (const ch of list) {
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if ((ch === ')' || ch === ']' || ch === '}') && depth > 0) depth--;
    if ((ch === ',' || ch === ';') && depth === 0) push();
    else cur += ch;
  }
  push();
  return items;
}

// ---------------- Allergens ----------------

/** Plant "milks/butters/creams" that are not dairy. */
const PLANT_BEFORE =
  /(coconut|almond|oat|soy|soya|rice|cashew|peanut|cocoa|cacao|shea|nut|apple|seed|sunflower|hemp|pea|mango|kokum|illipe)\s*$/i;

interface AllergenRule {
  name: string;
  pattern: RegExp;
  /** Return true to ignore a match (e.g. "cocoa butter" for Milk). */
  exclude?: (before: string, after: string, match: string) => boolean;
}

const ALLERGEN_RULES: AllergenRule[] = [
  {
    name: 'Milk',
    pattern:
      /\b(milk\w*|buttermilk|whey|casein\w*|lactose|ghee|cheese|cream|butter|yog(?:h)?urt|curds?|lactalbumin|dairy)\b/gi,
    exclude: (before, after, match) =>
      PLANT_BEFORE.test(before) ||
      (/^cream$/i.test(match) && /^\s*of\s+tartar/i.test(after)) ||
      /\b(non[- ]?dairy|dairy[- ]free)\s*$/i.test(before + match),
  },
  {
    name: 'Eggs',
    pattern: /\b(eggs?|egg\s*(?:whites?|yolks?)|albumin|meringue|mayonnaise)\b/gi,
  },
  {
    name: 'Fish',
    pattern:
      /\b(fish|anchov(?:y|ies)|cod|salmon|tuna|tilapia|pollock|haddock|trout|sardines?|mackerel|halibut|catfish|swordfish|snapper|flounder|herring)\b/gi,
  },
  {
    name: 'Shellfish',
    pattern: /\b(shellfish|shrimps?|crabs?|lobsters?|prawns?|crayfish|crawfish|krill)\b/gi,
  },
  {
    name: 'Tree nuts',
    pattern:
      /\b(tree\s*nuts?|almonds?|cashews?|walnuts?|pecans?|pistachios?|hazelnuts?|filberts?|macadamia|brazil\s*nuts?|pine\s*nuts?)\b/gi,
  },
  { name: 'Peanuts', pattern: /\b(peanuts?|groundnuts?|arachis)\b/gi },
  {
    name: 'Wheat',
    pattern: /\b(wheat|semolina|durum|spelt|farina|einkorn|kamut|triticale)\b/gi,
    exclude: (before, after) => /^\s*[- ]?free\b/i.test(after),
  },
  { name: 'Soy', pattern: /\b(soy|soya|soybeans?|edamame|tofu|miso)\b/gi },
  { name: 'Sesame', pattern: /\b(sesame|tahini)\b/gi },
];

/** FDA major allergens found in the ingredient list and/or "Contains:" statement. */
export function detectAllergens(ingredients?: string, containsStatement?: string): string[] {
  const text = `${ingredients ?? ''}\n${containsStatement ?? ''}`;
  return ALLERGEN_RULES.filter(rule => {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(text))) {
      const before = text.slice(Math.max(0, m.index - 16), m.index);
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 16);
      if (!rule.exclude?.(before, after, m[0])) return true;
    }
    return false;
  }).map(r => r.name);
}
