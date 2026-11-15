# HonestPlate

A React Native (iOS) nutrient tracker built on three inputs:

| Feature | How it works | Where |
|---|---|---|
| **Nutrition label scanner** | Photo → on-device OCR (Google ML Kit, offline) → parser turns the Nutrition Facts text into per-serving nutrients, serving size, ingredients and allergens. Missing fields are highlighted for you to fill in. | `src/services/labelScanner.ts`, `src/services/labelParser.ts` |
| **AI plate / portion recognition** | Photo → resized to 1280 px → your proxy server → a vision model returns each food, portion (g), calories and macros with a confidence score. You can untick items, scale portions and edit values. | `src/services/plateRecognition.ts`, `server/index.mjs` |
| **Label safety rating** | A–F grade (0–100 score) from sodium, saturated fat, added sugar and trans fat as % of FDA Daily Values, credit for fiber and protein, plus ingredient flags (partially hydrogenated oils, potassium bromate, BVO, BHA/BHT, nitrites, titanium dioxide, synthetic dyes, HFCS, artificial sweeteners…). Recomputed live as you correct the scan. | `src/services/safetyRating.ts` |
| **Tracker** | Today: calorie ring + protein/carb/fat bars against your goals, entries grouped by meal. Last 7 days: calorie bar chart with goal and average lines, plus average kcal/P/C/F (averaged over the days you logged). Swipe back through earlier days with ‹ ›. Stored on device (AsyncStorage). | `src/screens/DashboardScreen.tsx`, `src/utils/nutrition.ts` |

## Requirements

- macOS with **Xcode 16+**, CocoaPods (`sudo gem install cocoapods` or `bundle install`)
- **Node 22.11+**
- A **physical iPhone** for the camera features (the Simulator has no camera; the dashboard, manual entry and settings work in the Simulator)
- An Anthropic API key for plate recognition (only on the proxy, never in the app)

## Setup

```sh
npm install
cd ios && bundle install && bundle exec pod install && cd ..   # or just: cd ios && pod install
open ios/HonestPlate.xcworkspace                                  # always the .xcworkspace, not the .xcodeproj
```

In Xcode: select the **HonestPlate** target → **Signing & Capabilities** → choose your Team and change the bundle identifier (it defaults to `org.reactjs.native.example.HonestPlate`). Then pick your iPhone and press Run. Metro starts automatically (or run `npm start`).

### AI proxy (for plate recognition)

```sh
cd server
ANTHROPIC_API_KEY=sk-ant-... node index.mjs        # listens on :8787
```

- In the app, open **Settings → AI plate recognition**, enter `http://<your-Mac's-LAN-IP>:8787` (find it with `ipconfig getifaddr en0`) and tap **Test connection**. Your phone and Mac must be on the same Wi-Fi.
- Optional env vars: `MODEL` (default `claude-sonnet-5-5`), `PORT`, `APP_TOKEN` (requires a `Bearer` header; add it to the fetch in `plateRecognition.ts` if you enable it).
- For production, deploy `server/index.mjs` behind HTTPS and add authentication and rate limiting.

### Own model server (no API key)

`ml/` holds a food model trained on MM-Food-100K (dish name, food type, calories, protein, carbs, fat — each with a calibrated confidence). `ml/serve.py` speaks the same `/analyze-plate` API as the Node proxy, so the app works with it unchanged:

**Mac:** double-click **Start Model Server.command** (first run installs Python packages), then enter one of the URLs it prints in the app. It uses the Apple-silicon GPU when available. On a real iPhone, `localhost` is the phone itself, even over USB — use the Mac's Wi-Fi IP, or turn on the iPhone's **Personal Hotspot** while it's plugged in by USB and use the `172.20.10.x` address. (`localhost` only works in the Simulator, which has no camera.)

**Windows:**

```sh
cd ml
.venv\Scripts\python.exe serve.py              # or double-click start_server.bat; prints the URL to enter in the app
.venv\Scripts\python.exe serve.py --token SECRET   # optional: require "Authorization: Bearer SECRET"
```

- Enter the printed `http://<LAN-IP>:8787` in **Settings → AI plate recognition**. On first run, allow Python through Windows Firewall on **private** networks.
- The model returns one item per photo (the main dish); per-nutrient ranges are shown in the notes. `POST /analyze` (multipart or raw image) returns the full per-statistic output with confidences.
- Weights: the server uses `ml/runs/best.pt` if you trained locally, otherwise the committed half-precision copy `ml/weights/food_model_fp16.pt` (57 MB, same predictions).
- To run elsewhere, copy `ml/model.py`, `ml/serve.py` and `ml/weights/`, then `pip install torch torchvision timm fastapi uvicorn pillow python-multipart`. Works on CPU (slower).

## Project layout

```
App.tsx                         Navigation container
src/
  config.ts                     Default goals, FDA Daily Values, proxy URL
  types.ts                      Nutrients, FoodEntry, ParsedLabel, PlateAnalysis, SafetyRating
  store/useNutritionStore.ts    Zustand store persisted to AsyncStorage
  utils/nutrition.ts            Day/week aggregation, local-date helpers, scaling
  services/
    labelScanner.ts             ML Kit OCR
    labelParser.ts              OCR text → nutrients (handles O/0, l/1, "<1g", %DV columns)
    safetyRating.ts             A–F rating rules
    plateRecognition.ts         Proxy client + output validation/clamping
    imageUtils.ts               Resize + base64
  components/                   CameraCapture, CalorieRing, MacroBars, WeekChart, SafetyCard, ui
  screens/                      Dashboard, ScanLabel, LabelReview, ScanPlate, PlateReview, ManualEntry, Settings
  navigation/                   Tabs (Today · Label · Plate · Settings) + review stack
server/index.mjs                Zero-dependency Node proxy to the vision model
__tests__/                      Parser, safety rating, aggregation and AI-output tests
```

Native changes from the RN template: `NSCameraUsageDescription` in `Info.plist`, and the iOS deployment target raised to **15.5** (required by ML Kit) in both the `Podfile` and the Xcode project.

## Scripts

```sh
npm test          # 14 unit tests (parser, rating, tracking math, AI output guard)
npx tsc --noEmit  # type-check
npm run ios       # build & run from the CLI instead of Xcode
```

## Next steps worth doing

- **Barcode lookup**: Vision Camera can scan barcodes; pair it with Open Food Facts to fill labels without OCR.
- **Live label detection**: run OCR on frames (Vision Camera frame processors) to auto-capture when a panel is in view.
- **Saved foods / favorites** for quick re-logging, and editing logged entries.
- **HealthKit** export of calories and macros.
- **Cloud sync**: entries are local-only today.

> The safety rating and AI estimates are informational, not medical advice. AI portion estimates are typically within ±20–30%.
