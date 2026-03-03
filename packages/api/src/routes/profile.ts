import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { leadScores, portfolioPieces, userProfiles } from '../db/schema/index.js';
import { normalizedLeadsQueue, portfolioEmbeddingsQueue } from '../queues/index.js';

// ─── FR-03: inline PDF text extraction (no external deps) ───────────────────────────────────
function extractPdfText(buf: Buffer): string {
    // Read as latin1 so binary stays byte-for-byte
    const content = buf.toString('latin1');
    const parts: string[] = [];
    // Match PDF string literals in Tj / TJ operators
    const re = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*(?:Tj|'|")|(?:\[([^\]]*)\])\s*TJ/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
        if (m[1]) {
            parts.push(
                m[1]
                    .replace(/\\n/g, ' ')
                    .replace(/\\r/g, ' ')
                    .replace(/\\\(/g, '(')
                    .replace(/\\\)/g, ')')
                    .replace(/\\\\/g, '\\')
            );
        } else if (m[2]) {
            const inner = m[2];
            const strRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
            let sm: RegExpExecArray | null;
            while ((sm = strRe.exec(inner)) !== null) parts.push(sm[1]);
        }
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// ─── PROF-T07: Profile completeness score (weighted, 0–100) ──────────────────
function computeCompleteness(profile: {
    first_name: string;
    last_name: string;
    core_skills: string[];
    hourly_rate: string | null;
    min_budget: string | null;
    max_budget: string | null;
    portfolio_url: string | null;
    linkedin_url: string | null;
    experience_years: number;
    onboarding_completed: boolean;
}): number {
    let score = 0;
    // Name — 10 pts
    if (profile.first_name.trim() && profile.last_name.trim()) score += 10;
    // Skills — up to 30 pts (≥1 → +20, ≥3 → additional +10)
    const skillCount = profile.core_skills.length;
    if (skillCount >= 1) score += 20;
    if (skillCount >= 3) score += 10;
    // Rate — 15 pts
    if (profile.hourly_rate) score += 15;
    // Budget range — 10 pts (either bound counts)
    if (profile.min_budget || profile.max_budget) score += 10;
    // Portfolio URL — 10 pts
    if (profile.portfolio_url?.trim()) score += 10;
    // LinkedIn — 10 pts
    if (profile.linkedin_url?.trim()) score += 10;
    // Experience > 0 — 5 pts
    if (profile.experience_years > 0) score += 5;
    // Onboarding completed — 10 pts
    if (profile.onboarding_completed) score += 10;
    return Math.min(100, score);
}

const UpsertProfileSchema = z.object({
    first_name: z.string().max(255).optional(),
    last_name: z.string().max(255).optional(),
    core_skills: z.array(z.string()).optional(),
    timezone: z.string().optional(),
    hourly_rate: z.number().optional(),
    min_budget: z.number().optional(),
    max_budget: z.number().optional(),
    availability: z.string().optional(),
    portfolio_url: z.string().url().optional().or(z.literal('')).optional(),
    linkedin_url: z.string().url().optional().or(z.literal('')).optional(),
    notification_settings: z.record(z.any()).optional(),
    autopilot_rules: z.record(z.any()).optional(),
    onboarding_completed: z.boolean().optional(),
});

const PortfolioPieceSchema = z.object({
    title: z.string().max(255),
    description: z.string().max(5000),
    url: z.string().url().optional(),
    skills_demonstrated: z.array(z.string()).default([]),
    outcomes: z.string().max(2000).optional(),
});

export async function profileRoutes(app: FastifyInstance) {
    // GET /profile
    app.get('/profile', async (req, reply) => {
        const userId = (req as any).clerkUserId as string;
        const [profile] = await db
            .select()
            .from(userProfiles)
            .where(eq(userProfiles.clerk_user_id, userId))
            .limit(1);
        if (!profile) return reply.status(404).send({ error: 'Profile not found' });
        return reply.send(profile);
    });

    // PUT /profile (upsert)
    app.put('/profile', async (req, reply) => {
        const userId = (req as any).clerkUserId as string;
        const data = UpsertProfileSchema.parse(req.body);

        const [existing] = await db
            .select({ id: userProfiles.id })
            .from(userProfiles)
            .where(eq(userProfiles.clerk_user_id, userId))
            .limit(1);

        const { hourly_rate, min_budget, max_budget, ...rest } = data;
        const dbData = {
            ...rest,
            ...(hourly_rate !== undefined && { hourly_rate: String(hourly_rate) }),
            ...(min_budget !== undefined && { min_budget: String(min_budget) }),
            ...(max_budget !== undefined && { max_budget: String(max_budget) }),
        };

        if (existing) {
            await db
                .update(userProfiles)
                .set({ ...dbData, updated_at: new Date() })
                .where(eq(userProfiles.clerk_user_id, userId));
        } else {
            await db.insert(userProfiles).values({ clerk_user_id: userId, email: '', ...dbData });
        }

        const [updated] = await db
            .select()
            .from(userProfiles)
            .where(eq(userProfiles.clerk_user_id, userId))
            .limit(1);

        // PROF-T07: recompute completeness from the persisted state
        const completeness = computeCompleteness(updated);
        await db
            .update(userProfiles)
            .set({ profile_completeness: completeness })
            .where(eq(userProfiles.clerk_user_id, userId));

        // Re-score existing leads if any score-affecting field was updated
        const SCORE_AFFECTING = ['core_skills', 'hourly_rate', 'min_budget', 'max_budget'] as const;
        const needsRescore = SCORE_AFFECTING.some(f => data[f as keyof typeof data] !== undefined);
        if (needsRescore) {
            const scored = await db
                .select({ lead_id: leadScores.lead_id })
                .from(leadScores)
                .where(eq(leadScores.user_id, userId))
                .orderBy(desc(leadScores.updated_at))
                .limit(200);
            if (scored.length > 0) {
                await normalizedLeadsQueue.addBulk(
                    scored.map(({ lead_id }) => ({
                        name: 'rescore',
                        data: { lead_id },
                    }))
                );
            }
        }

        return reply.send({ ...updated, profile_completeness: completeness });
    });

    // GET /profile/portfolio
    app.get('/profile/portfolio', async (req, reply) => {
        const userId = (req as any).clerkUserId as string;
        const pieces = await db
            .select()
            .from(portfolioPieces)
            .where(eq(portfolioPieces.user_id, userId));
        return reply.send(pieces);
    });

    // POST /profile/portfolio
    app.post('/profile/portfolio', async (req, reply) => {
        const userId = (req as any).clerkUserId as string;
        const data = PortfolioPieceSchema.parse(req.body);
        const [piece] = await db
            .insert(portfolioPieces)
            .values({ user_id: userId, ...data })
            .returning();
        await portfolioEmbeddingsQueue.add('embed', {
            portfolio_piece_id: piece.id,
            user_id: userId,
            operation: 'create',
        });
        return reply.status(201).send(piece);
    });

    // PUT /profile/portfolio/:id
    app.put('/profile/portfolio/:id', async (req, reply) => {
        const userId = (req as any).clerkUserId as string;
        const { id } = req.params as { id: string };
        const data = PortfolioPieceSchema.parse(req.body);

        const [existing] = await db
            .select()
            .from(portfolioPieces)
            .where(eq(portfolioPieces.id, id))
            .limit(1);
        if (!existing || existing.user_id !== userId)
            return reply.status(404).send({ error: 'Not found' });

        const [updated] = await db
            .update(portfolioPieces)
            .set({ ...data, embedding_status: 'pending', updated_at: new Date() })
            .where(eq(portfolioPieces.id, id))
            .returning();

        await portfolioEmbeddingsQueue.add('embed', {
            portfolio_piece_id: id,
            user_id: userId,
            operation: 'update',
        });
        return reply.send(updated);
    });

    // DELETE /profile/portfolio/:id
    app.delete('/profile/portfolio/:id', async (req, reply) => {
        const userId = (req as any).clerkUserId as string;
        const { id } = req.params as { id: string };
        const [existing] = await db
            .select()
            .from(portfolioPieces)
            .where(eq(portfolioPieces.id, id))
            .limit(1);
        if (!existing || existing.user_id !== userId)
            return reply.status(404).send({ error: 'Not found' });
        await db.delete(portfolioPieces).where(eq(portfolioPieces.id, id));
        return reply.status(204).send();
    });

    // POST /profile/portfolio/upload — FR-03: extract text from a base64-encoded PDF
    app.post('/profile/portfolio/upload', async (req, reply) => {
        const { pdf_base64 } = req.body as { pdf_base64?: string };
        if (!pdf_base64) return reply.status(400).send({ error: 'pdf_base64 is required' });

        let buf: Buffer;
        try {
            buf = Buffer.from(pdf_base64, 'base64');
        } catch {
            return reply.status(400).send({ error: 'Invalid base64' });
        }

        if (buf.length > 5 * 1024 * 1024) {
            return reply.status(400).send({ error: 'File too large (max 5 MB)' });
        }

        const text = extractPdfText(buf).slice(0, 1000);
        return reply.send({ text });
    });
}
