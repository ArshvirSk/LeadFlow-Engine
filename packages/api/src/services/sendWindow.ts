/**
 * FR-04: Send Window Optimizer
 *
 * Pure TypeScript utility — no external dependencies.
 * Mirrors the implementation in packages/workers/src/services/sendWindow.ts.
 */

export interface OptimalSendWindow {
    recipient_timezone: string;
    window_start: string;           // ISO 8601 UTC
    window_end: string;             // ISO 8601 UTC (window_start + 2h)
    local_time_description: string; // Human-readable in recipient TZ
    is_in_window_now: boolean;
}

/**
 * Find the next 9–11am business-hours window in the recipient's timezone.
 * Skips weekends — advances to Monday morning if needed.
 * Falls back to 'America/New_York' if the timezone string is invalid.
 */
export function calculateOptimalSendWindow(
    recipientTimezone: string,
    nowUTC: Date = new Date(),
): OptimalSendWindow {
    // Validate timezone; fall back to EST if invalid
    let tz = recipientTimezone;
    try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
    } catch {
        tz = 'America/New_York';
    }

    const fmtHour = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        hour12: false,
    });
    const fmtDow = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
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
        // Past 11am on a weekday — find next valid morning
        const tomorrow = new Date(nowUTC.getTime() + 24 * 3_600_000);
        const tomorrowDow = fmtDow.format(tomorrow);
        if (tomorrowDow === 'Sat') {
            hoursAhead = (24 - localHour + 9) + 2 * 24;
        } else if (tomorrowDow === 'Sun') {
            hoursAhead = (24 - localHour + 9) + 24;
        } else {
            hoursAhead = 24 - localHour + 9;
        }
    }

    const windowStart = new Date(nowUTC.getTime() + hoursAhead * 3_600_000);
    const windowEnd = new Date(windowStart.getTime() + 2 * 3_600_000);

    const localTimeDesc = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    }).format(windowStart);

    return {
        recipient_timezone: tz,
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        local_time_description: localTimeDesc,
        is_in_window_now: isInWindow,
    };
}
