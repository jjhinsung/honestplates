import { compareProducts, summarizeProduct } from '../src/services/compare';
import { EMPTY_PROFILE } from '../src/services/personalVerdict';
import type { ParsedLabel } from '../src/types';

const label = (over: Partial<ParsedLabel>): ParsedLabel => ({
  nutrients: { calories: 150, protein: 3, carbs: 20, fat: 5, sodium: 120, sugar: 4 },
  rawText: '',
  detectedFields: ['calories'],
  ...over,
});
const opts = { profile: EMPTY_PROFILE, gmoOn: true };

describe('compare', () => {
  const clean = summarizeProduct(label({ productName: 'Plain Oats', ingredients: 'Whole grain oats' }), opts);
  const messy = summarizeProduct(
    label({
      productName: 'Neon Chips',
      ingredients: 'Corn, vegetable oil, BHA, red 40, soy lecithin, partially hydrogenated oil',
      containsStatement: 'CONTAINS: SOY',
    }),
    opts,
  );

  it('summarizes a product', () => {
    expect(clean.name).toBe('Plain Oats');
    expect(clean.allergens).toEqual([]);
    expect(messy.allergens).toContain('Soy');
    expect(messy.flagged.length).toBeGreaterThan(clean.flagged.length);
  });

  it('picks the cleaner product and says why', () => {
    const r = compareProducts(clean, messy);
    expect(r.winner).toBe('a');
    expect(r.verdict).toContain('Plain Oats');
    expect(r.rows.find(x => x.key === 'grade')?.winner).toBe('a');
    expect(r.rows.find(x => x.key === 'allergens')?.winner).toBe('a');
    // Swapping the order flips the winner.
    expect(compareProducts(messy, clean).winner).toBe('b');
  });

  it('reports a tie for identical products', () => {
    const r = compareProducts(clean, clean);
    expect(r.winner).toBe('tie');
    expect(r.verdict).toMatch(/too close/i);
  });

  it('leaves out the GMO row when the check is off', () => {
    const off = summarizeProduct(label({ ingredients: 'Oats' }), { ...opts, gmoOn: false });
    expect(compareProducts(off, off).rows.some(r => r.key === 'gmo')).toBe(false);
  });
});
