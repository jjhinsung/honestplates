import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert } from 'react-native';
import { CameraCapture } from '../components/CameraCapture';
import type { RootStackParamList } from '../navigation/types';
import { isUsableParse } from '../services/labelParser';
import { scanNutritionLabel } from '../services/labelScanner';
import React, { useCallback, useRef, useState } from 'react';
import type { ScannedObjectType } from 'react-native-vision-camera';
import { lookupBarcode } from '../services/barcodeLookup';
import { tapHaptic } from '../services/haptics';

// Retail food barcodes. (US UPC-A codes arrive as EAN-13 with a leading 0 on iOS.)
const FOOD_BARCODES: ScannedObjectType[] = ['ean-13', 'ean-8', 'upc-e', 'itf-14'];
/** Ignore the same barcode for this long so one product isn't looked up repeatedly. */
const SAME_CODE_COOLDOWN_MS = 8000;

export function ScanLabelScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [busy, setBusy] = useState(false);

  const [busyText, setBusyText] = useState('Reading label…');
  const lookingUp = useRef(false);
  const lastCode = useRef<{ code: string; at: number } | undefined>(undefined);

  // Path 1: barcode → Open Food Facts. Fires automatically when a barcode is in view.
  const handleBarcode = useCallback(
    async (code: string) => {
      const now = Date.now();
      if (lookingUp.current || busy) return;
      if (lastCode.current?.code === code && now - lastCode.current.at < SAME_CODE_COOLDOWN_MS) return;
      lastCode.current = { code, at: now };
      lookingUp.current = true;
      tapHaptic(); // a barcode was captured
      setBusyText('Looking up barcode…');
      setBusy(true);
      try {
        const result = await lookupBarcode(code);
        if (result.status === 'found') {
          nav.navigate('LabelReview', { parsed: result.parsed });
        } else {
          Alert.alert(
          result.status === 'not-found' ? 'Product not found' : 'No nutrition data for this product',
          `${result.status === 'no-nutrition' && result.productName ? `${result.productName}: ` : ''}` +
            `barcode ${code} has no nutrition facts in Open Food Facts yet. ` +
            'Take a photo of the Nutrition Facts panel instead.',
          );
        }
      } catch (e: any) {
        Alert.alert('Barcode lookup failed', `${e?.message ?? e} You can take a photo of the label instead.`);
      } finally {
        lookingUp.current = false;
        setBusy(false);
      }
    },
    [busy, nav],
  );

  // Path 2 (unchanged): photo of the Nutrition Facts panel → on-device OCR.
  const handleCapture = async (photoPath: string) => {
    setBusyText('Reading label…');
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
          hint="Point at the barcode — or snap the Nutrition Facts panel"
          busy={busy}
          busyText={busyText}
          onCapture={handleCapture}
          barcodeTypes={FOOD_BARCODES}
          onBarcode={handleBarcode}
    />
  );
}
