import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalorieRing } from '../components/CalorieRing';
import { MacroBars, MacroLine } from '../components/MacroBars';
import { GradeBadge } from '../components/SafetyCard';
import { Button, Card, SectionTitle } from '../components/ui';
import { WeekChart } from '../components/WeekChart';
import type { RootStackParamList } from '../navigation/types';
import { useNutritionStore } from '../store/useNutritionStore';
import { colors, MACRO_COLORS, spacing, type } from '../theme';
import type { FoodEntry, MealType } from '../types';
import { fromDateKey, summarizeDay, summarizeWeek, toDateKey } from '../utils/nutrition';

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const SOURCE_ICON = { label: '🏷️', plate: '🍽️', manual: '✏️' } as const;

export function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const entries = useNutritionStore(s => s.entries);
  const goals = useNutritionStore(s => s.goals);
  const removeEntry = useNutritionStore(s => s.removeEntry);

  const [date, setDate] = useState(toDateKey());
  const isToday = date === toDateKey();
  const shiftDay = (delta: number) => {
    const d = fromDateKey(date);
    d.setDate(d.getDate() + delta);
    setDate(toDateKey(d));
  };

  const day = useMemo(() => summarizeDay(entries, date), [entries, date]);
  const week = useMemo(() => summarizeWeek(entries, date), [entries, date]);
  const dayEntries = useMemo(
    () => entries.filter(e => e.date === date).sort((a, b) => a.createdAt - b.createdAt),
    [entries, date],
  );

  const confirmDelete = (e: FoodEntry) =>
    Alert.alert('Remove entry?', e.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeEntry(e.id) },
    ]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing(4), paddingTop: insets.top + spacing(2) }}>
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
          <CalorieRing consumed={day.totals.calories} goal={goals.calories} size={150} />
          <View style={{ flex: 1 }}>
            <MacroBars totals={day.totals} goals={goals} />
          </View>
        </View>
      </Card>

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

      {/* Entries by meal */}
      {MEALS.map(meal => {
        const list = dayEntries.filter(e => e.meal === meal);
        if (!list.length) return null;
        const kcal = list.reduce((s, e) => s + e.nutrients.calories, 0);
        return (
          <Card key={meal}>
            <SectionTitle right={<Text style={[type.small, type.num]}>{Math.round(kcal)} kcal</Text>}>
              {meal[0].toUpperCase() + meal.slice(1)}
            </SectionTitle>
            {list.map(e => (
              <Pressable key={e.id} onLongPress={() => confirmDelete(e)} style={styles.entry}>
                <Text style={{ fontSize: 18 }}>{SOURCE_ICON[e.source]}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={type.body} numberOfLines={1}>
                    {e.name}
                  </Text>
                  <MacroLine n={e.nutrients} />
                </View>
                {e.safety && <GradeBadge grade={e.safety.grade} size={22} />}
                <Text style={[type.h3, type.num]}>{Math.round(e.nutrients.calories)}</Text>
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

      <Button title="Add manually" variant="secondary" onPress={() => nav.navigate('ManualEntry')} />
      {dayEntries.length > 0 && (
        <Text style={[type.small, { textAlign: 'center', marginTop: spacing(3) }]}>
          Long-press an entry to remove it.
        </Text>
      )}
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
  arrow: { fontSize: 32, color: colors.primary, paddingHorizontal: spacing(2) },
  dailyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(4) },
  avgGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing(4) },
  avgCell: { alignItems: 'center', flex: 1 },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    paddingVertical: spacing(2),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
