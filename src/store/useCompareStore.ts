import { create } from 'zustand';
import type { ParsedLabel } from '../types';

/** The first product of a comparison, held in memory only while the user scans the second. */
interface CompareState {
  first?: { label: ParsedLabel; name: string };
  start: (label: ParsedLabel, name: string) => void;
  clear: () => void;
}

export const useCompareStore = create<CompareState>(set => ({
  first: undefined,
  start: (label, name) => set({ first: { label, name } }),
  clear: () => set({ first: undefined }),
}));
