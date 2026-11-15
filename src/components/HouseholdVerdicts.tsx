import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { HouseholdMember, PersonalVerdict } from '../types';
import { colors, radius, spacing, type } from '../theme';

const ICON = { avoid: '⛔', caution: '⚠️', ok: '✅' } as const;

/** One row per household member: is this food OK for them, and the main reason. */
export function HouseholdVerdicts({ rows }: { rows: { member: HouseholdMember; verdict: PersonalVerdict }[] }) {
  if (!rows.length) return null;
  const order = { avoid: 0, caution: 1, ok: 2 };
  const sorted = [...rows].sort((a, b) => order[a.verdict.level] - order[b.verdict.level]);
  return (
    <View style={styles.card}>
      <Text style={[type.small, styles.kicker]}>FOR YOUR HOUSEHOLD</Text>
      {sorted.map(({ member, verdict }) => {
        // The most important reason; for an all-clear, the reminder about "may contain".
        const reason = verdict.reasons.find(r => r.severity !== 'info') ?? verdict.reasons[0];
        return (
          <View key={member.id} style={styles.row}>
            <Text style={styles.icon}>{ICON[verdict.level]}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontWeight: '600' }]}>{member.name}</Text>
              {reason ? <Text style={styles.reason}>{reason.message}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing(4),
    marginBottom: spacing(3),
  },
  kicker: { fontWeight: '700', letterSpacing: 1, marginBottom: spacing(2) },
  row: { flexDirection: 'row', gap: spacing(3), paddingVertical: spacing(2) },
  icon: { fontSize: 18, width: 24, textAlign: 'center' },
  reason: { fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
});
