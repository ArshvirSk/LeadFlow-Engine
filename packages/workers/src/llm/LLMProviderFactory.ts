import type { LLMProvider } from '@leadflow/types';
import { ClaudeProvider } from './ClaudeProvider.js';
import { GeminiProvider } from './GeminiProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';

let _instance: LLMProvider | null = null;

/**
 * Returns a singleton LLMProvider.
 * Switch providers via LLM_PROVIDER=gemini|claude|openai (default: gemini).
 */
export function getLLMProvider(): LLMProvider {
    if (!_instance) {
        const provider = process.env.LLM_PROVIDER ?? 'gemini';
        if (provider === 'openai') {
            _instance = new OpenAIProvider();
        } else if (provider === 'claude') {
            _instance = new ClaudeProvider();
        } else {
            _instance = new GeminiProvider();
        }
    }
    return _instance;
}

/** Force a new instance (useful in tests) */
export function resetLLMProvider(): void {
    _instance = null;
}
