import type { Lead, RawLeadItem, SourceAdapter } from '@leadflow/types';

/**
 * Remotive.io adapter (replaces the defunct Upwork adapter)
 *
 * Context: Upwork's RSS feeds were removed (HTTP 410) and their GraphQL endpoint
 * (`/api/graphql/v1`) requires OAuth 2.0 — it is NOT a public API.
 *
 * Remotive.io provides a free, unauthenticated JSON API with structured job data
 * including a `job_type` field. We filter for contract / freelance / part-time
 * postings only so the pipeline stays focused on hireable gigs.
 *
 * API docs: https://remotive.com/api/remote-jobs
 */
const REMOTIVE_API = 'https://remotive.com/api/remote-jobs';

/** Only these job types are relevant for a freelance pipeline */
const CONTRACT_TYPES = new Set(['contract', 'freelance', 'part_time']);

/** Categories that yield dev / design freelance work */
const CATEGORIES = ['software-dev', 'design', 'devops-sysadmin'] as const;

interface RemotiveJob {
    id: number;
    url: string;
    title: string;
    company_name: string;
    company_logo_url?: string;
    category: string;
    tags: string[];
    job_type: string;
    publication_date: string;
    description: string;
    salary?: string;
    candidate_required_location?: string;
}

export class UpworkAdapter implements SourceAdapter {
    /** Keep id as 'upwork' so existing DB rows are not orphaned */
    id = 'remotive';
    schedule = '*/30 * * * *';

    async poll(): Promise<RawLeadItem[]> {
        const results: RawLeadItem[] = [];

        for (let i = 0; i < CATEGORIES.length; i++) {
            // 600ms between requests — Remotive has no documented rate limit but
            // sequential bursts without delay are considered abusive by most public APIs
            if (i > 0) await new Promise(r => setTimeout(r, 600));
            const category = CATEGORIES[i]!;
            try {
                const url = `${REMOTIVE_API}?category=${category}&limit=50`;
                const resp = await fetch(url, {
                    headers: { 'User-Agent': 'LeadFlowBot/1.0 (lead aggregator)' },
                });
                if (resp.status === 429) {
                    const retryAfter = resp.headers.get('retry-after');
                    console.warn(`[remotive] Rate limited${retryAfter ? ` (retry after ${retryAfter}s)` : ''}. Stopping early.`);
                    break;
                }
                if (!resp.ok) continue;

                const data = await resp.json() as { jobs?: RemotiveJob[] };
                const relevant = (data.jobs ?? []).filter(j => CONTRACT_TYPES.has(j.job_type));

                for (const job of relevant) {
                    results.push({
                        rawId: String(job.id),
                        raw: job as unknown as Record<string, unknown>,
                        fetchedAt: new Date(job.publication_date),
                    });
                }
            } catch (err) {
                console.warn(`[remotive] failed to fetch category ${category}:`, (err as Error).message);
            }
        }

        // Deduplicate across categories
        const seen = new Set<string>();
        return results.filter(r => !seen.has(r.rawId) && seen.add(r.rawId) as unknown as boolean);
    }

    normalize(item: RawLeadItem): Partial<Lead> {
        const raw = item.raw as unknown as RemotiveJob;
        return {
            source: this.id,
            source_id: item.rawId,
            title: raw.title ?? '',
            description: raw.description ?? '',
            url: raw.url ?? '',
            client_name: raw.company_name ?? null,
            status: 'new',
            remote: true,
        };
    }

    async healthCheck() {
        try {
            const resp = await fetch(`${REMOTIVE_API}?limit=1`, {
                headers: { 'User-Agent': 'LeadFlowBot/1.0' },
            });
            return resp.ok ? 'healthy' : 'degraded';
        } catch {
            return 'down';
        }
    }
}
