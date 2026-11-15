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
  LabelReview: { parsed: ParsedLabel; photoPath?: string; scannedIngredients?: string };
  PlateReview: { analysis: PlateAnalysis; photoPath: string };
  ManualEntry: undefined;
  IngredientReport: {
    ingredientsText: string;
    additiveTags?: string[];
    productName?: string;
    barcode?: string;
    source: 'barcode' | 'photo';
  };
  IngredientDetail: { label: string; cardId?: string };
  // Camera for photographing just the ingredient list;
  IngredientsScan: { returnKey: string };
};

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;
