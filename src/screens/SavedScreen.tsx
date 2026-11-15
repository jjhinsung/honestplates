import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradeBadge } from '../components/SafetyCard';
import { Card } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';
import { buildIngredientReport } from '../services/ingredientMatcher';
import { useNutritionStore, type FavoriteFood } from '../store/useNutritionStore';
import { colors, spacing, type } from '../theme';

function worthCount(f: FavoriteFood): number | undefined {
  const text = f.label.ingredients?.trim();
  return text ? buildIngredientReport(text, f.label.additiveTags).worthKnowing.length : undefined;
}

/** Foods the user saved with the heart button: a short list of what's actually good. */
export function SavedScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const favorites = useNutritionStore(s => s.favorites);
  const removeFavorite = useNutritionStore(s => s.removeFavorite);

  const confirmRemove = (f: FavoriteFood) =>
    Alert.alert('Remove from saved?', f.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeFavorite(f.id) },
    ]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(8) }}>
      <Text style={[type.small, { marginBottom: spacing(4) }]}>
        Foods you hearted because they're actually good.
      </Text>

      {favorites.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: spacing(2) }}>
          <Text style={{ fontSize: 32 }}>♡</Text>
          <Text style={type.h3}>Nothing saved yet</Text>
          <Text style={[type.small, { textAlign: 'center' }]}>
            Scan a food, and tap the heart at the top of the screen when it comes out clean.
          </Text>
        </Card>
      ) : (
        favorites.map(f => {
          const n = worthCount(f);
          return (
            <Pressable
              key={f.id}
              onPress={() => nav.navigate('LabelReview', { parsed: f.label })}
              onLongPress={() => confirmRemove(f)}
              accessibilityRole="button"
              accessibilityLabel={`${f.name}, grade ${f.grade}`}>
              <Card style={styles.row}>
                <GradeBadge grade={f.grade} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={type.h3} numberOfLines={2}>
                    {f.name}
                  </Text>
                  <Text style={type.small}>
                    {n === undefined ? 'No ingredient list saved' : n === 0 ? 'Nothing unusual in the ingredients' : `${n} ingredient${n === 1 ? '' : 's'} worth knowing`}
                    {' · '}score {f.score}
                  </Text>
                </View>
                <Pressable hitSlop={10} onPress={() => confirmRemove(f)} accessibilityLabel={`Remove ${f.name}`}>
                  <Text style={styles.heart}>♥</Text>
                </Pressable>
              </Card>
            </Pressable>
          );
        })
      )}
      {favorites.length > 0 && <Text style={[type.small, styles.hint]}>Tap the heart or long-press to remove.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  heart: { fontSize: 24, color: colors.primary },
  hint: { textAlign: 'center', marginTop: spacing(2), fontSize: 11 },
});
