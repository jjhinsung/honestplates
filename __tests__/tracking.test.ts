jest.mock('@bam.tech/react-native-image-resizer', () => ({}));
jest.mock('react-native-fs', () => ({}));

import { sanitizeAnalysis } from '../src/services/plateRecognition';
import type { FoodEntry } from '../src/types';
import { lastNDays, summarizeDay, summarizeWeek } from '../src/utils/nutrition';

const entry = (date: string, calories: number, protein = 0, carbs = 0, fat = 0): FoodEntry => ({
  id: Math.random().toString(),
  name: 'x',
  date,
  createdAt: 0,
  meal: 'lunch',
  source: 'manual',
  servings: 1,
  nutrients: { calories, protein, carbs, fat },
});

describe('daily and weekly aggregation', () => {
  const entries = [
    entry('2026-11-14', 500, 30, 50, 20),
    entry('2026-11-14', 700, 40, 60, 30),
    entry('2026-11-12', 1800, 100, 200, 60),
    entry('2026-11-01', 9999), // outside the 7-day window
  ];

  it('totals a day', () => {
    const d = summarizeDay(entries, '2026-11-14');
    expect(d.totals).toMatchObject({ calories: 1200, protein: 70, carbs: 110, fat: 50 });
    expect(d.entryCount).toBe(2);
  });

  it('averages the week over logged days only', () => {
    const w = summarizeWeek(entries, '2026-11-14');
    expect(w.days.map(d => d.date)).toEqual(lastNDays(7, '2026-11-14'));
    expect(w.days[0].date).toBe('2026-11-08');
    expect(w.loggedDays).toBe(2);
    expect(w.average).toMatchObject({ calories: 1500, protein: 85, carbs: 155, fat: 55 });
  });

  it('handles month boundaries', () => {
    expect(lastNDays(3, '2026-03-01')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
  });
});

describe('sanitizeAnalysis (AI output guard)', () => {
  it('coerces strings, clamps values and defaults missing fields', () => {
    const a = sanitizeAnalysis({
      items: [
        { name: 'Grilled chicken', portion: '150 g', grams: '150', nutrients: { calories: '248', protein: 46, carbs: 0, fat: 5.4 }, confidence: 0.9 },
        { nutrients: { calories: -50, protein: 'abc', carbs: 99999, fat: 2 } },
      ],
      notes: 'ok',
    });
    expect(a.items[0]).toMatchObject({ name: 'Grilled chicken', grams: 150, nutrients: { calories: 248, protein: 46 } });
    expect(a.items[1]).toMatchObject({ name: 'Unknown food', confidence: 0.5, nutrients: { calories: 0, protein: 0, carbs: 500 } });
  });

  it('returns no items for garbage', () => {
    expect(sanitizeAnalysis('nope').items).toEqual([]);
  });
});
