import React, { useEffect, useState } from 'react';
import { ScrollView, TextInput } from 'react-native';
import { MealPicker } from '../components/MealPicker';
import { Button, Card, NumberField, SectionTitle } from '../components/ui';
import type { RootScreenProps } from '../navigation/types';
import { useNutritionStore } from '../store/useNutritionStore';
import { colors, spacing, type } from '../theme';
import type { Nutrients } from '../types';
import { guessMeal, toDateKey } from '../utils/nutrition';

export function ManualEntryScreen({ navigation, route }: RootScreenProps<'ManualEntry'>) {
  const addEntry = useNutritionStore(s => s.addEntry);
  const updateEntry = useNutritionStore(s => s.updateEntry);
  const showMeals = useNutritionStore(s => s.showMeals);
  // Reopened from the Today list: edit that entry instead of adding one.
  const entryId = route.params?.entryId;
  const existing = useNutritionStore(s => (entryId ? s.entries.find(e => e.id === entryId) : undefined));
  useEffect(() => {
    if (entryId) navigation.setOptions({ title: 'Logged food' });
  }, [entryId, navigation]);
  const [name, setName] = useState(existing?.name ?? '');
  const [meal, setMeal] = useState(existing?.meal ?? guessMeal());
  const [n, setN] = useState<Nutrients>(existing?.nutrients ?? { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const set = (k: keyof Nutrients) => (v: number | undefined) => setN(p => ({ ...p, [k]: v ?? 0 }));

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(4) }}>
      <Card>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Food name"
          placeholderTextColor={colors.textMuted}
          style={[type.h3, { paddingVertical: spacing(2) }]}
        />
        <NumberField label="Calories" unit="kcal" value={n.calories} onChange={set('calories')} />
        <NumberField label="Protein" unit="g" value={n.protein} onChange={set('protein')} />
        <NumberField label="Carbs" unit="g" value={n.carbs} onChange={set('carbs')} />
        <NumberField label="Fat" unit="g" value={n.fat} onChange={set('fat')} />
      </Card>
      {showMeals && (
        <Card>
          <SectionTitle>Meal</SectionTitle>
          <MealPicker value={meal} onChange={setMeal} />
        </Card>
      )}
      <Button
        title={existing ? 'Save changes' : 'Add'}
        disabled={!name.trim() || n.calories <= 0}
        onPress={() => {
          if (existing) updateEntry(existing.id, { name: name.trim(), meal, nutrients: n });
          else addEntry({ name: name.trim(), date: toDateKey(), meal, source: 'manual', servings: 1, nutrients: n });
          navigation.goBack();
        }}
      />
    </ScrollView>
  );
}
