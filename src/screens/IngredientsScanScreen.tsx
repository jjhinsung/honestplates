import { CommonActions } from '@react-navigation/native';
import React, { useState } from 'react';
import { Alert } from 'react-native';
import { CameraCapture } from '../components/CameraCapture';
import type { RootScreenProps } from '../navigation/types';
import { scanIngredientList } from '../services/ingredientLookup';

/**
 * Opened from the Review label screen ("📷 Scan list") when the ingredient list is
 * on a different side of the package than the Nutrition Facts panel. Reads the list
 * with on-device OCR and hands the text back to that Review label screen.
 * (Barcodes are handled by the Label tab, so this camera only takes photos.)
 */
export function IngredientsScanScreen({ route, navigation }: RootScreenProps<'IngredientsScan'>) {
  const { returnKey } = route.params;
  const [busy, setBusy] = useState(false);

  const handleCapture = async (photoPath: string) => {
    setBusy(true);
    try {
      const text = await scanIngredientList(photoPath);
      if (!text) {
        Alert.alert(
          "Couldn't find an ingredient list",
          'Fill the frame with the ingredient list (starting at "Ingredients:"), avoid glare, and hold steady.',
        );
        return;
      }
      // Put the text on the Review label screen that opened us, then go back to it.
      navigation.dispatch({ ...CommonActions.setParams({ scannedIngredients: text }), source: returnKey });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Scan failed', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CameraCapture
      overlay="label"
      hint='Fill the frame with the ingredient list, starting at "Ingredients:"'
      busy={busy}
      busyText="Reading ingredients…"
      onCapture={handleCapture}
    />
  );
}
