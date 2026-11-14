import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing, type } from '../theme';

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: string; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={type.h3}>{children}</Text>
      {right}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg =
    variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : colors.primarySoft;
  const fg = variant === 'secondary' ? colors.primary : '#fff';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

/** Numeric input bound to a number value. Empty input maps to undefined. */
export function NumberField({
  label,
  value,
  unit,
  onChange,
  highlight,
  edited,
}: {
  label: string;
  value: number | undefined;
  unit?: string;
  onChange: (v: number | undefined) => void;
  /** Value wasn't found by the scanner. */
  highlight?: boolean;
  /** Value was changed by the user. */
  edited?: boolean;
}) {
  const [text, setText] = React.useState(value === undefined ? '' : String(value));
  React.useEffect(() => {
    const parsed = text === '' ? undefined : parseFloat(text);
    if (parsed !== value) setText(value === undefined ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <View style={styles.fieldRow}>
      <Text style={[type.body, { flex: 1 }]}>{label}</Text>
      <TextInput
        value={text}
        onChangeText={t => {
          const clean = t.replace(/[^0-9.]/g, '');
          setText(clean);
          const n = parseFloat(clean);
          onChange(clean === '' || Number.isNaN(n) ? undefined : n);
        }}
        keyboardType="decimal-pad"
        placeholder="—"
        style={[styles.input, highlight && styles.inputHighlight, edited && styles.inputEdited]}
      />
      <Text style={[type.small, { width: 28 }]}>{unit ?? ''}</Text>
    </View>
  );
}

export function Stepper({
  value,
  onChange,
  step = 0.5,
  min = 0.25,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        style={styles.stepBtn}
        onPress={() => onChange(Math.max(min, +(value - step).toFixed(2)))}>
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={[type.h3, type.num, { minWidth: 44, textAlign: 'center' }]}>{value}</Text>
      <Pressable style={styles.stepBtn} onPress={() => onChange(+(value + step).toFixed(2))}>
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
      <Text style={[type.small, selected && { color: '#fff', fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing(4),
    marginBottom: spacing(3),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(3),
  },
  button: {
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing(5),
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing(1.5),
    gap: spacing(2),
  },
  input: {
    width: 90,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing(2),
    textAlign: 'right',
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#FAFBF9',
  },
  inputHighlight: { borderColor: colors.carbs, backgroundColor: '#FFF8EA' },
  inputEdited: { borderColor: colors.calories, backgroundColor: colors.primarySoft },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 20, color: colors.primary, fontWeight: '600' },
  chip: {
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
});
