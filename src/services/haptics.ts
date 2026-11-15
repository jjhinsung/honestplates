import { HapticFeedbackTypes, trigger } from 'react-native-haptic-feedback';

/**
 * A small, light tap (iPhone Taptic Engine / Android short vibration).
 * Respects the system "Vibration"/"System Haptics" settings and never throws.
 */
export function tapHaptic() {
  try {
    trigger(HapticFeedbackTypes.impactLight, { enableVibrateFallback: false, ignoreAndroidSystemSettings: false });
  } catch {
    // Haptics are a nice-to-have; never let them break a capture.
  }
}
