"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "nl_search_history";
const MAX_SEARCHES = 10;

function readHistory(): string[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeHistory(queries: string[]): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queries));
}

export function useRecentSearches() {
    const [searches, setSearches] = useState<string[]>([]);

    // Hydrate from localStorage after mount (avoids SSR mismatch)
    useEffect(() => {
        setSearches(readHistory());
    }, []);

    const addSearch = (query: string) => {
        const q = query.trim();
        if (!q) return;
        const deduped = [q, ...readHistory().filter((s) => s !== q)].slice(
            0,
            MAX_SEARCHES
        );
        writeHistory(deduped);
        setSearches(deduped);
    };

    const clearSearches = () => {
        localStorage.removeItem(STORAGE_KEY);
        setSearches([]);
    };

    return { recentSearches: searches, addSearch, clearSearches };
}
