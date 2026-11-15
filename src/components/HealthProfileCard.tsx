import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SUGGESTED_LIMITS } from '../services/personalVerdict';
import { useNutritionStore } from '../store/useNutritionStore';
import { colors, radius, spacing, type } from '../theme';
import type { DietRule, FdaAllergen, WatchedLimits } from '../types';
import { Card, Chip, NumberField, SectionTitle } from './ui';

export const ALLERGENS: FdaAllergen[] = ['Milk', 'Eggs', 'Fish', 'Shellfish', 'Tree nuts', 'Peanuts', 'Wheat', 'Soy', 'Sesame'];
export const DIETS: { key: DietRule; label: string }[] = [
  { key: 'vegan', label: 'Vegan' },
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'gluten-free', label: 'Gluten-free' },
];
const LIMITS: { key: keyof WatchedLimits; label: string; unit: string }[] = [
  { key: 'sodium', label: 'Sodium', unit: 'mg' },
  { key: 'addedSugar', label: 'Added sugar', unit: 'g' },
  { key: 'saturatedFat', label: 'Saturated fat', unit: 'g' },
];

export const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter(x => x !== item) : [...list, item]);

/** Settings section for the personal verdict: allergies, diet, watched limits, avoided ingredients. */
export function HealthProfileCard() {
  const profile = useNutritionStore(s => s.profile);
  const setProfile = useNutritionStore(s => s.setProfile);
  const [avoidText, setAvoidText] = useState(profile.avoidIngredients.join(', '));

  const setLimit = (key: keyof WatchedLimits, value: number | undefined) => {
    const limits = { ...profile.limits };
    if (value === undefined) delete limits[key];
    else limits[key] = value;
    setProfile({ limits });
  };

  return (
    <Card>
      <SectionTitle>Your health profile</SectionTitle>
      <Text style={[type.small, { marginBottom: spacing(3) }]}>
        Used for the "For you" verdict when you scan food. Stored only on this phone.
      </Text>

      <Text style={styles.heading}>Allergies</Text>
      <View style={styles.chips}>
        {ALLERGENS.map(a => (
          <Chip
            key={a}
            label={a}
            selected={profile.allergies.includes(a)}
            onPress={() => setProfile({ allergies: toggle(profile.allergies, a) })}
          />
        ))}
      </View>

      <Text style={styles.heading}>Diet</Text>
      <View style={styles.chips}>
        {DIETS.map(d => (
          <Chip
            key={d.key}
            label={d.label}
            selected={profile.diets.includes(d.key)}
            onPress={() => setProfile({ diets: toggle(profile.diets, d.key) })}
          />
        ))}
      </View>

      <Text style={styles.heading}>Daily limits to watch</Text>
      <View style={styles.chips}>
        {LIMITS.map(l => (
          <Chip
            key={l.key}
            label={l.label}
            selected={profile.limits[l.key] !== undefined}
            onPress={() =>
              setLimit(l.key, profile.limits[l.key] === undefined ? SUGGESTED_LIMITS[l.key] : undefined)
            }
          />
        ))}
      </View>
      {LIMITS.filter(l => profile.limits[l.key] !== undefined).map(l => (
        <NumberField
          key={l.key}
          label={`${l.label} per day`}
          unit={l.unit}
          value={profile.limits[l.key]}
          onChange={v => v && setLimit(l.key, v)}
        />
      ))}
      {Object.keys(profile.limits).length > 0 && (
        <Text style={[type.small, { fontSize: 11 }]}>
          Starting values follow American Heart Association guidance. Adjust them to what your doctor recommends.
        </Text>
      )}

      <Text style={styles.heading}>Ingredients I avoid</Text>
      <TextInput
        value={avoidText}
        onChangeText={setAvoidText}
        onBlur={() =>
          setProfile({
            avoidIngredients: avoidText
              .split(',')
              .map(w => w.trim())
              .filter(Boolean),
          })
        }
        placeholder="e.g. aspartame, coconut, red 40"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        style={styles.input}
      />
      <Text style={[type.small, { marginTop: spacing(3), fontSize: 11 }]}>
        Checks only what's in the scanned ingredient list and can miss "may contain" warnings. Always read the
        package if you have a serious allergy. Not medical advice.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: { ...type.h3, fontSize: 14, marginTop: spacing(3), marginBottom: spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing(3),
    fontSize: 15,
    color: colors.text,
  },
});
