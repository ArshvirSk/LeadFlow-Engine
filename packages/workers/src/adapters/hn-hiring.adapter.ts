/**
 * HN "Freelancer? Seeking freelancer?" adapter
 *
 * Every month whoishiring posts two threads on Hacker News:
 *   • "Ask HN: Who is Hiring?" — companies looking for full-time employees ❌
 *   • "Ask HN: Freelancer? Seeking freelancer?" — clients + freelancers ✅
 *
 * We only consume comments from the SECOND thread that start with
 * [SEEKING FREELANCER] — those are clients who have a project and want to hire.
 * ([SEEKING WORK] comments are freelancers advertising; we skip those.)
 */

import type { Lead, RawLeadItem, SourceAdapter } from '@leadflow/types';

const ALGOLIA_BASE = 'https://hn.algolia.com/api/v1';

interface AlgoliaHit {
    objectID: string;
    author: string;
    comment_text?: string;
    created_at?: string;
    [key: string]: unknown;
}

export class HNHiringAdapter implements SourceAdapter {
    id = 'hn_hiring';
    schedule = '0 */6 * * *'; // every 6 hours

    async poll(): Promise<RawLeadItem[]> {
        const storyId = await this.getFreelanceStoryId();
        if (!storyId) {
            console.warn('[hn_hiring] could not find current "Freelancer? Seeking freelancer?" story');
            return [];
        }

        const url =
            `${ALGOLIA_BASE}/search?tags=comment,story_${storyId}` +
            `&hitsPerPage=200&attributesToRetrieve=objectID,author,comment_text,created_at`;

        const resp = await fetch(url);
        if (!resp.ok) return [];

        const data = (await resp.json()) as { hits?: AlgoliaHit[] };

        // Only keep [SEEKING FREELANCER] comments — those are clients with projects
        const projectPosts = (data.hits ?? []).filter(hit =>
            /^\[SEEKING FREELANCER/i.test((hit.comment_text ?? '').trimStart())
        );

        return projectPosts.map(hit => ({
            rawId: hit.objectID,
            raw: hit as unknown as Record<string, unknown>,
            fetchedAt: new Date(),
        }));
    }

    normalize(item: RawLeadItem): Partial<Lead> {
        const raw = item.raw as AlgoliaHit;
        const body = raw.comment_text ?? '';

        // First line after the [SEEKING FREELANCER: ...] tag is usually the project summary
        const lines = body.split('\n').map(l => l.trim()).filter(Boolean);

        // Strip the tag prefix to get a clean first line
        const tagStripped = lines[0]?.replace(/^\[SEEKING FREELANCER[^\]]*\]\s*/i, '') ?? '';
        const title = tagStripped.length > 10
            ? tagStripped.slice(0, 120)
            : `Project by ${raw.author ?? 'Anonymous'} via HN`;

        return {
            source: this.id,
            source_id: item.rawId,
            title,
            description: body,
            url: `https://news.ycombinator.com/item?id=${item.rawId}`,
            client_name: raw.author ?? null,
            status: 'new',
            remote: /remote/i.test(body),
        };
    }

    async healthCheck() {
        try {
            const resp = await fetch(`${ALGOLIA_BASE}/search?query=test&hitsPerPage=1`);
            return resp.ok ? 'healthy' : 'degraded';
        } catch {
            return 'down';
        }
    }

    // ─── Private ───────────────────────────────────────────────────────────────

    /** Find the latest "Freelancer? Seeking freelancer?" thread by whoishiring. */
    private async getFreelanceStoryId(): Promise<string | null> {
        const now = new Date();
        const month = now.toLocaleString('en-US', { month: 'long' });
        const year = now.getFullYear();
        const query = encodeURIComponent(`Freelancer? Seeking freelancer? (${month} ${year})`);

        const url =
            `${ALGOLIA_BASE}/search?query=${query}` +
            `&tags=story,author_whoishiring` +
            `&hitsPerPage=5` +
            `&attributesToRetrieve=objectID,title,author`;

        const resp = await fetch(url);
        if (!resp.ok) return null;

        const data = (await resp.json()) as {
            hits?: Array<{ objectID: string; title?: string; author?: string }>;
        };

        const story = (data.hits ?? []).find(
            h => /freelancer.*seeking freelancer/i.test(h.title ?? '') && h.author === 'whoishiring'
        );
        return story?.objectID ?? null;
    }
}
