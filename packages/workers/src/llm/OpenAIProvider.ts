import type { LLMCompletion, LLMPrompt, LLMProvider } from '@leadflow/types';
import OpenAI from 'openai';

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_BATCH_SIZE = 100; // OpenAI max per call

export class OpenAIProvider implements LLMProvider {
    private client: OpenAI;

    constructor() {
        // Use a placeholder so the OpenAI SDK doesn't throw at startup;
        // actual API calls will fail with a 401 if the key is missing.
        this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? 'sk-placeholder' });
    }

    async complete(prompt: LLMPrompt): Promise<LLMCompletion> {
        const resp = await this.client.chat.completions.create({
            model: OPENAI_MODEL,
            max_tokens: prompt.maxTokens ?? 1024,
            temperature: prompt.temperature ?? 0.7,
            messages: [
                ...(prompt.system ? [{ role: 'system' as const, content: prompt.system }] : []),
                { role: 'user' as const, content: prompt.user },
            ],
        });
        return {
            content: resp.choices[0].message.content ?? '',
            inputTokens: resp.usage?.prompt_tokens ?? 0,
            outputTokens: resp.usage?.completion_tokens ?? 0,
            model: OPENAI_MODEL,
        };
    }

    async completeBatch(prompts: LLMPrompt[]): Promise<LLMCompletion[]> {
        return Promise.all(prompts.map(p => this.complete(p)));
    }

    /** Batches input into chunks of 100 — OpenAI's max per request */
    async embed(texts: string[]): Promise<number[][]> {
        const results: number[][] = [];
        for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
            const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
            const resp = await this.client.embeddings.create({
                model: EMBED_MODEL,
                input: batch,
            });
            results.push(...resp.data.sort((a, b) => a.index - b.index).map(d => d.embedding));
        }
        return results;
    }
}
