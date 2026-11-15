import { splitIngredients } from './ingredientParser';

/**
 * GMO check for a packaged food.
 *
 * Ingredient lists don't say whether an ingredient is genetically engineered, so
 * this combines three signals, strongest first:
 *  1. The package's own disclosure: the USDA "Bioengineered" label, or a
 *     "Non-GMO" / organic claim (organic rules prohibit GMOs).
 *  2. Open Food Facts label tags (barcode lookups).
 *  3. Ingredients made from crops that are mostly genetically engineered in the
 *     US (corn, soy, canola, sugar beets, cotton…), unless marked organic/non-GMO.
 *
 * Result 3 is "likely", not proven: the same ingredient can come from a non-GMO crop.
 */

export type GmoStatus =
  | 'bioengineered' // the package says so
  | 'likely' // made from a crop that's mostly GMO in the US
  | 'possible' // an ingredient that's often made from one of those crops
  | 'non-gmo' // labeled non-GMO or organic
  | 'none-found' // no ingredients from common GMO crops
  | 'unknown'; // no ingredient list to check

export interface GmoMatch {
  /** The ingredient as printed, e.g. "SOY LECITHIN". */
  ingredient: string;
  /** The crop it most likely comes from, e.g. "soy". */
  crop: string;
  confidence: 'likely' | 'possible';
}

export interface GmoResult {
  status: GmoStatus;
  headline: string;
  detail: string;
  matches: GmoMatch[];
  /** The package wording behind a bioengineered / non-GMO result. */
  evidence?: string;
}

interface CropRule {
  crop: string;
  pattern: RegExp;
  confidence: 'likely' | 'possible';
  exclude?: RegExp;
}

/** Crops that are mostly genetically engineered in the US (USDA: ~90%+ of acreage). */
const CROP_RULES: CropRule[] = [
  // "corn" but not peppercorn/acorn/popcorn (GMO popcorn isn't grown).
  { crop: 'corn', pattern: /\b(corn|maize|hominy|masa|polenta)\b/i, confidence: 'likely' },
  { crop: 'corn', pattern: /\bhigh[- ]fructose\b|\bhfcs\b/i, confidence: 'likely' },
  {
    crop: 'soy',
    pattern: /\b(soy|soya|soybeans?|edamame|tofu|tempeh|miso|tamari|textured vegetable protein|tvp)\b/i,
    confidence: 'likely',
  },
  { crop: 'canola', pattern: /\b(canola|rapeseed)\b/i, confidence: 'likely' },
  { crop: 'cotton', pattern: /\bcottonseed\b/i, confidence: 'likely' },
  { crop: 'sugar beets', pattern: /\bbeet\s*sugar\b|\bsugar\s*beets?\b/i, confidence: 'likely' },
  { crop: 'alfalfa', pattern: /\balfalfa\b/i, confidence: 'likely' },
  { crop: 'papaya', pattern: /\bhawaiian\s+papaya\b/i, confidence: 'possible' },
  // Plain "sugar" in the US is about half sugar beet unless it says cane/coconut/etc.
  {
    crop: 'sugar beets',
    pattern: /\bsugar\b/i,
    confidence: 'possible',
    exclude: /\b(cane|coconut|palm|date|maple|turbinado|demerara|muscovado|brown rice|invert cane)\b|sugar\s*(cane|alcohol)|\bno\s+(added\s+)?sugar/i,
  },
  // Usually made from corn (or soy/canola/cotton for oils), but the label doesn't say.
  {
    crop: 'corn',
    pattern: /\b(maltodextrin|dextrose|glucose(\s*-?\s*fructose)?\s*syrup|modified\s+(food\s+)?starch|food\s+starch)\b/i,
    confidence: 'possible',
    exclude: /\b(tapioca|potato|wheat|rice|cassava)\b/i,
  },
  {
    crop: 'soy, canola, corn or cotton',
    pattern: /\bvegetable\s+(oil|shortening)\b|\bmargarine\b|\bmono-?\s*(and\s+)?diglycerides\b|\blecithin\b/i,
    confidence: 'possible',
    exclude: /\bsunflower\b/i,
  },
];

/** Ingredient marked organic / non-GMO, e.g. "organic corn syrup". */
const SAFE_ITEM = /\borganic\b|\bnon[- ]?gmo\b|\bnot\s+genetically\b|\bnon[- ]?bioengineered\b/i;

const BIOENGINEERED =
  /\b(contains\s+(a\s+)?bioengineered\s+food\s+ingredients?|bioengineered\s+food|derived\s+from\s+bioengineering|partially\s+produced\s+with\s+genetic\s+engineering|produced\s+with\s+genetic\s+engineering|genetically\s+(modified|engineered)\s+(ingredients?|organisms?)?)\b/i;
const NON_GMO =
  /\b(non[- ]?gmo(\s+project(\s+verified)?)?|no\s+gmos?|gmo[- ]free|free\s+(of|from)\s+gmos?|(not|no|without)\s+(genetically\s+(modified|engineered)|bioengineered)(\s+ingredients?)?|usda\s+organic|certified\s+organic|100%\s+organic)\b/i;

