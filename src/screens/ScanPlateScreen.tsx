import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert } from 'react-native';
import { CameraCapture } from '../components/CameraCapture';
import type { RootStackParamList } from '../navigation/types';
import { analyzePlate } from '../services/plateRecognition';
import { useNutritionStore } from '../store/useNutritionStore';

export function ScanPlateScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const proxyUrl = useNutritionStore(s => s.aiProxyUrl);
  const [busy, setBusy] = useState(false);

  const handleCapture = async (photoPath: string) => {
    setBusy(true);
    try {
      const analysis = await analyzePlate(photoPath, proxyUrl);
      if (analysis.items.length === 0) {
        Alert.alert('No food found', analysis.notes ?? 'Try again with the whole plate in view.');
        return;
      }
      nav.navigate('PlateReview', { analysis, photoPath });
    } catch (e: any) {
      Alert.alert('Plate recognition failed', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CameraCapture
      overlay="plate"
      hint="Shoot from above with the whole plate in view"
      busy={busy}
      busyText="Recognizing food…"
      onCapture={handleCapture}
    />
  );
}
