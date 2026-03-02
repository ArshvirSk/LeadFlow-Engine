"use client";

/**
 * FR02-T02 — CompanyHealthBadge
 *
 * Displays a colour-coded pill (green / yellow / red) for the company's
 * funding health, with a Radix Tooltip showing the signals array on hover.
 */

import type { CompanyHealth } from "@leadflow/types";
import * as Tooltip from "@radix-ui/react-tooltip";

interface CompanyHealthBadgeProps {
  health: CompanyHealth;
  className?: string;
}

const STATUS_CFG = {
  green: {
    dot: "bg-green-500",
    wrapper:
      "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
    label: "Healthy",
  },
  yellow: {
    dot: "bg-amber-500",
    wrapper:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    label: "Caution",
  },
  red: {
    dot: "bg-red-500",
    wrapper: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
    label: "Risk",
  },
} as const;

export function CompanyHealthBadge({
  health,
  className = "",
}: CompanyHealthBadgeProps) {
  const cfg = STATUS_CFG[health.status];

  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            data-testid="company-health-badge"
            className={[
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
              "text-[10px] font-medium cursor-default select-none",
              cfg.wrapper,
              className,
            ].join(" ")}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`}
              aria-hidden="true"
            />
            {cfg.label}
          </span>
        </Tooltip.Trigger>

        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={4}
            className="z-50 max-w-[220px] rounded-md bg-zinc-900 px-3 py-2 text-xs text-white shadow-lg"
          >
            <ul className="space-y-0.5">
              {health.signals.map((signal, i) => (
                <li key={i}>• {signal}</li>
              ))}
            </ul>
            <Tooltip.Arrow className="fill-zinc-900" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
