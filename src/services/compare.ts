import { checkGmo, type GmoResult, type GmoStatus } from './gmoCheck';
import { buildIngredientReport } from './ingredientMatcher';
import { detectAllergens } from './ingredientParser';
import { personalVerdict } from './personalVerdict';
import { rateLabel } from './safetyRating';
import type { HealthProfile, Nutrients, ParsedLabel, PersonalVerdict, SafetyGrade } from '../types';

/** Everything the compare screen shows about one product. */
export interface ProductSummary {
  name: string;
  grade: SafetyGrade;
  score: number;
  /** Ingredients that aren't plain "fine": notes, limits and restricted ones. */
  worthKnowing: string[];
  /** The stricter subset: ingredients marked "limit" or "restricted". */
  flagged: string[];
  gmo?: GmoResult;
  allergens: string[];
  /** Only when the user has set up a health profile. */
  verdict?: PersonalVerdict;
  hasIngredients: boolean;
}

const ZERO: Nutrients = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export function summarizeProduct(
  label: ParsedLabel,
  opts: { profile: HealthProfile; gmoOn: boolean; name?: string },
): ProductSummary {
  const ingredients = label.ingredients?.trim() ?? '';
  const allergens = detectAllergens(ingredients, label.containsStatement);
  const nutrients = { ...ZERO, ...label.nutrients };
  const rating = rateLabel(nutrients, ingredients || undefined, allergens);
  const report = ingredients ? buildIngredientReport(ingredients, label.additiveTags) : undefined;
  const worth = report?.worthKnowing ?? [];
  return {
    name: opts.name?.trim() || label.productName?.trim() || 'Product',
    grade: rating.grade,
    score: rating.score,
    worthKnowing: worth.map(c => c.name),
    flagged: worth.filter(c => c.status === 'limit' || c.status === 'restricted').map(c => c.name),
    gmo: opts.gmoOn
      ? checkGmo({ ingredients, labelText: label.rawText, labelTags: label.labelTags })
      : undefined,
    allergens,
    verdict: personalVerdict({ profile: opts.profile, item: nutrients, ingredients, allergens, today: ZERO }),
    hasIngredients: ingredients.length > 0,
  };
}

export type Winner = 'a' | 'b' | 'tie';

export interface CompareRow {
  key: 'grade' | 'worth' | 'flagged' | 'gmo' | 'allergens';
  label: string;
  a: string;
  b: string;
  /** Extra detail lines under each value (e.g. the ingredient names). */
  aNote?: string;
  bNote?: string;
  winner: Winner;
}

/** Lower is better. */
const GMO_RANK: Record<GmoStatus, number | undefined> = {
  'non-gmo': 0,
  'none-found': 1,
  possible: 2,
  likely: 3,
  bioengineered: 4,
  unknown: undefined,
};

const lowerWins = (x: number, y: number): Winner => (x === y ? 'tie' : x < y ? 'a' : 'b');
const higherWins = (x: number, y: number): Winner => lowerWins(y, x);

const names = (list: string[]) => (list.length ? list.slice(0, 3).join(', ') + (list.length > 3 ? '…' : '') : undefined);

export function compareProducts(a: ProductSummary, b: ProductSummary): { rows: CompareRow[]; verdict: string; winner: Winner } {
  const rows: CompareRow[] = [
    {
      key: 'grade',
      label: 'Safety grade',
      a: `${a.grade} · ${a.score}`,
      b: `${b.grade} · ${b.score}`,
      winner: higherWins(a.score, b.score),
    },
    {
      key: 'worth',
      label: 'Ingredients worth knowing',
      a: a.hasIngredients ? String(a.worthKnowing.length) : '—',
      b: b.hasIngredients ? String(b.worthKnowing.length) : '—',
      aNote: names(a.worthKnowing),
      bNote: names(b.worthKnowing),
      winner: a.hasIngredients && b.hasIngredients ? lowerWins(a.worthKnowing.length, b.worthKnowing.length) : 'tie',
    },
    {
      key: 'flagged',
      label: 'Flagged additives',
      a: a.hasIngredients ? String(a.flagged.length) : '—',
      b: b.hasIngredients ? String(b.flagged.length) : '—',
      aNote: names(a.flagged),
      bNote: names(b.flagged),
      winner: a.hasIngredients && b.hasIngredients ? lowerWins(a.flagged.length, b.flagged.length) : 'tie',
    },
  ];

  if (a.gmo || b.gmo) {
    const ra = a.gmo ? GMO_RANK[a.gmo.status] : undefined;
    const rb = b.gmo ? GMO_RANK[b.gmo.status] : undefined;
    rows.push({
      key: 'gmo',
      label: 'GMO',
      a: a.gmo?.headline.replace(/^(GMO|Non-GMO):\s*/i, '') ?? '—',
      b: b.gmo?.headline.replace(/^(GMO|Non-GMO):\s*/i, '') ?? '—',
      winner: ra !== undefined && rb !== undefined ? lowerWins(ra, rb) : 'tie',
    });
  }

  // Allergens: with a health profile, "avoid" beats "caution" beats ok; otherwise fewer allergens wins.
  const level = (s: ProductSummary) => (s.verdict ? { ok: 0, caution: 1, avoid: 2 }[s.verdict.level] : undefined);
  const la = level(a);
  const lb = level(b);
  const allergenWinner: Winner =
    la !== undefined && lb !== undefined && la !== lb ? lowerWins(la, lb) : lowerWins(a.allergens.length, b.allergens.length);
  const allergenText = (s: ProductSummary) => (s.allergens.length ? s.allergens.join(', ') : 'None found');
  const verdictNote = (s: ProductSummary) =>
    s.verdict ? `${{ ok: '✅', caution: '⚠️', avoid: '⛔' }[s.verdict.level]} ${s.verdict.headline}` : undefined;
  rows.push({
    key: 'allergens',
    label: 'Allergens',
    a: allergenText(a),
    b: allergenText(b),
    aNote: verdictNote(a),
    bNote: verdictNote(b),
    winner: allergenWinner,
  });

  const aWins = rows.filter(r => r.winner === 'a').length;
  const bWins = rows.filter(r => r.winner === 'b').length;
  const winner: Winner = aWins === bWins ? 'tie' : aWins > bWins ? 'a' : 'b';

  let verdict: string;
  if (winner === 'tie') {
    verdict = 'Too close to call. They compare about the same on these checks.';
  } else {
    const [w, l] = winner === 'a' ? [a, b] : [b, a];
    const reasons: string[] = [];
    if (w.score > l.score) reasons.push(`a better grade (${w.grade} vs ${l.grade})`);
    if (w.hasIngredients && l.hasIngredients && w.flagged.length < l.flagged.length)
      reasons.push(`${l.flagged.length - w.flagged.length} fewer flagged additive${l.flagged.length - w.flagged.length === 1 ? '' : 's'}`);
    else if (w.hasIngredients && l.hasIngredients && w.worthKnowing.length < l.worthKnowing.length)
      reasons.push(`${l.worthKnowing.length - w.worthKnowing.length} fewer ingredients worth knowing`);
    const gm = rows.find(r => r.key === 'gmo');
    if (gm && gm.winner === winner) reasons.push('a better GMO result');
    const al = rows.find(r => r.key === 'allergens');
    if (al && al.winner === winner) reasons.push('fewer allergen concerns');
    verdict = `${w.name} comes out ahead${reasons.length ? `: ${reasons.slice(0, 3).join(', ')}` : ''}.`;
  }
  return { rows, verdict, winner };
}
