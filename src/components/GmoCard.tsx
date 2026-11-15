import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GmoResult, GmoStatus } from '../services/gmoCheck';
import { colors, radius, spacing, type } from '../theme';

const LOOK: Record<GmoStatus, { bg: string; border: string; icon: string }> = {
  bioengineered: { bg: '#FFF8EA', border: '#E39B1B', icon: '🧬' },
  likely: { bg: '#FFF8EA', border: '#E39B1B', icon: '🧬' },
  possible: { bg: '#F6F7F4', border: colors.border, icon: '🧬' },
  'non-gmo': { bg: '#E9F6EE', border: '#1F7A4D', icon: '🌱' },
  'none-found': { bg: '#E9F6EE', border: '#1F7A4D', icon: '🌱' },
  unknown: { bg: '#F6F7F4', border: colors.border, icon: '❔' },
};

/** GMO result for a scanned product. Hidden when the user turned the check off in Settings. */
export function GmoCard({ result }: { result: GmoResult }) {
  const [showAll, setShowAll] = useState(false);
  const look = LOOK[result.status];
  const shown = showAll ? result.matches : result.matches.slice(0, 4);

  return (
    <View
      style={[styles.card, { backgroundColor: look.bg, borderColor: look.border }]}
      accessible
      accessibilityLabel={`${result.headline}. ${result.detail}`}>
      <Text style={[type.small, styles.kicker]}>GMO CHECK</Text>
      <Text style={[type.h3, { marginBottom: spacing(1) }]}>
        {look.icon}  {result.headline}
      </Text>
      <Text style={[type.body, styles.detail]}>{result.detail}</Text>

      {!!result.evidence && <Text style={styles.evidence}>Package says: “{result.evidence}”</Text>}

      {shown.map(m => (
        <View key={m.ingredient} style={styles.row}>
          <Text style={[type.body, { flex: 1 }]} numberOfLines={2}>
            {m.ingredient}
          </Text>
          <Text style={[type.small, m.confidence === 'likely' && styles.likely]}>
            {m.confidence === 'likely' ? 'likely GMO' : 'maybe'} · {m.crop}
          </Text>
        </View>
      ))}
      {result.matches.length > 4 && (
        <Pressable onPress={() => setShowAll(s => !s)} hitSlop={8}>
          <Text style={styles.more}>{showAll ? 'Show fewer' : `Show all ${result.matches.length}`}</Text>
        </Pressable>
      )}

      <Text style={styles.note}>
        Based on the label and on which crops are mostly genetically engineered in the US. GMO foods on the market are
        approved as safe to eat; this is for your information.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: radius.lg, padding: spacing(4), marginBottom: spacing(3) },
  kicker: { fontWeight: '700', letterSpacing: 0.6, marginBottom: spacing(1) },
  detail: { fontSize: 14, marginBottom: spacing(2) },
  evidence: { ...type.small, fontStyle: 'italic', marginBottom: spacing(2) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    paddingVertical: spacing(1.5),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  likely: { color: colors.carbs, fontWeight: '600' },
  more: { ...type.small, color: colors.calories, fontWeight: '600', marginTop: spacing(1) },
  note: { ...type.small, fontSize: 11, marginTop: spacing(2) },
});
