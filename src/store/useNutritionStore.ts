import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_AI_PROXY_URL, DEFAULT_GOALS } from '../config';
import type { DailyGoals, FoodEntry, HealthProfile } from '../types';
import { EMPTY_PROFILE } from '../services/personalVerdict';
import { newId } from '../utils/nutrition';
import type { RecallMatch } from '../services/recallCheck';

export interface RecallAlert extends RecallMatch {
  /** The logged food it matched. */
  entryName: string;
  foundAt: number;
  dismissed: boolean;
}

interface NutritionState {
  entries: FoodEntry[];
  goals: DailyGoals;
  aiProxyUrl: string;
  profile: HealthProfile;

  addEntry: (entry: Omit<FoodEntry, 'id' | 'createdAt'>) => FoodEntry;
  addEntries: (entries: Omit<FoodEntry, 'id' | 'createdAt'>[]) => void;
  updateEntry: (id: string, patch: Partial<FoodEntry>) => void;
  removeEntry: (id: string) => void;
  setGoals: (goals: Partial<DailyGoals>) => void;
  setAiProxyUrl: (url: string) => void;
  setProfile: (patch: Partial<HealthProfile>) => void;
  /** Recalls found for foods the user already logged (checked when the Today tab opens). */
  recallAlerts: RecallAlert[];
  addRecallAlerts: (alerts: RecallAlert[]) => void;
  dismissRecallAlert: (recallNumber: string) => void;
  clearAll: () => void;
}

export const useNutritionStore = create<NutritionState>()(
  persist(
    set => ({
      entries: [],
      goals: DEFAULT_GOALS,
      aiProxyUrl: DEFAULT_AI_PROXY_URL,
      profile: EMPTY_PROFILE,
      recallAlerts: [],

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
      setProfile: patch => set(s => ({ profile: { ...s.profile, ...patch } })),
      addRecallAlerts: alerts =>
          set(s => ({
          // One alert per recall; never re-add one the user already saw or dismissed.
          recallAlerts: [
              ...s.recallAlerts,
              ...alerts.filter(a => !s.recallAlerts.some(x => x.recall.recallNumber === a.recall.recallNumber)),
            ],
          })),
        dismissRecallAlert: recallNumber =>
          set(s => ({
            recallAlerts: s.recallAlerts.map(a =>
              a.recall.recallNumber === recallNumber ? { ...a, dismissed: true } : a,
            ),
          })),
      clearAll: () => set({ entries: [] }),
    }),
    {
      name: 'nutrilens-store',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
