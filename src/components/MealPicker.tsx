import React from 'react';
import { View } from 'react-native';
import type { MealType } from '../types';
import { spacing } from '../theme';
import { Chip } from './ui';

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function MealPicker({ value, onChange }: { value: MealType; onChange: (m: MealType) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) }}>
      {MEALS.map(m => (
        <Chip
          key={m}
          label={m[0].toUpperCase() + m.slice(1)}
          selected={value === m}
          onPress={() => onChange(m)}
        />
      ))}
    </View>
  );
}
