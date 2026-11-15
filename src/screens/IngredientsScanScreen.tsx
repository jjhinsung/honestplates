import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { ScannedObjectType } from 'react-native-vision-camera';
import { CameraCapture } from '../components/CameraCapture';
import type { RootStackParamList } from '../navigation/types';
import { lookupIngredients, scanIngredientList } from '../services/ingredientLookup';

const FOOD_BARCODES: ScannedObjectType[] = ['ean-13', 'ean-8', 'upc-e', 'itf-14'];
const SAME_CODE_COOLDOWN_MS = 8000;

/**
 * Ingredients tab: point at a barcode (automatic) or photograph the ingredient list.
 * Only explains ingredients; it never logs food or changes calories.
 */
export function IngredientsScanScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState('Reading ingredients…');
  const lookingUp = useRef(false);
  const lastCode = useRef<{ code: string; at: number } | undefined>(undefined);

  const handleBarcode = useCallback(
    async (code: string) => {
      const now = Date.now();
      if (lookingUp.current) return;
      if (lastCode.current?.code === code && now - lastCode.current.at < SAME_CODE_COOLDOWN_MS) return;
      lastCode.current = { code, at: now };
      lookingUp.current = true;
      setBusyText('Looking up ingredients…');
      setBusy(true);
      try {
        const r = await lookupIngredients(code);
        if (r.status === 'found') {
          nav.navigate('IngredientReport', {
            ingredientsText: r.ingredientsText,
            additiveTags: r.additiveTags,
            productName: r.productName,
            barcode: r.barcode,
            source: 'barcode',
          });
        } else {
          Alert.alert(
            r.status === 'not-found' ? 'Product not found' : 'No ingredient list yet',
            `${r.status === 'no-ingredients' && r.productName ? `${r.productName}: ` : ''}` +
              'this product has no ingredient list in Open Food Facts yet. ' +
              'Take a photo of the ingredient list instead.',
          );
        }
      } catch (e: any) {
        Alert.alert('Lookup failed', `${e?.message ?? e} You can take a photo of the ingredient list instead.`);
      } finally {
        lookingUp.current = false;
        setBusy(false);
      }
    },
    [nav],
  );

  const handleCapture = async (photoPath: string) => {
    setBusyText('Reading ingredients…');
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
      nav.navigate('IngredientReport', { ingredientsText: text, source: 'photo' });
    } catch (e: any) {
      Alert.alert('Scan failed', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CameraCapture
      overlay="label"
      hint="Point at the barcode, or snap the ingredient list"
      busy={busy}
      busyText={busyText}
      onCapture={handleCapture}
      barcodeTypes={FOOD_BARCODES}
      onBarcode={handleBarcode}
    />
  );
}
