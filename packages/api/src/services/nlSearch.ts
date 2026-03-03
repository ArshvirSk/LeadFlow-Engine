/**
 * FR-11: Natural Language Lead Search
 * Converts a free-text query into a structured filter JSON using the Gemini API,
 * then caches the result in Redis (1 h per user+query hash).
 */
import crypto from 'crypto';
import { connection as redis } from '../queues/index.js';

const CACHE_TTL_SECS = 3600; // 1 h

export interface NLSearchFilter {
    skills: string[] | null;
    min_budget: number | null;
    max_budget: number | null;
    budget_type: 'fixed' | 'hourly' | 'monthly' | null;
    max_age_days: number | null;
    source: string | null;
    remote: boolean | null;
    min_score: number | null;
    natural_language_summary: string;
}

export const NL_SEARCH_EXAMPLES = [
    'React projects over $5k posted this week',
    'Python retainers from HN',
    'Remote full-stack projects any budget',
];

const SYSTEM_PROMPT = `You are a lead search filter parser for a freelance lead management application.
Convert the user's natural language query into a structured JSON filter object.

Available filter fields:
- skills: string[] | null — technologies or skills (e.g. ["React", "TypeScript"])
- min_budget: number | null — minimum budget in USD
- max_budget: number | null — maximum budget in USD
- budget_type: "fixed" | "hourly" | "monthly" | null
- max_age_days: number | null — recency (7 = "this week", 30 = "this month", 1 = "today")
- source: "upwork" | "reddit" | "hn" | "remoteok" | "weworkremotely" | null
- remote: boolean | null
- min_score: number | null — minimum AI score 0-100 ("top leads" → 70, "great leads" → 80)
- natural_language_summary: string — 1 sentence summarising what will be shown

Return ONLY valid JSON with no markdown, no explanation, no code fences.

Examples:
Q: "React projects over $5k posted this week"
{"skills":["React"],"min_budget":5000,"max_budget":null,"budget_type":null,"max_age_days":7,"source":null,"remote":null,"min_score":null,"natural_language_summary":"Showing React projects over $5k from the last 7 days"}

Q: "Python retainers from HN"
{"skills":["Python"],"min_budget":null,"max_budget":null,"budget_type":"monthly","max_age_days":null,"source":"hn","remote":null,"min_score":null,"natural_language_summary":"Showing Python monthly retainer leads from Hacker News"}

Q: "Remote full-stack projects any budget"
{"skills":["full-stack"],"min_budget":null,"max_budget":null,"budget_type":"fixed","max_age_days":null,"source":null,"remote":true,"min_score":null,"natural_language_summary":"Showing remote full-stack project leads"}

Q: "top scoring leads this month"
{"skills":null,"min_budget":null,"max_budget":null,"budget_type":null,"max_age_days":30,"source":null,"remote":null,"min_score":70,"natural_language_summary":"Showing highly-scored leads from the last 30 days"}

Q: "cheap WordPress jobs under $500"
{"skills":["WordPress"],"min_budget":null,"max_budget":500,"budget_type":"fixed","max_age_days":null,"source":null,"remote":null,"min_score":null,"natural_language_summary":"Showing WordPress projects under $500"}`;

async function callGemini(query: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');
    const model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ parts: [{ text: query }] }],
            generationConfig: { maxOutputTokens: 300, temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(8000), // 8s hard timeout
    });

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Gemini API ${res.status}: ${errText}`);
    }
    const data = await res.json() as any;
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) throw new Error('Empty Gemini response');
    return text;
}

function stripFences(raw: string): string {
    return raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
}

export async function parseNLQuery(userId: string, query: string): Promise<NLSearchFilter> {
    const normalised = query.toLowerCase().trim();
    const cacheKey = `nl_search:${userId}:${crypto.createHash('sha256').update(normalised).digest('hex')}`;

    // ── Cache hit ──────────────────────────────────────────────────────────────
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
        try { return JSON.parse(cached); } catch { /* fall through on corrupt cache */ }
    }

    // ── LLM call ───────────────────────────────────────────────────────────────
    const rawText = await callGemini(query);
    let parsed: NLSearchFilter;

    try {
        parsed = JSON.parse(stripFences(rawText));
    } catch {
        // One retry with an explicit no-markdown instruction
        const retry = await callGemini(`Output ONLY raw JSON, no markdown. Query: ${query}`).catch(() => '{}');
        try {
            parsed = JSON.parse(stripFences(retry));
        } catch {
            throw new Error('PARSE_ERROR');
        }
    }

    // ── Cache result ───────────────────────────────────────────────────────────
    await redis.setex(cacheKey, CACHE_TTL_SECS, JSON.stringify(parsed)).catch(() => { });

    return parsed;
}
