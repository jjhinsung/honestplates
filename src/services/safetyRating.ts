import { DAILY_VALUES } from '../config';
import type { Nutrients, SafetyFlag, SafetyGrade, SafetyRating } from '../types';
import type { GmoResult } from './gmoCheck';
import { splitIngredients } from './ingredientParser';

/**
 * Label safety / quality rating (0–100 → A–F).
 *
 * This is an informational heuristic, not medical or regulatory advice. It
 * combines two signals:
 *   1. Nutrient load per serving vs FDA Daily Values (sodium, saturated fat,
 *      added sugar, trans fat) with credit for fiber and protein.
 *   2. Ingredient flags for additives that regulators or major health bodies
 *      have restricted, banned elsewhere, or advise limiting.
 *
 * Strict by design: nutrient penalties are tripled, sugar and sodium are judged as ratios
 * (added sugar vs calories, sodium vs calories), fiber vs carbs and additives vs ingredients
 * are checked, and ingredient deductions are capped (see the constants below rateLabel).
 */

interface IngredientRule {
  pattern: RegExp;
  severity: SafetyFlag['severity'];
  penalty: number;
  message: string;
  /** Flat points for each distinct item found (artificial colors, sweeteners). */
  group?: boolean;
}

const INGREDIENT_RULES: IngredientRule[] = [
  {
    pattern: /partially\s*hydrogenated/i,
    severity: 'warning',
    penalty: 25,
    message: 'Partially hydrogenated oil (a source of artificial trans fat)',
  },
  {
    pattern: /potassium\s*bromate/i,
    severity: 'warning',
    penalty: 15,
    message: 'Potassium bromate (banned as a food additive in many countries)',
  },
  {
    pattern: /brominated\s*vegetable\s*oil|\bBVO\b/i,
    severity: 'warning',
    penalty: 12,
    message: 'Brominated vegetable oil (no longer authorized by the FDA)',
  },
  {
    pattern: /\bBHA\b|butylated\s*hydroxyanisole/i,
    severity: 'warning',
    penalty: 10,
    message: 'BHA preservative (listed as a possible carcinogen by NTP)',
  },
  {
    pattern: /\bBHT\b|butylated\s*hydroxytoluene/i,
    severity: 'caution',
    penalty: 4,
    message: 'BHT preservative',
  },
  {
    pattern: /sodium\s*nitr(ite|ate)|potassium\s*nitr(ite|ate)/i,
    severity: 'caution',
    penalty: 8,
    message: 'Nitrite/nitrate curing agent (common in processed meats)',
  },
  {
    pattern: /titanium\s*dioxide/i,
    severity: 'caution',
    penalty: 5,
    message: 'Titanium dioxide (banned as a food additive in the EU)',
  },
  {
    pattern: /propyl\s*paraben/i,
    severity: 'caution',
    penalty: 6,
    message: 'Propylparaben preservative',
  },
  {
    pattern: /high[\s-]*fructose\s*corn\s*syrup|\bHFCS\b/i,
    severity: 'caution',
    penalty: 6,
    message: 'High-fructose corn syrup',
  },
  {
    pattern: /\b(red|yellow|blue|green)\s*(no\.?\s*)?(3|40|5|6|1|2)\b(\s*lake)?/gi,
    severity: 'caution',
    penalty: 4,
    message: 'Synthetic color additive',
    group: true,
  },
  {
    pattern: /aspartame|sucralose|acesulfame|saccharin/i,
    severity: 'info',
    penalty: 2,
    message: 'Artificial sweetener',
    group: true,
  },
  {
    pattern: /carrageenan/i,
    severity: 'info',
    penalty: 2,
    message: 'Carrageenan',
  },
];

