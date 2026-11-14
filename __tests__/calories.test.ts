import { parseNutritionLabel } from '../src/services/labelParser';
import { caloriesFromLayout, type OcrLine } from '../src/services/caloriesExtractor';

const cal = (text: string, layout?: OcrLine[]) => parseNutritionLabel(text, layout);

describe('calories from OCR text (no layout)', () => {
  it.each([
    [
      'big number returned as its own block after the nutrients',
      'Nutrition Facts\nServing size 2/3 cup (55g)\nAmount per serving\nCalories\n% Daily Value*\nTotal Fat 8g\n10%\nSodium 160mg\n7%\nTotal Carbohydrate 37g\nProtein 3g\n230',
      230,
    ],
    [
      'big number block before the "Calories" label',
      '230\nNutrition Facts\nAmount per serving\nCalories\nTotal Fat 8g\nProtein 3g\nTotal Carbohydrate 37g',
      230,
    ],
    ['thousands separator', 'Calories 1,250\nTotal Fat 60g\nTotal Carbohydrate 150g\nProtein 30g', 1250],
    ['big digits misread: O for 0', 'Calories 23O\nTotal Fat 8g\nTotal Carbohydrate 37g\nProtein 3g', 230],
    ['big digits misread: S for 5', 'Calories 1S0\nTotal Fat 8g\nTotal Carbohydrate 17g\nProtein 3g', 150],
    ['"Calories" misread as "Calorles"', 'Calorles 230\nTotal Fat 8g\nTotal Carbohydrate 37g\nProtein 3g', 230],
    ['"Calories" misread as "Calones"', 'Calones 230\nTotal Fat 8g\nTotal Carbohydrate 37g\nProtein 3g', 230],
    ['dual column: per serving first', 'Calories 140 280\nTotal Fat 7g 14g\nTotal Carbohydrate 18g 36g\nProtein 2g 4g', 140],
    ['EU label: kcal, not kJ', 'Energy 1046 kJ / 250 kcal\nFat 9g\nCarbohydrate 37g\nProtein 5g', 250],
    ['zero-calorie drink', 'Calories 0\nTotal Fat 0g\nSodium 40mg\nTotal Carbohydrate 0g\nProtein 0g', 0],
    ['ignores "Calories from Fat"', 'Calories from Fat 90 Calories 250 Total Fat 10g Protein 5g Total Carbohydrate 30g', 250],
  ])('%s', (_name, text, expected) => {
    const p = cal(text);
    expect(p.nutrients.calories).toBe(expected);
    expect(p.detectedFields).toContain('calories');
  });

  it('does not read the "2,000 calories a day" footnote as calories', () => {
    const p = cal(
      'Total Fat 8g\nTotal Carbohydrate 37g\nProtein 3g\n*The % Daily Value tells you how much a nutrient contributes. 2,000 calories a day is used for general nutrition advice.',
    );
    expect(p.nutrients.calories).not.toBe(2000);
    expect(p.nutrients.calories).not.toBe(2);
  });

  it('estimates from macros (and flags it) when calories are unreadable', () => {
    const p = cal('Total Fat 8g\nTotal Carbohydrate 37g\nProtein 3g');
    expect(p.nutrients.calories).toBe(232); // 3*4 + 37*4 + 8*9
    expect(p.caloriesCheck?.status).toBe('estimated');
    expect(p.detectedFields).not.toContain('calories'); // highlighted for review
  });

  it('flags a value that disagrees with the macros', () => {
    const p = cal('Calories 900\nTotal Fat 8g\nTotal Carbohydrate 37g\nProtein 3g');
    expect(p.nutrients.calories).toBe(900);
    expect(p.caloriesCheck).toMatchObject({ status: 'mismatch', macroEstimate: 232 });
  });

  it('confirms a value that agrees with the macros', () => {
    expect(cal('Calories 230\nTotal Fat 8g\nTotal Carbohydrate 37g\nProtein 3g').caloriesCheck?.status).toBe('ok');
  });
});

// Simulated ML Kit output with word bounding boxes (y grows downward).
const word = (text: string, left: number, top: number, height: number, width = text.length * height * 0.55) => ({
  text,
  frame: { left, top, width, height },
});
const line = (...words: ReturnType<typeof word>[]): OcrLine => ({ text: words.map(w => w.text).join(' '), words });

