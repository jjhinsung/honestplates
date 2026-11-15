import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, type } from '../theme';

export function CalorieRing({
  consumed,
  goal,
  size = 160,
  stroke = 24,
}: {
  consumed: number;
  goal: number;
  size?: number;
  stroke?: number;
}) {
  // The ring, badge and numbers all follow `shown`, which fills up from 0 when the
  // ring appears and glides to the new total when food is added or removed.
  const shown = useAnimatedNumber(consumed);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(shown / goal, 1) : 0;
  const over = shown > goal;
  const remaining = Math.round(goal - shown);
  const ringColor = over ? colors.danger : colors.calories;
  const finalPercent = goal > 0 ? Math.round((consumed / goal) * 100) : 0;

  // Percentage badge sits on the end of the arc (the arc starts at 12 o'clock, clockwise).
  const percent = goal > 0 ? Math.round((shown / goal) * 100) : 0;
  const angle = 2 * Math.PI * pct - Math.PI / 2;
  const badgeX = size / 2 + r * Math.cos(angle);
  const badgeY = size / 2 + r * Math.sin(angle);
  // The badge lies along the ring (tangent to it) so it fits inside the stroke at any
  // position; on the bottom half it's turned the other way so the text isn't upside down.
  const tangentDeg = (angle * 180) / Math.PI + 90;
  const badgeRotation = Math.sin(angle) > 1e-6 ? tangentDeg + 180 : tangentDeg;
  const badgeH = stroke - 4;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={ringColor}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={[type.h1, type.num]}>{Math.round(shown)}</Text>
        <Text style={type.small}>of {goal} kcal</Text>
        <Text style={[type.small, { color: over ? colors.danger : colors.primary, marginTop: 2 }]}>
          {over ? `${-remaining} over` : `${remaining} left`}
        </Text>
      </View>
      <View
        pointerEvents="none"
        accessibilityLabel={`${finalPercent}% of calorie goal eaten`}
        style={[
          styles.badge,
          {
            backgroundColor: ringColor,
            height: badgeH,
            borderRadius: badgeH / 2,
            left: badgeX - BADGE_W / 2,
            top: badgeY - badgeH / 2,
            transform: [{ rotate: `${badgeRotation}deg` }],
          },
        ]}>
        <Text style={[styles.badgeText, type.num]} numberOfLines={1} adjustsFontSizeToFit>
          {percent}%
        </Text>
      </View>
    </View>
  );
}

/**
 * Animates from 0 to `target` on mount, then from the current value to each new target.
 * Skipped (jumps straight to the value) when the user has turned on Reduce Motion.
 */
function useAnimatedNumber(target: number, duration = 900): number {
  const anim = useRef(new Animated.Value(0)).current;
  const [value, setValue] = useState(0);

  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setValue(v));
    return () => anim.removeListener(id);
  }, [anim]);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then(reduceMotion => {
        if (cancelled) return;
        if (reduceMotion) {
          anim.setValue(target);
          return;
        }
        Animated.timing(anim, {
          toValue: target,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false, // drives SVG props and text, which the native driver can't
        }).start();
      });
    return () => {
      cancelled = true;
      anim.stopAnimation();
    };
  }, [anim, target, duration]);

  return value;
}

const BADGE_W = 38;

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    width: BADGE_W,
    borderWidth: 1.5,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
