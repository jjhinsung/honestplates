import React, { useMemo, useState } from 'react';
import { Image, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MacroLine } from '../components/MacroBars';
import { MealPicker } from '../components/MealPicker';
import { SafetyCard } from '../components/SafetyCard';
import { Button, Card, NumberField, SectionTitle, Stepper } from '../components/ui';
import type { RootScreenProps } from '../navigation/types';
import { toFileUri } from '../services/imageUtils';
import { rateLabel } from '../services/safetyRating';
import { useNutritionStore } from '../store/useNutritionStore';
import { colors, radius, spacing, type } from '../theme';
import type { Nutrients } from '../types';
import { guessMeal, scaleNutrients, toDateKey } from '../utils/nutrition';

const FIELDS: { key: keyof Nutrients; label: string; unit: string }[] = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Total carbs', unit: 'g' },
  { key: 'fiber', label: '  Fiber', unit: 'g' },
  { key: 'sugar', label: '  Total sugars', unit: 'g' },
  { key: 'addedSugar', label: '  Added sugars', unit: 'g' },
  { key: 'fat', label: 'Total fat', unit: 'g' },
  { key: 'saturatedFat', label: '  Saturated fat', unit: 'g' },
  { key: 'transFat', label: '  Trans fat', unit: 'g' },
  { key: 'sodium', label: 'Sodium', unit: 'mg' },
  { key: 'cholesterol', label: 'Cholesterol', unit: 'mg' },
];

export function LabelReviewScreen({ route, navigation }: RootScreenProps<'LabelReview'>) {
  const { parsed, photoPath } = route.params;
  const addEntry = useNutritionStore(s => s.addEntry);

  const [name, setName] = useState('');
  const [perServing, setPerServing] = useState<Nutrients>(parsed.nutrients);
  const [servings, setServings] = useState(1);
  const [meal, setMeal] = useState(guessMeal());
  const [ingredients, setIngredients] = useState(parsed.ingredients ?? '');

  // Rating is recomputed live as the user corrects OCR values.
  const rating = useMemo(
    () => rateLabel(perServing, ingredients, parsed.allergens),
    [perServing, ingredients, parsed.allergens],
  );
  const total = useMemo(() => scaleNutrients(perServing, servings), [perServing, servings]);

  const save = () => {
    addEntry({
      name: name.trim() || 'Packaged food',
      date: toDateKey(),
      meal,
      source: 'label',
      servings,
      servingDescription: parsed.servingSize,
      nutrients: total,
      safety: rating,
    });
    navigation.popToTop();
    navigation.navigate('Tabs', { screen: 'Today' });
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(4) }}>
        <View style={styles.header}>
          <Image source={{ uri: toFileUri(photoPath) }} style={styles.thumb} />
          <View style={{ flex: 1, gap: spacing(1) }}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Food name (e.g. Granola bar)"
              placeholderTextColor={colors.textMuted}
              style={styles.nameInput}
            />
            {parsed.servingSize && <Text style={type.small}>Serving size: {parsed.servingSize}</Text>}
            {parsed.servingsPerContainer && (
              <Text style={type.small}>{parsed.servingsPerContainer} servings per container</Text>
            )}
          </View>
        </View>

        <SafetyCard rating={rating} />

        <Card>
          <SectionTitle right={<Stepper value={servings} onChange={setServings} />}>Servings eaten</SectionTitle>
          <Text style={[type.h2, type.num]}>{Math.round(total.calories)} kcal</Text>
          <MacroLine n={total} />
        </Card>

        <Card>
          <SectionTitle>Per serving (check the scan)</SectionTitle>
          <Text style={[type.small, { marginBottom: spacing(2) }]}>
            Highlighted fields weren't found on the label — fill them in if they're printed.
          </Text>
          {FIELDS.map(f => (
            <NumberField
              key={f.key}
              label={f.label}
              unit={f.unit}
              value={perServing[f.key]}
              highlight={!parsed.detectedFields.includes(f.key)}
              onChange={v =>
                setPerServing(p => ({
                  ...p,
                  [f.key]: v === undefined && ['calories', 'protein', 'carbs', 'fat'].includes(f.key) ? 0 : v,
                }))
              }
            />
          ))}
        </Card>

        <Card>
          <SectionTitle>Ingredients</SectionTitle>
          <TextInput
            value={ingredients}
            onChangeText={setIngredients}
            multiline
            placeholder="Not detected — scan the ingredient list or paste it here for a better rating."
            placeholderTextColor={colors.textMuted}
            style={styles.ingredients}
          />
        </Card>

        <Card>
          <SectionTitle>Meal</SectionTitle>
          <MealPicker value={meal} onChange={setMeal} />
        </Card>

        <Button title={`Add ${Math.round(total.calories)} kcal to today`} onPress={save} />
        <View style={{ height: spacing(10) }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', gap: spacing(3), marginBottom: spacing(3), alignItems: 'center' },
  thumb: { width: 72, height: 96, borderRadius: radius.sm, backgroundColor: colors.track },
  nameInput: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing(1.5),
  },
  ingredients: {
    minHeight: 80,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing(2),
    textAlignVertical: 'top',
  },
});
