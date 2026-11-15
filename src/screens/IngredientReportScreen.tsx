import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CATEGORY_ICON, StatusBadge } from '../components/IngredientBits';
import { Card } from '../components/ui';
import type { IngredientCard } from '../data/ingredientLibrary';
import type { RootScreenProps } from '../navigation/types';
import { GmoCard } from '../components/GmoCard';
import { checkGmo } from '../services/gmoCheck';
import { useNutritionStore } from '../store/useNutritionStore';
import { buildIngredientReport, STATUS_ORDER, type IngredientItem } from '../services/ingredientMatcher';
import { colors, spacing, type } from '../theme';

/** The most serious card in an item decides its badge and where a tap goes. */
function primaryCard(item: IngredientItem): IngredientCard | undefined {
  return [...item.cards].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])[0];
}

const titleCase = (s: string) =>
  s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_, p, c) => p + c.toUpperCase()) : s;

export function IngredientReportScreen({ route, navigation }: RootScreenProps<'IngredientReport'>) {
  const { ingredientsText, additiveTags, labelText, labelTags, productName, barcode, source } = route.params;
  const report = useMemo(() => buildIngredientReport(ingredientsText, additiveTags), [ingredientsText, additiveTags]);
  const gmoCheckOn = useNutritionStore(s => s.gmoCheck);
  const gmo = useMemo(
    () => (gmoCheckOn ? checkGmo({ ingredients: ingredientsText, labelText, labelTags }) : undefined),
    [gmoCheckOn, ingredientsText, labelText, labelTags],
  );

  const openCard = (label: string, card?: IngredientCard) =>
    navigation.navigate('IngredientDetail', { label: titleCase(label), cardId: card?.id });

  const renderItem = (item: IngredientItem, depth: number, key: string): React.ReactNode => {
    const main = primaryCard(item);
    const label = titleCase(item.label);
    const translations = item.cards
      .map(c => c.plain)
      .filter((p): p is string => !!p && p.toLowerCase() !== item.label.toLowerCase());
    return (
      <View key={key}>
        <Pressable
          onPress={() => openCard(item.label, main)}
          style={({ pressed }) => [styles.row, { paddingLeft: spacing(depth * 5) }, pressed && styles.pressed]}>
          <Text style={styles.rowIcon}>{main ? CATEGORY_ICON[main.category] : '❔'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={type.body}>{label}</Text>
            {translations.length > 0 && <Text style={styles.translation}>→ {translations.join(' + ')}</Text>}
            {item.cards.length > 1 && (
              <View style={styles.chips}>
                {item.cards.map(c => (
                  <Pressable key={c.id} onPress={() => openCard(c.name, c)} style={styles.chip}>
                    <Text style={type.small}>
                      {CATEGORY_ICON[c.category]} {c.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
          <StatusBadge status={main?.status} compact />
        </Pressable>
        {item.children.map((c, i) => renderItem(c, depth + 1, `${key}.${i}`))}
      </View>
    );
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(4) }}>
      <Text style={type.h2}>{productName ?? 'Scanned ingredient list'}</Text>
      <Text style={[type.small, { marginTop: spacing(1), marginBottom: spacing(4) }]}>{report.summary}</Text>

      {report.worthKnowing.length > 0 && (
        <Card>
          <Text style={[type.h3, { marginBottom: spacing(2) }]}>Worth knowing</Text>
          {report.worthKnowing.map(c => (
            <Pressable
              key={c.id}
              onPress={() => openCard(c.name, c)}
              style={({ pressed }) => [styles.knowRow, pressed && styles.pressed]}>
              <View style={{ flex: 1, gap: spacing(1) }}>
                <Text style={type.h3}>
                  {CATEGORY_ICON[c.category]} {c.name}
                  {c.plain ? <Text style={styles.translation}>  → {c.plain}</Text> : null}
                </Text>
                <Text style={type.small}>{c.statusNote}</Text>
              </View>
              <StatusBadge status={c.status} compact />
            </Pressable>
          ))}
        </Card>
      )}

      {gmo && <GmoCard result={gmo} />}

      <Card>
        <Text style={[type.h3, { marginBottom: spacing(1) }]}>All ingredients</Text>
        <Text style={[type.small, { marginBottom: spacing(2) }]}>In label order. Tap any one to learn what it is.</Text>
        {report.items.length === 0 ? (
          <Text style={type.body}>No ingredients could be read.</Text>
        ) : (
          report.items.map((it, i) => renderItem(it, 0, String(i)))
        )}
      </Card>

      {report.extraAdditives.length > 0 && (
        <Card>
          <Text style={[type.h3, { marginBottom: spacing(1) }]}>Also detected</Text>
          <Text style={[type.small, { marginBottom: spacing(2) }]}>
            Open Food Facts lists these additives for this product.
          </Text>
          {report.extraAdditives.map(c => (
            <Pressable
              key={c.id}
              onPress={() => openCard(c.name, c)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <Text style={styles.rowIcon}>{CATEGORY_ICON[c.category]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={type.body}>{c.name}</Text>
                {c.plain && <Text style={styles.translation}>→ {c.plain}</Text>}
              </View>
              <StatusBadge status={c.status} compact />
            </Pressable>
          ))}
        </Card>
      )}

      <Text style={styles.footer}>
        {source === 'barcode'
          ? `Barcode ${barcode}. Ingredient data from Open Food Facts (openfoodfacts.org, ODbL licence); community-maintained, so check the package. `
          : 'Read from your photo; check it against the package. '}
        For education only, not medical advice.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    paddingVertical: spacing(2.5),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  knowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    paddingVertical: spacing(2.5),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: { opacity: 0.6 },
  rowIcon: { fontSize: 20, width: 26, textAlign: 'center' },
  translation: { fontSize: 13, color: colors.protein, fontWeight: '500' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5), marginTop: spacing(1.5) },
  chip: {
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderRadius: 999,
    backgroundColor: colors.track,
  },
  footer: { ...type.small, fontSize: 11, textAlign: 'center', marginTop: spacing(2), marginBottom: spacing(10) },
});
