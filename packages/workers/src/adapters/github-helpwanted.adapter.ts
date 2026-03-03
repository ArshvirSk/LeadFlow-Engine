import type { Lead, RawLeadItem, SourceAdapter } from '@leadflow/types';

/**
 * GitHub Help Wanted + Bounty adapter
 *
 * Why: GitHub issues labelled "help wanted" or "bounty" are real paid work that
 * the vast majority of freelancers never look at. Competition is near-zero
 * compared to any job board. Issues labelled "bounty" typically have a cash
 * reward attached (via Gitcoin, IssueHunt, Algora, or a manual comment).
 *
 * Auth: Unauthenticated = 10 req/hr (barely enough). Set GITHUB_TOKEN env var
 * for 5,000 req/hr (free PAT, no scopes needed for public search).
 *
 * API docs: https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests
 *
 * Query strategy:
 *   - label:"help wanted" OR label:"bounty" — direct signal
 *   - state:open — only open issues
 *   - Multiple language passes so we don't exceed the 1,000-result cap per query
 *   - Only issues (not PRs) — `type:issue`
 */
const GITHUB_API = 'https://api.github.com/search/issues';

/** Programming languages/stacks most relevant to a freelance dev pipeline */
const LANGUAGES = ['javascript', 'typescript', 'python', 'go', 'rust'] as const;

interface GitHubIssue {
    id: number;
    number: number;
    title: string;
    html_url: string;
    body: string | null;
    created_at: string;
    updated_at: string;
    user: { login: string; html_url: string } | null;
    labels: Array<{ name: string }>;
    repository_url: string;
    comments: number;
    state: string;
}

interface SearchResponse {
    total_count?: number;
    items?: GitHubIssue[];
    message?: string; // rate limit error message
}

export class GitHubHelpWantedAdapter implements SourceAdapter {
    id = 'github_helpwanted';
    /**
     * Rate limits (GitHub REST Search API):
     *   Unauthenticated : 10 requests/hour  — 1 query per run, every 3 hours = 0.33 req/hr ✅
     *   Authenticated   : 5,000 req/hour    — 6 queries per run, every hour = 6 req/hr  ✅
     *
     * Set GITHUB_TOKEN env var (free PAT, no scopes needed) to unlock full query set.
     * https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
     */
    get schedule(): string {
        // Without a token we make 1 req/poll → safe at every 3h (stays under 10 req/hr budget)
        // With a token    we make 6 req/poll → safe at every 1h (6 of 5000 req/hr)
        return process.env.GITHUB_TOKEN ? '0 * * * *' : '0 */3 * * *';
    }

    private get hasToken(): boolean {
        return Boolean(process.env.GITHUB_TOKEN);
    }

