import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CATEGORY_ICON, ORIGIN_INFO, StatusBadge } from '../components/IngredientBits';
import { Button, Card } from '../components/ui';
import { INGREDIENT_BY_ID } from '../data/ingredientLibrary';
import type { RootScreenProps } from '../navigation/types';
import { explainIngredient, type AiExplanation } from '../services/ingredientExplainer';
import { useNutritionStore } from '../store/useNutritionStore';
import { colors, spacing, type } from '../theme';

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldTitle}>{title}</Text>
      <Text style={type.body}>{children}</Text>
    </View>
  );
}

/** One ingredient, explained in four short answers. */
export function IngredientDetailScreen({ route, navigation }: RootScreenProps<'IngredientDetail'>) {
  const { label, cardId } = route.params;
  const card = cardId ? INGREDIENT_BY_ID[cardId] : undefined;
  // Read-only: the AI server address set in Settings. Nothing is written to the store.
  const proxyUrl = useNutritionStore(s => s.aiProxyUrl);
  const [ai, setAi] = useState<AiExplanation>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: card?.name ?? label });
  }, [navigation, card, label]);

  const askAi = async () => {
    setLoading(true);
    setError(undefined);
    try {
      setAi(await explainIngredient(label, proxyUrl));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  if (card) {
    const origin = ORIGIN_INFO[card.origin];
    return (
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(4) }}>
        <Card>
          <Text style={type.h2}>
            {CATEGORY_ICON[card.category]} {card.name}
          </Text>
          {card.plain && <Text style={styles.plain}>→ {card.plain}</Text>}
          {label.toLowerCase() !== card.name.toLowerCase() && (
            <Text style={[type.small, { marginTop: spacing(1) }]}>On the label as "{label}"</Text>
          )}
          <View style={{ height: spacing(3) }} />
          <Field title="What it is">{card.what}</Field>
          <Field title="Why it's in your food">{card.why}</Field>
          <Field title="Where it comes from">
            {origin.icon} {card.from}
          </Field>
          <View style={styles.field}>
            <Text style={styles.fieldTitle}>Status</Text>
            <StatusBadge status={card.status} />
            <Text style={[type.body, { marginTop: spacing(1.5) }]}>{card.statusNote}</Text>
          </View>
          <Pressable onPress={() => Linking.openURL(card.source.url)} style={{ marginTop: spacing(2) }}>
            <Text style={styles.source}>Source: {card.source.label} ↗</Text>
          </Pressable>
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(4) }}>
      <Card>
        <Text style={type.h2}>{label}</Text>
        <View style={{ marginTop: spacing(2) }}>
          <StatusBadge />
        </View>
        {!ai && (
          <>
            <Text style={[type.body, { marginVertical: spacing(3), color: colors.textMuted }]}>
              This ingredient isn't in the HonestPlates library yet. You can ask the AI for a short explanation.
            </Text>
            <Button title="Explain with AI" onPress={askAi} loading={loading} />
            {error && <Text style={[type.small, { color: colors.danger, marginTop: spacing(2) }]}>{error}</Text>}
          </>
        )}
        {ai && (
          <>
            <Text style={styles.aiTag}>🤖 AI explanation, not verified</Text>
            <Field title="What it is">{ai.what}</Field>
            {!!ai.why && <Field title="Why it's in your food">{ai.why}</Field>}
            {!!ai.from && <Field title="Where it comes from">{ai.from}</Field>}
            <View style={styles.field}>
              <Text style={styles.fieldTitle}>Status</Text>
              <StatusBadge status={ai.status} />
              {!!ai.statusNote && <Text style={[type.body, { marginTop: spacing(1.5) }]}>{ai.statusNote}</Text>}
            </View>
          </>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  plain: { fontSize: 15, color: colors.protein, fontWeight: '600', marginTop: spacing(1) },
  field: { marginBottom: spacing(4) },
  fieldTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing(1),
  },
  source: { fontSize: 13, color: colors.protein, fontWeight: '500' },
  aiTag: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    backgroundColor: colors.track,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderRadius: 999,
    marginVertical: spacing(3),
  },
});
