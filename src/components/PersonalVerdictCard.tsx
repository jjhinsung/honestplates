import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PersonalVerdict } from '../types';
import { colors, radius, spacing, type } from '../theme';

const LOOK = {
  avoid: { bg: '#FDECEA', border: '#D63B30', icon: '⛔' },
  caution: { bg: '#FFF8EA', border: '#E39B1B', icon: '⚠️' },
  ok: { bg: '#E9F6EE', border: '#1F7A4D', icon: '✅' },
} as const;
const REASON_ICON = { avoid: '⛔', caution: '⚠️', info: '·' } as const;

/**
 * "For you" verdict shown above the general safety rating. With no profile set,
 * shows a small prompt to set one up instead.
 */
export function PersonalVerdictCard({
  verdict,
  onSetUp,
}: {
  verdict?: PersonalVerdict;
  onSetUp: () => void;
}) {
  if (!verdict) {
    return (
      <Pressable onPress={onSetUp} style={styles.setup} accessibilityRole="button">
        <Text style={type.body}>👤 Get a personal verdict</Text>
        <Text style={type.small}>Add your allergies, diet and limits in Settings ›</Text>
      </Pressable>
    );
  }
  const look = LOOK[verdict.level];
  return (
    <View style={[styles.card, { backgroundColor: look.bg, borderColor: look.border }]}>
      <Text style={[type.small, styles.kicker]}>FOR YOU</Text>
      <Text style={[type.h3, { marginBottom: spacing(2) }]}>
        {look.icon}  {verdict.headline}
      </Text>
      {verdict.reasons.map((r, i) => (
        <Text key={i} style={[type.body, styles.reason, r.severity === 'info' && { color: colors.textMuted }]}>
          {REASON_ICON[r.severity]}  {r.message}
        </Text>
      ))}
      <Pressable onPress={onSetUp} hitSlop={8}>
        <Text style={styles.edit}>Edit my profile</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1.5, padding: spacing(4), marginBottom: spacing(3) },
  kicker: { fontWeight: '700', letterSpacing: 1, marginBottom: spacing(1) },
  reason: { fontSize: 14, marginBottom: spacing(1.5) },
  edit: { color: colors.primary, fontWeight: '600', marginTop: spacing(2), fontSize: 13 },
  setup: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    padding: spacing(4),
    marginBottom: spacing(3),
    gap: spacing(1),
  },
});
