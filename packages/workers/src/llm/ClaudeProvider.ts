import Anthropic from '@anthropic-ai/sdk';
import type { LLMCompletion, LLMPrompt, LLMProvider } from '@leadflow/types';

const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? 'claude-3-5-sonnet-20241022';
const MAX_RETRIES = 3;
const RETRY_STATUS = new Set([429, 500, 503, 529]);

export class ClaudeProvider implements LLMProvider {
    private client: Anthropic;

    constructor() {
        this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }

    async complete(prompt: LLMPrompt): Promise<LLMCompletion> {
        return this.withRetry(async () => {
            const resp = await this.client.messages.create({
                model: CLAUDE_MODEL,
                max_tokens: prompt.maxTokens ?? 1024,
                temperature: prompt.temperature ?? 0.7,
                ...(prompt.system && { system: prompt.system }),
                messages: [{ role: 'user', content: prompt.user }],
            });
            return {
                content: (resp.content[0] as Anthropic.TextBlock).text,
                inputTokens: resp.usage.input_tokens,
                outputTokens: resp.usage.output_tokens,
                model: CLAUDE_MODEL,
            };
        });
    }

    async completeBatch(prompts: LLMPrompt[]): Promise<LLMCompletion[]> {
        // Sequential to respect rate limits; parallelise in Phase 2 with Anthropic Batch API
        const results: LLMCompletion[] = [];
        for (const p of prompts) {
            results.push(await this.complete(p));
        }
        return results;
    }

    /** Claude doesn't generate embeddings — delegate to OpenAI if available */
    async embed(texts: string[]): Promise<number[][]> {
        if (!process.env.OPENAI_API_KEY) {
            console.warn('[ClaudeProvider] OPENAI_API_KEY not set — skipping embeddings');
            return texts.map(() => []);
        }
        const { OpenAIProvider } = await import('./OpenAIProvider.js');
        return new OpenAIProvider().embed(texts);
    }

    private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
        let lastErr: unknown;
        for (let i = 0; i <= MAX_RETRIES; i++) {
            try {
                return await fn();
            } catch (err: any) {
                lastErr = err;
                if (!RETRY_STATUS.has(err?.status)) throw err;
                const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
                console.warn(`[Claude] ${err.status} — retrying in ${delay}ms (attempt ${i + 1}/${MAX_RETRIES})`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
        throw lastErr;
    }
}
