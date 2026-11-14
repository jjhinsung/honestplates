import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MacroLine } from '../components/MacroBars';
import { MealPicker } from '../components/MealPicker';
import { Button, Card, NumberField, SectionTitle, Stepper } from '../components/ui';
import type { RootScreenProps } from '../navigation/types';
import { toFileUri } from '../services/imageUtils';
import { useNutritionStore } from '../store/useNutritionStore';
import { colors, radius, spacing, type } from '../theme';
import type { PlateItem } from '../types';
import { addNutrients, emptyNutrients, guessMeal, scaleNutrients, toDateKey } from '../utils/nutrition';

interface EditableItem extends PlateItem {
  included: boolean;
  multiplier: number; // user portion adjustment relative to AI estimate
  expanded: boolean;
}

export function PlateReviewScreen({ route, navigation }: RootScreenProps<'PlateReview'>) {
  const { analysis, photoPath } = route.params;
  const addEntries = useNutritionStore(s => s.addEntries);
  const [meal, setMeal] = useState(guessMeal());
  const [items, setItems] = useState<EditableItem[]>(
    analysis.items.map(i => ({ ...i, included: true, multiplier: 1, expanded: false })),
  );

  const update = (idx: number, patch: Partial<EditableItem>) =>
    setItems(list => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const total = useMemo(
    () =>
      items
        .filter(i => i.included)
        .reduce((acc, i) => addNutrients(acc, scaleNutrients(i.nutrients, i.multiplier)), emptyNutrients()),
    [items],
  );

  const save = () => {
    const date = toDateKey();
    addEntries(
      items
        .filter(i => i.included)
        .map(i => ({
          name: i.name,
          date,
          meal,
          source: 'plate' as const,
          servings: i.multiplier,
          servingDescription: i.portion,
          nutrients: scaleNutrients(i.nutrients, i.multiplier),
          confidence: i.confidence,
        })),
    );
    navigation.popToTop();
    navigation.navigate('Tabs', { screen: 'Today' });
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(4) }}>
      <Image source={{ uri: toFileUri(photoPath) }} style={styles.photo} />

      <Card>
        <Text style={type.small}>Plate total</Text>
        <Text style={[type.h1, type.num]}>{Math.round(total.calories)} kcal</Text>
        <MacroLine n={total} />
        {analysis.notes ? <Text style={[type.small, { marginTop: spacing(2) }]}>{analysis.notes}</Text> : null}
      </Card>

      <SectionTitle>Detected foods</SectionTitle>
      {items.map((it, idx) => {
        const scaled = scaleNutrients(it.nutrients, it.multiplier);
        const lowConfidence = it.confidence < 0.6;
        return (
          <Card key={idx} style={!it.included && { opacity: 0.5 }}>
            <View style={styles.itemHeader}>
              <Pressable
                onPress={() => update(idx, { included: !it.included })}
                style={[styles.check, it.included && styles.checkOn]}>
                {it.included && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
              </Pressable>
              <View style={{ flex: 1 }}>
                <TextInput
                  value={it.name}
                  onChangeText={name => update(idx, { name })}
                  style={type.h3}
                />
                <Text style={type.small}>
                  ~{it.portion}
                  {it.grams ? ` (${Math.round(it.grams)} g)` : ''} · {Math.round(it.confidence * 100)}% confident
                  {lowConfidence ? ' — please check' : ''}
                </Text>
              </View>
              <Text style={[type.h3, type.num]}>{Math.round(scaled.calories)}</Text>
            </View>

            <View style={styles.portionRow}>
              <Text style={type.body}>Portion ×</Text>
              <Stepper value={it.multiplier} onChange={multiplier => update(idx, { multiplier })} step={0.25} />
            </View>
            <MacroLine n={scaled} />

            <Pressable onPress={() => update(idx, { expanded: !it.expanded })}>
              <Text style={styles.link}>{it.expanded ? 'Hide details' : 'Edit nutrients'}</Text>
            </Pressable>
            {it.expanded && (
              <View>
                {(['calories', 'protein', 'carbs', 'fat'] as const).map(k => (
                  <NumberField
                    key={k}
                    label={`${k[0].toUpperCase() + k.slice(1)} (per AI portion)`}
                    unit={k === 'calories' ? 'kcal' : 'g'}
                    value={it.nutrients[k]}
                    onChange={v => update(idx, { nutrients: { ...it.nutrients, [k]: v ?? 0 } })}
                  />
                ))}
              </View>
            )}
          </Card>
        );
      })}

      <Card>
        <SectionTitle>Meal</SectionTitle>
        <MealPicker value={meal} onChange={setMeal} />
      </Card>

      <Text style={[type.small, { textAlign: 'center', marginBottom: spacing(3) }]}>
        AI portion estimates can be off by 20–30%. Adjust portions for better accuracy.
      </Text>
      <Button
        title={`Add ${Math.round(total.calories)} kcal to today`}
        onPress={save}
        disabled={!items.some(i => i.included)}
      />
      <View style={{ height: spacing(10) }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg, marginBottom: spacing(3), backgroundColor: colors.track },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  check: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  portionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: spacing(3),
  },
  link: { color: colors.primary, fontWeight: '600', marginTop: spacing(3) },
});
