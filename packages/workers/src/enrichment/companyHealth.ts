/**
 * FR02 — Company Health Enrichment (Crunchbase Phase 1)
 *
 * Fetches last funding data for a company from Crunchbase v4 and returns a
 * CompanyHealth object.  Results are cached in Redis for 24 h so we never
 * hammer the API on repeated ingestions of the same client.
 *
 * Status logic:
 *   green  — last_funding_at ≤ 12 months ago
 *   yellow — last_funding_at 12–24 months ago
 *   red    — not found (404) | last_funding_at > 24 months | no funding data
 *
 * Special cases:
 *   429  — rate-limited → return null (don't block normalization pipeline)
 *   5xx  — network / server error → return null (fail open)
 */

import type { CompanyHealth } from '@leadflow/types';
import { connection } from '../redis.js';

const CRUNCHBASE_API_KEY = process.env.CRUNCHBASE_API_KEY ?? '';
const CACHE_TTL_SECONDS = 86_400; // 24 h

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert a company display name into a Crunchbase organization slug. */
function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
}

/** Return how many full months ago a date string was. */
function monthsAgo(dateStr: string): number {
    const then = new Date(dateStr).getTime();
    const now = Date.now();
    return (now - then) / (1_000 * 60 * 60 * 24 * 30.44);
}

// ─── Crunchbase response types ────────────────────────────────────────────────

interface CrunchbaseOrg {
    properties?: {
        last_funding_at?: string;
        last_funding_type?: string;
    };
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Enrich a lead's company with health data from Crunchbase.
 * Returns `null` when the API key is missing, rate-limited, or a network
 * error occurs — callers should skip the update and let scoring fall back to
 * the neutral value.
 */
export async function enrichCompanyHealth(client_name: string): Promise<CompanyHealth | null> {
    const slug = slugify(client_name);
    const cacheKey = `company_health:${slug}`;

    // ── 1. Cache hit ────────────────────────────────────────────────────────
    const cached = await connection.get(cacheKey);
    if (cached) {
        try {
            return JSON.parse(cached) as CompanyHealth;
        } catch {
            // Corrupt cache entry — fall through and re-fetch
        }
    }

    // ── 2. Guard: skip if key not configured ───────────────────────────────
    if (!CRUNCHBASE_API_KEY || CRUNCHBASE_API_KEY === '...') {
        return null;
    }

    // ── 3. Crunchbase API call ──────────────────────────────────────────────
    let health: CompanyHealth;

    try {
        const url = [
            `https://api.crunchbase.com/api/v4/entities/organizations/${slug}`,
            '?field_ids=last_funding_type,last_funding_at',
        ].join('');

        const res = await fetch(url, {
            headers: { 'X-cb-user-key': CRUNCHBASE_API_KEY },
            signal: AbortSignal.timeout(8_000), // 8 s hard timeout
        });

        // Rate-limited — fail open so the pipeline keeps moving
        if (res.status === 429) {
            console.warn(`[companyHealth] Rate-limited for "${client_name}", skipping`);
            return null;
        }

        if (res.status === 404) {
            health = {
                status: 'red',
                signals: ['Company not found in Crunchbase'],
                checked_at: new Date().toISOString(),
            };
        } else if (!res.ok) {
            console.warn(`[companyHealth] Crunchbase returned ${res.status} for "${slug}"`);
            return null;
        } else {
            const body = await res.json() as CrunchbaseOrg;
            const props = body.properties ?? {};
            const fundedAt = props.last_funding_at;
            const fundType = props.last_funding_type;
            const typeLabel = fundType ? ` (${fundType})` : '';

            if (!fundedAt) {
                health = {
                    status: 'red',
                    signals: ['No funding data found in Crunchbase'],
                    checked_at: new Date().toISOString(),
                };
            } else {
                const months = monthsAgo(fundedAt);
                const monthsRounded = Math.round(months);

                if (months <= 12) {
                    health = {
                        status: 'green',
                        signals: [
                            `Funded ${monthsRounded} month${monthsRounded !== 1 ? 's' : ''} ago${typeLabel}`,
                        ],
                        checked_at: new Date().toISOString(),
                    };
                } else if (months <= 24) {
                    health = {
                        status: 'yellow',
                        signals: [`Last funded ${monthsRounded} months ago${typeLabel}`],
                        checked_at: new Date().toISOString(),
                    };
                } else {
                    health = {
                        status: 'red',
                        signals: [`Last funded over 2 years ago${typeLabel}`],
                        checked_at: new Date().toISOString(),
                    };
                }
            }
        }
    } catch (err) {
        // Network or timeout error — fail open
        console.warn(`[companyHealth] Network error for "${client_name}":`, (err as Error).message);
        return null;
    }

    // ── 4. Write through to Redis ───────────────────────────────────────────
    await connection.set(cacheKey, JSON.stringify(health), 'EX', CACHE_TTL_SECONDS);

    return health;
}
