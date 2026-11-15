import { checkGmo } from '../src/services/gmoCheck';
import { rateLabel } from '../src/services/safetyRating';

describe('rateLabel', () => {
  it('rates a simple, high-fiber, low-sodium food highly', () => {
    const r = rateLabel(
      { calories: 150, protein: 5, carbs: 27, fat: 3, fiber: 4, sugar: 1, addedSugar: 0, sodium: 0, saturatedFat: 0.5 },
      'Whole grain rolled oats',
    );
    expect(r.grade).toBe('A');
    expect(r.positives).toEqual(expect.arrayContaining(['Low sodium', 'Short, simple ingredient list']));
  });

  it('penalizes salty, sugary, dyed, trans-fat foods', () => {
    const r = rateLabel(
      { calories: 380, protein: 2, carbs: 50, fat: 18, sodium: 820, saturatedFat: 8, transFat: 1.5, addedSugar: 24 },
      'Sugar, partially hydrogenated soybean oil, high fructose corn syrup, Red 40, Yellow 5, Blue 1, BHA',
    );
    expect(r.grade).toBe('F');
    const text = r.flags.map(f => f.message).join(' | ');
    expect(text).toMatch(/Partially hydrogenated/);
    expect(text).toMatch(/Synthetic color additive: red 40, yellow 5, blue 1 \(−30\)/);
    expect(text).toMatch(/High sodium for its calories/);
    expect(text).toMatch(/Ingredient deductions are capped at −40/);
    expect(r.flags[0].severity).toBe('warning'); // most severe first
  });

  it('is gentler on total sugar when added sugar is unknown (e.g. fruit, milk)', () => {
    const withTotalOnly = rateLabel({ calories: 120, protein: 8, carbs: 12, fat: 5, sugar: 12 });
    expect(['A', 'B']).toContain(withTotalOnly.grade);
  });

  it('keeps the score within 0–100', () => {
    const r = rateLabel(
      { calories: 1000, protein: 0, carbs: 100, fat: 60, sodium: 5000, saturatedFat: 30, transFat: 5, addedSugar: 80 },
      'partially hydrogenated oil, potassium bromate, BVO, BHA, BHT, sodium nitrite, titanium dioxide, red 3, red 40, yellow 6',
    );
    expect(r.score).toBe(0);
  });

  it('explains every deduction with its points', () => {
    const r = rateLabel(
      { calories: 150, protein: 3, carbs: 17, fat: 8, fiber: 0, sodium: 200, saturatedFat: 2 },
      'Enriched flour, soy lecithin, baking soda, sugar, high fructose corn syrup',
      [],
      { additiveTags: ['en:e322', 'en:e500', 'en:e341'] },
    );
    const text = r.flags.map(f => f.message).join(' | ');
    expect(text).toMatch(/3 food additives detected \(−24\)/);
    expect(text).toMatch(/\(−10\)/); // sodium ratio
    expect(text).toMatch(/Low fiber for its carbs: 0g per 17g \(−5\)/);
  });

  it('caps one ingredient at -30 and all ingredient deductions at -40', () => {
    const r = rateLabel({ calories: 100, protein: 0, carbs: 5, fat: 0 }, 'partially hydrogenated oil, potassium bromate');
    // each rule would exceed 30 on its own; together they stop at 40
    expect(r.score).toBe(60);
  });

  it('takes 40 points only for an exact FDA recall', () => {
    const base = { calories: 100, protein: 0, carbs: 5, fat: 0 };
    expect(rateLabel(base, 'Water').score).toBe(100);
    expect(rateLabel(base, 'Water', [], { fdaRecall: true }).score).toBe(60);
  });

  it('subtracts 3 per likely-GMO ingredient', () => {
    const gmo: any = { status: 'likely', headline: '', detail: '', matches: [
      { ingredient: 'corn syrup', crop: 'corn', confidence: 'likely' },
      { ingredient: 'soy lecithin', crop: 'soy', confidence: 'likely' },
      { ingredient: 'sugar', crop: 'sugar beets', confidence: 'possible' },
    ] };
    const r = rateLabel({ calories: 100, protein: 0, carbs: 5, fat: 0 }, 'Corn syrup, soy lecithin, sugar', [], { gmo });
    expect(r.score).toBe(94);
  });
});

describe('example foods (approximate labels)', () => {
  const grade = (n: any, ing: string, extras = {}) => rateLabel(n, ing, [], extras);

  it('plain popcorn and sparkling water stay at the top', () => {
    expect(grade({ calories: 150, protein: 2, carbs: 14, fat: 10, fiber: 3, sodium: 75, saturatedFat: 1.5 }, 'Popcorn, sunflower oil, salt').grade).toBe('A');
    expect(grade({ calories: 0, protein: 0, carbs: 0, fat: 0 }, 'Carbonated water, natural flavor').grade).toBe('A');
  });

  it('a sugary marshmallow bar fails', () => {
    const r = grade(
      { calories: 90, protein: 1, carbs: 17, fat: 1.5, fiber: 0, sugar: 8, addedSugar: 7, sodium: 80, saturatedFat: 0.5 },
      'Marshmallow (corn syrup, sugar, dextrose, gelatin), rice, high fructose corn syrup, soybean oil, soy lecithin, salt',
      { additiveTags: ['en:e322', 'en:e1422'] },
    );
    expect(['D', 'F']).toContain(r.grade);
  });

  it('chips with a short list land in the B range', () => {
    const ing = 'Potatoes, vegetable oil (sunflower, corn, and/or canola oil), salt';
    const r = grade(
      { calories: 160, protein: 2, carbs: 15, fat: 10, fiber: 1, sodium: 170, saturatedFat: 1.5 },
      ing,
      { gmo: checkGmo({ ingredients: ing }) },
    );
    expect(r.score).toBe(79); // sodium ratio -10, low fiber -5, corn and canola -6
    expect(r.grade).toBe('B');
  });
});
