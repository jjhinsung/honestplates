import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { findRecalls, getActiveRecalls } from '../services/recallCheck';
import { useNutritionStore, type RecallAlert } from '../store/useNutritionStore';
import { fromDateKey } from '../utils/nutrition';

const LOOKBACK_DAYS = 90;

/**
 * Re-checks foods logged in the last 90 days against the FDA recall list whenever
 * the screen using this hook comes into focus. The list is only downloaded about
 * once a day (see getActiveRecalls), so this is cheap. New matches are saved as
 * alerts and announced once.
 */
export function useRecallWatch() {
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const { entries, recallAlerts, addRecallAlerts } = useNutritionStore.getState();
        const since = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
        const packaged = entries.filter(e => e.source === 'label' && fromDateKey(e.date).getTime() >= since);
        if (!packaged.length) return;

        let recalls;
        try {
          recalls = await getActiveRecalls();
        } catch {
          return; // offline or FDA unavailable: try again next time
        }
        if (cancelled) return;

        const known = new Set(recallAlerts.map(a => a.recall.recallNumber));
        const fresh: RecallAlert[] = [];
        // Newest entries first, so the alert names the most recent purchase.
        for (const e of [...packaged].sort((a, b) => b.createdAt - a.createdAt)) {
          for (const m of findRecalls({ barcode: e.barcode, name: e.name }, recalls)) {
            if (known.has(m.recall.recallNumber)) continue;
            known.add(m.recall.recallNumber);
            fresh.push({ ...m, entryName: e.name, foundAt: Date.now(), dismissed: false });
          }
        }
        if (!fresh.length) return;
        addRecallAlerts(fresh);
        const first = fresh.find(a => a.matchedBy === 'barcode') ?? fresh[0];
        Alert.alert(
          first.matchedBy === 'barcode' ? 'Recall on a food you logged' : 'Possible recall on a food you logged',
          `${first.entryName}: ${first.recall.reason}` +
            (fresh.length > 1 ? `\n\n…and ${fresh.length - 1} more. See the Today tab.` : '\n\nDetails are on the Today tab.'),
        );
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );
}
