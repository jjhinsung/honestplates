/** Core nutrient values. All macro weights in grams, sodium in milligrams. */
export interface Nutrients {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  addedSugar?: number;
  saturatedFat?: number;
  transFat?: number;
  sodium?: number; // mg
  cholesterol?: number; // mg
}

export type EntrySource = 'label' | 'plate' | 'manual';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type SafetyGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface SafetyFlag {
  severity: 'info' | 'caution' | 'warning';
  message: string;
}

export interface SafetyRating {
  score: number; // 0–100, higher is better
  grade: SafetyGrade;
  flags: SafetyFlag[];
  positives: string[];
}

/** One logged food item. `nutrients` are the TOTAL for this entry (already multiplied by servings). */
export interface FoodEntry {
  id: string;
  name: string;
  date: string; // local YYYY-MM-DD
  createdAt: number; // epoch ms
  meal: MealType;
  source: EntrySource;
  servings: number;
  servingDescription?: string;
  nutrients: Nutrients;
  safety?: SafetyRating;
  confidence?: number; // 0–1 for AI plate estimates
}

/** Result of parsing a printed Nutrition Facts panel (values are PER SERVING). */
export interface ParsedLabel {
  source?: 'ocr' | 'barcode';
  barcode?: string;
  productName?: string;
  servingSize?: string;
  servingsPerContainer?: number;
  nutrients: Nutrients;
  ingredients?: string;
  /** Open Food Facts additive codes (e.g. "en:e322"), barcode lookups only. Sharpens the ingredient report. */
  additiveTags?: string[];
  /** Allergen statement printed after the list, e.g. "MILK, SOY" from "CONTAINS: MILK, SOY." */
  containsStatement?: string;
  allergens?: string[];
  rawText: string;
  /** Which fields were actually read from the label vs defaulted to 0. */
  detectedFields: (keyof Nutrients)[];
  /**
   * How the calorie value was obtained and whether it agrees with the macros
   * (4·protein + 4·carbs + 9·fat). 'estimated' means it wasn't readable on the label.
   */
  caloriesCheck?: {
    status: 'ok' | 'unverified' | 'mismatch' | 'estimated';
    macroEstimate?: number;
    /** Diagnostics shown in the "Scanned text" panel. */
    candidates: number[]; // every calorie value the scanner considered
    rejected: number[]; // values ruled out as impossible for the serving size
    maxPlausible?: number; // ~9 kcal × serving grams
    servingGrams?: number;
    found: boolean; // false → no calorie value at all
  };
}

/** One food the AI identified on a plate photo. */
export interface PlateItem {
  name: string;
  portion: string; // e.g. "1 cup", "150 g"
  grams?: number;
  nutrients: Nutrients;
  confidence: number; // 0–1
}

export interface PlateAnalysis {
  items: PlateItem[];
  notes?: string;
}

export interface DailyGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DaySummary {
  date: string;
  totals: Nutrients;
  entryCount: number;
}
