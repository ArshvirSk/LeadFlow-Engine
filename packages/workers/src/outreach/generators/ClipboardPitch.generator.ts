import { getLLMProvider } from '../../llm/LLMProviderFactory.js';
import type { OutreachContext } from '../OutreachContextBuilder.js';

// ─── Spec constraints ─────────────────────────────────────────────────────────
const MIN_LINES = 5;
const MAX_LINES = 8;
const MAX_RETRIES = 1;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ClipboardDraft {
    pitch: string;
    line_count: number;
    passed_validation: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function countNonEmptyLines(text: string): number {
    return text.split('\n').filter(l => l.trim().length > 0).length;
}

// ─── Generator ────────────────────────────────────────────────────────────────
export class ClipboardPitchGenerator {
    async generate(ctx: OutreachContext): Promise<ClipboardDraft> {
        let attempt = 0;
        let lastDraft: Omit<ClipboardDraft, 'passed_validation'> | null = null;

        while (attempt <= MAX_RETRIES) {
            const pitch = await this.callLLM(ctx, lastDraft ? lastDraft.line_count : 0);
            const lineCount = countNonEmptyLines(pitch);
            const ok = lineCount >= MIN_LINES && lineCount <= MAX_LINES;

            if (ok) return { pitch, line_count: lineCount, passed_validation: true };
            lastDraft = { pitch, line_count: lineCount };
            attempt++;
        }

        return { ...(lastDraft!), passed_validation: false };
    }

    // ─── Private ───────────────────────────────────────────────────────────────
    private async callLLM(ctx: OutreachContext, previousLineCount: number): Promise<string> {
        const llm = getLLMProvider();

        const retryNote = previousLineCount > 0 && (previousLineCount < MIN_LINES || previousLineCount > MAX_LINES)
            ? `\n\nPREVIOUS ATTEMPT HAD ${previousLineCount} lines. You MUST write exactly ${MIN_LINES}–${MAX_LINES} non-empty lines.`
            : '';

        const portfolioLinks = ctx.portfolio
            .filter(p => p.url)
            .slice(0, 2)
            .map(p => p.url!)
            .join('\n');

        const prompt = `Write a universal clipboard pitch for a freelancer.
This pitch must work pasted on any platform — Slack, Discord, Upwork, Reddit, job boards — without any platform-specific formatting.

FREELANCER: ${ctx.freelancer.first_name} ${ctx.freelancer.last_name}
Skills: ${ctx.freelancer.core_skills.join(', ')}
Experience: ${ctx.freelancer.experience_years} years | Rate: ${ctx.freelancer.hourly_rate}
${portfolioLinks ? `Portfolio links:\n${portfolioLinks}` : ''}

FOR OPPORTUNITY: "${ctx.lead.title}"
Skills needed: ${ctx.lead.skills_required.join(', ') || 'not specified'}
${ctx.score?.ai_summary ? `Context: ${ctx.score.ai_summary}` : ''}
${retryNote}
RULES:
- EXACTLY ${MIN_LINES}–${MAX_LINES} non-empty lines (count each line individually)
- OUTCOME-FIRST: Line 1 must state a concrete result or outcome the client will get — NOT "My name is" or "I am"
- No markdown, no bullet symbols (-, *, •), no numbered lists — plain text lines only
- Include 1–2 portfolio URLs on their own lines (if available above)
- Soft CTA on the final line
- Neutral tone — works across all platforms and industries

Output ONLY the pitch lines — no JSON, no quotes, no explanation.`;

        const result = await llm.complete({
            system: 'You write plain-text clipboard pitches for freelancers. Output ONLY the pitch — no extra text, no formatting symbols.',
            user: prompt,
            maxTokens: 350,
            temperature: 0.5,
        });

        // Normalise line endings, strip leading/trailing blanks, collapse 3+ blank lines to 1
        return result.content
            .trim()
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n');
    }
}
