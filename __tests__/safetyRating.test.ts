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
    expect(text).toMatch(/Synthetic color additive: Red 40, Yellow 5, Blue 1/);
    expect(text).toMatch(/Sodium is 36%/);
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
});
