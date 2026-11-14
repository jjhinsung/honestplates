import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DailyGoals, Nutrients } from '../types';
import { colors, MACRO_COLORS, spacing, type } from '../theme';

const ROWS = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
] as const;

export function MacroBars({ totals, goals }: { totals: Nutrients; goals: DailyGoals }) {
  return (
    <View style={{ gap: spacing(3) }}>
      {ROWS.map(({ key, label }) => {
        const v = totals[key];
        const g = goals[key];
        const pct = g > 0 ? Math.min(v / g, 1) : 0;
        return (
          <View key={key}>
            <View style={styles.labelRow}>
              <Text style={type.body}>{label}</Text>
              <Text style={[type.small, type.num]}>
                {Math.round(v)} / {g} g
              </Text>
            </View>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${pct * 100}%`, backgroundColor: v > g ? colors.danger : MACRO_COLORS[key] },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Compact "P 32g · C 40g · F 12g" line. */
export function MacroLine({ n }: { n: Nutrients }) {
  return (
    <Text style={[type.small, type.num]}>
      <Text style={{ color: MACRO_COLORS.protein }}>P {Math.round(n.protein)}g</Text>
      {'  ·  '}
      <Text style={{ color: MACRO_COLORS.carbs }}>C {Math.round(n.carbs)}g</Text>
      {'  ·  '}
      <Text style={{ color: MACRO_COLORS.fat }}>F {Math.round(n.fat)}g</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(1.5) },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
});
