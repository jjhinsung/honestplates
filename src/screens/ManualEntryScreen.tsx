import React, { useState } from 'react';
import { ScrollView, TextInput } from 'react-native';
import { MealPicker } from '../components/MealPicker';
import { Button, Card, NumberField, SectionTitle } from '../components/ui';
import type { RootScreenProps } from '../navigation/types';
import { useNutritionStore } from '../store/useNutritionStore';
import { colors, spacing, type } from '../theme';
import type { Nutrients } from '../types';
import { guessMeal, toDateKey } from '../utils/nutrition';

export function ManualEntryScreen({ navigation }: RootScreenProps<'ManualEntry'>) {
  const addEntry = useNutritionStore(s => s.addEntry);
  const [name, setName] = useState('');
  const [meal, setMeal] = useState(guessMeal());
  const [n, setN] = useState<Nutrients>({ calories: 0, protein: 0, carbs: 0, fat: 0 });

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
      <Card>
        <SectionTitle>Meal</SectionTitle>
        <MealPicker value={meal} onChange={setMeal} />
      </Card>
      <Button
        title="Add"
        disabled={!name.trim() || n.calories <= 0}
        onPress={() => {
          addEntry({ name: name.trim(), date: toDateKey(), meal, source: 'manual', servings: 1, nutrients: n });
          navigation.goBack();
        }}
      />
    </ScrollView>
  );
}
