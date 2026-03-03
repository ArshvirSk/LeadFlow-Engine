"use client";

import { useRecentSearches } from "@/hooks/useRecentSearches";
import { useNLSearch } from "@/lib/queries";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, Clock, Loader2, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LeadCard } from "./lead-card";

const EXAMPLES = [
  "React projects over $5k posted this week",
  "Python retainers from HN",
  "Remote full-stack projects any budget",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NLSearchModal({ open, onOpenChange }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { recentSearches, addSearch, clearSearches } = useRecentSearches();
  const nlSearch = useNLSearch();

  // Reset + focus when modal opens
  useEffect(() => {
    if (open) {
      setQuery("");
      nlSearch.reset();
      setTimeout(() => inputRef.current?.focus(), 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounced search — fires 400ms after last keystroke
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length >= 3) {
      debounceRef.current = setTimeout(() => {
        fire(query.trim());
      }, 400);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function fire(q: string) {
    nlSearch.mutate(q, {
      onSuccess: (data) => {
        if (!data.error) addSearch(q);
      },
    });
  }

  function selectExample(ex: string) {
    setQuery(ex);
    fire(ex);
  }

  const isParseError =
    nlSearch.isError || (nlSearch.data as any)?.error === "PARSE_ERROR";
  const results = nlSearch.data?.leads ?? [];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Backdrop */}
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        {/* Panel */}
        <Dialog.Content className="fixed left-1/2 top-[12%] z-50 w-full max-w-2xl -translate-x-1/2 rounded-xl border bg-background shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <Dialog.Title className="sr-only">
            Natural language lead search
          </Dialog.Title>
          {/* ── Input row ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 border-b px-4 py-3">
            {nlSearch.isPending ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim().length >= 2)
                  fire(query.trim());
                if (e.key === "Escape") onOpenChange(false);
              }}
              placeholder='Search leads… e.g. "React projects over $5k this week"'
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery("");
                  nlSearch.reset();
                }}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <kbd className="hidden shrink-0 select-none items-center gap-1 rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
              Esc
            </kbd>
          </div>

          {/* ── Body ──────────────────────────────────────────────────────── */}
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {/* Summary chip */}
            {nlSearch.isSuccess && !isParseError && (
              <div className="mb-2 px-2 pt-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  {nlSearch.data.natural_language_summary}
                  <span className="text-muted-foreground">
                    &nbsp;· {nlSearch.data.total_count}{" "}
                    {nlSearch.data.total_count === 1 ? "lead" : "leads"}
                  </span>
                </span>
              </div>
            )}

            {/* Parse error */}
            {isParseError && (
              <div className="p-4">
                <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  Couldn&apos;t understand that — try:
                </div>
                <div className="flex flex-col gap-1">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => selectExample(ex)}
                      className="rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                    >
                      &ldquo;{ex}&rdquo;
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Results */}
            {nlSearch.isSuccess && !isParseError && results.length > 0 && (
              <div className="flex flex-col gap-2 px-1 pb-2">
                {results.map((lead: any) => (
                  <div key={lead.id} onClick={() => onOpenChange(false)}>
                    <LeadCard lead={lead} />
                  </div>
                ))}
              </div>
            )}

            {/* Empty results */}
            {nlSearch.isSuccess && !isParseError && results.length === 0 && (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No leads match your search
              </p>
            )}

            {/* Recent searches — shown when no query and no results yet */}
            {!query && !nlSearch.data && recentSearches.length > 0 && (
              <div className="px-2 py-2">
                <div className="mb-1 flex items-center justify-between px-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Recent
                  </span>
                  <button
                    onClick={clearSearches}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
                {recentSearches.map((s) => (
                  <button
                    key={s}
                    onClick={() => selectExample(s)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm",
                      "text-foreground transition-colors hover:bg-muted",
                    )}
                  >
                    <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Empty state — no query, no recents */}
            {!query && !nlSearch.data && recentSearches.length === 0 && (
              <div className="px-4 py-8">
                <p className="mb-3 text-sm text-muted-foreground">
                  Try searching for:
                </p>
                <div className="flex flex-col gap-1">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => selectExample(ex)}
                      className="rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
