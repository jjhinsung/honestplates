import { tapHaptic } from '../services/haptics';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MacroLine } from '../components/MacroBars';
import { MealPicker } from '../components/MealPicker';
import { SafetyCard } from '../components/SafetyCard';
import { Button, Card, NumberField, SectionTitle, Stepper } from '../components/ui';
import type { RootScreenProps } from '../navigation/types';
import { toFileUri } from '../services/imageUtils';
import { detectAllergens, splitIngredients } from '../services/ingredientParser';
import { rateLabel } from '../services/safetyRating';
import { useNutritionStore } from '../store/useNutritionStore';
import { colors, radius, spacing, type } from '../theme';
import type { Nutrients, ParsedLabel } from '../types';
import { caloriesFromMacros, guessMeal, scaleNutrients, summarizeDay, toDateKey } from '../utils/nutrition';
import { PersonalVerdictCard } from '../components/PersonalVerdictCard';
import { householdVerdicts, personalVerdict } from '../services/personalVerdict';
import { HouseholdVerdicts } from '../components/HouseholdVerdicts';
import { RecallCard } from '../components/RecallCard';
import { GmoCard } from '../components/GmoCard';
import { checkGmo } from '../services/gmoCheck';
import { findRecalls, getActiveRecalls, type Recall } from '../services/recallCheck';

