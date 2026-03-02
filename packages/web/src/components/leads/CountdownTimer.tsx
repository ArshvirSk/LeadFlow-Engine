'use client';

import { useCountdown } from '@/hooks/useCountdown';
import { cn } from '@/lib/utils';

interface CountdownTimerProps {
  /** The time by which the golden hour window expires */
  expiresAt: Date | string;
  className?: string;
}

/**
 * CountdownTimer
 *
 * Displays a live HH:MM:SS countdown for golden-hour leads.
 * Turns amber when < 30 min remain and red when < 10 min remain.
 * Shows "Expired" badge once the window closes.
 */
export function CountdownTimer({ expiresAt, className }: CountdownTimerProps) {
  const { formatted, totalSecondsLeft, isExpired } = useCountdown(expiresAt);

  if (isExpired) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
          'bg-gray-100 text-gray-500',
          className,
        )}
      >
        <ClockIcon className="h-3 w-3" />
        Expired
      </span>
    );
  }

  const urgency =
    totalSecondsLeft < 10 * 60  ? 'critical' :  // < 10 min
    totalSecondsLeft < 30 * 60  ? 'warning'  :  // < 30 min
    'normal';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
        urgency === 'critical' && 'bg-red-100 text-red-700 animate-pulse',
        urgency === 'warning'  && 'bg-amber-100 text-amber-700',
        urgency === 'normal'   && 'bg-emerald-100 text-emerald-700',
        className,
      )}
      title={`Golden hour expires in ${formatted}`}
      aria-label={`Time remaining: ${formatted}`}
      aria-live="polite"
    >
      <ClockIcon className="h-3 w-3 shrink-0" />
      {formatted}
    </span>
  );
}

// Inline SVG clock icon to avoid extra dependencies
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
