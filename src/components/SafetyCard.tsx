import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GRADE_COLORS } from '../services/safetyRating';
import type { SafetyRating } from '../types';
import { colors, spacing, type } from '../theme';
import { Card } from './ui';

export function GradeBadge({ grade, size = 28 }: { grade: SafetyRating['grade']; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 4,
        backgroundColor: GRADE_COLORS[grade],
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.55 }}>{grade}</Text>
    </View>
  );
}

const SEVERITY_ICON = { warning: '⛔', caution: '⚠️', info: 'ℹ️' } as const;

export function SafetyCard({ rating }: { rating: SafetyRating }) {
  return (
    <Card>
      <View style={styles.header}>
        <GradeBadge grade={rating.grade} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={type.h3}>Label safety rating</Text>
          <Text style={[type.small, type.num]}>Score {rating.score}/100</Text>
        </View>
      </View>
      {rating.flags.map((f, i) => (
        <Text key={`f${i}`} style={[type.body, styles.line]}>
          {SEVERITY_ICON[f.severity]}  {f.message}
        </Text>
      ))}
      {rating.positives.map((p, i) => (
        <Text key={`p${i}`} style={[type.body, styles.line]}>
          ✅  {p}
        </Text>
      ))}
      {rating.flags.length === 0 && rating.positives.length === 0 && (
        <Text style={type.small}>No concerns found in the scanned nutrients or ingredients.</Text>
      )}
      <Text style={[type.small, { marginTop: spacing(2), fontSize: 11, color: colors.textMuted }]}>
        Informational only, based on FDA Daily Values and common additive guidance. Not medical advice.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(3) },
  line: { marginBottom: spacing(1.5), fontSize: 14 },
});
