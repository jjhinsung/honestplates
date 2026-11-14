import type { DaySummary, FoodEntry, Nutrients } from '../types';

export const NUTRIENT_KEYS: (keyof Nutrients)[] = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'fiber',
  'sugar',
  'addedSugar',
  'saturatedFat',
  'transFat',
  'sodium',
  'cholesterol',
];

export const emptyNutrients = (): Nutrients => ({
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
});

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  const out: Nutrients = { ...emptyNutrients() };
  for (const k of NUTRIENT_KEYS) {
    const av = a[k];
    const bv = b[k];
    if (av !== undefined || bv !== undefined) {
      out[k] = (av ?? 0) + (bv ?? 0);
    }
  }
  return out;
}

export function scaleNutrients(n: Nutrients, factor: number): Nutrients {
  const out: Nutrients = { ...emptyNutrients() };
  for (const k of NUTRIENT_KEYS) {
    const v = n[k];
    if (v !== undefined) {
      out[k] = round1(v * factor);
    }
  }
  return out;
}

export const round1 = (v: number) => Math.round(v * 10) / 10;

/** Calories implied by macros (4/4/9). Useful to sanity-check OCR/AI output. */
export const caloriesFromMacros = (n: Nutrients) =>
  n.protein * 4 + n.carbs * 4 + n.fat * 9;

/** Share of calories from each macro, 0–1. */
export function macroSplit(n: Nutrients) {
  const total = caloriesFromMacros(n) || 1;
  return {
    protein: (n.protein * 4) / total,
    carbs: (n.carbs * 4) / total,
    fat: (n.fat * 9) / total,
  };
}

// ---------- Dates (always local time, never UTC, so "today" matches the user's day) ----------

export function toDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The 7 date keys ending on (and including) `endKey`, oldest first. */
export function lastNDays(n: number, endKey: string = toDateKey()): string[] {
  const end = fromDateKey(endKey);
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    keys.push(toDateKey(d));
  }
  return keys;
}

export function shortWeekday(key: string): string {
  return fromDateKey(key).toLocaleDateString(undefined, { weekday: 'short' });
}

// ---------- Aggregation ----------

export function summarizeDay(entries: FoodEntry[], date: string): DaySummary {
  const dayEntries = entries.filter(e => e.date === date);
  const totals = dayEntries.reduce(
    (acc, e) => addNutrients(acc, e.nutrients),
    emptyNutrients(),
  );
  return { date, totals, entryCount: dayEntries.length };
}

export interface WeekSummary {
  days: DaySummary[];
  /** Average over days that have at least one entry (so unlogged days don't drag it to 0). */
  average: Nutrients;
  loggedDays: number;
}

export function summarizeWeek(
  entries: FoodEntry[],
  endKey: string = toDateKey(),
): WeekSummary {
  const days = lastNDays(7, endKey).map(k => summarizeDay(entries, k));
  const logged = days.filter(d => d.entryCount > 0);
  const sum = logged.reduce(
    (acc, d) => addNutrients(acc, d.totals),
    emptyNutrients(),
  );
  const average =
    logged.length > 0 ? scaleNutrients(sum, 1 / logged.length) : emptyNutrients();
  return { days, average, loggedDays: logged.length };
}

export const newId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function guessMeal(d: Date = new Date()) {
  const h = d.getHours();
  if (h < 10.5) return 'breakfast' as const;
  if (h < 15) return 'lunch' as const;
  if (h < 21) return 'dinner' as const;
  return 'snack' as const;
}
