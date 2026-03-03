/**
 * FR-04: Send Window Optimizer
 *
 * inferTimezone:              location string → IANA timezone (or null)
 * calculateOptimalSendWindow: given recipient timezone, return next 9-11am window
 */

// ─── City / country / state lookup table ─────────────────────────────────────

const CITY_TZ_MAP: Record<string, string> = {
    // North America
    'new york': 'America/New_York',
    'nyc': 'America/New_York',
    'boston': 'America/New_York',
    'miami': 'America/New_York',
    'atlanta': 'America/New_York',
    'toronto': 'America/Toronto',
    'montreal': 'America/Toronto',
    'chicago': 'America/Chicago',
    'dallas': 'America/Chicago',
    'houston': 'America/Chicago',
    'austin': 'America/Chicago',
    'minneapolis': 'America/Chicago',
    'denver': 'America/Denver',
    'phoenix': 'America/Phoenix',
    'los angeles': 'America/Los_Angeles',
    'san francisco': 'America/Los_Angeles',
    'sf bay': 'America/Los_Angeles',
    'seattle': 'America/Los_Angeles',
    'portland': 'America/Los_Angeles',
    'las vegas': 'America/Los_Angeles',
    'vancouver': 'America/Vancouver',
    'calgary': 'America/Edmonton',
    'united states': 'America/New_York',
    'usa': 'America/New_York',
    'canada': 'America/Toronto',
    // Europe
    'london': 'Europe/London',
    'uk': 'Europe/London',
    'england': 'Europe/London',
    'ireland': 'Europe/Dublin',
    'dublin': 'Europe/Dublin',
    'paris': 'Europe/Paris',
    'france': 'Europe/Paris',
    'berlin': 'Europe/Berlin',
    'germany': 'Europe/Berlin',
    'amsterdam': 'Europe/Amsterdam',
    'netherlands': 'Europe/Amsterdam',
    'madrid': 'Europe/Madrid',
    'spain': 'Europe/Madrid',
    'barcelona': 'Europe/Madrid',
    'rome': 'Europe/Rome',
    'italy': 'Europe/Rome',
    'milan': 'Europe/Rome',
    'stockholm': 'Europe/Stockholm',
    'sweden': 'Europe/Stockholm',
    'oslo': 'Europe/Oslo',
    'norway': 'Europe/Oslo',
    'copenhagen': 'Europe/Copenhagen',
    'denmark': 'Europe/Copenhagen',
    'helsinki': 'Europe/Helsinki',
    'finland': 'Europe/Helsinki',
    'warsaw': 'Europe/Warsaw',
    'poland': 'Europe/Warsaw',
    'prague': 'Europe/Prague',
    'czech': 'Europe/Prague',
    'vienna': 'Europe/Vienna',
    'austria': 'Europe/Vienna',
    'zurich': 'Europe/Zurich',
    'switzerland': 'Europe/Zurich',
    'brussels': 'Europe/Brussels',
    'belgium': 'Europe/Brussels',
    'lisbon': 'Europe/Lisbon',
    'portugal': 'Europe/Lisbon',
    'kyiv': 'Europe/Kyiv',
    'ukraine': 'Europe/Kyiv',
    'istanbul': 'Europe/Istanbul',
    'turkey': 'Europe/Istanbul',
    'bucharest': 'Europe/Bucharest',
    'romania': 'Europe/Bucharest',
    'budapest': 'Europe/Budapest',
    'hungary': 'Europe/Budapest',
    'athens': 'Europe/Athens',
    'greece': 'Europe/Athens',
    // Asia / Pacific
    'tokyo': 'Asia/Tokyo',
    'japan': 'Asia/Tokyo',
    'osaka': 'Asia/Tokyo',
    'beijing': 'Asia/Shanghai',
    'shanghai': 'Asia/Shanghai',
    'china': 'Asia/Shanghai',
    'shenzhen': 'Asia/Shanghai',
    'hong kong': 'Asia/Hong_Kong',
    'singapore': 'Asia/Singapore',
    'seoul': 'Asia/Seoul',
    'south korea': 'Asia/Seoul',
    'korea': 'Asia/Seoul',
    'taipei': 'Asia/Taipei',
    'taiwan': 'Asia/Taipei',
    'mumbai': 'Asia/Kolkata',
    'delhi': 'Asia/Kolkata',
    'bangalore': 'Asia/Kolkata',
    'india': 'Asia/Kolkata',
    'dubai': 'Asia/Dubai',
    'uae': 'Asia/Dubai',
    'riyadh': 'Asia/Riyadh',
    'saudi': 'Asia/Riyadh',
    'tel aviv': 'Asia/Jerusalem',
    'israel': 'Asia/Jerusalem',
    'bangkok': 'Asia/Bangkok',
    'thailand': 'Asia/Bangkok',
    'jakarta': 'Asia/Jakarta',
    'indonesia': 'Asia/Jakarta',
    'kuala lumpur': 'Asia/Kuala_Lumpur',
    'malaysia': 'Asia/Kuala_Lumpur',
    'manila': 'Asia/Manila',
    'philippines': 'Asia/Manila',
    'sydney': 'Australia/Sydney',
    'melbourne': 'Australia/Melbourne',
    'brisbane': 'Australia/Brisbane',
    'australia': 'Australia/Sydney',
    'auckland': 'Pacific/Auckland',
    'new zealand': 'Pacific/Auckland',
    // South America
    'sao paulo': 'America/Sao_Paulo',
    'brazil': 'America/Sao_Paulo',
    'buenos aires': 'America/Argentina/Buenos_Aires',
    'argentina': 'America/Argentina/Buenos_Aires',
    'bogota': 'America/Bogota',
    'colombia': 'America/Bogota',
    'lima': 'America/Lima',
    'peru': 'America/Lima',
    'santiago': 'America/Santiago',
    'chile': 'America/Santiago',
    // Africa
    'lagos': 'Africa/Lagos',
    'nigeria': 'Africa/Lagos',
    'nairobi': 'Africa/Nairobi',
    'kenya': 'Africa/Nairobi',
    'cairo': 'Africa/Cairo',
    'egypt': 'Africa/Cairo',
    'cape town': 'Africa/Johannesburg',
    'johannesburg': 'Africa/Johannesburg',
    'south africa': 'Africa/Johannesburg',
    'accra': 'Africa/Accra',
    'ghana': 'Africa/Accra',
};

