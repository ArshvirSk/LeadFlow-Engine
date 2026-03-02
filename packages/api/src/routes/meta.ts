/**
 * PROF-T03: Meta / reference-data routes
 *
 * GET /meta/skills — public, cached 24 h.
 * Returns the canonical skills list used by the SkillsAutocomplete component.
 */
import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillsData = JSON.parse(
    readFileSync(join(__dirname, '../data/skills.json'), 'utf-8'),
) as { skills: string[] };

const SKILLS: string[] = skillsData.skills;

export async function metaRoutes(app: FastifyInstance) {
    app.get('/meta/skills', async (_req, reply) => {
        return reply
            .header('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600')
            .send({ skills: SKILLS });
    });
}
