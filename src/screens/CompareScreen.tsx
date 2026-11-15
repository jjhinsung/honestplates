import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradeBadge } from '../components/SafetyCard';
import { Card } from '../components/ui';
import type { RootScreenProps } from '../navigation/types';
import { compareProducts, summarizeProduct, type CompareRow, type Winner } from '../services/compare';
import { useNutritionStore } from '../store/useNutritionStore';
import { colors, radius, spacing, type } from '../theme';

const WIN_BG = '#E3F2EA';

/** Two products side by side, with a one-line verdict on top and the better value of each row highlighted. */
export function CompareScreen({ route }: RootScreenProps<'Compare'>) {
  const { a: labelA, b: labelB, aName, bName } = route.params;
  const insets = useSafeAreaInsets();
  const profile = useNutritionStore(s => s.profile);
  const gmoOn = useNutritionStore(s => s.gmoCheck);

  const { sa, sb, result } = useMemo(() => {
    const sa = summarizeProduct(labelA, { profile, gmoOn, name: aName });
    const sb = summarizeProduct(labelB, { profile, gmoOn, name: bName });
    return { sa, sb, result: compareProducts(sa, sb) };
  }, [labelA, labelB, aName, bName, profile, gmoOn]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(8) }}>
      {/* Verdict */}
      <View style={[styles.verdict, result.winner === 'tie' && styles.verdictTie]}>
        <Text style={[type.small, styles.kicker]}>VERDICT</Text>
        <Text style={[type.h3, { lineHeight: 22 }]}>
          {result.winner === 'tie' ? '⚖️  ' : '🏆  '}
          {result.verdict}
        </Text>
      </View>

      <Card style={styles.table}>
        {/* Product headers */}
        <View style={styles.headRow}>
          <View style={styles.labelCol} />
          {[
            { s: sa, w: result.winner === 'a' },
            { s: sb, w: result.winner === 'b' },
          ].map(({ s, w }, i) => (
            <View key={i} style={[styles.col, styles.headCol, w && styles.winCol]}>
              <GradeBadge grade={s.grade} size={40} />
              <Text style={styles.productName} numberOfLines={3}>
                {s.name}
              </Text>
            </View>
          ))}
        </View>

        {result.rows.map(row => (
          <Row key={row.key} row={row} />
        ))}
      </Card>

      <Text style={[type.small, styles.foot]}>
        Greener means better on that row. Based on the label, FDA daily values and common additive guidance. For your
        information, not medical advice.
      </Text>
    </ScrollView>
  );
}

function Cell({ value, note, win }: { value: string; note?: string; win: boolean }) {
  return (
    <View style={[styles.col, win && styles.winCol]}>
      <Text style={[styles.value, win && styles.valueWin]}>{value}</Text>
      {!!note && (
        <Text style={styles.note} numberOfLines={4}>
          {note}
        </Text>
      )}
    </View>
  );
}

function Row({ row }: { row: CompareRow }) {
  const win = (w: Winner, side: 'a' | 'b') => w === side;
  return (
    <View style={styles.row}>
      <View style={styles.labelCol}>
        <Text style={styles.rowLabel}>{row.label}</Text>
      </View>
      <Cell value={row.a} note={row.aNote} win={win(row.winner, 'a')} />
      <Cell value={row.b} note={row.bNote} win={win(row.winner, 'b')} />
    </View>
  );
}

const styles = StyleSheet.create({
  verdict: {
    backgroundColor: WIN_BG,
    borderColor: colors.calories,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: spacing(4),
    marginBottom: spacing(3),
  },
  verdictTie: { backgroundColor: '#F6F7F4', borderColor: colors.border },
  kicker: { fontWeight: '700', letterSpacing: 1, marginBottom: spacing(1) },
  table: { padding: spacing(2) },
  headRow: { flexDirection: 'row', alignItems: 'stretch', marginBottom: spacing(1) },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  labelCol: { width: 78, paddingVertical: spacing(2), paddingRight: spacing(1), justifyContent: 'center' },
  rowLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  col: { flex: 1, padding: spacing(2), justifyContent: 'center', borderRadius: radius.sm },
  headCol: { alignItems: 'center', gap: spacing(1) },
  winCol: { backgroundColor: WIN_BG },
  productName: { fontSize: 13, fontWeight: '700', color: colors.text, textAlign: 'center' },
  value: { fontSize: 14, fontWeight: '600', color: colors.text },
  valueWin: { color: colors.calories },
  note: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  foot: { fontSize: 11, marginTop: spacing(3), textAlign: 'center' },
});
