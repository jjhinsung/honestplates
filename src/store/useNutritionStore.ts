import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_AI_PROXY_URL, DEFAULT_GOALS } from '../config';
import type { DailyGoals, FoodEntry, HealthProfile, HouseholdMember } from '../types';
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
  /** Show the breakfast/lunch/dinner/snack choice and grouping (off by default). */
  showMeals: boolean;
  setShowMeals: (on: boolean) => void;
  /** Show the GMO check on scan reports. */
  gmoCheck: boolean;
  setGmoCheck: (on: boolean) => void;

  addEntry: (entry: Omit<FoodEntry, 'id' | 'createdAt'>) => FoodEntry;
  addEntries: (entries: Omit<FoodEntry, 'id' | 'createdAt'>[]) => void;
  updateEntry: (id: string, patch: Partial<FoodEntry>) => void;
  removeEntry: (id: string) => void;
  setGoals: (goals: Partial<DailyGoals>) => void;
  setAiProxyUrl: (url: string) => void;
  setProfile: (patch: Partial<HealthProfile>) => void;
  /** Other people the user scans food for; checked for allergies/diet on every scan. */
  household: HouseholdMember[];
  addMember: (name: string) => void;
  updateMember: (id: string, patch: Partial<Omit<HouseholdMember, 'id'>>) => void;
  removeMember: (id: string) => void;
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
      showMeals: false,
      setShowMeals: on => set({ showMeals: on }),
      gmoCheck: true,
      household: [],
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
      setGmoCheck: on => set({ gmoCheck: on }),
      setProfile: patch => set(s => ({ profile: { ...s.profile, ...patch } })),
      addMember: name =>
        set(s => ({
          household: [
            ...s.household,
            { id: newId(), name: name.trim() || 'Someone', allergies: [], diets: [], avoidIngredients: [] },
          ],
        })),
      updateMember: (id, patch) =>
        set(s => ({ household: s.household.map(m => (m.id === id ? { ...m, ...patch } : m)) })),
      removeMember: id => set(s => ({ household: s.household.filter(m => m.id !== id) })),
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
