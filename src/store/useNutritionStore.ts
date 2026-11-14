import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_AI_PROXY_URL, DEFAULT_GOALS } from '../config';
import type { DailyGoals, FoodEntry } from '../types';
import { newId } from '../utils/nutrition';

interface NutritionState {
  entries: FoodEntry[];
  goals: DailyGoals;
  aiProxyUrl: string;

  addEntry: (entry: Omit<FoodEntry, 'id' | 'createdAt'>) => FoodEntry;
  addEntries: (entries: Omit<FoodEntry, 'id' | 'createdAt'>[]) => void;
  updateEntry: (id: string, patch: Partial<FoodEntry>) => void;
  removeEntry: (id: string) => void;
  setGoals: (goals: Partial<DailyGoals>) => void;
  setAiProxyUrl: (url: string) => void;
  clearAll: () => void;
}

export const useNutritionStore = create<NutritionState>()(
  persist(
    set => ({
      entries: [],
      goals: DEFAULT_GOALS,
      aiProxyUrl: DEFAULT_AI_PROXY_URL,

      addEntry: entry => {
        const full: FoodEntry = { ...entry, id: newId(), createdAt: Date.now() };
        set(s => ({ entries: [...s.entries, full] }));
        return full;
      },
      addEntries: list =>
        set(s => ({
          entries: [
            ...s.entries,
            ...list.map(e => ({ ...e, id: newId(), createdAt: Date.now() })),
          ],
        })),
      updateEntry: (id, patch) =>
        set(s => ({
          entries: s.entries.map(e => (e.id === id ? { ...e, ...patch } : e)),
        })),
      removeEntry: id =>
        set(s => ({ entries: s.entries.filter(e => e.id !== id) })),
      setGoals: goals => set(s => ({ goals: { ...s.goals, ...goals } })),
      setAiProxyUrl: url => set({ aiProxyUrl: url.trim().replace(/\/+$/, '') }),
      clearAll: () => set({ entries: [] }),
    }),
    {
      name: 'nutrilens-store',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
