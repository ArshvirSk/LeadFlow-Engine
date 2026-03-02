// ─── Prompt / Completion shapes ───────────────────────────────────────────────
export interface LLMPrompt {
  system?: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMCompletion {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

// ─── Provider contract ────────────────────────────────────────────────────────
export interface LLMProvider {
  /** Single prompt → completion */
  complete(prompt: LLMPrompt): Promise<LLMCompletion>;
  /** Multiple prompts in one call (may be sequential or parallel depending on impl) */
  completeBatch(prompts: LLMPrompt[]): Promise<LLMCompletion[]>;
  /** Generate embeddings for one or more text strings */
  embed(texts: string[]): Promise<number[][]>;
}
