import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert } from 'react-native';
import { CameraCapture } from '../components/CameraCapture';
import type { RootStackParamList } from '../navigation/types';
import { isUsableParse } from '../services/labelParser';
import { scanNutritionLabel } from '../services/labelScanner';

export function ScanLabelScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [busy, setBusy] = useState(false);

  const handleCapture = async (photoPath: string) => {
    setBusy(true);
    try {
      const parsed = await scanNutritionLabel(photoPath);
      if (!isUsableParse(parsed)) {
        Alert.alert(
          "Couldn't read the whole label",
          'Fill the frame with the Nutrition Facts panel, avoid glare, and hold steady. You can also review and fill in the values by hand.',
          [
            { text: 'Retake', style: 'cancel' },
            { text: 'Review anyway', onPress: () => nav.navigate('LabelReview', { parsed, photoPath }) },
          ],
        );
        return;
      }
      nav.navigate('LabelReview', { parsed, photoPath });
    } catch (e: any) {
      Alert.alert('Scan failed', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CameraCapture
      overlay="label"
      hint="Fit the Nutrition Facts panel (and ingredients) in the frame"
      busy={busy}
      busyText="Reading label…"
      onCapture={handleCapture}
    />
  );
}
