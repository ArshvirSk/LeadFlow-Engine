import { sql } from 'drizzle-orm';
import { db } from '../db.js';

export interface PortfolioMatchResult {
    portfolio_piece_id: string;
    title: string;
    url: string | null;
    similarity: number;
    key_outcome: string | null;
}

/** Minimum cosine similarity to include a portfolio piece as a match */
const SIMILARITY_THRESHOLD = 0.72;
const MAX_MATCHES = 3;

export class PortfolioMatcher {
    /**
     * Find the top portfolio pieces most relevant to a lead, using pgvector
     * cosine similarity between the lead's embedding and each piece's embedding.
     * Only pieces that have been indexed (embedding_status = 'ready') are checked.
     */
    async match(
        leadEmbedding: number[],
        userId: string,
    ): Promise<PortfolioMatchResult[]> {
        if (!leadEmbedding || leadEmbedding.length === 0) {
            return [];
        }

        const vectorLiteral = `[${leadEmbedding.join(',')}]`;

        const rows = await db.execute(sql`
            SELECT id,
                   title,
                   url,
                   outcomes,
                   1 - (embedding <=> ${sql.raw(vectorLiteral)}::vector) AS similarity
            FROM   portfolio_pieces
            WHERE  user_id          = ${userId}
              AND  embedding        IS NOT NULL
              AND  embedding_status = 'ready'
              AND  1 - (embedding <=> ${sql.raw(vectorLiteral)}::vector) >= ${SIMILARITY_THRESHOLD}
            ORDER BY embedding <=> ${sql.raw(vectorLiteral)}::vector ASC
            LIMIT  ${MAX_MATCHES}
        `);

        return (rows.rows as any[]).map((row: any) => ({
            portfolio_piece_id: row.id as string,
            title: row.title as string,
            url: (row.url as string | null) ?? null,
            similarity: Math.round(Number(row.similarity) * 100) / 100,
            key_outcome: (row.outcomes as string | null) ?? null,
        }));
    }
}
