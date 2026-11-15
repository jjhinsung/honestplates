import { findCards } from './ingredientMatcher';
import type { HealthProfile, Nutrients, PersonalReason, PersonalVerdict } from '../types';

/**
 * "Is this right for ME?" — checks a food against the user's own profile:
 * allergies, diet (vegan / vegetarian / gluten-free), daily limits they chose
 * to watch, and ingredients they want to avoid.
 *
 * The daily-limit checks look at what's already been logged today, so the same
 * snack can be fine in the morning and "puts you over" in the evening.
 *
 * Informational only. Ingredient-based checks can only see what's in the scanned
 * text, so allergy results always tell the user to confirm on the package.
 */

/** Suggested starting points shown in Settings (American Heart Association guidance). */
export const SUGGESTED_LIMITS = {
  sodium: 1500, // mg/day — AHA "ideal" limit for most adults
  addedSugar: 25, // g/day — AHA limit for women (36 g for men)
  saturatedFat: 13, // g/day — ~6% of calories on a 2,000 kcal diet
};

export const EMPTY_PROFILE: HealthProfile = { allergies: [], diets: [], limits: {}, avoidIngredients: [] };

export function hasProfile(p: HealthProfile): boolean {
  return (
    p.allergies.length > 0 ||
    p.diets.length > 0 ||
    Object.values(p.limits).some(v => v !== undefined) ||
    p.avoidIngredients.length > 0
  );
}

// Ingredients that rule out a vegetarian diet (vegan also excludes dairy, eggs, honey…).
const MEAT_WORDS =
  /\b(beef|pork|bacon|ham|chicken|turkey|lamb|veal|duck|gelatine?|lard|tallow|suet|anchov(?:y|ies)|fish\s*(?:sauce|oil)|meat|broth|stock|rennet|carmine|cochineal)\b/gi;
// "vegetable broth", "mushroom stock", "plant-based meat" are fine.
const PLANT_BEFORE = /(vegetable|veggie|mushroom|plant[- ]based|vegan|kombu|seaweed|meatless)\s*$/i;

