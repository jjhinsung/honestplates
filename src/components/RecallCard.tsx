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
  return (
    <View style={styles.card} accessibilityRole="alert">
      <Text style={[type.small, styles.kicker]}>FDA RECALL</Text>
      <Text style={[type.h3, { marginBottom: spacing(2) }]}>
        {title ?? (sure ? '🚨 This product has an active recall' : '⚠️ Possible recall — check your package')}
      </Text>
      {matches.slice(0, 3).map(({ recall, matchedBy, entryName }) => (
        <View key={recall.recallNumber} style={styles.item}>
          {entryName ? <Text style={[type.body, styles.bold]}>You logged: {entryName}</Text> : null}
          <Text style={[type.body, styles.bold]}>
            {recall.classification ? `${recall.classification} · ` : ''}
            {recall.reason}
          </Text>
          <Text style={styles.detail} numberOfLines={3}>
            {recall.firm} — {recall.product}
          </Text>
          {recall.codeInfo ? (
            <Text style={styles.detail} numberOfLines={4}>
              Affected codes/lots: {recall.codeInfo}
            </Text>
          ) : null}
          <Text style={styles.meta}>
            {matchedBy === 'barcode' ? 'Matched by barcode' : 'Matched by brand and name — may be a different product'}
            {' · '}Recall {recall.recallNumber} · reported {formatReportDate(recall.reportDate)}
          </Text>
          {onDismiss ? (
            <Pressable onPress={() => onDismiss(recall.recallNumber)} hitSlop={8}>
              <Text style={styles.dismiss}>Dismiss</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      <Text style={styles.footer}>
        Recalls often cover specific lots or dates. Compare with your package, and don't eat it if it matches.
        Source: FDA enforcement reports (openFDA).
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FDECEA',
    borderColor: '#D63B30',
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: spacing(4),
    marginBottom: spacing(3),
  },
  kicker: { fontWeight: '700', letterSpacing: 1, color: '#D63B30', marginBottom: spacing(1) },
  item: { marginBottom: spacing(3), gap: spacing(1) },
  bold: { fontWeight: '600', fontSize: 14 },
  detail: { fontSize: 13, color: '#3B2422' },
  meta: { fontSize: 11, color: '#7A5A57' },
  dismiss: { color: '#D63B30', fontWeight: '600', fontSize: 13, marginTop: spacing(1) },
  footer: { fontSize: 11, color: '#7A5A57' },
});

