/**
 * Turns a raw ingredient list into an education report: every item is matched
 * against the plain-language library in src/data/ingredientLibrary.ts.
 *
 * This is read-only and never touches the food log or calorie tracking.
 */
import {
  INGREDIENT_LIBRARY,
  type IngredientCard,
  type IngredientCategory,
  type IngredientStatus,
} from '../data/ingredientLibrary';
import { splitIngredients } from './ingredientParser';

export interface IngredientItem {
  /** The text as printed on the label, e.g. "Thiamine Mononitrate". */
  label: string;
  /** Library cards found in this item, in the order they appear. Empty = unknown. */
  cards: IngredientCard[];
  /** Sub-ingredients from parentheses, e.g. the vitamins in "Enriched flour (...)". */
  children: IngredientItem[];
}

export interface IngredientReport {
  items: IngredientItem[];
  /** Cards Open Food Facts detected (by E-number) that the ingredient text didn't mention. */
  extraAdditives: IngredientCard[];
  /** Distinct cards worth knowing about, most serious first. */
  worthKnowing: IngredientCard[];
  /** Number of individual ingredients, including sub-ingredients. */
  ingredientCount: number;
  /** Plain-English one-liner, e.g. "14 ingredients · 5 vitamins & minerals · 2 preservatives". */
  summary: string;
}

/** Lowercase, strip accents and punctuation, pad with spaces for whole-word matching. */
export function normalize(text: string): string {
  const flat = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return ` ${flat} `;
}

interface AliasEntry {
  alias: string; // normalized, padded
  card: IngredientCard;
}

const ALIASES: AliasEntry[] = [];
const EXACT = new Map<string, IngredientCard>();
for (const card of INGREDIENT_LIBRARY) {
  // The card name counts as an alias, unless it's an exact-only word ("Milk" must not match "coconut milk").
  const name = card.name.toLowerCase();
  const nameIsExact = (card.exact ?? []).some(e => normalize(e) === normalize(name));
  for (const a of new Set([...(nameIsExact ? [] : [name]), ...card.aliases])) {
    ALIASES.push({ alias: normalize(a), card });
  }
  for (const e of card.exact ?? []) EXACT.set(normalize(e), card);
}
// Longest first, so "high fructose corn syrup" wins over "corn syrup".
ALIASES.sort((a, b) => b.alias.length - a.alias.length);

const E_NUMBER_INDEX = new Map<string, IngredientCard>();
for (const card of INGREDIENT_LIBRARY) {
  for (const e of card.eNumbers ?? []) E_NUMBER_INDEX.set(e.toLowerCase(), card);
}

/** Every library card mentioned in a piece of text, in reading order, without overlaps. */
export function findCards(text: string): IngredientCard[] {
  const norm = normalize(text);
  const exact = EXACT.get(norm);
  if (exact) return [exact];

  const taken: { start: number; end: number; card: IngredientCard }[] = [];
  for (const { alias, card } of ALIASES) {
    let from = 0;
    let idx: number;
    while ((idx = norm.indexOf(alias, from)) !== -1) {
      // The padded alias includes its surrounding spaces; shrink to the word span.
      const start = idx + 1;
      const end = idx + alias.length - 1;
      if (!taken.some(t => start < t.end && end > t.start)) taken.push({ start, end, card });
      from = idx + 1;
    }
  }
  taken.sort((a, b) => a.start - b.start);
  const seen = new Set<string>();
  return taken.filter(t => !seen.has(t.card.id) && seen.add(t.card.id)).map(t => t.card);
}

