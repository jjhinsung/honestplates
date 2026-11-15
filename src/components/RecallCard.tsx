import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatReportDate, type RecallMatch } from '../services/recallCheck';
import { radius, spacing, type } from '../theme';

/**
 * Red alert for FDA recalls that match a product. A barcode match is shown as a
 * recall of this product; a name match is shown as a possible match to check.
 */
export function RecallCard({
  matches,
  title,
  onDismiss,
}: {
  matches: (RecallMatch & { entryName?: string })[];
  title?: string;
  onDismiss?: (recallNumber: string) => void;
}) {
  if (!matches.length) return null;
  const sure = matches.some(m => m.matchedBy === 'barcode');
  const extra = matches.length - 1;
  const { recall, matchedBy, entryName } = matches[0];
  return (
    <View style={styles.card} accessibilityRole="alert">
      <Text style={styles.title} numberOfLines={2}>
        <Text style={styles.kicker}>FDA RECALL  </Text>
        {title ?? (sure ? '🚨 This product has an active recall' : '⚠️ Possible recall — check your package')}
      </Text>
      {entryName ? (
        <Text style={styles.detail} numberOfLines={1}>
          You logged: {entryName}
        </Text>
      ) : null}
      <Text style={styles.detail} numberOfLines={2}>
        {recall.classification ? `${recall.classification} · ` : ''}
        {recall.reason}
      </Text>
      <Text style={styles.meta} numberOfLines={2}>
        {matchedBy === 'barcode' ? 'Matched by barcode' : 'Matched by name — may be a different product'}
        {' · '}Recall {recall.recallNumber} · {formatReportDate(recall.reportDate)}
        {extra > 0 ? ` · +${extra} more` : ''}
        {' · Source: openFDA'}
      </Text>
      {onDismiss ? (
        <Pressable onPress={() => onDismiss(recall.recallNumber)} hitSlop={8}>
          <Text style={styles.dismiss}>Dismiss</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FDECEA',
    borderColor: '#D63B30',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    marginBottom: spacing(3),
    gap: 2,
  },
  title: { fontSize: 14, fontWeight: '700', color: '#3B2422' },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#D63B30' },
  detail: { fontSize: 12, color: '#3B2422' },
  meta: { fontSize: 11, color: '#7A5A57' },
  dismiss: { color: '#D63B30', fontWeight: '600', fontSize: 12, marginTop: 2 },
});
