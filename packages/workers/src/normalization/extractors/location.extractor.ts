// Ordered by specificity — more specific patterns first
const REMOTE_SIGNALS = [
  /\bfully\s+remote\b/i,
  /\b100%\s+remote\b/i,
  /\bremote(?:\s+only)?\b/i,
  /\bwork\s+from\s+anywhere\b/i,
  /\bwfh\b/i,
  /\bdistributed\s+team\b/i,
];

const COUNTRY_CODES: Record<string, string> = {
  us: 'United States', usa: 'United States', 'united states': 'United States',
  uk: 'United Kingdom', gb: 'United Kingdom', 'united kingdom': 'United Kingdom', britain: 'United Kingdom',
  ca: 'Canada', canada: 'Canada',
  au: 'Australia', australia: 'Australia',
  de: 'Germany', germany: 'Germany', deutschland: 'Germany',
  fr: 'France', france: 'France',
  nl: 'Netherlands', netherlands: 'Netherlands',
  se: 'Sweden', sweden: 'Sweden',
  no: 'Norway', norway: 'Norway',
  ch: 'Switzerland', switzerland: 'Switzerland',
  in: 'India', india: 'India',
  sg: 'Singapore', singapore: 'Singapore',
  br: 'Brazil', brazil: 'Brazil',
  pl: 'Poland', poland: 'Poland',
  es: 'Spain', spain: 'Spain',
  it: 'Italy', italy: 'Italy',
  jp: 'Japan', japan: 'Japan',
  kr: 'South Korea', 'south korea': 'South Korea',
  mx: 'Mexico', mexico: 'Mexico',
  ar: 'Argentina', argentina: 'Argentina',
  nz: 'New Zealand', 'new zealand': 'New Zealand',
};

// US major cities (for location extraction)
const MAJOR_CITIES = new Set([
  'new york', 'san francisco', 'los angeles', 'chicago', 'seattle', 'boston',
  'austin', 'denver', 'miami', 'atlanta', 'dallas', 'houston', 'phoenix',
  'portland', 'washington dc', 'washington', 'nyc', 'sf', 'la',
  'london', 'berlin', 'amsterdam', 'toronto', 'sydney', 'melbourne',
  'paris', 'barcelona', 'madrid', 'stockholm', 'oslo', 'zurich',
  'singapore', 'tokyo', 'seoul', 'bangalore', 'mumbai', 'delhi',
]);

export interface ExtractedLocation {
  remote: boolean;
  location: string | null;
}

export function extractLocation(text: string): ExtractedLocation {
  const lower = text.toLowerCase();

  const remote = REMOTE_SIGNALS.some(re => re.test(lower));

  // Try to find a city mention
  let location: string | null = null;

  for (const city of MAJOR_CITIES) {
    if (lower.includes(city)) {
      location = city.replace(/\b\w/g, c => c.toUpperCase()); // Title Case
      break;
    }
  }

  // Try country if no city found
  if (!location) {
    for (const [alias, country] of Object.entries(COUNTRY_CODES)) {
      // Use word-boundary check to avoid false positives (e.g. "in" matching everywhere)
      const re = new RegExp(`\\b${alias}\\b`, 'i');
      if (alias.length > 2 && re.test(lower)) {
        location = country;
        break;
      }
    }
  }

  return { remote, location };
}