// US state abbreviation → canonical timezone
const US_STATE_TZ: Record<string, string> = {
    al: 'America/Chicago', ak: 'America/Anchorage', az: 'America/Phoenix',
    ar: 'America/Chicago', ca: 'America/Los_Angeles', co: 'America/Denver',
    ct: 'America/New_York', de: 'America/New_York', fl: 'America/New_York',
    ga: 'America/New_York', hi: 'Pacific/Honolulu', id: 'America/Boise',
    il: 'America/Chicago', in: 'America/Indiana/Indianapolis', ia: 'America/Chicago',
    ks: 'America/Chicago', ky: 'America/New_York', la: 'America/Chicago',
    me: 'America/New_York', md: 'America/New_York', ma: 'America/New_York',
    mi: 'America/Detroit', mn: 'America/Chicago', ms: 'America/Chicago',
    mo: 'America/Chicago', mt: 'America/Denver', ne: 'America/Chicago',
    nv: 'America/Los_Angeles', nh: 'America/New_York', nj: 'America/New_York',
    nm: 'America/Denver', ny: 'America/New_York', nc: 'America/New_York',
    nd: 'America/Chicago', oh: 'America/New_York', ok: 'America/Chicago',
    or: 'America/Los_Angeles', pa: 'America/New_York', ri: 'America/New_York',
    sc: 'America/New_York', sd: 'America/Chicago', tn: 'America/Chicago',
    tx: 'America/Chicago', ut: 'America/Denver', vt: 'America/New_York',
    va: 'America/New_York', wa: 'America/Los_Angeles', wv: 'America/New_York',
    wi: 'America/Chicago', wy: 'America/Denver', dc: 'America/New_York',
};

