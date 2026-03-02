"use client";

/**
 * PROF-T03: SkillsAutocomplete
 *
 * - Fuzzy-searches 500+ canonical skills via fuse.js (< 100 ms after typing)
 * - Shows top 5 matches in dropdown
 * - Accepts custom free-text entries not in the list
 * - Enter key selects the top suggestion (or adds free-text if no matches)
 * - Backspace on empty input removes the last chip
 */
import Fuse from "fuse.js";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface SkillsAutocompleteProps {
  /** Currently selected skills */
  value: string[];
  /** Called when the skills array changes */
  onChange: (skills: string[]) => void;
  /** Full canonical skills list (loaded externally so this component stays pure) */
  skills: string[];
  placeholder?: string;
  /** Hard cap on number of skills selectable (default 15) */
  maxSkills?: number;
}

export function SkillsAutocomplete({
  value,
  onChange,
  skills,
  placeholder = "Type to search skills…",
  maxSkills = 15,
}: SkillsAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Fuse instance — recreated only when the skills list changes
  const fuse = useMemo(
    () =>
      new Fuse(skills, {
        threshold: 0.35, // 0 = perfect match only, 1 = match anything
        distance: 80,
        minMatchCharLength: 1,
        includeScore: false,
      }),
    [skills],
  );

  // Top 5 matches, excluding already-selected skills
  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    return fuse
      .search(query.trim(), { limit: 6 })
      .map((r) => r.item)
      .filter((s) => !value.includes(s))
      .slice(0, 5);
  }, [query, fuse, value]);

  // Whether to show the "Add 'x'" custom entry option
  const showCustomEntry =
    query.trim().length > 0 &&
    !skills.includes(query.trim()) &&
    !value.includes(query.trim()) &&
    suggestions.length < 5;

  const isDropdownOpen = open && (suggestions.length > 0 || showCustomEntry);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addSkill = (skill: string) => {
    const trimmed = skill.trim();
    if (!trimmed || value.includes(trimmed) || value.length >= maxSkills)
      return;
    onChange([...value, trimmed]);
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const removeSkill = (skill: string) => {
    onChange(value.filter((s) => s !== skill));
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length > 0) {
        addSkill(suggestions[0]);
      } else if (query.trim()) {
        addSkill(query.trim());
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    } else if (e.key === "Backspace" && !query && value.length > 0) {
      removeSkill(value[value.length - 1]);
    }
  };

  const atCap = value.length >= maxSkills;

  return (
    <div ref={containerRef} className="relative w-full">
      {/* ── Input area with chips ─────────────────────────────────────────── */}
      <div
        className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((skill) => (
          <span
            key={skill}
            className="flex items-center gap-0.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
          >
            {skill}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeSkill(skill);
              }}
              className="ml-0.5 rounded-full text-primary/60 hover:text-primary focus:outline-none"
              aria-label={`Remove ${skill}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {!atCap && (
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => query && setOpen(true)}
            placeholder={value.length === 0 ? placeholder : ""}
            className="flex-1 min-w-[140px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        )}

        {atCap && (
          <span className="text-xs text-muted-foreground ml-1">
            Max {maxSkills} skills reached
          </span>
        )}
      </div>

      {/* ── Suggestions dropdown ─────────────────────────────────────────── */}
      {isDropdownOpen && (
        <div
          className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md"
          // Prevent the input blur from closing before click registers
          onMouseDown={(e) => e.preventDefault()}
        >
          <ul ref={listRef} className="py-1" role="listbox">
            {suggestions.map((skill) => (
              <li key={skill} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => addSkill(skill)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:outline-none"
                >
                  {skill}
                </button>
              </li>
            ))}

            {/* Custom "Add 'x'" entry */}
            {showCustomEntry && (
              <li role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => addSkill(query.trim())}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:outline-none text-muted-foreground"
                >
                  Add &ldquo;
                  <span className="font-medium text-foreground">
                    {query.trim()}
                  </span>
                  &rdquo;
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
