import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MacroLine } from '../components/MacroBars';
import { MealPicker } from '../components/MealPicker';
import { PersonalVerdictCard } from '../components/PersonalVerdictCard';
import { Button, Card, NumberField, SectionTitle, Stepper } from '../components/ui';
import type { RootScreenProps } from '../navigation/types';
import { keepPhoto, toFileUri } from '../services/imageUtils';
import { detectAllergens } from '../services/ingredientParser';
import { householdVerdicts, personalVerdict } from '../services/personalVerdict';
import { HouseholdVerdicts } from '../components/HouseholdVerdicts';
import { useNutritionStore } from '../store/useNutritionStore';
import { colors, radius, spacing, type } from '../theme';
import type { PlateItem } from '../types';
import { addNutrients, emptyNutrients, guessMeal, scaleNutrients, summarizeDay, toDateKey } from '../utils/nutrition';

interface EditableItem extends PlateItem {
  included: boolean;
  multiplier: number; // user portion adjustment relative to AI estimate
  expanded: boolean;
}

export function PlateReviewScreen({ route, navigation }: RootScreenProps<'PlateReview'>) {
  const { analysis, photoPath, entryId } = route.params;
  const addEntries = useNutritionStore(s => s.addEntries);
  const updateEntry = useNutritionStore(s => s.updateEntry);
  // Reopened from the Today list: one logged item, edited in place.
  const existing = useNutritionStore(s => (entryId ? s.entries.find(e => e.id === entryId) : undefined));
  useEffect(() => {
    if (entryId) navigation.setOptions({ title: 'Logged food' });
  }, [entryId, navigation]);
  const [saving, setSaving] = useState(false);
  const showMeals = useNutritionStore(s => s.showMeals);
  const [meal, setMeal] = useState(existing?.meal ?? guessMeal());
  const [items, setItems] = useState<EditableItem[]>(
    analysis.items.map(i => ({ ...i, included: true, multiplier: existing?.servings ?? 1, expanded: false })),
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

  // Personal verdict for the whole plate: daily limits use the plate total; allergy and
  // diet checks can only use the food names the AI detected (no ingredient list).
  const profile = useNutritionStore(s => s.profile);
  const entries = useNutritionStore(s => s.entries);
  const today = useMemo(() => summarizeDay(entries, toDateKey()).totals, [entries]);
  const foodNames = useMemo(
    () => items.filter(i => i.included).map(i => i.name).join(', '),
    [items],
  );
  const verdict = useMemo(
    () =>
      personalVerdict({
        profile,
        item: total,
        ingredients: foodNames,
        allergens: detectAllergens(foodNames),
        today,
        context: 'plate',
      }),
    [profile, total, foodNames, today],
  );
  const household = useNutritionStore(s => s.household);
  const householdRows = useMemo(
    () => householdVerdicts({ household, ingredients: foodNames, allergens: detectAllergens(foodNames), context: 'plate' }),
    [household, foodNames],
  );

  const save = async () => {
    setSaving(true);
    const kept = await keepPhoto(photoPath); // the camera's temp folder gets emptied by iOS
    setSaving(false);
    if (existing) {
      const it = items[0];
      updateEntry(existing.id, {
        name: it.name,
        meal,
        servings: it.multiplier,
        servingDescription: it.portion,
        nutrients: scaleNutrients(it.nutrients, it.multiplier),
        photoPath: kept,
      });
      navigation.goBack();
      return;
    }
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
          photoPath: kept,
        })),
    );
    navigation.popToTop();
    navigation.navigate('Tabs', { screen: 'Today' });
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(4) }}>
      {photoPath ? <Image source={{ uri: toFileUri(photoPath) }} style={styles.photo} /> : null}

      <Card>
        <Text style={type.small}>Plate total</Text>
        <Text style={[type.h1, type.num]}>{Math.round(total.calories)} kcal</Text>
        <MacroLine n={total} />
        {analysis.notes ? <Text style={[type.small, { marginTop: spacing(2) }]}>{analysis.notes}</Text> : null}
      </Card>

      <PersonalVerdictCard
        verdict={verdict}
        onSetUp={() => navigation.navigate('Tabs', { screen: 'Settings' })}
      />
      <HouseholdVerdicts rows={householdRows} />

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

      {showMeals && (
        <Card>
          <SectionTitle>Meal</SectionTitle>
          <MealPicker value={meal} onChange={setMeal} />
        </Card>
      )}

      <Text style={[type.small, { textAlign: 'center', marginBottom: spacing(3) }]}>
        AI portion estimates can be off by 20–30%. Adjust portions for better accuracy.
      </Text>
      <Button
        title={existing ? 'Save changes' : `Add ${Math.round(total.calories)} kcal to today`}
        onPress={save}
        loading={saving}
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
