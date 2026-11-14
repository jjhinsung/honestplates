import { DAILY_VALUES } from '../config';
import type { Nutrients, SafetyFlag, SafetyGrade, SafetyRating } from '../types';

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
 * Tune penalties and the ingredient list to your product's needs.
 */

interface IngredientRule {
  pattern: RegExp;
  severity: SafetyFlag['severity'];
  penalty: number;
  message: string;
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
  },
  {
    pattern: /aspartame|sucralose|acesulfame|saccharin/i,
    severity: 'info',
    penalty: 2,
    message: 'Artificial sweetener',
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

export function rateLabel(
  perServing: Nutrients,
  ingredients?: string,
  allergens: string[] = [],
): SafetyRating {
  let score = 100;
  const flags: SafetyFlag[] = [];
  const positives: string[] = [];

  const penalize = (
    pct: number,
    name: string,
    tiers: [number, number, SafetyFlag['severity']][],
  ) => {
    for (const [threshold, penalty, severity] of tiers) {
      if (pct >= threshold) {
        score -= penalty;
        flags.push({
          severity,
          message: `${name} is ${Math.round(pct)}% of daily value per serving`,
        });
        return;
      }
    }
  };

  // --- Nutrient load (FDA: 5% DV is "low", 20% DV is "high") ---
  penalize(pctDV(perServing.sodium, DAILY_VALUES.sodium), 'Sodium', [
    [35, 22, 'warning'],
    [20, 14, 'caution'],
    [12, 5, 'info'],
  ]);
  penalize(pctDV(perServing.saturatedFat, DAILY_VALUES.saturatedFat), 'Saturated fat', [
    [35, 20, 'warning'],
    [20, 12, 'caution'],
    [12, 4, 'info'],
  ]);
  const sugarIsAdded = perServing.addedSugar !== undefined;
  penalize(
    pctDV(sugarIsAdded ? perServing.addedSugar : perServing.sugar, DAILY_VALUES.addedSugar),
    sugarIsAdded ? 'Added sugar' : 'Sugar',
    // Total sugar includes natural sugars (fruit, milk), so be gentler without the added-sugar line.
    sugarIsAdded
      ? [
          [40, 22, 'warning'],
          [20, 12, 'caution'],
          [10, 5, 'info'],
        ]
      : [
          [50, 14, 'caution'],
          [30, 6, 'info'],
        ],
  );
  if ((perServing.transFat ?? 0) > 0) {
    score -= 20;
    flags.push({
      severity: 'warning',
      message: `Contains ${perServing.transFat}g trans fat per serving`,
    });
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

  // --- Ingredients ---
  if (ingredients) {
    const seen = new Set<string>();
    for (const rule of INGREDIENT_RULES) {
      const matches = ingredients.match(
        new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g'),
      );
      if (!matches) continue;
      const names = Array.from(new Set(matches.map(m => m.trim())));
      const key = rule.message;
      if (seen.has(key)) continue;
      seen.add(key);
      // Color additives: penalize each distinct dye, capped.
      const count = rule.message.startsWith('Synthetic color') ? Math.min(names.length, 3) : 1;
      score -= rule.penalty * count;
      flags.push({
        severity: rule.severity,
        message:
          count > 1 || rule.message.startsWith('Synthetic color')
            ? `${rule.message}: ${names.join(', ')}`
            : rule.message,
      });
    }
    // A very long ingredient list is a rough proxy for ultra-processing.
    const count = ingredients.split(/,(?![^()]*\))/).length;
    if (count >= 20) {
      score -= 5;
      flags.push({ severity: 'info', message: `Long ingredient list (${count} items)` });
    } else if (count <= 5) {
      positives.push('Short, simple ingredient list');
    }
  }

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