/** Open Food Facts label tags (e.g. "en:no-gmos", "en:organic"). */
const NON_GMO_TAG = /^[a-z]{2}:(no-gmos|non-gmo-project(-verified)?|organic|usda-organic|eu-organic|ab-agriculture-biologique)$/;
const GMO_TAG = /^[a-z]{2}:(contains-gmos|bioengineered|partially-produced-with-genetic-engineering)$/;

function quote(text: string, re: RegExp): string | undefined {
  const m = re.exec(text);
  return m ? m[0].replace(/\s+/g, ' ').trim() : undefined;
}

/** Each top-level ingredient plus its sub-ingredients, so "CHOCOLATE (SUGAR, SOY LECITHIN)" is checked inside too. */
function ingredientParts(list: string): string[] {
  const parts: string[] = [];
  const walk = (text: string) => {
    for (const item of splitIngredients(text)) {
      const open = item.search(/[([]/);
      if (open > 0) {
        const name = item.slice(0, open).trim();
        const inner = item.slice(open + 1).replace(/[)\]]\s*$/, '');
        // "Organic chocolate (sugar, cocoa)": the parent's "organic" covers its sub-ingredients.
        if (SAFE_ITEM.test(name)) continue;
        if (name) parts.push(name);
        walk(inner);
      } else {
        parts.push(item);
      }
    }
  };
  walk(list);
  return parts;
}

export function findGmoIngredients(ingredients: string): GmoMatch[] {
  const matches: GmoMatch[] = [];
  const seen = new Set<string>();
  for (const part of ingredientParts(ingredients)) {
    if (SAFE_ITEM.test(part)) continue;
    // One match per ingredient: the first (most specific, highest-confidence) rule wins.
    const rule = CROP_RULES.find(r => r.pattern.test(part) && !(r.exclude?.test(part) ?? false));
    if (!rule) continue;
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({ ingredient: part, crop: rule.crop, confidence: rule.confidence });
  }
  // Likely first, then possible; label order within each.
  return [...matches.filter(m => m.confidence === 'likely'), ...matches.filter(m => m.confidence === 'possible')];
}

const listCrops = (matches: GmoMatch[]) => Array.from(new Set(matches.map(m => m.crop))).join(', ');

export function checkGmo({
  ingredients,
  labelText,
  labelTags,
}: {
  ingredients?: string;
  /** Everything read from the package (OCR text), where "Bioengineered" / "Non-GMO" claims appear. */
  labelText?: string;
  /** Open Food Facts labels_tags, for barcode lookups. */
  labelTags?: string[];
}): GmoResult {
  const text = `${labelText ?? ''}\n${ingredients ?? ''}`;
  const matches = ingredients?.trim() ? findGmoIngredients(ingredients) : [];

  // Ignore "not genetically modified" etc. when looking for a bioengineered disclosure.
  const beWording = quote(text.replace(new RegExp(NON_GMO.source, 'gi'), ' '), BIOENGINEERED) ?? labelTags?.find(t => GMO_TAG.test(t));
  if (beWording) {
    return {
      status: 'bioengineered',
      headline: 'GMO: labeled bioengineered',
      detail:
        'The package says it contains bioengineered (genetically engineered) ingredients.' +
        (matches.length ? ` Likely from: ${listCrops(matches)}.` : ''),
      matches,
      evidence: beWording,
    };
  }

  const nonGmoWording = quote(text, NON_GMO) ?? labelTags?.find(t => NON_GMO_TAG.test(t));
  if (nonGmoWording) {
    return {
      status: 'non-gmo',
      headline: 'Non-GMO: labeled on the package',
      detail: /organic/i.test(nonGmoWording)
        ? 'Labeled organic, and organic foods can’t use genetically engineered ingredients.'
        : 'The package says it’s non-GMO.',
      matches: [],
      evidence: nonGmoWording,
    };
  }

  if (!ingredients?.trim()) {
    return {
      status: 'unknown',
      headline: 'GMO: no ingredient list to check',
      detail: 'Scan or type the ingredient list to check it for GMO ingredients.',
      matches: [],
    };
  }

  const likely = matches.filter(m => m.confidence === 'likely');
  if (likely.length) {
    return {
      status: 'likely',
      headline: 'Likely contains GMO ingredients',
      detail:
        `Made with ${listCrops(likely)}. In the US, most of ${likely.length > 1 ? 'these crops are' : 'this crop is'} ` +
        'genetically engineered, and this package doesn’t say it’s organic or non-GMO.',
      matches,
    };
  }
  if (matches.length) {
    return {
      status: 'possible',
      headline: 'May contain GMO ingredients',
      detail:
        `Some ingredients are often made from ${listCrops(matches)}, which are mostly genetically engineered in the US. ` +
        'The label doesn’t say which crop was used.',
      matches,
    };
  }
  return {
    status: 'none-found',
    headline: 'No common GMO ingredients found',
    detail: 'None of the ingredients come from crops that are commonly genetically engineered.',
    matches: [],
  };
}
