import { getLLMProvider } from '../../llm/LLMProviderFactory.js';
import type { OutreachContext } from '../OutreachContextBuilder.js';
import { buildTriggerAngle, getTimeAgo } from '../OutreachContextBuilder.js';

// ─── Spec constraints ─────────────────────────────────────────────────────────
const MAX_CONNECTION_NOTE = 300;
const MAX_INMAIL_BODY = 1900;
const MAX_RETRIES = 1;

const BANNED_PHRASES = [
    'i would love to connect',
    'i am a seasoned',
    'hope this message finds you well',
    'i am reaching out to',
    'please find attached',
    'synergy',
    'touch base',
];

// ─── Types ────────────────────────────────────────────────────────────────────
export interface LinkedInDraft {
    connection_note: string;   // < 300 chars
    inmail_subject: string;
    inmail_body: string;   // < 1900 chars
    passed_validation: boolean;
}

// ─── Validation ───────────────────────────────────────────────────────────────
function validateLinkedIn(draft: Omit<LinkedInDraft, 'passed_validation'>): string[] {
    const errors: string[] = [];

    if (draft.connection_note.length > MAX_CONNECTION_NOTE)
        errors.push(`connection_note too long: ${draft.connection_note.length} chars (max ${MAX_CONNECTION_NOTE})`);

    if (draft.inmail_body.length > MAX_INMAIL_BODY)
        errors.push(`inmail_body too long: ${draft.inmail_body.length} chars (max ${MAX_INMAIL_BODY})`);

    const combined = (draft.connection_note + ' ' + draft.inmail_body).toLowerCase();
    const found = BANNED_PHRASES.filter(p => combined.includes(p));
    if (found.length > 0) errors.push(`banned phrases: ${found.join(', ')}`);

    return errors;
}

// ─── Generator ────────────────────────────────────────────────────────────────
export class LinkedInGenerator {
    async generate(ctx: OutreachContext): Promise<LinkedInDraft> {
        let attempt = 0;
        let lastDraft: Omit<LinkedInDraft, 'passed_validation'> | null = null;
        let lastErrors: string[] = [];

        while (attempt <= MAX_RETRIES) {
            const draft = await this.callLLM(ctx, attempt > 0 ? lastErrors : []);
            const errors = validateLinkedIn(draft);
            if (errors.length === 0) return { ...draft, passed_validation: true };
            lastDraft = draft;
            lastErrors = errors;
            attempt++;
        }

        return { ...(lastDraft!), passed_validation: false };
    }

    // ─── Private ───────────────────────────────────────────────────────────────
    private async callLLM(
        ctx: OutreachContext,
        previousErrors: string[],
    ): Promise<Omit<LinkedInDraft, 'passed_validation'>> {
        const llm = getLLMProvider();

        const retryNote = previousErrors.length > 0
            ? `\n\nFix these from the previous attempt:\n${previousErrors.map(e => `- ${e}`).join('\n')}`
            : '';

        const portfolioLine = ctx.portfolio.length > 0
            ? `Portfolio: ${ctx.portfolio
                .map(p => p.title + (p.key_outcome ? ` (${p.key_outcome})` : ''))
                .slice(0, 2)
                .join('; ')}`
            : '';

        const boomerangNote = ctx.boomerang_context
            ? `PRIOR CONTACT: Similar project ${getTimeAgo(ctx.boomerang_context.contacted_at)} ago, outcome: ${ctx.boomerang_context.outcome}. Reference this subtly if it helps.`
            : '';

        const triggerNote = ctx.trigger_event_context
            ? `COMPANY NEWS: ${buildTriggerAngle(ctx.trigger_event_context)} — reference this in the connection note.`
            : '';

        const contextLines = [portfolioLine, boomerangNote, triggerNote].filter(Boolean).join('\n');

        const prompt = `Write LinkedIn outreach for a freelance opportunity.

FREELANCER: ${ctx.freelancer.first_name} ${ctx.freelancer.last_name}
Skills: ${ctx.freelancer.core_skills.slice(0, 5).join(', ')} | ${ctx.freelancer.experience_years}y exp | ${ctx.freelancer.hourly_rate}
${contextLines ? contextLines + '\n' : ''}
OPPORTUNITY: "${ctx.lead.title}"
Client: ${ctx.lead.client_name ?? 'unknown'} | Budget: ${ctx.lead.budget} | Skills needed: ${ctx.lead.skills_required.slice(0, 6).join(', ') || 'not specified'}
${retryNote}
RULES:
- connection_note: STRICTLY ≤ ${MAX_CONNECTION_NOTE} chars. Hook in first sentence. No "would love to connect".
- inmail_subject: 5–7 words, specific to their project.
- inmail_body: STRICTLY ≤ ${MAX_INMAIL_BODY} chars. Conversational, 3–4 short paragraphs. One clear CTA at the end.
- Both must reference their specific opportunity, not be generic.
- No clichés, no empty openers.

Output JSON only:
{
  "connection_note": "...",
  "inmail_subject": "...",
  "inmail_body": "..."
}`;

        const result = await llm.complete({
            system: 'You are an expert LinkedIn outreach writer for freelancers. Output valid JSON only. No extra text.',
            user: prompt,
            maxTokens: 900,
            temperature: 0.5,
        });

        let parsed: { connection_note: string; inmail_subject: string; inmail_body: string };
        try {
            const cleaned = result.content.replace(/```json\n?|\n?```/g, '').trim();
            parsed = JSON.parse(cleaned);
        } catch {
            const title60 = ctx.lead.title.slice(0, 60);
            parsed = {
                connection_note: `Saw your "${title60}" post — I specialise in ${ctx.freelancer.core_skills[0]}. Would love to help.`.slice(0, MAX_CONNECTION_NOTE),
                inmail_subject: `Re: ${ctx.lead.title.slice(0, 40)}`,
                inmail_body: result.content.slice(0, MAX_INMAIL_BODY),
            };
        }

        return {
            connection_note: parsed.connection_note.trim().slice(0, MAX_CONNECTION_NOTE),
            inmail_subject: parsed.inmail_subject.trim(),
            inmail_body: parsed.inmail_body.trim().slice(0, MAX_INMAIL_BODY),
        };
    }
}
