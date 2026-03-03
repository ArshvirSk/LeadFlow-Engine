import { getLLMProvider } from '../../llm/LLMProviderFactory.js';
import type { OutreachContext } from '../OutreachContextBuilder.js';
import { getTimeAgo } from '../OutreachContextBuilder.js';

// ─── Spec constraints ─────────────────────────────────────────────────────────
const MAX_CHARS = 280;
const MAX_RETRIES = 1;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface TwitterDraft {
    dm: string;
    passed_validation: boolean;
}

// ─── Generator ────────────────────────────────────────────────────────────────
export class TwitterDMGenerator {
    async generate(ctx: OutreachContext): Promise<TwitterDraft> {
        let attempt = 0;
        let lastDm = '';

        while (attempt <= MAX_RETRIES) {
            const dm = await this.callLLM(ctx, attempt > 0 ? lastDm.length : 0);
            if (dm.length <= MAX_CHARS) return { dm, passed_validation: true };
            lastDm = dm;
            attempt++;
        }

        // Hard-truncate to word boundary
        return { dm: truncateAtWord(lastDm, MAX_CHARS), passed_validation: false };
    }

    // ─── Private ───────────────────────────────────────────────────────────────
    private async callLLM(ctx: OutreachContext, previousLength: number): Promise<string> {
        const llm = getLLMProvider();

        const retryNote = previousLength > MAX_CHARS
            ? `\n\nCRITICAL: Previous attempt was ${previousLength} characters. MUST be ≤ ${MAX_CHARS} characters total.`
            : '';

        const triggerHint = ctx.trigger_event_context
            ? ` They ${ctx.trigger_event_context.summary}.`
            : '';

        const boomerangHint = ctx.boomerang_context
            ? ` (I reached out about something similar ${getTimeAgo(ctx.boomerang_context.contacted_at)} ago)`
            : '';

        const portfolioUrl = ctx.portfolio[0]?.url ?? null;

        const prompt = `Write a Twitter/X DM for a freelance inquiry. HARD LIMIT: ≤ ${MAX_CHARS} CHARACTERS TOTAL.

FREELANCER: ${ctx.freelancer.first_name}, ${ctx.freelancer.core_skills[0]} specialist${boomerangHint}
LEAD: "${ctx.lead.title}"${triggerHint}
${portfolioUrl ? `Portfolio example: ${portfolioUrl}` : ''}
${retryNote}
REQUIREMENTS:
- ≤ ${MAX_CHARS} characters INCLUDING spaces and punctuation (count carefully)
- 2–3 short sentences maximum
- Casual, direct Twitter tone
- Hook in sentence 1, value/proof in sentence 2, soft CTA in sentence 3
- No "I would love to", no "I am a seasoned"
- Output ONLY the DM text — no quotes, no JSON, no explanation`;

        const result = await llm.complete({
            system: `You write Twitter DMs for freelancers. Output ONLY the DM text. Maximum ${MAX_CHARS} characters. No extra text.`,
            user: prompt,
            maxTokens: 120,
            temperature: 0.6,
        });

        // Strip any surrounding quotes the model may add
        return result.content.trim().replace(/^["']|["']$/g, '');
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function truncateAtWord(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    const cut = text.slice(0, maxChars - 1);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > maxChars * 0.7 ? cut.slice(0, lastSpace) : cut) + '…';
}
