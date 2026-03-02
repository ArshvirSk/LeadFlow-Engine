import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LLMCompletion, LLMPrompt, LLMProvider } from '@leadflow/types';

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

export class GeminiProvider implements LLMProvider {
    private client: GoogleGenerativeAI;

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
        this.client = new GoogleGenerativeAI(apiKey);
    }

    async complete(prompt: LLMPrompt): Promise<LLMCompletion> {
        return this.withRetry(async () => {
            const model = this.client.getGenerativeModel({
                model: GEMINI_MODEL,
                ...(prompt.system && {
                    systemInstruction: { role: 'system', parts: [{ text: prompt.system }] },
                }),
                generationConfig: {
                    maxOutputTokens: prompt.maxTokens ?? 1024,
                    temperature: prompt.temperature ?? 0.7,
                },
            });

            const result = await model.generateContent(prompt.user);
            const text = result.response.text();
            const usage = result.response.usageMetadata;

            return {
                content: text,
                inputTokens: usage?.promptTokenCount ?? 0,
                outputTokens: usage?.candidatesTokenCount ?? 0,
                model: GEMINI_MODEL,
            };
        });
    }

    async completeBatch(prompts: LLMPrompt[]): Promise<LLMCompletion[]> {
        // Sequential to stay within rate limits
        const results: LLMCompletion[] = [];
        for (const p of prompts) {
            results.push(await this.complete(p));
        }
        return results;
    }

    /** Gemini doesn't generate standalone embeddings via this SDK — no-op returning empty arrays */
    async embed(texts: string[]): Promise<number[][]> {
        // If OpenAI key is available, delegate; otherwise return empty (embeddings are optional in Phase 1)
        if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith('sk-...')) {
            const { OpenAIProvider } = await import('./OpenAIProvider.js');
            return new OpenAIProvider().embed(texts);
        }
        console.warn('[GeminiProvider] No embedding provider available — skipping embeddings');
        return texts.map(() => []);
    }

    private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
        let lastErr: unknown;
        for (let i = 0; i <= MAX_RETRIES; i++) {
            try {
                return await fn();
            } catch (err: any) {
                lastErr = err;
                const status = err?.status ?? err?.httpStatusCode;
                if (![429, 500, 503].includes(status)) throw err;
                const delay = RETRY_DELAYS[i] ?? 4000;
                console.warn(`[Gemini] ${status} — retrying in ${delay}ms (attempt ${i + 1}/${MAX_RETRIES})`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
        throw lastErr;
    }
}
