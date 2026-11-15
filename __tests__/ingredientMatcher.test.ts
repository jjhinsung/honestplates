import {
  buildIngredientReport,
  cardsFromAdditiveTags,
  findCards,
  parseIngredientList,
} from '../src/services/ingredientMatcher';

const ids = (cards: { id: string }[]) => cards.map(c => c.id);

describe('findCards', () => {
  it('matches label spellings, ignoring case and punctuation', () => {
    expect(ids(findCards('THIAMINE MONONITRATE'))).toEqual(['thiamine']);
    expect(ids(findCards('FD&C Red No. 40'))).toEqual(['red-40']);
    expect(ids(findCards('Yellow 5 Lake'))).toEqual(['yellow-5']);
    expect(ids(findCards('Vitamin B1'))).toEqual(['thiamine']);
  });

  it('prefers the longest match', () => {
    expect(ids(findCards('high fructose corn syrup'))).toEqual(['hfcs']);
    expect(ids(findCards('vitamin A palmitate'))).toEqual(['vitamin-a']);
    expect(ids(findCards('enriched bleached flour'))).toEqual(['enriched-flour']);
  });

  it('finds several things in one item', () => {
    expect(ids(findCards('canola oil with TBHQ for freshness'))).toEqual(['canola-oil', 'tbhq']);
  });

  it('only treats generic words as a match when they are the whole item', () => {
    expect(ids(findCards('flour'))).toEqual(['wheat-flour']);
    expect(ids(findCards('almond flour'))).toEqual([]);
    expect(ids(findCards('rice flour'))).toEqual(['rice']);
    expect(ids(findCards('coconut milk'))).toEqual([]);
    expect(ids(findCards('peanut butter'))).toEqual([]);
    expect(ids(findCards('soybean'))).toEqual(['soybean-oil']);
  });
});

describe('parseIngredientList', () => {
  it('nests the vitamins inside enriched flour', () => {
    const items = parseIngredientList(
      'Enriched flour (wheat flour, niacin, reduced iron, thiamine mononitrate, riboflavin, folic acid), sugar.',
    );
    expect(items).toHaveLength(2);
    expect(ids(items[0].cards)).toEqual(['enriched-flour']);
    expect(items[0].children.map(c => ids(c.cards)[0])).toEqual([
      'wheat-flour',
      'niacin',
      'reduced-iron',
      'thiamine',
      'riboflavin',
      'folic-acid',
    ]);
    expect(ids(items[1].cards)).toEqual(['sugar']);
  });

  it('treats "(color)" as a note, not a sub-ingredient', () => {
    const [item] = parseIngredientList('Red 40 Lake (color)');
    expect(item.children).toEqual([]);
    expect(ids(item.cards)).toEqual(['red-40']);
  });

  it('drops "contains 2% or less of" and keeps the ingredient', () => {
    const items = parseIngredientList('Corn, contains 2% or less of salt, BHT (to maintain freshness)');
    expect(items.map(i => i.label)).toEqual(['Corn', 'salt', 'BHT']);
    expect(ids(items[2].cards)).toEqual(['bht']);
  });
});

describe('expanded library', () => {
  it('recognizes common label ingredients', () => {
    expect(ids(findCards('Vitamin D3'))).toEqual(['vitamin-d']);
    expect(ids(findCards('Cellulose Gum'))).toEqual(['cellulose-gum']);
    expect(ids(findCards('Powdered Cellulose'))).toEqual(['cellulose']);
    expect(ids(findCards('Cocoa (Processed with Alkali)'))).toEqual(['cocoa']);
    expect(ids(findCards('Cocoa Butter'))).toEqual(['cocoa-butter']);
    expect(ids(findCards('Celery Powder'))).toEqual(['celery-powder']);
    expect(ids(findCards('Stevia Leaf Extract'))).toEqual(['stevia']);
    expect(ids(findCards('Carmine'))).toEqual(['carmine']);
    expect(ids(findCards('Autolyzed Yeast Extract'))).toEqual(['yeast-extract']);
    expect(ids(findCards('Azodicarbonamide'))).toEqual(['azodicarbonamide']);
  });

  it('keeps partially and fully hydrogenated oils apart', () => {
    expect(ids(findCards('Partially Hydrogenated Cottonseed Oil'))[0]).toBe('partially-hydrogenated');
    expect(ids(findCards('Fully Hydrogenated Palm Oil'))).toEqual(['fully-hydrogenated', 'palm-oil']);
  });

  it('reads a Hormel-style pepperoni label', () => {
    const r = buildIngredientReport(
      'Pork, beef, salt, contains 2% or less of dextrose, lactic acid starter culture, oleoresin of paprika, ' +
        'flavoring, sodium ascorbate, sodium nitrite, BHA, BHT, citric acid.',
    );
    expect(ids(r.worthKnowing)).toEqual(expect.arrayContaining(['nitrite', 'bha', 'bht', 'dextrose', 'salt']));
  });
});

describe('buildIngredientReport', () => {
  it('handles a Cheez-It style list', () => {
    const r = buildIngredientReport(
      'Enriched flour (wheat flour, niacin, reduced iron, vitamin B1 [thiamin mononitrate], vitamin B2 [riboflavin], folic acid), ' +
        'vegetable oil (high oleic soybean, soybean, palm, and/or canola oil with TBHQ for freshness), ' +
        'cheese made with skim milk (skim milk, whey protein, cheese cultures, salt, enzymes, annatto extract color), ' +
        'contains 2% or less of salt, paprika, yeast, paprika extract color, soy lecithin.',
    );
    const worth = ids(r.worthKnowing);
    expect(worth.slice(0, 3)).toEqual(expect.arrayContaining(['tbhq', 'palm-oil', 'salt']));
    expect(worth).toEqual(expect.arrayContaining(['annatto', 'lecithin', 'whey', 'milk', 'enriched-flour']));
    expect(r.summary).toMatch(/vitamins & minerals/);
  });

  it('puts banned ingredients first in Worth knowing', () => {
    const r = buildIngredientReport('Sugar, Red 3, BHA, natural flavors');
    expect(ids(r.worthKnowing)).toEqual(['red-3', 'sugar', 'bha', 'natural-flavors']);
  });

  it('adds Open Food Facts additives the text missed', () => {
    const r = buildIngredientReport('Pork, salt', ['en:e250', 'en:e320']);
    expect(ids(r.extraAdditives)).toEqual(['nitrite', 'bha']);
  });

  it('maps additive tags with letter suffixes', () => {
    expect(ids(cardsFromAdditiveTags(['en:e322i', 'en:e150d', 'en:e999']))).toEqual(['lecithin', 'caramel-color']);
  });

  it('leaves unknown items without cards', () => {
    const [item] = parseIngredientList('Dragonfruit powder');
    expect(item.cards).toEqual([]);
  });
});