/** Distinct meat/fish words in the ingredient list, skipping plant-based uses. */
function findMeat(ingredients: string): string[] {
  const found = new Set<string>();
  MEAT_WORDS.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MEAT_WORDS.exec(ingredients))) {
    const before = ingredients.slice(Math.max(0, m.index - 16), m.index);
    if (!PLANT_BEFORE.test(before)) found.add(m[0].toLowerCase());
  }
  return Array.from(found);
}
// Gluten sources beyond the "Wheat" allergen.
const GLUTEN_WORDS = /\b(barley|rye|malt|triticale|brewer'?s\s*yeast|seitan)\b/i;
const NON_VEGAN_ALLERGENS = ['Milk', 'Eggs', 'Fish', 'Shellfish'];

const fmt = (n: number) => (n >= 100 ? Math.round(n).toLocaleString() : String(Math.round(n * 10) / 10));

export function personalVerdict(opts: {
  profile: HealthProfile;
  /** Nutrients for the amount the user is about to log (already × servings). */
  item: Nutrients;
  ingredients?: string;
  /** Allergens already detected on this label (from detectAllergens). */
  allergens: string[];
  /** Totals logged so far today (not including this item). */
  today: Nutrients;
  /**
   * 'label' (default): `ingredients` is a printed ingredient list.
   * 'plate': `ingredients` is just the food names the AI saw on a plate, so hidden
   * ingredients (butter, sauces, breading) can't be checked and the wording says so.
   */
  context?: 'label' | 'plate';
}): PersonalVerdict | undefined {
  const { profile, item, allergens, today } = opts;
  const isPlate = opts.context === 'plate';
  if (!hasProfile(profile)) return undefined;

  const ingredients = opts.ingredients?.trim() ?? '';
  const haveIngredients = ingredients.length > 3;
  const reasons: PersonalReason[] = [];

  // 1. Allergies
  const hits = profile.allergies.filter(a => allergens.includes(a));
  for (const a of hits) {
    reasons.push({ severity: 'avoid', message: `Contains ${a.toLowerCase()} — you marked a ${a.toLowerCase()} allergy.` });
  }
  if (profile.allergies.length && !hits.length && isPlate) {
    // A photo shows dishes, not recipes — never give an all-clear for allergies.
    reasons.push({
      severity: 'caution',
      message: `No ${profile.allergies.join(', ').toLowerCase()} in the foods detected, but a photo can't show hidden ingredients like butter, sauces or breading. Ask if you're unsure.`,
    });
  } else if (profile.allergies.length && !hits.length) {
    reasons.push(
      haveIngredients
        ? {
            severity: 'info',
            message: `No ${profile.allergies.join(', ').toLowerCase()} found in the scanned ingredients. Check "may contain" warnings on the package.`,
          }
        : { severity: 'caution', message: "Couldn't check your allergies: no ingredient list was found. Scan or check the package." },
    );
  }

  // 2. Diets
  if (haveIngredients) {
    const cards = findCards(ingredients);
    if (profile.diets.includes('vegan')) {
      const found = [
        ...cards.filter(c => c.origin === 'animal').map(c => c.name),
        ...allergens.filter(a => NON_VEGAN_ALLERGENS.includes(a)).map(a => a.toLowerCase()),
        ...findMeat(ingredients),
      ];
      const unique = Array.from(new Set(found));
      if (unique.length) reasons.push({ severity: 'avoid', message: `Not vegan: ${unique.join(', ')}.` });
    } else if (profile.diets.includes('vegetarian')) {
      const fish = allergens.filter(a => a === 'Fish' || a === 'Shellfish').map(f => f.toLowerCase());
      const found = Array.from(new Set([...findMeat(ingredients), ...fish]));
      if (found.length) reasons.push({ severity: 'avoid', message: `Not vegetarian: ${found.join(', ')}.` });
    }
    if (profile.diets.includes('gluten-free')) {
      const gluten = allergens.includes('Wheat') ? 'wheat' : GLUTEN_WORDS.exec(ingredients)?.[0]?.toLowerCase();
      if (gluten) reasons.push({ severity: 'avoid', message: `Not gluten-free: contains ${gluten}.` });
    }
    if (isPlate && profile.diets.length && !reasons.some(r => r.message.startsWith('Not '))) {
      reasons.push({
        severity: 'info',
        message: `Nothing in the foods detected rules out your ${profile.diets.join(' / ')} diet. Cooking fats and sauces can't be seen in a photo.`,
      });
    }
  } else if (profile.diets.length) {
    reasons.push({ severity: 'caution', message: `Couldn't check your ${profile.diets.join(' / ')} diet: no ingredient list.` });
  }

  // 3. Ingredients to avoid
  if (haveIngredients) {
    const lower = ingredients.toLowerCase();
    const avoided = profile.avoidIngredients.filter(w => w.trim() && lower.includes(w.trim().toLowerCase()));
    if (avoided.length) reasons.push({ severity: 'avoid', message: `Contains ${avoided.join(', ')}, which you want to avoid.` });
  }

  // 4. Daily limits, using what's already logged today
  const limitChecks: { key: 'sodium' | 'addedSugar' | 'saturatedFat'; name: string; unit: string }[] = [
    { key: 'sodium', name: 'sodium', unit: 'mg' },
    { key: 'addedSugar', name: 'added sugar', unit: 'g' },
    { key: 'saturatedFat', name: 'saturated fat', unit: 'g' },
  ];
  for (const { key, name, unit } of limitChecks) {
    const limit = profile.limits[key];
    if (!limit) continue;
    // Added sugar isn't on every label; fall back to total sugar and say so.
    const usesTotalSugar = key === 'addedSugar' && item.addedSugar === undefined && item.sugar !== undefined;
    const amount = usesTotalSugar ? item.sugar : item[key];
    if (amount === undefined) continue;
    const already = (usesTotalSugar ? today.addedSugar ?? today.sugar : today[key]) ?? 0;
    const after = already + amount;
    const label = usesTotalSugar ? 'sugar (added sugar not listed)' : name;
    const share = Math.round((amount / limit) * 100);

    if (after > limit) {
      reasons.push({
        severity: 'caution',
        message:
          already > 0
            ? `Puts you over your ${fmt(limit)} ${unit} ${name} limit: ${fmt(already)} ${unit} today + ${fmt(amount)} ${unit} from this.`
            : `${fmt(amount)} ${unit} of ${label} — more than your whole daily limit of ${fmt(limit)} ${unit}.`,
      });
    } else if (share >= 33) {
      reasons.push({
        severity: 'caution',
        message: `Uses ${share}% of your daily ${label} limit (${fmt(limit - after)} ${unit} left after this).`,
      });
    } else if (amount > 0) {
      reasons.push({ severity: 'info', message: `${share}% of your daily ${label} limit.` });
    }
  }

  const level = reasons.some(r => r.severity === 'avoid')
    ? 'avoid'
    : reasons.some(r => r.severity === 'caution')
      ? 'caution'
      : 'ok';
  const headline =
    level === 'avoid' ? 'Not a match for you' : level === 'caution' ? 'OK, with a heads-up' : 'Looks good for you';
  const order = { avoid: 0, caution: 1, info: 2 };
  reasons.sort((a, b) => order[a.severity] - order[b.severity]);
  return { level, headline, reasons };
}