describe('calories from layout (word positions)', () => {
  // The big "230" sits to the right of "Calories" but ML Kit lists it last.
  const layout: OcrLine[] = [
    line(word('Nutrition', 10, 0, 30), word('Facts', 160, 0, 30)),
    line(word('Amount', 10, 80, 12), word('per', 60, 80, 12), word('serving', 85, 80, 12)),
    line(word('Calories', 10, 96, 26)),
    line(word('%', 200, 135, 10), word('Daily', 210, 135, 10), word('Value*', 240, 135, 10)),
    line(word('Total', 10, 150, 12), word('Fat', 45, 150, 12), word('8g', 70, 150, 12), word('10%', 260, 150, 12)),
    line(word('Protein', 10, 170, 12), word('3g', 60, 170, 12)),
    line(word('230', 200, 82, 44)),
  ];

  it('picks the tall number on the same row as "Calories", wherever it is in reading order', () => {
    expect(caloriesFromLayout(layout)).toBe(230);
  });

  it('beats a misleading reading order in the full parser', () => {
    const text = layout.map(l => l.text).join('\n');
    const p = cal(text, layout);
    expect(p.nutrients.calories).toBe(230);
  });

  it('handles misread digits in the big number', () => {
    const l2 = [...layout.slice(0, -1), line(word('23O', 200, 82, 44))];
    expect(caloriesFromLayout(l2)).toBe(230);
  });

  it('chooses the nearest column on dual-column labels', () => {
    const dual: OcrLine[] = [
      line(word('Calories', 10, 100, 26), word('140', 150, 92, 40), word('280', 260, 92, 40)),
    ];
    expect(caloriesFromLayout(dual)).toBe(140);
  });

  it('ignores numbers on other rows', () => {
    const other: OcrLine[] = [line(word('Calories', 10, 100, 26)), line(word('160', 200, 200, 12))];
    expect(caloriesFromLayout(other)).toBeUndefined();
  });
});

describe('plausibility and misread macros (Goldfish 28 g pack: 130 kcal, fat 4.5 g, carbs 19 g, protein 3 g)', () => {
  const base = `Nutrition Facts
20 Servings Per Container
Serving Size 1 Pack (28g)
Amount per serving
Calories 130
% Daily Value*
Total Fat 4.5g 6%
Saturated Fat 1g 5%
Total Carbohydrate 19g 7%
Protein 3g
910001029461 4845-3-3SOE3`;

  it('reads the clean label', () => {
    const p = parseNutritionLabel(base);
    expect(p.nutrients).toMatchObject({ calories: 130, fat: 4.5, carbs: 19, protein: 3 });
    expect(p.caloriesCheck?.status).toBe('ok');
  });

  it('rejects a calorie value impossible for the serving size (1570 kcal in 28 g)', () => {
    const p = parseNutritionLabel(base.replace('Calories 130', 'Calories\n1570\n130'));
    expect(p.nutrients.calories).toBe(130);
    expect(p.caloriesCheck).toMatchObject({ rejected: [1570], servingGrams: 28, maxPlausible: 262 });
  });

  it('picks the most plausible value, not the first, when a macro was misread', () => {
    // "Total Fat" lost → fat missing → macro estimate ~88; candidates 900 and 130.
    const p = parseNutritionLabel(base.replace('Total Fat 4.5g 6%', '').replace('Calories 130', 'Calories 900 130').replace('(28g)', ''));
    expect(p.nutrients.calories).toBe(130);
    expect(p.caloriesCheck?.status).toBe('mismatch');
  });

  it('tolerates misread macro labels', () => {
    const p = parseNutritionLabel(base.replace('Total Fat', 'Tota! Fat').replace('Protein', 'Prote1n').replace('Total Carbohydrate', 'T0tal Carbohydrate'));
    expect(p.nutrients).toMatchObject({ fat: 4.5, carbs: 19, protein: 3 });
  });

  it('falls back to plain "Fat" but never to Saturated/Trans fat', () => {
    expect(parseNutritionLabel('Energy 250 kcal\nFat 9g\nof which saturates 2g\nCarbohydrate 37g\nProtein 5g').nutrients.fat).toBe(9);
    const noTotal = parseNutritionLabel('Calories 130\nSaturated Fat 1g\nTrans Fat 0g\nCarbohydrate 19g\nProtein 3g');
    expect(noTotal.detectedFields).not.toContain('fat');
  });

  it('records diagnostics for the troubleshooting panel', () => {
    const p = parseNutritionLabel(base);
    expect(p.caloriesCheck?.candidates).toContain(130);
    expect(p.caloriesCheck?.found).toBe(true);
  });
});
