import { checkGmo, findGmoIngredients } from '../src/services/gmoCheck';

describe('findGmoIngredients', () => {
  it('flags ingredients from mostly-GMO crops', () => {
    const m = findGmoIngredients('ENRICHED FLOUR, HIGH FRUCTOSE CORN SYRUP, SOYBEAN OIL, CANOLA OIL, SALT');
    expect(m.map(x => [x.ingredient, x.crop, x.confidence])).toEqual([
      ['HIGH FRUCTOSE CORN SYRUP', 'corn', 'likely'],
      ['SOYBEAN OIL', 'soy', 'likely'],
      ['CANOLA OIL', 'canola', 'likely'],
    ]);
  });

  it('marks ambiguous ingredients as possible, after the likely ones', () => {
    const m = findGmoIngredients('MALTODEXTRIN, CORN, SUGAR, VEGETABLE OIL');
    expect(m.map(x => [x.ingredient, x.confidence])).toEqual([
      ['CORN', 'likely'],
      ['MALTODEXTRIN', 'possible'],
      ['SUGAR', 'possible'],
      ['VEGETABLE OIL', 'possible'],
    ]);
  });

  it('skips organic and non-GMO ingredients, including an organic parent', () => {
    expect(
      findGmoIngredients('ORGANIC CORN SYRUP, NON-GMO SOY LECITHIN, ORGANIC CHOCOLATE (SUGAR, SOY LECITHIN)'),
    ).toEqual([]);
  });

  it('checks sub-ingredients', () => {
    expect(findGmoIngredients('CHOCOLATE CHIPS (CANE SUGAR, COCOA, SOY LECITHIN)').map(m => m.ingredient)).toEqual([
      'SOY LECITHIN',
    ]);
  });

  it('does not flag look-alikes', () => {
    expect(
      findGmoIngredients('PEPPERCORN, CANE SUGAR, TAPIOCA STARCH, SUNFLOWER LECITHIN, POPCORN, COCONUT SUGAR'),
    ).toEqual([]);
  });
});

describe('checkGmo', () => {
  it('trusts a bioengineered disclosure on the package', () => {
    const r = checkGmo({ ingredients: 'CORN, SALT', labelText: 'Contains a bioengineered food ingredient' });
    expect(r.status).toBe('bioengineered');
    expect(r.evidence).toMatch(/bioengineered food ingredient/i);
  });

  it('trusts non-GMO and organic labels over the ingredient list', () => {
    expect(checkGmo({ ingredients: 'CORN, SOYBEAN OIL', labelText: 'Non-GMO Project Verified' }).status).toBe('non-gmo');
    expect(checkGmo({ ingredients: 'CORN', labelText: 'USDA ORGANIC' }).status).toBe('non-gmo');
    expect(checkGmo({ ingredients: 'CORN', labelTags: ['en:organic'] }).status).toBe('non-gmo');
  });

  it('does not read "not genetically modified" as a GMO disclosure', () => {
    expect(checkGmo({ ingredients: 'CORN', labelText: 'Made with corn not genetically modified' }).status).toBe('non-gmo');
    expect(checkGmo({ ingredients: 'CORN', labelText: 'No genetically engineered ingredients' }).status).toBe('non-gmo');
  });

  it('reports likely, possible, none and unknown', () => {
    expect(checkGmo({ ingredients: 'CORN, SALT' }).status).toBe('likely');
    expect(checkGmo({ ingredients: 'WATER, SUGAR' }).status).toBe('possible');
    expect(checkGmo({ ingredients: 'OATS, CANE SUGAR, SALT' }).status).toBe('none-found');
    expect(checkGmo({ ingredients: '' }).status).toBe('unknown');
  });

  it('uses Open Food Facts GMO tags', () => {
    expect(checkGmo({ ingredients: 'WATER', labelTags: ['en:contains-gmos'] }).status).toBe('bioengineered');
  });
});
