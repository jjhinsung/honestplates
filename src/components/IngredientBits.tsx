import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { IngredientCategory, IngredientOrigin, IngredientStatus } from '../data/ingredientLibrary';
import { colors, spacing } from '../theme';

export const STATUS_INFO: Record<IngredientStatus, { icon: string; label: string; color: string; bg: string }> = {
  fine: { icon: '✅', label: 'Fine', color: colors.calories, bg: '#E7F4EC' },
  note: { icon: 'ℹ️', label: 'Good to know', color: colors.protein, bg: '#E9EFFC' },
  limit: { icon: '⚠️', label: 'Limit', color: '#B07410', bg: '#FFF4DE' },
  restricted: { icon: '🚫', label: 'Banned / restricted', color: colors.danger, bg: '#FCE9E7' },
};

export const UNKNOWN_INFO = { icon: '❓', label: 'Not in our library yet', color: colors.textMuted, bg: colors.track };

export const CATEGORY_ICON: Record<IngredientCategory, string> = {
  vitamin: '💊',
  mineral: '💊',
  preservative: '🧪',
  color: '🎨',
  grain: '🌾',
  fat: '🧈',
  sweetener: '🍬',
  dairy: '🥛',
  texture: '🫧',
  flavor: '🧂',
  leavening: '🍞',
  other: '🔹',
};

export const ORIGIN_INFO: Record<IngredientOrigin, { icon: string; label: string }> = {
  plant: { icon: '🌱', label: 'Plant' },
  animal: { icon: '🐄', label: 'Animal' },
  mineral: { icon: '⛏️', label: 'Mineral' },
  fermented: { icon: '🧫', label: 'Fermented' },
  lab: { icon: '🏭', label: 'Lab-made' },
  mixed: { icon: '🔀', label: 'Plant or animal' },
};

export function StatusBadge({ status, compact }: { status?: IngredientStatus; compact?: boolean }) {
  const info = status ? STATUS_INFO[status] : UNKNOWN_INFO;
  return (
    <View style={[styles.badge, { backgroundColor: info.bg }]}>
      <Text style={styles.badgeIcon}>{info.icon}</Text>
      {!compact && <Text style={[styles.badgeText, { color: info.color }]}>{info.label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  badgeIcon: { fontSize: 13 },
  badgeText: { fontSize: 13, fontWeight: '600' },
});
