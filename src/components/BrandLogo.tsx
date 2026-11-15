import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, spacing } from '../theme';

/** Placeholder mark (fork and spoon). Swap for the hand-drawn logo image when it's ready. */
function ForkSpoon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {/* fork */}
      <Path d="M6 3v6a2.5 2.5 0 0 0 5 0V3M8.5 3v18" />
      {/* spoon */}
      <Path d="M18 21V11M18 11c-2 0-3-2-3-4.5S16.2 3 18 3s3 1.5 3 3.5S20 11 18 11Z" />
    </Svg>
  );
}

export function BrandLogo() {
  return (
    <View style={styles.row} accessibilityRole="header">
      <ForkSpoon size={26} color={colors.primary} />
      <Text style={styles.word}>honestplates</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: spacing(2), marginBottom: spacing(3) },
  word: { fontFamily: 'Fraunces-Bold', fontSize: 26, color: colors.text, letterSpacing: -0.3 },
});
