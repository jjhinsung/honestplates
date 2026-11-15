import { INGREDIENT_LIBRARY } from '../src/data/ingredientLibrary';
import { capWords, sanitizeExplanation } from '../src/services/ingredientExplainer';
import { normalize } from '../src/services/ingredientMatcher';

const MAX_WORDS = 20;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

describe('ingredient library', () => {
  it('keeps every card concise', () => {
    const tooLong: string[] = [];
    for (const c of INGREDIENT_LIBRARY) {
      for (const field of ['what', 'why', 'from', 'statusNote'] as const) {
        if (words(c[field]) > MAX_WORDS) tooLong.push(`${c.id}.${field} (${words(c[field])} words)`);
        if (!c[field].trim()) tooLong.push(`${c.id}.${field} is empty`);
      }
    }
    expect(tooLong).toEqual([]);
  });

  it('has unique ids and links every card to an https source', () => {
    const ids = INGREDIENT_LIBRARY.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of INGREDIENT_LIBRARY) expect(c.source.url).toMatch(/^https:\/\//);
  });

  it('never maps one spelling to two different cards', () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const c of INGREDIENT_LIBRARY) {
      for (const a of new Set([c.name.toLowerCase(), ...c.aliases, ...(c.exact ?? [])].map(normalize))) {
        const prev = owner.get(a);
        if (prev && prev !== c.id) clashes.push(`"${a.trim()}": ${prev} vs ${c.id}`);
        owner.set(a, c.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('never uses the same E-number twice', () => {
    const seen = new Map<string, string>();
    for (const c of INGREDIENT_LIBRARY) {
      for (const e of c.eNumbers ?? []) {
        expect(seen.get(e) ?? c.id).toBe(c.id);
        seen.set(e, c.id);
      }
    }
  });
});

describe('AI explanations', () => {
  it('cuts long answers to the word limit', () => {
    const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
    expect(words(capWords(long))).toBe(MAX_WORDS);
  });

  it('never lets the AI label something banned and fills a safe default status', () => {
    expect(sanitizeExplanation({ what: 'x', status: 'restricted' }).status).toBe('limit');
    expect(sanitizeExplanation({ what: 'x', status: 'scary' }).status).toBe('note');
  });
});
