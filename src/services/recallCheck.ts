import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Product recalls from the FDA (openFDA food enforcement reports).
 *
 * Barcodes are not a structured field in these reports — they're written into
 * free text ("UPC 0 28400 23908 0"), so the API can't be searched by barcode.
 * Instead the app downloads the list of ACTIVE ("Ongoing") food recalls about
 * once a day, keeps it on the phone, and matches locally. That also makes it
 * cheap to re-check everything the user already logged.
 *
 * Limits: openFDA allows 1,000 requests/day per IP without a key; this uses 1–2
 * per day. The data is unvalidated and enforcement reports can appear some time
 * after a recall is announced. Meat, poultry and egg products are recalled by
 * USDA FSIS, not FDA, so they aren't covered.
 */

const ENDPOINT = 'https://api.fda.gov/food/enforcement.json';
const CACHE_KEY = 'nutrilens-recalls-v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PAGE = 1000; // openFDA's maximum page size

export interface Recall {
  recallNumber: string;
  product: string; // product_description
  firm: string; // recalling_firm
  reason: string;
  classification: string; // "Class I" (most serious) … "Class III"
  status: string;
  reportDate: string; // YYYYMMDD
  codeInfo: string; // lots, best-by dates, UPCs
  /** Digit strings found in the product/code text that look like barcodes. */
  upcs: string[];
}

export interface RecallMatch {
  recall: Recall;
  /** 'barcode' = the scanned barcode appears in the recall; 'name' = brand + product words match (possible). */
  matchedBy: 'barcode' | 'name';
}

// ---------- Barcodes in free text ----------

/**
 * Finds barcode-like numbers in recall text. UPCs are often printed with spaces
 * or dashes ("0 28400 23908 0", "28400-23908"), so runs of digits separated by
 * single spaces/dashes are joined and kept when they're 11–14 digits long.
 */
export function extractUpcs(text: string): string[] {
  const found = new Set<string>();
  const re = /\d(?:[\d]|[ \-](?=\d))+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 11 && digits.length <= 14) found.add(digits);
  }
  return Array.from(found);
}

/** UPC-A / EAN-13 / GTIN-14 written differently: ignore leading zeros. */
const upcKey = (d: string) => d.replace(/^0+/, '');

/** Same barcode, allowing for leading zeros and a printed-without-check-digit UPC. */
export function sameBarcode(a: string, b: string): boolean {
  const ka = upcKey(a);
  const kb = upcKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  // Some reports omit the final check digit (11 digits instead of 12).
  return (ka.length === kb.length + 1 && ka.startsWith(kb)) || (kb.length === ka.length + 1 && kb.startsWith(ka));
}

// ---------- Name matching (weaker, "possible match") ----------

const STOP = new Set([
  'with', 'and', 'the', 'original', 'flavor', 'flavored', 'natural', 'organic', 'classic', 'style',
  'brand', 'foods', 'food', 'company', 'inc', 'llc', 'snack', 'snacks', 'pack', 'size', 'family',
]);
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/'s$|'/g, ''))
    .filter(w => w.length >= 4 && !STOP.has(w));

/**
 * Brand and product words must BOTH appear in the recall, so "Lay's Classic" won't
 * match every potato chip recall. Still only a "possible match" for the user to check.
 */
export function nameMatches(productName: string, recall: Recall): boolean {
  const w = words(productName);
  if (w.length < 2) return false;
  const haystack = ` ${words(`${recall.firm} ${recall.product}`).join(' ')} `;
  const hits = w.filter(x => haystack.includes(` ${x} `));
  return hits.length >= 2 && hits.length / w.length >= 0.5;
}

export function findRecalls(
  item: { barcode?: string; name?: string },
  recalls: Recall[],
): RecallMatch[] {
  const out: RecallMatch[] = [];
  for (const recall of recalls) {
    if (item.barcode && recall.upcs.some(u => sameBarcode(u, item.barcode!))) {
      out.push({ recall, matchedBy: 'barcode' });
    } else if (item.name && nameMatches(item.name, recall)) {
      out.push({ recall, matchedBy: 'name' });
    }
  }
  // Barcode matches and the most serious class first.
  return out.sort(
    (a, b) =>
      (a.matchedBy === 'barcode' ? 0 : 1) - (b.matchedBy === 'barcode' ? 0 : 1) ||
      a.recall.classification.localeCompare(b.recall.classification),
  );
}

// ---------- Download + cache ----------

export function toRecall(r: any): Recall {
  const product = String(r.product_description ?? '');
  const codeInfo = String(r.code_info ?? '');
  return {
    recallNumber: String(r.recall_number ?? ''),
    product,
    firm: String(r.recalling_firm ?? ''),
    reason: String(r.reason_for_recall ?? ''),
    classification: String(r.classification ?? ''),
    status: String(r.status ?? ''),
    reportDate: String(r.report_date ?? ''),
    codeInfo,
    upcs: extractUpcs(`${product} ${codeInfo}`),
  };
}

async function download(timeoutMs: number): Promise<Recall[]> {
  const all: Recall[] = [];
  for (let skip = 0; skip < 5 * PAGE; skip += PAGE) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const search = encodeURIComponent('status:"Ongoing"');
      const res = await fetch(`${ENDPOINT}?search=${search}&limit=${PAGE}&skip=${skip}`, {
        signal: controller.signal,
      });
      if (res.status === 404) break; // openFDA answers 404 when there are no (more) results
      if (!res.ok) throw new Error(`FDA recall service error (${res.status})`);
      const json = await res.json();
      const page: any[] = json?.results ?? [];
      all.push(...page.map(toRecall));
      if (page.length < PAGE) break;
    } finally {
      clearTimeout(timer);
    }
  }
  return all;
}

let memory: { at: number; recalls: Recall[] } | undefined;

/**
 * Active FDA food recalls, from memory or the phone's cache if under a day old,
 * otherwise downloaded fresh. If the download fails, older cached data is used.
 */
export async function getActiveRecalls(opts: { force?: boolean; timeoutMs?: number } = {}): Promise<Recall[]> {
  const fresh = (c?: { at: number }) => c && Date.now() - c.at < MAX_AGE_MS;
  if (!opts.force && fresh(memory)) return memory!.recalls;

  let cached: { at: number; recalls: Recall[] } | undefined;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    cached = raw ? JSON.parse(raw) : undefined;
  } catch {
    cached = undefined;
  }
  if (!opts.force && fresh(cached)) {
    memory = cached;
    return cached!.recalls;
  }

  try {
    const recalls = await download(opts.timeoutMs ?? 20000);
    memory = { at: Date.now(), recalls };
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(memory)).catch(() => {});
    return recalls;
  } catch (e) {
    if (cached) return cached.recalls; // offline: better old data than none
    throw e;
  }
}

/** "20261103" → "Nov 3, 2026" */
export function formatReportDate(d: string): string {
  if (!/^\d{8}$/.test(d)) return d;
  const date = new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
