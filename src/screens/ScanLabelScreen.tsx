import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraCapture } from '../components/CameraCapture';
import type { RootStackParamList } from '../navigation/types';
import { isUsableParse } from '../services/labelParser';
import { scanNutritionLabel } from '../services/labelScanner';
import React, { useCallback, useRef, useState } from 'react';
import type { ScannedObjectType } from 'react-native-vision-camera';
import { findBarcodeInPhoto } from '../services/barcodeImage';
import { lookupBarcode, type BarcodeLookupResult } from '../services/barcodeLookup';
import { lookupIngredients } from '../services/ingredientLookup';
import { tapHaptic } from '../services/haptics';
import { useCompareStore } from '../store/useCompareStore';
import type { ParsedLabel } from '../types';
import { colors, radius, spacing } from '../theme';

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
  const insets = useSafeAreaInsets();

  // Compare mode: a first product is waiting, so the next successful scan opens the comparison.
  const compareFirst = useCompareStore(s => s.first);
  const clearCompare = useCompareStore(s => s.clear);

  /** Shows a scanned product: the usual review page, or the comparison when a first product is waiting. */
  const openResult = useCallback(
    (parsed: ParsedLabel, photoPath?: string) => {
      const first = useCompareStore.getState().first;
      if (!first) {
        nav.navigate('LabelReview', { parsed, photoPath });
        return;
      }
      if (parsed.barcode && parsed.barcode === first.label.barcode) {
        Alert.alert('Same product', 'That is the same product. Scan a different one to compare.');
        return;
      }
      useCompareStore.getState().clear();
      nav.navigate('Compare', { a: first.label, b: parsed, aName: first.name });
    },
    [nav],
  );

  /** Ingredient report for a barcode whose product has no nutrition data. */
  const showIngredientsOnly = useCallback(
    async (code: string) => {
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
          Alert.alert('No ingredient list yet', 'This product has no ingredient list in Open Food Facts yet.');
        }
      } catch (e: any) {
        Alert.alert('Lookup failed', String(e?.message ?? e));
      } finally {
        setBusy(false);
      }
    },
    [nav],
  );

  /** Tell the user why a barcode didn't give nutrition info (not in the database, no data, or an error). */
  const explainBarcodeMiss = useCallback(
    (code: string, outcome: Exclude<BarcodeLookupResult, { status: 'found' }> | Error) => {
      if (outcome instanceof Error || !('status' in outcome)) {
        const msg = (outcome as Error)?.message ?? String(outcome);
        Alert.alert('Barcode lookup failed', `${msg} You can take a photo of the label instead.`);
      } else if (outcome.status === 'no-nutrition') {
        // No nutrition facts in the database, but there may still be an ingredient list
        // (this used to be the Ingredients tab's job).
        Alert.alert(
          'No nutrition data for this product',
          `${outcome.productName ? `${outcome.productName}: ` : ''}barcode ${code} has no nutrition facts in ` +
            'Open Food Facts yet. Take a photo of the Nutrition Facts panel to log it, or view its ingredients.',
          [
            { text: 'OK', style: 'cancel' },
            { text: 'View ingredients', onPress: () => showIngredientsOnly(code) },
          ],
        );
      } else {
        Alert.alert(
          'Product not found',
          `Barcode ${code} isn't in Open Food Facts yet. Take a photo of the Nutrition Facts panel instead.`,
        );
      }
    },
    [showIngredientsOnly],
  );

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
          openResult(result.parsed);
        } else {
          explainBarcodeMiss(code, result);
        }
      } catch (e: any) {
        explainBarcodeMiss(code, e);
      } finally {
        lookingUp.current = false;
        setBusy(false);
      }
    },
    [busy, openResult, explainBarcodeMiss],
  );

  // Path 2: photo of the Nutrition Facts panel → on-device OCR.
  // Camera-roll photos are checked for a barcode first, since the live barcode
  // detection only sees what's in front of the camera.
  const handleCapture = async (photoPath: string, source: 'camera' | 'library') => {
    setBusy(true);
    try {
      let barcodeMiss: { code: string; outcome: Exclude<BarcodeLookupResult, { status: 'found' }> | Error } | undefined;
      if (source === 'library') {
        setBusyText('Checking for a barcode…');
        const code = await findBarcodeInPhoto(photoPath);
        if (code) {
          tapHaptic(); // a barcode was captured
          setBusyText('Looking up barcode…');
          try {
            const result = await lookupBarcode(code);
            if (result.status === 'found') {
              openResult(result.parsed, photoPath);
              return;
            }
            barcodeMiss = { code, outcome: result };
          } catch (e: any) {
            barcodeMiss = { code, outcome: e instanceof Error ? e : new Error(String(e)) };
          }
        }
      }

      // No barcode, or the barcode had no nutrition data: read the label in the photo.
      setBusyText('Reading label…');
      const parsed = await scanNutritionLabel(photoPath);
      if (!isUsableParse(parsed) && barcodeMiss) {
        // Probably a photo of just the barcode, so the barcode result is the useful message.
        explainBarcodeMiss(barcodeMiss.code, barcodeMiss.outcome);
        return;
      }
      if (!isUsableParse(parsed)) {
        Alert.alert(
          "Couldn't read the whole label",
          'Fill the frame with the Nutrition Facts panel, avoid glare, and hold steady. You can also review and fill in the values by hand.',
          [
            { text: 'Retake', style: 'cancel' },
            { text: 'Review anyway', onPress: () => openResult(parsed, photoPath) },
          ],
        );
        return;
      }
      openResult(parsed, photoPath);
    } catch (e: any) {
      Alert.alert('Scan failed', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <CameraCapture
        overlay="label"
        hint={compareFirst ? 'Scan the second product to compare' : 'Point at the barcode — or snap the Nutrition Facts panel'}
        busy={busy}
        busyText={busyText}
        onCapture={handleCapture}
        barcodeTypes={FOOD_BARCODES}
        onBarcode={handleBarcode}
      />
      {compareFirst && (
        <View style={[styles.banner, { top: insets.top + spacing(2) }]} pointerEvents="box-none">
          <View style={styles.bannerBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>⇄ Comparing</Text>
              <Text style={styles.bannerText} numberOfLines={1}>
                {compareFirst.name} vs … scan the other product
              </Text>
            </View>
            <Pressable onPress={clearCompare} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel comparing">
              <Text style={styles.bannerCancel}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', left: spacing(4), right: spacing(4), zIndex: 10 },
  bannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(3),
  },
  bannerTitle: { color: '#fff', fontWeight: '800', fontSize: 13 },
  bannerText: { color: '#fff', fontSize: 12 },
  bannerCancel: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
