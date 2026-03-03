"use client";

import type { LeadFeedParams } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUSES = [
  { value: undefined, label: "All" },
  { value: "new", label: "New" },
  { value: "scored", label: "Scored" },
  { value: "actioned", label: "Actioned" },
  { value: "archived", label: "Archived" },
];

interface LeadFiltersBarProps {
  filters: LeadFeedParams;
  onChange: (filters: LeadFeedParams) => void;
}

export function LeadFiltersBar({ filters, onChange }: LeadFiltersBarProps) {
  const set = (patch: Partial<LeadFeedParams>) =>
    onChange({ ...filters, ...patch });

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {/* Status filter */}
      <div className="flex rounded-md border overflow-hidden">
        {STATUSES.map(({ value, label }) => (
          <button
            key={label}
            onClick={() => set({ status: value })}
            className={cn(
              "px-3 py-1 text-xs font-medium transition-colors",
              filters.status === value
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Min score — defaults to 30 on the server (profile-match floor) */}
      <div className="flex items-center gap-1.5 rounded-md border bg-background px-3 py-1">
        <span className="text-xs text-muted-foreground">Min match</span>
        <input
          type="number"
          min={0}
          max={100}
          value={filters.minScore ?? ""}
          onChange={(e) =>
            set({
              minScore: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          className="w-12 bg-transparent text-xs outline-none"
          placeholder="30"
        />
      </div>

      {/* Remote toggle */}
      <button
        onClick={() => set({ remote: filters.remote ? undefined : true })}
        className={cn(
          "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
          filters.remote
            ? "bg-primary text-primary-foreground"
            : "bg-background text-muted-foreground hover:bg-muted",
        )}
      >
        Remote only
      </button>

      {/* Golden hour toggle */}
      <button
        onClick={() =>
          set({ goldenHour: filters.goldenHour ? undefined : true })
        }
        className={cn(
          "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
          filters.goldenHour
            ? "bg-amber-500 text-white"
            : "bg-background text-muted-foreground hover:bg-muted",
        )}
      >
        🔥 Golden Hour
      </button>

      {/* Reset */}
      {Object.keys(filters).some((k) => (filters as any)[k] !== undefined) && (
        <button
          onClick={() => onChange({})}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
