import { sql } from 'drizzle-orm';
import { db } from '../db.js';

export interface BoomerangResult {
    is_boomerang: boolean;
    ref_id?: string;
    context?: {
        contacted_at: string;
        outcome: string;
        ai_summary: string;
        similarity: number;
    };
}

const BOOMERANG_THRESHOLD = 0.85;
const NEAR_DEDUP_THRESHOLD = 0.92;
const NEAR_DEDUP_WINDOW_DAYS = 30;
const HISTORY_WINDOW_DAYS = 180;

export class BoomerangDetector {
    /**
     * Check whether a newly ingested lead is a "boomerang" — a lead that closely
     * matches one the user previously contacted, but was created more than 30 days
     * ago (so it's not just a re-posting of the same job, but a recurring need).
     */
    async detect(
        userId: string,
        embedding: number[],
    ): Promise<BoomerangResult> {
        if (!embedding || embedding.length === 0) {
            return { is_boomerang: false };
        }

        const vectorLiteral = `[${embedding.join(',')}]`;

        const rows = await db.execute(sql`
            SELECT id,
                   lead_snapshot,
                   contacted_at,
                   outcome,
                   1 - (lead_embedding <=> ${sql.raw(vectorLiteral)}::vector) AS similarity
            FROM   lead_history
            WHERE  user_id     = ${userId}
              AND  archived_at > NOW() - INTERVAL '${sql.raw(String(HISTORY_WINDOW_DAYS))} days'
              AND  lead_embedding IS NOT NULL
            ORDER BY lead_embedding <=> ${sql.raw(vectorLiteral)}::vector ASC
            LIMIT  1
        `);

        const row = rows.rows[0] as {
            id: string;
            lead_snapshot: Record<string, unknown>;
            contacted_at: Date | string;
            outcome: string | null;
            similarity: string;
        } | undefined;

        if (!row) return { is_boomerang: false };

        const similarity = Number(row.similarity);
        if (similarity < BOOMERANG_THRESHOLD) return { is_boomerang: false };

        // Near-duplicate within 30 days → already handled by the dedup step
        const daysSince = (Date.now() - new Date(row.contacted_at).getTime()) / 86_400_000;
        if (similarity >= NEAR_DEDUP_THRESHOLD && daysSince < NEAR_DEDUP_WINDOW_DAYS) {
            return { is_boomerang: false };
        }

        return {
            is_boomerang: true,
            ref_id: row.id,
            context: {
                contacted_at: new Date(row.contacted_at).toISOString(),
                outcome: row.outcome ?? 'no_reply',
                ai_summary: (row.lead_snapshot as any)?.ai_summary ?? '',
                similarity: Math.round(similarity * 100) / 100,
            },
        };
    }
}
