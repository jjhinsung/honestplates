import { isUsableParse, parseNutritionLabel } from '../src/services/labelParser';

// Typical ML Kit output for a US Nutrition Facts panel, including OCR noise.
const CLEAN_LABEL = `Nutrition Facts
8 servings per container
Serving size 2/3 cup (55g)
Amount per serving
Calories
230
% Daily Value*
Total Fat 8g
10%
Saturated Fat 1g
5%
Trans Fat 0g
Cholesterol 0mg
0%
Sodium 160mg
7%
Total Carbohydrate 37g
13%
Dietary Fiber 4g
14%
Total Sugars 12g
Includes 10g Added Sugars
20%
Protein 3g
INGREDIENTS: WHOLE GRAIN OATS, SUGAR, CANOLA OIL, RICE FLOUR, HONEY, SALT, SOY LECITHIN, RED 40, YELLOW 5.
CONTAINS: SOY.`;

describe('parseNutritionLabel', () => {
  const p = parseNutritionLabel(CLEAN_LABEL);

  it('reads core nutrients and skips %DV numbers', () => {
    expect(p.nutrients).toMatchObject({
      calories: 230,
      fat: 8,
      saturatedFat: 1,
      transFat: 0,
      cholesterol: 0,
      sodium: 160,
      carbs: 37,
      fiber: 4,
      sugar: 12,
      addedSugar: 10,
      protein: 3,
    });
  });

  it('reads serving info, ingredients and allergens', () => {
    expect(p.servingSize).toBe('2/3 cup (55g)');
    expect(p.servingsPerContainer).toBe(8);
    expect(p.ingredients).toMatch(/^WHOLE GRAIN OATS/);
    expect(p.ingredients).not.toMatch(/CONTAINS/);
    expect(p.allergens).toContain('Soy');
    expect(isUsableParse(p)).toBe(true);
  });

  it('handles common OCR misreads', () => {
    const noisy = `Calories 150 | Total Fat Og 0% Sodium 1O5mg 4% Total Carb. 22g Protein l2g`;
    const q = parseNutritionLabel(noisy);
    expect(q.nutrients.fat).toBe(0);
    expect(q.nutrients.sodium).toBe(105);
    expect(q.nutrients.carbs).toBe(22);
    expect(q.nutrients.protein).toBe(12);
    expect(q.nutrients.calories).toBe(150);
  });

  it('does not take "Calories from Fat" as calories', () => {
    const q = parseNutritionLabel('Calories from Fat 90 Calories 250 Total Fat 10g Protein 5g Total Carbohydrate 30g');
    expect(q.nutrients.calories).toBe(250);
  });

  it('flags an unreadable scan as unusable', () => {
    expect(isUsableParse(parseNutritionLabel('blurry nonsense'))).toBe(false);
  });
});