/** Drops "contains 2% or less of", "(color)", trailing periods and similar label noise. */
function cleanLabel(raw: string): string {
  return raw
    .replace(/^\s*(?:and\/or|and|or)\s+/i, '')
    .replace(
      /^\s*(?:contains\s+)?(?:(?:less\s+than\s+)?\d+(?:\.\d+)?\s*%\s*(?:or\s+less\s+)?(?:of\s*)?(?:each\s+of\s*)?(?:the\s+following\s*)?:?)\s*/i,
      '',
    )
    .replace(/^\s*contains\s+(?:one\s+or\s+more\s+of\s+the\s+following|less\s+than)\s*:?\s*/i, '')
    .replace(/[*†.]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits "Head (sub, sub) tail" into the head text and the parenthesized part. */
function splitParens(item: string): { head: string; inner?: string } {
  const open = item.search(/[([{]/);
  if (open < 0) return { head: item };
  let depth = 0;
  for (let i = open; i < item.length; i++) {
    const ch = item[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) {
        const head = `${item.slice(0, open)} ${item.slice(i + 1)}`;
        return { head, inner: item.slice(open + 1, i) };
      }
    }
  }
  return { head: item.slice(0, open), inner: item.slice(open + 1) };
}

/** Words that describe a function, not a separate ingredient: "(color)", "(preservative)". */
const FUNCTION_NOTE =
  /^\s*(?:a\s+)?(?:color|colour|colors|preservative|preservatives|to\s+preserve\s+freshness|for\s+freshness|to\s+maintain\s+freshness|emulsifier|leavening|antioxidant|vitamin\s*[a-z0-9]*|dough\s+conditioner|thickener|stabilizer)s?\s*$/i;

function parseItem(raw: string, depth: number): IngredientItem | undefined {
  const label = cleanLabel(raw);
  if (!label) return undefined;
  const { head, inner } = splitParens(label);
  const headLabel = cleanLabel(head);
  let children: IngredientItem[] = [];
  let cards = findCards(headLabel || label);

  if (inner && depth < 3) {
    if (FUNCTION_NOTE.test(inner) || inner.split(/[,;]/).length === 1) {
      // "(color)", "(vitamin B1)", "(for freshness)", "(E322)": describes the head, not sub-items.
      // Still pick up anything it names that the head didn't, e.g. "Vitamin C (ascorbic acid)".
      for (const c of findCards(inner)) if (!cards.some(x => x.id === c.id)) cards = [...cards, c];
    } else {
      children = splitIngredients(inner)
        .map(s => parseItem(s, depth + 1))
        .filter((x): x is IngredientItem => !!x);
    }
  }
  return { label: headLabel || label, cards, children };
}

/** Parse a whole ingredient list into items with matched library cards. */
export function parseIngredientList(text: string): IngredientItem[] {
  const body = text
    .replace(/^\s*ingredients?\s*[:;.]\s*/i, '')
    .replace(/\s*\.\s*$/, '')
    .replace(/\s+/g, ' ');
  return splitIngredients(body)
    .map(s => parseItem(s, 0))
    .filter((x): x is IngredientItem => !!x);
}

/** Map Open Food Facts additive tags like "en:e322i" or "en:e150d" to library cards. */
export function cardsFromAdditiveTags(tags: string[] = []): IngredientCard[] {
  const out: IngredientCard[] = [];
  for (const t of tags) {
    const code = t.replace(/^[a-z]{2}:/i, '').toLowerCase();
    const base = /^e\d+/.exec(code)?.[0];
    const card = E_NUMBER_INDEX.get(code) ?? (base ? E_NUMBER_INDEX.get(base) : undefined);
    if (card && !out.some(c => c.id === card.id)) out.push(card);
  }
  return out;
}

export const STATUS_ORDER: Record<IngredientStatus, number> = { restricted: 0, limit: 1, note: 2, fine: 3 };

function flatten(items: IngredientItem[]): IngredientItem[] {
  return items.flatMap(i => [i, ...flatten(i.children)]);
}

const SUMMARY_GROUPS: { label: [string, string]; cats: IngredientCategory[] }[] = [
  { label: ['vitamin or mineral', 'vitamins & minerals'], cats: ['vitamin', 'mineral'] },
  { label: ['preservative', 'preservatives'], cats: ['preservative'] },
  { label: ['color', 'colors'], cats: ['color'] },
  { label: ['sweetener', 'sweeteners'], cats: ['sweetener'] },
];

export function buildIngredientReport(text: string, additiveTags: string[] = []): IngredientReport {
  const items = parseIngredientList(text);
  const all = flatten(items);
  const matched = new Map<string, IngredientCard>();
  for (const it of all) for (const c of it.cards) matched.set(c.id, c);

  const extraAdditives = cardsFromAdditiveTags(additiveTags).filter(c => !matched.has(c.id));
  const every = [...matched.values(), ...extraAdditives];

  const worthKnowing = every
    .filter(c => c.status !== 'fine')
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  const parts = [`${all.length} ingredient${all.length === 1 ? '' : 's'}`];
  for (const g of SUMMARY_GROUPS) {
    const n = every.filter(c => g.cats.includes(c.category)).length;
    if (n) parts.push(`${n} ${n === 1 ? g.label[0] : g.label[1]}`);
  }
  return { items, extraAdditives, worthKnowing, ingredientCount: all.length, summary: parts.join(' · ') };
}