// ─── Timezone inference ───────────────────────────────────────────────────────

/**
 * Infer an IANA timezone from a free-text location string.
 * Returns null if no match can be found (remote, worldwide, etc.).
 */
export function inferTimezone(location: string | null | undefined): string | null {
    if (!location) return null;
    const lower = location.toLowerCase().trim();

    // Explicit timezone string already provided (e.g., "America/New_York")
    if (lower.includes('/') && !lower.includes(' ')) {
        try {
            Intl.DateTimeFormat(undefined, { timeZone: lower });
            return lower;
        } catch {
            // not a valid TZ string — fall through
        }
    }

    // Remote / distributed signals — no location to infer
    if (/\b(remote|worldwide|global|anywhere|distributed)\b/.test(lower)) return null;

    // City / country lookup (longest-first to avoid partial matches overriding)
    const sortedKeys = Object.keys(CITY_TZ_MAP).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        if (lower.includes(key)) return CITY_TZ_MAP[key];
    }

    // US state abbreviation (e.g., "Austin, TX" → "tx")
    const words = lower.split(/[\s,./\-]+/);
    for (const word of words) {
        if (US_STATE_TZ[word]) return US_STATE_TZ[word];
    }

    return null;
}

// ─── Optimal send window ──────────────────────────────────────────────────────

export interface OptimalSendWindow {
    recipient_timezone: string;
    window_start: Date;          // 9am in recipient TZ
    window_end: Date;            // 11am in recipient TZ
    local_time_description: string;
    is_in_window_now: boolean;
}

/**
 * Find the next 9–11am business-hours window in the recipient's timezone.
 * Skips weekends — advances to Monday if needed.
 */
export function calculateOptimalSendWindow(
    recipientTimezone: string,
    nowUTC: Date = new Date(),
): OptimalSendWindow {
    const fmtHour = new Intl.DateTimeFormat('en-US', {
        timeZone: recipientTimezone,
        hour: 'numeric',
        hour12: false,
    });
    const fmtDow = new Intl.DateTimeFormat('en-US', {
        timeZone: recipientTimezone,
        weekday: 'short',
    });

    const localHour = parseInt(fmtHour.format(nowUTC), 10);
    const localDow = fmtDow.format(nowUTC); // "Mon", "Tue", …

    const isWeekend = ['Sat', 'Sun'].includes(localDow);
    const isInWindow = !isWeekend && localHour >= 9 && localHour < 11;

    let hoursAhead = 0;
    if (isInWindow) {
        hoursAhead = 0;
    } else if (isWeekend) {
        const daysToMonday = localDow === 'Sat' ? 2 : 1;
        hoursAhead = (24 - localHour + 9) + (daysToMonday - 1) * 24;
    } else if (localHour < 9) {
        hoursAhead = 9 - localHour;
    } else {
        // past 11am on a weekday
        // check if tomorrow is a weekend
        const tomorrow = new Date(nowUTC.getTime() + 24 * 3_600_000);
        const tomorrowDow = fmtDow.format(tomorrow);
        if (tomorrowDow === 'Sat') {
            hoursAhead = (24 - localHour + 9) + 2 * 24; // skip to Monday
        } else if (tomorrowDow === 'Sun') {
            hoursAhead = (24 - localHour + 9) + 24; // skip to Monday
        } else {
            hoursAhead = 24 - localHour + 9;
        }
    }

    const windowStart = new Date(nowUTC.getTime() + hoursAhead * 3_600_000);
    const windowEnd = new Date(windowStart.getTime() + 2 * 3_600_000);

    const localTimeDesc = new Intl.DateTimeFormat('en-US', {
        timeZone: recipientTimezone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    }).format(windowStart);

    return {
        recipient_timezone: recipientTimezone,
        window_start: windowStart,
        window_end: windowEnd,
        local_time_description: localTimeDesc,
        is_in_window_now: isInWindow,
    };
}
