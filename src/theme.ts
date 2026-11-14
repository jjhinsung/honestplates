export const colors = {
  bg: '#F6F7F4',
  card: '#FFFFFF',
  text: '#16201A',
  textMuted: '#6A756E',
  border: '#E4E8E2',
  primary: '#1F7A4D',
  primarySoft: '#E3F2EA',
  danger: '#D63B30',
  calories: '#1F7A4D',
  protein: '#3D6FD8',
  carbs: '#E39B1B',
  fat: '#C2477A',
  track: '#ECEFEA',
};

export const MACRO_COLORS = {
  protein: colors.protein,
  carbs: colors.carbs,
  fat: colors.fat,
} as const;

export const spacing = (n: number) => n * 4;

export const radius = { sm: 8, md: 14, lg: 20 };

export const type = {
  h1: { fontSize: 28, fontWeight: '700' as const, color: colors.text },
  h2: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  h3: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.textMuted }
};
