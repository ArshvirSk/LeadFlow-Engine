import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { skills: SKILLS_LIST, aliases: ALIASES } = require('../../data/skills.json') as {
    skills: string[];
    aliases: Record<string, string>;
};

// Build a fast lookup: lowercase canonical → canonical
const CANONICAL = new Map<string, string>(SKILLS_LIST.map(s => [s.toLowerCase(), s]));

// N-gram sizes to try (longest first for greedy matching)
const NGRAM_SIZES = [4, 3, 2, 1];

/**
 * Extracts tech skills from free text.
 * Returns canonical skill names deduplicated and sorted.
 *
 * Strategy:
 *   1. Normalise text (lowercase, collapse whitespace)
 *   2. Try multi-word aliases map first
 *   3. Greedy n-gram scan against canonical dictionary (n=4 → 3 → 2 → 1)
 *   4. Levenshtein-1 fuzzy fallback for 1-gram tokens only (avoid false positives on short tokens)
 */
export function extractSkills(text: string): string[] {
    const found = new Set<string>();
    const normalised = text.toLowerCase().replace(/[^\w\s.#+]/g, ' ').replace(/\s+/g, ' ');

    // 1. Alias pass — check full phrases before tokenising
    for (const [alias, canonical] of Object.entries(ALIASES)) {
        if (normalised.includes(alias.toLowerCase())) {
            found.add(canonical);
        }
    }

    // 2. N-gram pass on whitespace-tokenised words
    const words = normalised.split(' ').filter(Boolean);
    const consumed = new Set<number>(); // track consumed word positions

    for (const n of NGRAM_SIZES) {
        for (let i = 0; i <= words.length - n; i++) {
            if ([...Array(n).keys()].some(k => consumed.has(i + k))) continue;
            const ngram = words.slice(i, i + n).join(' ');

            // Exact match in canonical map
            const exact = CANONICAL.get(ngram);
            if (exact) {
                found.add(exact);
                for (let k = 0; k < n; k++) consumed.add(i + k);
                continue;
            }

            // Alias match for multi-word n-grams
            const aliasMatch = ALIASES[ngram];
            if (aliasMatch) {
                found.add(aliasMatch);
                for (let k = 0; k < n; k++) consumed.add(i + k);
            }
        }
    }

    // 3. Levenshtein-1 fuzzy on remaining single tokens (only for tokens ≥ 5 chars)
    for (let i = 0; i < words.length; i++) {
        if (consumed.has(i)) continue;
        const word = words[i];
        if (word.length < 5) continue;

        for (const [lower, canonical] of CANONICAL) {
            if (lower.length < 5) continue;
            if (levenshtein(word, lower) === 1) {
                found.add(canonical);
                consumed.add(i);
                break;
            }
        }
    }

    return [...found].sort();
}

/** Simple iterative Levenshtein distance (bounded at 2 for performance) */
function levenshtein(a: string, b: string): number {
    if (Math.abs(a.length - b.length) > 1) return 2;
    const m = a.length, n = b.length;
    const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
        let prev = i;
        for (let j = 1; j <= n; j++) {
            const cur = a[i - 1] === b[j - 1] ? dp[j - 1] : 1 + Math.min(dp[j - 1], dp[j], prev);
            dp[j - 1] = prev;
            prev = cur;
        }
        dp[n] = prev;
    }
    return dp[n];
}
