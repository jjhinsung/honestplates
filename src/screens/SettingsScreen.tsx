import React, { useState } from 'react';
import { Alert, ScrollView, Text, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, NumberField, SectionTitle } from '../components/ui';
import { useNutritionStore } from '../store/useNutritionStore';
import { colors, radius, spacing, type } from '../theme';
import { caloriesFromMacros } from '../utils/nutrition';
import { HealthProfileCard } from '../components/HealthProfileCard';

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { goals, setGoals, aiProxyUrl, setAiProxyUrl, clearAll, entries } = useNutritionStore();
  const [url, setUrl] = useState(aiProxyUrl);
  const [testing, setTesting] = useState(false);

  const macroKcal = Math.round(caloriesFromMacros({ ...goals }));

  const testConnection = async () => {
    setAiProxyUrl(url);
    setTesting(true);
    try {
      const r = await fetch(`${url.replace(/\/+$/, '')}/health`);
      const j = await r.json();
      Alert.alert('Connected', `AI proxy is up (model: ${j.model}).`);
    } catch {
      Alert.alert('Not reachable', `Couldn't reach ${url}/health`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing(4), paddingTop: insets.top + spacing(2) }}>
      <Text style={[type.h1, { marginBottom: spacing(4) }]}>Settings</Text>

      <Card>
        <SectionTitle>Daily goals</SectionTitle>
        <NumberField label="Calories" unit="kcal" value={goals.calories} onChange={v => v && setGoals({ calories: v })} />
        <NumberField label="Protein" unit="g" value={goals.protein} onChange={v => v && setGoals({ protein: v })} />
        <NumberField label="Carbs" unit="g" value={goals.carbs} onChange={v => v && setGoals({ carbs: v })} />
        <NumberField label="Fat" unit="g" value={goals.fat} onChange={v => v && setGoals({ fat: v })} />
        <Text style={[type.small, { marginTop: spacing(2) }]}>
          Your macro goals add up to {macroKcal} kcal
          {Math.abs(macroKcal - goals.calories) > 100 ? ` (calorie goal is ${goals.calories})` : ''}.
        </Text>
      </Card>
          
          <HealthProfileCard />
          
      <Card>
        <SectionTitle>AI plate recognition</SectionTitle>
        <Text style={[type.small, { marginBottom: spacing(2) }]}>
          URL of your NutriLens proxy server (see server/README). Photos are sent here for analysis.
        </Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          onBlur={() => setAiProxyUrl(url)}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.sm,
            padding: spacing(3),
            fontSize: 15,
            color: colors.text,
            marginBottom: spacing(3),
          }}
        />
        <Button title="Test connection" variant="secondary" loading={testing} onPress={testConnection} />
      </Card>

      <Card>
        <SectionTitle>Data</SectionTitle>
        <Text style={[type.small, { marginBottom: spacing(3) }]}>
          {entries.length} entries stored on this device.
        </Text>
        <Button
          title="Delete all entries"
          variant="danger"
          onPress={() =>
            Alert.alert('Delete all entries?', 'This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: clearAll },
            ])
          }
        />
      </Card>
    </ScrollView>
  );
}
