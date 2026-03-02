export type BudgetType = 'fixed' | 'hourly' | 'retainer' | 'unspecified';

export interface ExtractedBudget {
  amount: number | null;
  type: BudgetType;
  min: number | null;
  max: number | null;
}

// Regex: matches $5,000 | $5k | $50/hr | $50-$100/hour | $5,000 fixed | $10k-15k
const BUDGET_RE =
  /\$\s*(\d[\d,]*(?:\.\d+)?)\s*k?\s*(?:[-–]\s*\$?\s*(\d[\d,]*(?:\.\d+)?)\s*k?)?\s*(\/\s*(?:hr|hour|mo|month|wk|week)|fixed|retainer|monthly|per\s+hour|per\s+month)?/gi;

const K_THRESHOLD = 1000; // treat bare numbers < this as hourly if /hr signal present

export function extractBudget(text: string): ExtractedBudget {
  const normalised = text.toLowerCase();
  const isHourly = /\/\s*h(?:r|our)|\bper\s+hour\b|\bhourly\b/.test(normalised);
  const isRetainer = /\bretainer\b|\bmonthly\b|\bper\s+month\b/.test(normalised);

  let bestAmount: number | null = null;
  let bestMin: number | null = null;
  let bestMax: number | null = null;
  let bestType: BudgetType = 'unspecified';

  let match: RegExpExecArray | null;
  BUDGET_RE.lastIndex = 0;

  while ((match = BUDGET_RE.exec(text)) !== null) {
    const raw1 = parseFloat(match[1].replace(/,/g, ''));
    const multiplier = match[0].toLowerCase().includes('k') ? 1000 : 1;
    const val1 = raw1 * multiplier;

    let val2: number | null = null;
    if (match[2]) {
      const raw2 = parseFloat(match[2].replace(/,/g, ''));
      const m2 = match[0].toLowerCase().lastIndexOf('k') > match[0].toLowerCase().lastIndexOf(match[2])
        ? 1000
        : 1;
      val2 = raw2 * m2;
    }

    const unitStr = (match[3] ?? '').toLowerCase();
    let type: BudgetType = 'fixed';
    if (isRetainer || unitStr.includes('mo') || unitStr.includes('month')) type = 'retainer';
    else if (isHourly || unitStr.includes('hr') || unitStr.includes('hour')) type = 'hourly';
    else if (val1 < K_THRESHOLD) type = 'hourly'; // small bare number → likely hourly

    if (bestAmount === null || val1 > bestAmount) {
      bestAmount = val2 ? Math.round((val1 + val2) / 2) : val1;
      bestMin = val1;
      bestMax = val2;
      bestType = type;
    }
  }

  return { amount: bestAmount, type: bestType, min: bestMin, max: bestMax };
}
