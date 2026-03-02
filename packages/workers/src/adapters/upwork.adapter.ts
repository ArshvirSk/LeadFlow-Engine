import type { Lead, RawLeadItem, SourceAdapter } from '@leadflow/types';

// Upwork RSS feeds were permanently removed (HTTP 410).
// Using the public GraphQL search endpoint instead — no auth required for basic search.
const UPWORK_GRAPHQL = 'https://www.upwork.com/api/graphql/v1';

// Category IDs for developer/design work
const CATEGORIES = [
    { id: '531770282580668418', name: 'Web Development' },
    { id: '531770282580668416', name: 'Mobile Development' },
];

interface UpworkJob {
    id: string;
    title: string;
    description: string;
    url: string;
    skills?: Array<{ prettyName: string }>;
    publishedOn?: string;
}

export class UpworkAdapter implements SourceAdapter {
    id = 'upwork';
    schedule = '*/30 * * * *';

    async poll(): Promise<RawLeadItem[]> {
        const results: RawLeadItem[] = [];

        for (const cat of CATEGORIES) {
            try {
                const jobs = await this.fetchCategory(cat.id);
                for (const job of jobs) {
                    results.push({
                        rawId: job.id,
                        raw: job as unknown as Record<string, unknown>,
                        fetchedAt: new Date(),
                    });
                }
            } catch (err) {
                console.warn(`[upwork] failed to fetch category ${cat.name}:`, (err as Error).message);
            }
        }

        const seen = new Set<string>();
        return results.filter(r => {
            if (seen.has(r.rawId)) return false;
            seen.add(r.rawId);
            return true;
        });
    }

    normalize(item: RawLeadItem): Partial<Lead> {
        const raw = item.raw as unknown as UpworkJob;
        return {
            source: this.id,
            source_id: item.rawId,
            title: raw.title ?? '',
            description: raw.description ?? '',
            url: raw.url ?? `https://www.upwork.com/jobs/${item.rawId}`,
            status: 'new',
            remote: true,
        };
    }

    async healthCheck() {
        try {
            const resp = await fetch('https://www.upwork.com', { method: 'HEAD' });
            return resp.ok ? 'healthy' : 'degraded';
        } catch {
            return 'down';
        }
    }

    private async fetchCategory(categoryId: string): Promise<UpworkJob[]> {
        const query = `
      query GetJobs($categoryId: String!) {
        search {
          jobs(filter: { subcategory2_uid: $categoryId }, pagination: { first: 20 }) {
            jobs {
              id
              title
              description
              url
              publishedOn
              skills { prettyName }
            }
          }
        }
      }
    `;

        const resp = await fetch(UPWORK_GRAPHQL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Upwork-API-GraphQL': '1',
            },
            body: JSON.stringify({ query, variables: { categoryId } }),
        });

        if (!resp.ok) {
            // GraphQL endpoint also blocked? Fall back to no results rather than crashing
            console.warn(`[upwork] GraphQL returned ${resp.status} for category ${categoryId}`);
            return [];
        }

        const data = (await resp.json()) as { data?: { search?: { jobs?: { jobs?: UpworkJob[] } } } };
        return data?.data?.search?.jobs?.jobs ?? [];
    }
}
