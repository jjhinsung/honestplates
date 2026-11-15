import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalorieRing } from '../components/CalorieRing';
import { MacroBars, MacroLine } from '../components/MacroBars';
import { GradeBadge } from '../components/SafetyCard';
import { Button, Card, SectionTitle } from '../components/ui';
import { WeekChart } from '../components/WeekChart';
import type { RootStackParamList } from '../navigation/types';
import { useNutritionStore } from '../store/useNutritionStore';
import { resolvePhotoPath } from '../services/imageUtils';
import { labelFromEntry, plateItemFromEntry } from '../utils/entryDetails';
import { colors, MACRO_COLORS, radius, spacing, type } from '../theme';
import type { FoodEntry, MealType } from '../types';
import { fromDateKey, summarizeDay, summarizeWeek, toDateKey } from '../utils/nutrition';
import { BrandLogo } from '../components/BrandLogo';
import { RecallCard } from '../components/RecallCard';
import { useRecallWatch } from '../hooks/useRecallWatch';

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const SOURCE_ICON = { label: '🏷️', plate: '🍽️', manual: '✏️' } as const;

export function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const entries = useNutritionStore(s => s.entries);
  const goals = useNutritionStore(s => s.goals);
  const removeEntry = useNutritionStore(s => s.removeEntry);
  const recallAlerts = useNutritionStore(s => s.recallAlerts);
  const dismissRecallAlert = useNutritionStore(s => s.dismissRecallAlert);
  const openRecalls = useMemo(() => recallAlerts.filter(a => !a.dismissed), [recallAlerts]);
  useRecallWatch(); // re-check logged foods against new FDA recalls when this tab opens

  const [date, setDate] = useState(toDateKey());
  // Remount the ring each time this tab is opened so it fills up again from 0.
  const [ringKey, setRingKey] = useState(0);
  useFocusEffect(useCallback(() => setRingKey(k => k + 1), []));
  const isToday = date === toDateKey();
  const shiftDay = (delta: number) => {
    const d = fromDateKey(date);
    d.setDate(d.getDate() + delta);
    setDate(toDateKey(d));
  };

  const day = useMemo(() => summarizeDay(entries, date), [entries, date]);
  const week = useMemo(() => summarizeWeek(entries, date), [entries, date]);
  const showMeals = useNutritionStore(s => s.showMeals);
  const favoriteCount = useNutritionStore(s => s.favorites.length);
  const dayEntries = useMemo(
    () => entries.filter(e => e.date === date).sort((a, b) => a.createdAt - b.createdAt),
    [entries, date],
  );

  /** Reopen the page the food was logged from (label, plate or manual), showing what was saved. */
  const openEntry = (e: FoodEntry) => {
    const photoPath = resolvePhotoPath(e.photoPath);
    if (e.source === 'plate') {
      nav.navigate('PlateReview', { analysis: { items: [plateItemFromEntry(e)] }, photoPath, entryId: e.id });
    } else if (e.source === 'manual') {
      nav.navigate('ManualEntry', { entryId: e.id });
    } else {
      nav.navigate('LabelReview', { parsed: labelFromEntry(e), photoPath, entryId: e.id });
    }
  };

  const confirmDelete = (e: FoodEntry) =>
    Alert.alert('Remove entry?', e.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeEntry(e.id) },
    ]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing(4), paddingTop: insets.top + spacing(2) }}>
      <BrandLogo />

      {/* Date switcher */}
      <View style={styles.dateRow}>
        <Pressable hitSlop={12} onPress={() => shiftDay(-1)}>
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <Text style={type.h2}>
          {isToday
            ? 'Today'
            : fromDateKey(date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
        </Text>
        <Pressable hitSlop={12} disabled={isToday} onPress={() => shiftDay(1)}>
          <Text style={[styles.arrow, isToday && { opacity: 0.2 }]}>›</Text>
        </Pressable>
      </View>
          
      {/* Daily totals */}
      <Card>
        <View style={styles.dailyRow}>
          <CalorieRing key={ringKey} consumed={day.totals.calories} goal={goals.calories} size={150} />
          <View style={{ flex: 1 }}>
            <MacroBars totals={day.totals} goals={goals} />
          </View>
        </View>
      </Card>

      {/* Entries (grouped by meal only when that setting is on) */}
      {(showMeals
        ? MEALS.map(meal => ({
            key: meal,
            title: meal[0].toUpperCase() + meal.slice(1),
            list: dayEntries.filter(e => e.meal === meal),
          }))
        : [{ key: 'all', title: 'Logged food', list: dayEntries }]
      ).map(({ key, title, list }) => {
        if (!list.length) return null;
        const kcal = list.reduce((s, e) => s + e.nutrients.calories, 0);
        return (
          <Card key={key}>
            <SectionTitle right={<Text style={[type.small, type.num]}>{Math.round(kcal)} kcal</Text>}>
              {title}
            </SectionTitle>
            {list.map(e => (
              <Pressable
                key={e.id}
                onPress={() => openEntry(e)}
                onLongPress={() => confirmDelete(e)}
                accessibilityRole="button"
                accessibilityHint="Opens the food's details. Long-press to remove it."
                style={({ pressed }) => [styles.entry, pressed && { opacity: 0.6 }]}>
                <Text style={{ fontSize: 18 }}>{SOURCE_ICON[e.source]}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={type.body} numberOfLines={1}>
                    {e.name}
                  </Text>
                  <MacroLine n={e.nutrients} />
                </View>
                {e.safety && <GradeBadge grade={e.safety.grade} size={22} />}
                <Text style={[type.h3, type.num]}>{Math.round(e.nutrients.calories)}</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </Card>
        );
      })}

      {dayEntries.length === 0 && (
        <Card style={{ alignItems: 'center', gap: spacing(2) }}>
          <Text style={type.h3}>Nothing logged {isToday ? 'yet today' : 'this day'}</Text>
          <Text style={[type.small, { textAlign: 'center' }]}>
            Scan a nutrition label or snap a photo of your plate to start tracking.
          </Text>
        </Card>
      )}

      {dayEntries.length > 0 && (
        <Text style={[type.small, { textAlign: 'center', marginBottom: spacing(3) }]}>
          Tap an entry to see its details. Long-press to remove it.
        </Text>
      )}
      <View style={{ marginBottom: spacing(48) }}>
        <Button title="Add manually" variant="secondary" onPress={() => nav.navigate('ManualEntry')} />
        <Pressable
          onPress={() => nav.navigate('Saved')}
          accessibilityRole="button"
          accessibilityLabel={`Saved foods, ${favoriteCount} saved`}
          style={({ pressed }) => [styles.savedTile, pressed && { opacity: 0.8 }]}>
          <Text style={styles.savedHeart}>♥</Text>
          <Text style={styles.savedLabel}>Saved</Text>
          <Text style={styles.savedCount}>{favoriteCount}</Text>
        </Pressable>
      </View>

      <RecallCard
        matches={openRecalls}
        title={
          openRecalls.some(a => a.matchedBy === 'barcode')
            ? '🚨 Recall alert for food you logged'
            : '⚠️ Possible recall on food you logged'
        }
        onDismiss={dismissRecallAlert}
      />

      {/* Weekly */}
      <Card>
        <SectionTitle
          right={<Text style={type.small}>{week.loggedDays}/7 days logged</Text>}>
          Last 7 days
        </SectionTitle>
        <WeekChart days={week.days} goal={goals.calories} average={week.average.calories} />
        <View style={styles.avgGrid}>
          <AvgCell label="Avg kcal" value={Math.round(week.average.calories)} color={colors.calories} />
          <AvgCell label="Protein" value={`${Math.round(week.average.protein)}g`} color={MACRO_COLORS.protein} />
          <AvgCell label="Carbs" value={`${Math.round(week.average.carbs)}g`} color={MACRO_COLORS.carbs} />
          <AvgCell label="Fat" value={`${Math.round(week.average.fat)}g`} color={MACRO_COLORS.fat} />
        </View>
        <Text style={[type.small, { marginTop: spacing(2), fontSize: 11 }]}>
          Averages include only days with at least one entry.
        </Text>
      </Card>
    </ScrollView>
  );
}

function AvgCell({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <View style={styles.avgCell}>
      <Text style={[type.h3, type.num, { color }]}>{value}</Text>
      <Text style={type.small}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing(3),
    paddingHorizontal: spacing(1),
  },
  savedTile: {
    alignSelf: 'flex-start',
    width: 120,
    height: 120,
    marginTop: spacing(3),
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  savedHeart: { fontSize: 36, color: colors.primary },
  savedLabel: { fontSize: 15, fontWeight: '700', color: colors.primary },
  savedCount: { fontSize: 12, color: colors.textMuted },
  arrow: { fontSize: 32, color: colors.primary, paddingHorizontal: spacing(2) },
  dailyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(4) },
  avgGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing(4) },
  avgCell: { alignItems: 'center', flex: 1 },
  chevron: { fontSize: 22, color: colors.textMuted, marginLeft: -spacing(1) },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    paddingVertical: spacing(2),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