    private get headers(): Record<string, string> {
        const h: Record<string, string> = {
            'User-Agent': 'LeadFlowBot/1.0 (lead aggregator)',
            'Accept': 'application/vnd.github.v3+json',
            'X-GitHub-Api-Version': '2022-11-28',
        };
        if (this.hasToken) {
            h['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
        }
        return h;
    }

    async poll(): Promise<RawLeadItem[]> {
        if (!this.hasToken) {
            console.warn(
                '[github_helpwanted] No GITHUB_TOKEN set. ' +
                'Running 1 query only (bounty issues). ' +
                'Create a free PAT at https://github.com/settings/tokens (no scopes needed) ' +
                'to enable all 6 queries and hourly polling.'
            );
        }

        const results: RawLeadItem[] = [];

        /**
         * Without token  → only the bounty query (highest value, 1 req)
         * With token     → bounty + help-wanted per language (6 reqs, still tiny vs 5k/hr budget)
         */
        const queries: string[] = [
            'label%3Abounty+type%3Aissue+state%3Aopen',
            ...(this.hasToken
                ? LANGUAGES.map(
                    lang =>
                        `label%3A%22help+wanted%22+type%3Aissue+state%3Aopen+language%3A${lang}`
                )
                : []),
        ];

        for (const q of queries) {
            try {
                const url = `${GITHUB_API}?q=${q}&sort=created&order=desc&per_page=30`;
                const resp = await fetch(url, { headers: this.headers });

                // Primary rate limit — check remaining BEFORE parsing body
                const remaining = Number(resp.headers.get('x-ratelimit-remaining') ?? '99');
                const resetTs = Number(resp.headers.get('x-ratelimit-reset') ?? '0');

                if (remaining <= 1) {
                    const resetIn = Math.max(0, resetTs * 1000 - Date.now());
                    console.warn(
                        `[github_helpwanted] Rate limit nearly exhausted ` +
                        `(remaining=${remaining}). Resets in ${Math.ceil(resetIn / 60000)} min. ` +
                        `Stopping early to preserve quota.`
                    );
                    break;
                }

                if (resp.status === 403 || resp.status === 429) {
                    const retryAfter = resp.headers.get('retry-after');
                    console.warn(
                        `[github_helpwanted] HTTP ${resp.status}. ` +
                        (retryAfter ? `Retry-After: ${retryAfter}s. ` : '') +
                        'Set GITHUB_TOKEN for 5,000 req/hr.'
                    );
                    break;
                }
                if (!resp.ok) {
                    console.warn(`[github_helpwanted] HTTP ${resp.status} for query ${q}`);
                    continue;
                }

                const data = (await resp.json()) as SearchResponse;
                if (data.message?.toLowerCase().includes('rate limit')) {
                    console.warn('[github_helpwanted] Rate limit in body:', data.message);
                    break;
                }

                for (const issue of data.items ?? []) {
                    results.push({
                        rawId: String(issue.id),
                        raw: issue as unknown as Record<string, unknown>,
                        fetchedAt: new Date(issue.created_at),
                    });
                }

                // Secondary rate limit: GitHub asks for no more than 1 req/sec on search
                // Use 1100ms to give a small buffer
                await new Promise(r => setTimeout(r, 1100));
            } catch (err) {
                console.warn('[github_helpwanted] query failed:', (err as Error).message);
            }
        }

        // Deduplicate (same issue can appear in bounty + help-wanted)
        const seen = new Set<string>();
        return results.filter(r => !seen.has(r.rawId) && seen.add(r.rawId) as unknown as boolean);
    }

    normalize(item: RawLeadItem): Partial<Lead> {
        const raw = item.raw as unknown as GitHubIssue;

        // Extract repo name from repository_url (e.g. https://api.github.com/repos/owner/repo)
        const repoName = raw.repository_url?.split('/repos/')[1] ?? '';
        const isBounty = raw.labels?.some(l => /bounty/i.test(l.name));

        // Extract bounty amount if mentioned in title or body
        const fullText = `${raw.title} ${raw.body ?? ''}`;
        const bountyMatch = fullText.match(/\$\s*([\d,]+)\s*(?:USD|USDC|DAI)?/);
        const bountyAmount = bountyMatch ? `$${bountyMatch[1]}` : null;

        const titlePrefix = isBounty && bountyAmount
            ? `[Bounty ${bountyAmount}] `
            : isBounty
                ? '[Bounty] '
                : '[Help Wanted] ';

        return {
            source: this.id,
            source_id: item.rawId,
            title: `${titlePrefix}${raw.title ?? ''} (${repoName})`,
            description: raw.body ?? '',
            url: raw.html_url ?? '',
            client_name: raw.user?.login ?? null,
            client_url: raw.user?.html_url ?? null,
            status: 'new',
            remote: true, // GitHub work is inherently remote
        };
    }

    async healthCheck() {
        try {
            const resp = await fetch(
                `${GITHUB_API}?q=label%3Abounty+type%3Aissue+state%3Aopen&per_page=1`,
                { headers: this.headers }
            );
            return resp.ok ? 'healthy' : 'degraded';
        } catch {
            return 'down';
        }
    }
}
