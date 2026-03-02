import { getLLMProvider } from '../../llm/LLMProviderFactory.js';
import type { OutreachContext } from '../OutreachContextBuilder.js';

// ─── Spec constraints ─────────────────────────────────────────────────────────
const MIN_WORDS   = 100;
const MAX_WORDS   = 160;
const MAX_SUBJECT = 8;   // words
const MAX_RETRIES = 1;

const BANNED_PHRASES = [
  'i am a seasoned',
  'i would love to',
  'please find attached',
  'feel free to',
  'hope this email finds you well',
  'do not hesitate to contact',
  'as per your requirements',
  'i am writing to express',
  'i am excited to',
  'synergy',
];

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ColdEmailDraft {
  subject: string;
  body: string;
  word_count: number;
  passed_validation: boolean;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

// ─── Validation ───────────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function validateEmail(subject: string, body: string): ValidationResult {
  const errors: string[] = [];

  const bodyWords    = countWords(body);
  const subjectWords = countWords(subject);

  if (bodyWords < MIN_WORDS)   errors.push(`body too short: ${bodyWords} words (min ${MIN_WORDS})`);
  if (bodyWords > MAX_WORDS)   errors.push(`body too long: ${bodyWords} words (max ${MAX_WORDS})`);
  if (subjectWords > MAX_SUBJECT) errors.push(`subject too long: ${subjectWords} words (max ${MAX_SUBJECT})`);

  const bodyLower = body.toLowerCase();
  const found = BANNED_PHRASES.filter(p => bodyLower.includes(p));
  if (found.length > 0) errors.push(`banned phrases: ${found.join(', ')}`);

  return { ok: errors.length === 0, errors };
}

// ─── Generator ────────────────────────────────────────────────────────────────

export class ColdEmailGenerator {
  async generate(ctx: OutreachContext): Promise<ColdEmailDraft> {
    let attempt = 0;
    let lastDraft: Omit<ColdEmailDraft, 'passed_validation'> | null = null;
    let lastErrors: string[] = [];

    while (attempt <= MAX_RETRIES) {
      const draft = await this.callLLM(ctx, attempt > 0 ? lastErrors : []);
      const validation = validateEmail(draft.subject, draft.body);

      if (validation.ok) {
        return { ...draft, passed_validation: true };
      }

      lastDraft  = draft;
      lastErrors = validation.errors;
      attempt++;
    }

    // Return last draft even if it didn't fully pass, flagged
    return { ...(lastDraft!), passed_validation: false };
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async callLLM(
    ctx: OutreachContext,
    previousErrors: string[],
  ): Promise<Omit<ColdEmailDraft, 'passed_validation'>> {
    const llm = getLLMProvider();

    const retryNote = previousErrors.length > 0
      ? `\n\nPREVIOUS ATTEMPT FAILED. Fix these issues:\n${previousErrors.map(e => `- ${e}`).join('\n')}`
      : '';

    const portfolioSnippet = ctx.portfolio.length > 0
      ? `\nRelevant portfolio:\n${ctx.portfolio
          .map(p => `- ${p.title}${p.key_outcome ? ': ' + p.key_outcome : ''}`)
          .join('\n')}`
      : '';

    const prompt = `Write a cold outreach email for a freelance opportunity.

FREELANCER: ${ctx.freelancer.first_name} ${ctx.freelancer.last_name}
Skills: ${ctx.freelancer.core_skills.join(', ')}
Experience: ${ctx.freelancer.experience_years} years | Rate: ${ctx.freelancer.hourly_rate}
${portfolioSnippet}

LEAD: "${ctx.lead.title}"
Source: ${ctx.lead.source}
Budget: ${ctx.lead.budget}
Skills required: ${ctx.lead.skills_required.join(', ') || 'not specified'}
${ctx.score?.ai_summary ? `AI assessment: ${ctx.score.ai_summary}` : ''}
${retryNote}

RULES:
- Subject line: max 8 words, no clickbait
- Body: exactly 100–160 words (count carefully)
- Do NOT use: "${BANNED_PHRASES.slice(0, 4).join('", "')}" or similar clichés
- Be specific about the lead's project, not generic
- One clear call to action at the end

Respond as JSON:
{
  "subject": "<subject line>",
  "body": "<email body>"
}`;

    const result = await llm.complete({
      system: 'You are an expert cold email writer for freelancers. Output valid JSON only.',
      user:   prompt,
      maxTokens: 600,
      temperature: 0.5,
    });

    let parsed: { subject: string; body: string };
    try {
      // Strip possible markdown code fences
      const cleaned = result.content.replace(/```json\n?|\n?```/g, '').trim();
      parsed = JSON.parse(cleaned) as { subject: string; body: string };
    } catch {
      // Fallback: try to extract with regex
      const subMatch  = result.content.match(/"subject"\s*:\s*"([^"]+)"/);
      const bodyMatch = result.content.match(/"body"\s*:\s*"([\s\S]+?)(?="\s*})/);
      parsed = {
        subject: subMatch?.[1]  ?? `Freelance inquiry: ${ctx.lead.title.slice(0, 40)}`,
        body:    bodyMatch?.[1] ?? result.content,
      };
    }

    return {
      subject:    parsed.subject.trim(),
      body:       parsed.body.trim(),
      word_count: countWords(parsed.body),
    };
  }
}
