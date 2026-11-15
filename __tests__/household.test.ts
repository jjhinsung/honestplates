import { detectAllergens } from '../src/services/ingredientParser';
import { householdVerdicts } from '../src/services/personalVerdict';
import type { HouseholdMember } from '../src/types';

const member = (name: string, m: Partial<HouseholdMember> = {}): HouseholdMember => ({
  id: name,
  name,
  allergies: [],
  diets: [],
  avoidIngredients: [],
  ...m,
});
const GOLDFISH =
  'Enriched wheat flour (flour, niacin, reduced iron), cheddar cheese (cultured milk, salt, enzymes, annatto), vegetable oils, salt, yeast.';
const rows = (household: HouseholdMember[], ingredients?: string, context?: 'label' | 'plate') =>
  householdVerdicts({ household, ingredients, allergens: detectAllergens(ingredients), context });

describe('household verdicts', () => {
  it('checks each person separately and names them', () => {
    const r = rows([member('Leo', { allergies: ['Milk'] }), member('Mia', { allergies: ['Peanuts'] })], GOLDFISH);
    const leo = r.find(x => x.member.name === 'Leo')!.verdict;
    const mia = r.find(x => x.member.name === 'Mia')!.verdict;
    expect(leo.level).toBe('avoid');
    expect(leo.headline).toBe('Not a match for Leo');
    expect(leo.reasons[0].message).toBe('Contains milk — Leo has a milk allergy.');
    expect(mia.level).toBe('ok');
    expect(mia.headline).toBe('Looks good for Mia');
  });

  it('skips people with nothing set', () => {
    expect(rows([member('Sam')], GOLDFISH)).toEqual([]);
  });

  it('uses their name for diets, avoided ingredients and missing ingredient lists', () => {
    expect(rows([member('Ana', { diets: ['vegan'] })], GOLDFISH)[0].verdict.reasons[0].message).toMatch(/Not vegan/);
    expect(rows([member('Ana', { avoidIngredients: ['yeast'] })], GOLDFISH)[0].verdict.reasons[0].message).toBe(
      'Contains yeast, which Ana avoids.',
    );
    expect(rows([member('Leo', { allergies: ['Milk'] })], undefined)[0].verdict.reasons[0].message).toBe(
      "Couldn't check Leo's allergies: no ingredient list was found. Scan or check the package.",
    );
  });

  it('never gives an allergy all-clear from a plate photo', () => {
    const r = rows([member('Leo', { allergies: ['Milk'] })], 'Grilled chicken, Rice', 'plate');
    expect(r[0].verdict.level).toBe('caution');
  });
});
