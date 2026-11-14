/**
 * App configuration.
 *
 * The AI plate recognizer calls YOUR backend proxy (see /server), never the
 * model provider directly — an API key shipped inside an iOS app can be
 * extracted from the binary. Run the proxy locally while developing:
 *
 *   cd server && ANTHROPIC_API_KEY=sk-... node index.mjs
 *
 * The iOS Simulator can reach your Mac at http://localhost. On a physical
 * device, use your Mac's LAN IP (e.g. http://192.168.1.20:8787) or a deployed URL.
 * The value here is only the default; it can be changed at runtime in Settings.
 */
export const DEFAULT_AI_PROXY_URL = 'http://localhost:8787';

/** Longest edge (px) for photos sent to the AI. Keeps uploads small and fast. */
export const AI_IMAGE_MAX_EDGE = 1280;

export const DEFAULT_GOALS = {
  calories: 2000,
  protein: 120,
  carbs: 225,
  fat: 70,
};

/** FDA Daily Values (adults, 2,000 kcal reference) used by the safety rating. */
export const DAILY_VALUES = {
  fat: 78,
  saturatedFat: 20,
  cholesterol: 300,
  sodium: 2300,
  carbs: 275,
  fiber: 28,
  addedSugar: 50,
  protein: 50,
};
