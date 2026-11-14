import { useIsFocused } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { Button } from './ui';

const NO_CODES: ScannedObjectType[] = [];

/**
 * Full-screen camera with a shutter button. Calls `onCapture(filePath)`.
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
  onCapture: (path: string) => void | Promise<void>;
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
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.permission}>
        <Text style={type.body}>No camera available. (The iOS Simulator has no camera — run on a device.)</Text>
      </View>
    );
  }

  const shoot = async () => {
    if (capturing || busy) return;
    setCapturing(true);
    try {
      const file = await photoOutput.capturePhotoToFile({ flashMode: 'off' }, {});
      await onCapture(file.filePath);
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
          <Pressable accessibilityLabel="Take photo" onPress={shoot} style={styles.shutterOuter}>
            <View style={styles.shutterInner} />
          </Pressable>
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
