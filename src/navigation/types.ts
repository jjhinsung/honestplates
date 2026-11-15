import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ParsedLabel, PlateAnalysis } from '../types';

export type TabParamList = {
  Today: undefined;
  ScanLabel: undefined;
  ScanPlate: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  /** `entryId` = reopening a logged food: the page edits that entry instead of adding a new one. */
  LabelReview: { parsed: ParsedLabel; photoPath?: string; scannedIngredients?: string; entryId?: string };
  PlateReview: { analysis: PlateAnalysis; photoPath?: string; entryId?: string };
  ManualEntry: { entryId?: string } | undefined;
  IngredientReport: {
    ingredientsText: string;
    additiveTags?: string[];
    /** Package text and label tags, for the GMO check ("Bioengineered", "Non-GMO", organic). */
    labelText?: string;
    labelTags?: string[];
    productName?: string;
    barcode?: string;
    source: 'barcode' | 'photo';
  };
  /** Foods the user saved with the heart button. */
  Saved: undefined;
  /** Two scanned products side by side. */
  Compare: { a: ParsedLabel; b: ParsedLabel; aName?: string; bName?: string };
  IngredientDetail: { label: string; cardId?: string };
  // Camera for photographing just the ingredient list;
  IngredientsScan: { returnKey: string };
};

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;
