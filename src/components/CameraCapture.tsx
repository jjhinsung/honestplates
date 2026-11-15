import { useIsFocused } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  isScannedCode,
  useCameraDevice,
  useCameraPermission,
  useObjectOutput,
  usePhotoOutput,
  type ScannedObject,
  type ScannedObjectType,
} from 'react-native-vision-camera';
import { colors, spacing, type } from '../theme';
import { tapHaptic } from '../services/haptics';
import { Button } from './ui';

const NO_CODES: ScannedObjectType[] = [];

/**
 * Full-screen camera with a shutter button and a "Photos" button for picking an
 * existing picture from the camera roll. Both call `onCapture(filePath)`.
 * `overlay` draws a guide frame (label rectangle or plate circle).
 */
export function CameraCapture({
  onCapture,
  busy,
  busyText,
  hint,
  overlay = 'label',
  barcodeTypes,
  onBarcode,
}: {
  /** `source` says whether the photo was just taken or picked from the camera roll. */
  onCapture: (path: string, source: 'camera' | 'library') => void | Promise<void>;
  busy?: boolean;
  busyText?: string;
  hint: string;
  overlay?: 'label' | 'plate';
  barcodeTypes?: ScannedObjectType[];
  onBarcode?: (value: string) => void;
}) {
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', s => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const photoOutput = usePhotoOutput({ qualityPrioritization: 'balanced' });
  // Barcode detection runs alongside photo capture, so both features share one camera.
  const handleObjects = useCallback(
    (objects: ScannedObject[]) => {
      const code = objects.find(isScannedCode)?.value;
      if (code && onBarcode) onBarcode(code);
    },
    [onBarcode],
  );
  const objectOutput = useObjectOutput({ types: barcodeTypes ?? NO_CODES, onObjectsScanned: handleObjects });
  const outputs = barcodeTypes?.length ? [photoOutput, objectOutput] : [photoOutput];
  const insets = useSafeAreaInsets();
  const [capturing, setCapturing] = useState(false);

  /** Pick an existing photo. Uses the system picker, so no photo-library permission is needed. */
  const pickFromLibrary = async () => {
    if (capturing || busy) return;
    setCapturing(true);
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        assetRepresentationMode: 'compatible', // HEIC → JPEG, which the scanner and AI expect
        maxWidth: 3000, // big enough for small label text, small enough to process quickly
        maxHeight: 3000,
        quality: 0.9,
      });
      if (result.didCancel) return;
      const uri = result.assets?.[0]?.uri;
      if (result.errorCode || !uri) {
        Alert.alert("Couldn't open that photo", result.errorMessage ?? 'Try a different picture.');
        return;
      }
      await onCapture(uri, 'library');
    } finally {
      setCapturing(false);
    }
  };

  const libraryFallback = (
    <Button title="Choose from Photos" variant="secondary" onPress={pickFromLibrary} loading={busy || capturing} />
  );

  if (!hasPermission) {
    return (
      <View style={styles.permission}>
        <Text style={[type.h2, { textAlign: 'center' }]}>Camera access needed</Text>
        <Text style={[type.body, styles.permissionText]}>
          NutriLens uses the camera to read nutrition labels and recognize the food on your plate.
        </Text>
        {canRequestPermission ? (
          <Button title="Allow camera" onPress={requestPermission} />
        ) : (
          <Button title="Open Settings" onPress={() => Linking.openSettings()} />
        )}
        {libraryFallback}
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.permission}>
        <Text style={[type.body, styles.permissionText]}>
          No camera available (the iOS Simulator has no camera). You can still use a photo from your library.
        </Text>
        {libraryFallback}
        {busy && !!busyText && <Text style={[type.small, { textAlign: 'center' }]}>{busyText}</Text>}
      </View>
    );
  }

  const shoot = async () => {
    if (capturing || busy) return;
    tapHaptic(); // feel the shutter right away, before the photo finishes saving
    setCapturing(true);
    try {
      const file = await photoOutput.capturePhotoToFile({ flashMode: 'off' }, {});
      await onCapture(file.filePath, 'camera');
    } finally {
      setCapturing(false);
    }
  };

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isFocused && appActive}
        outputs={outputs}
        enableNativeTapToFocusGesture
        enableNativeZoomGesture
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
        <View style={overlay === 'label' ? styles.labelFrame : styles.plateFrame} />
      </View>
      <View style={[styles.hint, { top: insets.top + spacing(4) }]}>
        <Text style={styles.hintText}>{hint}</Text>
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing(6) }]}>
        {busy || capturing ? (
          <View style={styles.busy}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.hintText}>{busyText ?? 'Processing…'}</Text>
          </View>
        ) : (
          <View style={styles.controls}>
            <View style={styles.side}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose from photo library"
                onPress={pickFromLibrary}
                hitSlop={8}
                style={({ pressed }) => [styles.libraryBtn, pressed && { opacity: 0.7 }]}>
                <Text style={styles.libraryText}>Photos</Text>
              </Pressable>
            </View>
            <Pressable accessibilityLabel="Take photo" onPress={shoot} style={styles.shutterOuter}>
              <View style={styles.shutterInner} />
            </Pressable>
            <View style={styles.side} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  labelFrame: {
    width: '78%',
    aspectRatio: 0.62,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 16,
  },
  plateFrame: {
    width: '86%',
    aspectRatio: 1,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 999,
    borderStyle: 'dashed',
  },
  hint: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2),
    borderRadius: 999,
  },
  hintText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  side: { flex: 1, alignItems: 'center' },
  libraryBtn: {
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2.5),
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  libraryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  busy: {
    flexDirection: 'row',
    gap: spacing(2),
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(3),
    borderRadius: 999,
  },
  permission: { flex: 1, padding: spacing(8), justifyContent: 'center', gap: spacing(4), backgroundColor: colors.bg },
  permissionText: { textAlign: 'center', color: colors.textMuted },
});
