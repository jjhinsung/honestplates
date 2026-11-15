import { detectAllergens } from '../src/services/ingredientParser';
import { EMPTY_PROFILE, personalVerdict } from '../src/services/personalVerdict';
import type { HealthProfile, Nutrients } from '../src/types';

const none: Nutrients = { calories: 0, protein: 0, carbs: 0, fat: 0 };
const plate: Nutrients = { calories: 780, protein: 42, carbs: 70, fat: 34, sodium: 1350, sugar: 9 };

const plateVerdict = (p: Partial<HealthProfile>, names: string, today: Nutrients = none, item = plate) =>
  personalVerdict({
    profile: { ...EMPTY_PROFILE, ...p },
    item,
    ingredients: names,
    allergens: detectAllergens(names),
    today,
    context: 'plate',
  })!;

describe('personal verdict on a plate (food names only)', () => {
  it('flags an allergen visible in a food name', () => {
    const v = plateVerdict({ allergies: ['Shellfish'] }, 'Shrimp tacos, Rice');
    expect(v.level).toBe('avoid');
    expect(v.reasons[0].message).toMatch(/shellfish allergy/);
  });

  it('never gives an all-clear for allergies from a photo', () => {
    const v = plateVerdict({ allergies: ['Milk'] }, 'Grilled chicken, French fries');
    expect(v.level).toBe('caution');
    expect(v.reasons[0].message).toMatch(/can't show hidden ingredients like butter, sauces or breading/);
  });

  it('checks diets from food names, and says what it cannot see', () => {
    expect(plateVerdict({ diets: ['vegetarian'] }, 'Chicken Caesar salad').reasons[0].message).toMatch(
      /Not vegetarian: chicken/,
    );
    const ok = plateVerdict({ diets: ['vegan'] }, 'Rice, Black beans, Grilled vegetables');
    expect(ok.level).toBe('ok');
    expect(ok.reasons[0].message).toMatch(/Cooking fats and sauces can't be seen/);
  });

  it('uses the plate total and today so far for daily limits', () => {
    const v = plateVerdict({ limits: { sodium: 1500 } }, 'Burger, Fries', { ...none, sodium: 600 });
    expect(v.level).toBe('caution');
    expect(v.reasons[0].message).toBe('Puts you over your 1,500 mg sodium limit: 600 mg today + 1,350 mg from this.');
  });

  it('keeps the label wording unchanged when context is not given', () => {
    const v = personalVerdict({
      profile: { ...EMPTY_PROFILE, allergies: ['Milk'] },
      item: none,
      ingredients: 'Potatoes, vegetable oil, salt',
      allergens: [],
      today: none,
    })!;
    expect(v.level).toBe('ok');
    expect(v.reasons[0].message).toMatch(/may contain/);
  });
});