type NutrientValues = { [K in keyof Nutrients]?: number };

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
  const showMeals = useNutritionStore(s => s.showMeals);

    const [name, setName] = useState(parsed.productName ?? '');
  // Every scanned value stays editable. Fields hold exactly what the user typed
  // (undefined = cleared), so clearing a recognized number doesn't snap back to 0.
  const [values, setValues] = useState<NutrientValues>(() => ({ ...parsed.nutrients }));
  const [servingSize, setServingSize] = useState(parsed.servingSize ?? '');
  const [servingsPerContainer, setServingsPerContainer] = useState(parsed.servingsPerContainer);
  const [servings, setServings] = useState(1);
  const [meal, setMeal] = useState(guessMeal());
  const [ingredients, setIngredients] = useState(parsed.ingredients ?? '');

  // Show a tappable preview when there's a list; start in edit mode when there isn't.
  const [editingIngredients, setEditingIngredients] = useState(!parsed.ingredients?.trim());

  // Text coming back from the "Scan ingredient list" camera replaces the box and shows the preview.
  const scannedIngredients = route.params.scannedIngredients;
  useEffect(() => {
    if (scannedIngredients) {
      setIngredients(scannedIngredients);
      setEditingIngredients(false);
    }
  }, [scannedIngredients]);

  const scanIngredientList = () => {
    tapHaptic();
    navigation.navigate('IngredientsScan', { returnKey: route.key });
  };

  /** Open the ingredient-by-ingredient report for whatever is in the box now (edits included). */
  const openIngredientReport = () => {
    if (!ingredients.trim()) return;
    tapHaptic();
    navigation.navigate('IngredientReport', {
      ingredientsText: ingredients,
      additiveTags: parsed.additiveTags,
      labelText: parsed.rawText,
      labelTags: parsed.labelTags,
      productName: name.trim() || parsed.productName,
      barcode: parsed.barcode,
      source: parsed.source === 'barcode' ? 'barcode' : 'photo',
    });
  };

  const perServing = useMemo<Nutrients>(
    () => ({
      ...values,
      calories: values.calories ?? 0,
      protein: values.protein ?? 0,
      carbs: values.carbs ?? 0,
      fat: values.fat ?? 0,
    }),
    [values],
  );
  const editedFields = FIELDS.filter(f => values[f.key] !== parsed.nutrients[f.key]).map(f => f.key);
  const caloriesEdited = editedFields.includes('calories');

  // Allergens and rating are recomputed live as the user corrects the scan.
  const allergens = useMemo(
    () => detectAllergens(ingredients, parsed.containsStatement),
    [ingredients, parsed.containsStatement],
  );
  const ingredientCount = useMemo(() => splitIngredients(ingredients).length, [ingredients]);
  const rating = useMemo(
    () => rateLabel(perServing, ingredients, allergens),
    [perServing, ingredients, allergens],
  );
  const total = useMemo(() => scaleNutrients(perServing, servings), [perServing, servings]);
  // Personal verdict: the user's profile + what they've already eaten today.
  const profile = useNutritionStore(s => s.profile);
  const entries = useNutritionStore(s => s.entries);
  const today = useMemo(() => summarizeDay(entries, toDateKey()).totals, [entries]);
  const verdict = useMemo(
    () => personalVerdict({ profile, item: total, ingredients, allergens, today }),
    [profile, total, ingredients, allergens, today],
  );
  // GMO check (optional in Settings), recomputed as the ingredient list is edited.
  const gmoCheckOn = useNutritionStore(s => s.gmoCheck);
  const gmo = useMemo(
    () => (gmoCheckOn ? checkGmo({ ingredients, labelText: parsed.rawText, labelTags: parsed.labelTags }) : undefined),
    [gmoCheckOn, ingredients, parsed.rawText, parsed.labelTags],
  );
  const household = useNutritionStore(s => s.household);
  const householdRows = useMemo(
    () => householdVerdicts({ household, ingredients, allergens }),
    [household, ingredients, allergens],
  );

  // Calorie sanity check: compare against 4·protein + 4·carbs + 9·fat (updates as the user edits).
  const macroEstimate = Math.round(caloriesFromMacros(perServing));
  const caloriesOff =
    macroEstimate > 0 && Math.abs(perServing.calories - macroEstimate) > Math.max(30, macroEstimate * 0.25);
  const calorieWarning =
    parsed.caloriesCheck?.status === 'estimated' && !caloriesEdited
      ? `Calories couldn't be read from the label, so ${perServing.calories} kcal was estimated from protein, carbs and fat. Check the label and correct it if needed.`
      : caloriesOff
        ? `${perServing.calories} kcal doesn't match the protein, carbs and fat, which add up to about ${macroEstimate} kcal. Either the calorie number or one of protein, carbs or fat may have been misread — check them against the label.`
        : undefined;
    
  // FDA recalls: load the (daily-cached) list once, then match barcode/name as the user edits.
  const [recalls, setRecalls] = useState<Recall[]>([]);
  useEffect(() => {
    let alive = true;
    getActiveRecalls()
      .then(r => alive && setRecalls(r))
      .catch(() => {}); // offline: no recall check, the rest of the screen still works
    return () => {
      alive = false;
    };
  }, []);
  const recallMatches = useMemo(
    () => findRecalls({ barcode: parsed.barcode, name: name.trim() || parsed.productName }, recalls),
    [recalls, parsed.barcode, parsed.productName, name],
  );
    
  const save = () => {
    addEntry({
      name: name.trim() || 'Packaged food',
      date: toDateKey(),
      meal,
      source: 'label',
      servings,
      servingDescription: servingSize.trim() || undefined,
      nutrients: total,
      safety: rating,
      barcode: parsed.barcode, // so the Today tab can re-check it against future recalls
    });
    navigation.popToTop();
    navigation.navigate('Tabs', { screen: 'Today' });
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(4) }}>
        <View style={styles.header}>
          {photoPath ? (
            <Image source={{ uri: toFileUri(photoPath) }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.barcodeThumb]}>
              <Text style={{ fontSize: 34 }}>🏷️</Text>
            </View>
          )}
          <View style={{ flex: 1, gap: spacing(1) }}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Food name (e.g. Granola bar)"
              placeholderTextColor={colors.textMuted}
              style={styles.nameInput}
            />
            {parsed.source === 'barcode' && (
              <Text style={type.small}>Barcode {parsed.barcode} · data from Open Food Facts</Text>
            )}
            <View style={styles.servingRow}>
              <Text style={type.small}>Serving size</Text>
              <TextInput
                value={servingSize}
                onChangeText={setServingSize}
                placeholder="e.g. 2/3 cup (55g)"
                placeholderTextColor={colors.textMuted}
                style={styles.servingInput}
              />
            </View>
            <View style={styles.servingRow}>
              <Text style={type.small}>Servings per container</Text>
              <TextInput
                value={servingsPerContainer === undefined ? '' : String(servingsPerContainer)}
                onChangeText={t => {
                  const n = parseFloat(t.replace(/[^0-9.]/g, ''));
                  setServingsPerContainer(Number.isNaN(n) ? undefined : n);
                }}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={colors.textMuted}
                style={[styles.servingInput, { flex: 0, width: 56, textAlign: 'right' }]}
              />
            </View>
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
                onPress={() => setValues(v => ({ ...v, calories: macroEstimate }))}
              />
            )}
          </Card>
        )}

          <PersonalVerdictCard
            verdict={verdict}
            onSetUp={() => navigation.navigate('Tabs', { screen: 'Settings' })}
          />
          <HouseholdVerdicts rows={householdRows} />
        <SafetyCard rating={rating} />
        {gmo && <GmoCard result={gmo} />}
        <Card>
          <SectionTitle
            right={
              <View style={styles.linkRow}>
                <Pressable onPress={scanIngredientList} hitSlop={8}>
                  <Text style={styles.link}>📷 Scan list</Text>
                </Pressable>
                {parsed.ingredients && ingredients !== parsed.ingredients ? (
                  <Pressable onPress={() => setIngredients(parsed.ingredients ?? '')} hitSlop={8}>
                    <Text style={styles.link}>Reset to scan</Text>
                  </Pressable>
                ) : null}
                {ingredients.trim() ? (
                  <Pressable onPress={() => setEditingIngredients(e => !e)} hitSlop={8}>
                    <Text style={styles.link}>{editingIngredients ? 'Done' : 'Edit'}</Text>
                  </Pressable>
                ) : null}
              </View>
            }>
            Ingredients
          </SectionTitle>
          {editingIngredients || !ingredients.trim() ? (
            <TextInput
              value={ingredients}
              onChangeText={setIngredients}
              multiline
              autoFocus={editingIngredients && !!parsed.ingredients}
              placeholder="Not detected — scan the ingredient list or paste it here for a better rating."
              placeholderTextColor={colors.textMuted}
              style={styles.ingredients}
            />
          ) : (
            <View style={{ gap: spacing(2) }}>
              <Pressable
                onPress={openIngredientReport}
                accessibilityRole="button"
                accessibilityLabel={`See what's in it. Opens a breakdown of ${ingredientCount} ingredients.`}
                style={({ pressed }) => [styles.seeButton, pressed && styles.previewPressed]}>
                <Text style={styles.seeButtonText}>
                  🔍 See what's in it{ingredientCount > 0 ? ` (${ingredientCount})` : ''}
                </Text>
                <Text style={styles.seeButtonArrow}>›</Text>
              </Pressable>
              <View style={styles.ingredientPreview}>
                <Text style={styles.previewText} numberOfLines={4}>
                  {ingredients}
                </Text>
              </View>
            </View>
          )}
          {ingredientCount > 0 && (
            <Text style={[type.small, { marginTop: spacing(2) }]}>
              {ingredientCount} {ingredientCount === 1 ? 'ingredient' : 'ingredients'}
              {allergens.length ? ` · Allergens: ${allergens.join(', ')}` : ''}
            </Text>
          )}
          {!!parsed.containsStatement && (
            <Text style={[type.small, { marginTop: spacing(1) }]}>Label says contains: {parsed.containsStatement}</Text>
          )}
        </Card>

          <RecallCard matches={recallMatches} />

        <Card>
          <SectionTitle>{showMeals ? 'Meal' : 'Servings'}</SectionTitle>
          {showMeals && <MealPicker value={meal} onChange={setMeal} />}
          <View style={[styles.servingsEaten, showMeals && { marginTop: spacing(3) }]}>
            <Text style={type.small}>Servings eaten</Text>
            <Stepper value={servings} onChange={setServings} />
            <Text style={[type.h3, type.num, { marginLeft: 'auto' }]}>{Math.round(total.calories)} kcal</Text>
          </View>
        </Card>

        <Button title={`Add ${Math.round(total.calories)} kcal to today`} onPress={save} />

        <Card>
          <SectionTitle
            right={
              editedFields.length > 0 ? (
                <Pressable onPress={() => setValues({ ...parsed.nutrients })} hitSlop={8}>
                  <Text style={styles.link}>Reset to scan</Text>
                </Pressable>
              ) : undefined
            }>
            Per serving
          </SectionTitle>
          <Text style={[type.small, { marginBottom: spacing(2) }]}>
            Tap any number to change it, including ones the scanner read. Yellow fields weren't found on the
            label; green fields are ones you changed.
          </Text>
          {FIELDS.map(f => (
            <NumberField
              key={f.key}
              label={f.label}
              unit={f.unit}
              value={values[f.key]}
              highlight={!parsed.detectedFields.includes(f.key) && !editedFields.includes(f.key)}
              edited={editedFields.includes(f.key)}
              onChange={v => setValues(p => ({ ...p, [f.key]: v }))}
            />
          ))}
        </Card>

        {parsed.source !== 'barcode' && <ScanDiagnostics parsed={parsed} />}
        {parsed.source === 'barcode' && (
          <Text style={[type.small, { textAlign: 'center', marginTop: spacing(4), fontSize: 11 }]}>
            Nutrition data from Open Food Facts (openfoodfacts.org), available under the ODbL licence.
            Community-maintained — check it against the package.
          </Text>
        )}
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
  link: { ...type.small, color: colors.primary, fontWeight: '600' },
  servingsEaten: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  servingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  servingInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing(0.5),
  },
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
  barcodeThumb: { alignItems: 'center', justifyContent: 'center' },
  linkRow: { flexDirection: 'row', gap: spacing(4) },
  ingredientPreview: {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.sm,
  padding: spacing(3),
    backgroundColor: '#FAFBF9',
  },
  previewPressed: { opacity: 0.7 },
  seeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
    borderRadius: radius.md,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(4),
  },
  seeButtonText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  seeButtonArrow: { fontSize: 22, fontWeight: '700', color: colors.primary },
  previewText: { fontSize: 14, color: colors.text, lineHeight: 20 },
    previewFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing(2),
    },
});
