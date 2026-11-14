import React, { useMemo, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MacroLine } from '../components/MacroBars';
import { MealPicker } from '../components/MealPicker';
import { SafetyCard } from '../components/SafetyCard';
import { Button, Card, NumberField, SectionTitle, Stepper } from '../components/ui';
import type { RootScreenProps } from '../navigation/types';
import { toFileUri } from '../services/imageUtils';
import { rateLabel } from '../services/safetyRating';
import { useNutritionStore } from '../store/useNutritionStore';
import { colors, radius, spacing, type } from '../theme';
import type { Nutrients, ParsedLabel } from '../types';
import { caloriesFromMacros, guessMeal, scaleNutrients, toDateKey } from '../utils/nutrition';

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

  // Calorie sanity check: compare against 4·protein + 4·carbs + 9·fat (updates as the user edits).
  const [caloriesEdited, setCaloriesEdited] = useState(false);
  const macroEstimate = Math.round(caloriesFromMacros(perServing));
  const caloriesOff =
    macroEstimate > 0 && Math.abs(perServing.calories - macroEstimate) > Math.max(30, macroEstimate * 0.25);
  const calorieWarning =
    parsed.caloriesCheck?.status === 'estimated' && !caloriesEdited
      ? `Calories couldn't be read from the label, so ${perServing.calories} kcal was estimated from protein, carbs and fat. Check the label and correct it if needed.`
      : caloriesOff
        ? `${perServing.calories} kcal doesn't match the protein, carbs and fat, which add up to about ${macroEstimate} kcal. Either the calorie number or one of protein, carbs or fat may have been misread — check them against the label.`
        : undefined;

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

        {calorieWarning && (
          <Card style={styles.warningCard}>
            <Text style={[type.h3, { marginBottom: spacing(1) }]}>⚠️ Check calories</Text>
            <Text style={[type.body, { marginBottom: spacing(3) }]}>{calorieWarning}</Text>
            {caloriesOff && (
              <Button
                title={`Use ${macroEstimate} kcal`}
                variant="secondary"
                onPress={() => {
                  setCaloriesEdited(true);
                  setPerServing(p => ({ ...p, calories: macroEstimate }));
                }}
              />
            )}
          </Card>
        )}

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
              onChange={v => {
                if (f.key === 'calories') setCaloriesEdited(true);
                setPerServing(p => ({
                  ...p,
                  [f.key]: v === undefined && ['calories', 'protein', 'carbs', 'fat'].includes(f.key) ? 0 : v,
                }));
              }}
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

        <ScanDiagnostics parsed={parsed} />
        <View style={{ height: spacing(10) }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Collapsible troubleshooting panel: what the OCR read and how calories were chosen. */
function ScanDiagnostics({ parsed }: { parsed: ParsedLabel }) {
  const [open, setOpen] = useState(false);
  const c = parsed.caloriesCheck;
  const statusText: Record<string, string> = {
    ok: 'matches protein/carbs/fat',
    unverified: 'not cross-checked (protein/carbs/fat not all read)',
    mismatch: "doesn't match protein/carbs/fat",
    estimated: 'not found on label — estimated from protein/carbs/fat',
  };
  const fieldNames: Record<string, string> = {
    calories: 'calories',
    protein: 'protein',
    carbs: 'carbs',
    fat: 'fat',
  };
  const missingMacros = (['calories', 'protein', 'carbs', 'fat'] as const)
    .filter(k => !parsed.detectedFields.includes(k))
    .map(k => fieldNames[k]);

  return (
    <View style={{ marginTop: spacing(4) }}>
      <Pressable onPress={() => setOpen(o => !o)} hitSlop={8}>
        <Text style={[type.small, styles.diagToggle]}>
          {open ? '▾ Hide scanned text' : '▸ Show scanned text (troubleshooting)'}
        </Text>
      </Pressable>
      {open && (
        <Card style={{ marginTop: spacing(2) }}>
          <SectionTitle>How calories were chosen</SectionTitle>
          <DiagRow label="Numbers considered" value={c?.candidates.length ? c.candidates.join(', ') : 'none found'} />
          {!!c?.rejected.length && (
            <DiagRow
              label="Ruled out as impossible"
              value={`${c.rejected.join(', ')} (over ${c.maxPlausible} kcal for a ${c.servingGrams} g serving)`}
            />
          )}
          <DiagRow label="Picked" value={c?.found ? `${parsed.nutrients.calories} kcal` : '—'} />
          {c?.macroEstimate !== undefined && (
            <DiagRow label="Protein/carbs/fat add up to" value={`≈ ${c.macroEstimate} kcal`} />
          )}
          <DiagRow label="Check" value={c ? statusText[c.status] : '—'} />
          {missingMacros.length > 0 && <DiagRow label="Not read from label" value={missingMacros.join(', ')} />}

          <Text style={[type.h3, { marginTop: spacing(4), marginBottom: spacing(2) }]}>Raw text from the scanner</Text>
          <Text selectable style={styles.rawText}>
            {parsed.rawText.trim() || '(no text was recognized)'}
          </Text>
          <Text style={[type.small, { marginTop: spacing(2), fontSize: 11 }]}>
            Long-press the text to copy it, or take a screenshot to share it.
          </Text>
        </Card>
      )}
    </View>
  );
}

function DiagRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.diagRow}>
      <Text style={[type.small, { flex: 1 }]}>{label}</Text>
      <Text style={[type.small, styles.diagValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  diagToggle: { color: colors.primary, fontWeight: '600', textAlign: 'center' },
  diagRow: { flexDirection: 'row', gap: spacing(3), paddingVertical: spacing(1) },
  diagValue: { flex: 1.4, color: colors.text, textAlign: 'right' },
  rawText: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 12,
    color: colors.text,
    backgroundColor: '#F2F4F0',
    borderRadius: radius.sm,
    padding: spacing(3),
  },
  header: { flexDirection: 'row', gap: spacing(3), marginBottom: spacing(3), alignItems: 'center' },
  warningCard: { backgroundColor: '#FFF8EA', borderColor: colors.carbs },
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