function gradeFor(score: number): SafetyGrade {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

const pctDV = (v: number | undefined, dv: number) => ((v ?? 0) / dv) * 100;

/** Extra signals that don't come from the nutrition panel or ingredient text. */
export interface RatingExtras {
  /** Open Food Facts additive codes (e.g. "en:e322"), barcode lookups only. */
  additiveTags?: string[];
  /** GMO check result; likely-GMO ingredients cost points. Leave out when the GMO check is turned off. */
  gmo?: GmoResult;
  /** True only when the scanned barcode matches an active FDA recall (not a loose name match). */
  fdaRecall?: boolean;
}

// ---- Tuning (all in one place) ----
const SEVERITY_ADD = { warning: 10, caution: 5, info: 0 } as const;
const PER_INGREDIENT_CAP = 30; // one ingredient can cost at most this much
const INGREDIENT_TOTAL_CAP = 40; // all ingredient-related deductions together
const OFF_ADDITIVE_POINTS = 8;
const OFF_ADDITIVE_CAP = 24;
const GMO_POINTS = 3;
const GMO_CAP = 21;
const FLAT_EACH = 10; // each artificial color / sweetener
const RATIO_FAIL = 10; // unhealthy additive ratio
const FIBER_RATIO_FAIL = 5;
const RECALL_POINTS = 40;
const SODIUM_RATIO_MIN_MG = 140; // FDA "low sodium" cutoff: below this the ratio isn't judged
const SUGAR_RATIO_MIN_G = 5;
const TOTAL_SUGAR_RATIO_MIN_G = 8;

const minus = (n: number) => `−${n}`;

export function rateLabel(
  perServing: Nutrients,
  ingredients?: string,
  allergens: string[] = [],
  extras: RatingExtras = {},
): SafetyRating {
  let score = 100;
  const flags: SafetyFlag[] = [];
  const positives: string[] = [];
  const cal = perServing.calories;

  const take = (points: number, severity: SafetyFlag['severity'], message: string) => {
    score -= points;
    flags.push({ severity, message: `${message} (${minus(points)})` });
  };

  // --- Saturated fat: share of the daily value, penalties tripled ---
  {
    const pct = pctDV(perServing.saturatedFat, DAILY_VALUES.saturatedFat);
    const tiers: [number, number, SafetyFlag['severity']][] = [
      [35, 60, 'warning'],
      [20, 36, 'warning'],
      [12, 12, 'caution'],
    ];
    const hit = tiers.find(([t]) => pct >= t);
    if (hit) take(hit[1], hit[2], `Saturated fat is ${Math.round(pct)}% of daily value per serving`);
  }
  if ((perServing.transFat ?? 0) > 0) {
    take(60, 'warning', `Contains ${perServing.transFat}g trans fat per serving`);
  }

  // --- Ratios ---
  // Added sugar as a share of calories (4 calories per gram).
  {
    const added = perServing.addedSugar;
    const grams = added ?? perServing.sugar;
    const minG = added !== undefined ? SUGAR_RATIO_MIN_G : TOTAL_SUGAR_RATIO_MIN_G;
    if (grams !== undefined && grams >= minG && cal > 0) {
      const share = ((grams * 4) / cal) * 100;
      // Total sugar includes natural sugars (fruit, milk), so use gentler cutoffs when added sugar isn't listed.
      const tiers: [number, number][] = added !== undefined ? [[35, 30], [20, 20], [10, 10]] : [[60, 30], [40, 20], [25, 10]];
      const hit = tiers.find(([t]) => share >= t);
      if (hit) take(hit[1], 'caution', `${added !== undefined ? 'Added sugar' : 'Sugar'} is ${Math.round(Math.min(share, 100))}% of calories`);
    }
  }
  // Sodium per calorie.
  if ((perServing.sodium ?? 0) >= SODIUM_RATIO_MIN_MG) {
    const ratio = perServing.sodium! / Math.max(cal, 10);
    const hit = ([[4, 30], [2, 20], [1, 10]] as [number, number][]).find(([t]) => ratio >= t);
    if (hit) take(hit[1], 'caution', `High sodium for its calories: ${ratio.toFixed(1)} mg per calorie`);
  }
  // Fiber to carbs: at least 1 g of fiber per 10 g of carbs is the usual whole-grain test.
  if (perServing.fiber !== undefined && perServing.carbs >= 15 && perServing.fiber / perServing.carbs < 0.1) {
    take(FIBER_RATIO_FAIL, 'info', `Low fiber for its carbs: ${perServing.fiber}g per ${perServing.carbs}g`);
  }

  // --- Credits ---
  if (pctDV(perServing.fiber, DAILY_VALUES.fiber) >= 10) {
    score += 5;
    positives.push(`Good source of fiber (${perServing.fiber}g)`);
  }
  if (perServing.protein >= 10) {
    score += 5;
    positives.push(`Good source of protein (${perServing.protein}g)`);
  }
  if ((perServing.sodium ?? Infinity) <= DAILY_VALUES.sodium * 0.05) {
    positives.push('Low sodium');
  }

  // --- Ingredients (all deductions here share one cap) ---
  const ingredientFlags: { points: number; severity: SafetyFlag['severity']; message: string }[] = [];
  let ingredientCount = 0;
  if (ingredients) {
    ingredientCount = splitIngredients(ingredients).length;
    const seen = new Set<string>();
    for (const rule of INGREDIENT_RULES) {
      const matches = ingredients.match(
        new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g'),
      );
      if (!matches) continue;
      const names = Array.from(new Set(matches.map(m => m.trim().toLowerCase())));
      if (seen.has(rule.message)) continue;
      seen.add(rule.message);
      let points: number;
      let message = rule.message;
      if (rule.group) {
        // Artificial colors and sweeteners: a flat amount for each one found.
        const n = Math.min(names.length, 3);
        points = FLAT_EACH * n;
        message = `${rule.message}: ${names.join(', ')}`;
      } else {
        points = Math.min(rule.penalty * 2 + SEVERITY_ADD[rule.severity], PER_INGREDIENT_CAP);
      }
      ingredientFlags.push({ points, severity: rule.group ? 'caution' : rule.severity, message });
    }

    // Additives Open Food Facts detected (barcode lookups).
    const additives = Array.from(new Set((extras.additiveTags ?? []).map(t => t.toLowerCase())));
    if (additives.length) {
      const points = Math.min(additives.length * OFF_ADDITIVE_POINTS, OFF_ADDITIVE_CAP);
      ingredientFlags.push({
        points,
        severity: 'caution',
        message: `${additives.length} food additive${additives.length === 1 ? '' : 's'} detected${
          additives.length * OFF_ADDITIVE_POINTS > OFF_ADDITIVE_CAP ? ' (capped)' : ''
        }`,
      });
      // Additives as a share of the ingredient list: a few in a short list is more processed than in a long one.
      if (ingredientCount > 0 && additives.length / ingredientCount >= 0.2) {
        take(RATIO_FAIL, 'caution', `Additives are ${Math.round((additives.length / ingredientCount) * 100)}% of the ingredient list`);
      }
    }

    // Ingredients likely made from genetically engineered crops.
    const likely = (extras.gmo?.matches ?? []).filter(m => m.confidence === 'likely');
    if (likely.length) {
      const points = Math.min(likely.length * GMO_POINTS, GMO_CAP);
      const crops = Array.from(new Set(likely.map(m => m.crop))).join(', ');
      ingredientFlags.push({
        points,
        severity: 'info',
        message: `${likely.length} ingredient${likely.length === 1 ? '' : 's'} likely from GMO crops (${crops})`,
      });
    }

    // A very long ingredient list is a rough proxy for ultra-processing.
    if (ingredientCount >= 20) {
      ingredientFlags.push({ points: 5, severity: 'info', message: `Long ingredient list (${ingredientCount} items)` });
    } else if (ingredientCount <= 5) {
      positives.push('Short, simple ingredient list');
    }

    const raw = ingredientFlags.reduce((n, f) => n + f.points, 0);
    for (const f of ingredientFlags) flags.push({ severity: f.severity, message: `${f.message} (${minus(f.points)})` });
    if (raw > INGREDIENT_TOTAL_CAP) {
      flags.push({
        severity: 'info',
        message: `Ingredient deductions are capped at ${minus(INGREDIENT_TOTAL_CAP)} (they added up to ${minus(raw)})`,
      });
    }
    score -= Math.min(raw, INGREDIENT_TOTAL_CAP);
  }

  // --- FDA recall: only when the barcode itself matches ---
  if (extras.fdaRecall) take(RECALL_POINTS, 'warning', 'This barcode matches an active FDA recall');

  if (allergens.length) {
    flags.push({ severity: 'info', message: `Allergens: ${allergens.join(', ')}` });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const order = { warning: 0, caution: 1, info: 2 };
  flags.sort((a, b) => order[a.severity] - order[b.severity]);
  return { score, grade: gradeFor(score), flags, positives };
}

export const GRADE_COLORS: Record<SafetyGrade, string> = {
  A: '#1E9E5A',
  B: '#7DBB2F',
  C: '#E3B505',
  D: '#EC7D10',
  F: '#D63B30',
};
