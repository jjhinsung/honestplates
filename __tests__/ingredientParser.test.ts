import { detectAllergens, extractIngredients, splitIngredients } from '../src/services/ingredientParser';
import { parseNutritionLabel } from '../src/services/labelParser';

describe('extractIngredients', () => {
  it('keeps going past "contains 2% or less of"', () => {
    const r = extractIngredients(
      'INGREDIENTS: ENRICHED FLOUR, SUGAR, CONTAINS 2% OR LESS OF: SALT, YEAST, SOY LECITHIN.\nCONTAINS: WHEAT, SOY.',
    );
    expect(r.ingredients).toBe('ENRICHED FLOUR, SUGAR, CONTAINS 2% OR LESS OF: SALT, YEAST, SOY LECITHIN');
    expect(r.containsStatement).toBe('WHEAT, SOY');
  });

  it('skips marketing copy and uses the real heading', () => {
    const r = extractIngredients('Made with simple ingredients you can trust\nIngredients: Oats, Honey, Salt.');
    expect(r.ingredients).toBe('Oats, Honey, Salt');
  });

  it('tolerates OCR misreads in the heading', () => {
    expect(extractIngredients('lNGREDlENTS: RICE, SALT').ingredients).toBe('RICE, SALT');
    expect(extractIngredients('INGREDIENTS; RICE, SALT').ingredients).toBe('RICE, SALT');
  });

  it('drops Nutrition Facts rows interleaved by OCR', () => {
    const r = extractIngredients('INGREDIENTS: WHOLE GRAIN OATS,\nTotal Fat 8g\n10%\nSUGAR, CANOLA OIL,\nProtein 3g\nSALT.');
    expect(r.ingredients).toBe('WHOLE GRAIN OATS, SUGAR, CANOLA OIL, SALT');
  });

  it('stops at the next label section', () => {
    const r = extractIngredients('INGREDIENTS: WATER, SALT.\nNutrition Facts\nServing size 1 cup');
    expect(r.ingredients).toBe('WATER, SALT');
    expect(extractIngredients('INGREDIENTS: WATER, SALT. Distributed by Acme Co.').ingredients).toBe('WATER, SALT');
  });

  it('rejoins words hyphenated across lines, but keeps real hyphens', () => {
    const r = extractIngredients('INGREDIENTS: PARTIALLY HYDRO-\nGENATED SOYBEAN OIL, HIGH-\nFRUCTOSE CORN SYRUP');
    expect(r.ingredients).toBe('PARTIALLY HYDROGENATED SOYBEAN OIL, HIGH-FRUCTOSE CORN SYRUP');
  });

  it('fixes digits read in place of letters but keeps vitamin names', () => {
    const r = extractIngredients('INGREDIENTS: S0Y LECITHIN, V1TAMIN B12, VITAMIN D3');
    expect(r.ingredients).toBe('SOY LECITHIN, VITAMIN B12, VITAMIN D3');
  });

  it('closes a parenthesis cut off at the edge of the photo', () => {
    expect(extractIngredients('INGREDIENTS: CHOCOLATE (SUGAR, COCOA BUTTER').ingredients).toBe(
      'CHOCOLATE (SUGAR, COCOA BUTTER)',
    );
  });

  it('returns nothing when there is no ingredient list', () => {
    expect(extractIngredients('Nutrition Facts Calories 100').ingredients).toBeUndefined();
  });
});

describe('splitIngredients', () => {
  it('keeps sub-ingredients with their parent', () => {
    expect(splitIngredients('CHOCOLATE (SUGAR, COCOA BUTTER), SALT, AND/OR CANOLA OIL')).toEqual([
      'CHOCOLATE (SUGAR, COCOA BUTTER)',
      'SALT',
      'CANOLA OIL',
    ]);
  });

  it('drops the "contains 2% or less of" lead-in', () => {
    expect(splitIngredients('FLOUR, CONTAINS 2% OR LESS OF: SALT, YEAST')).toEqual(['FLOUR', 'SALT', 'YEAST']);
  });
});

describe('detectAllergens', () => {
  it('ignores plant milks and butters', () => {
    expect(detectAllergens('COCONUT MILK, COCOA BUTTER, CREAM OF TARTAR')).toEqual([]);
    expect(detectAllergens('NON-DAIRY CREAMER')).not.toContain('Milk');
  });

  it('finds dairy, egg, wheat and nut ingredients', () => {
    const a = detectAllergens('MILKFAT, BUTTERMILK, EGG WHITES, SEMOLINA, ALMONDS, TAHINI');
    expect(a).toEqual(expect.arrayContaining(['Milk', 'Eggs', 'Wheat', 'Tree nuts', 'Sesame']));
  });

  it('does not flag buckwheat or peanut butter as wheat or milk', () => {
    const a = detectAllergens('BUCKWHEAT FLOUR, PEANUT BUTTER');
    expect(a).not.toContain('Wheat');
    expect(a).not.toContain('Milk');
    expect(a).toContain('Peanuts');
  });

  it('uses the "Contains:" statement too', () => {
    expect(detectAllergens('SUGAR', 'MILK, SOY')).toEqual(['Milk', 'Soy']);
  });
});

describe('parseNutritionLabel ingredients', () => {
  it('returns the full list and allergens for a typical label', () => {
    const p = parseNutritionLabel(
      'Nutrition Facts\nCalories 200\nTotal Fat 9g\nTotal Carbohydrate 26g\nProtein 4g\n' +
        'INGREDIENTS: WHEAT FLOUR, SUGAR, PALM OIL, CONTAINS 2% OR LESS OF: COCOA, SALT, SOY LECITHIN.\n' +
        'CONTAINS: WHEAT, SOY.',
    );
    expect(p.ingredients).toBe('WHEAT FLOUR, SUGAR, PALM OIL, CONTAINS 2% OR LESS OF: COCOA, SALT, SOY LECITHIN');
    expect(p.containsStatement).toBe('WHEAT, SOY');
    expect(p.allergens).toEqual(['Wheat', 'Soy']);
  });
});
