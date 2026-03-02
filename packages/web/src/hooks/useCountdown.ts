'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface CountdownState {
  hours: number;
  minutes: number;
  seconds: number;
  totalSecondsLeft: number;
  isExpired: boolean;
  formatted: string; // "01:23:45"
}

/**
 * useCountdown
 *
 * Returns a live countdown toward `expiresAt`.
 * Respects the Page Visibility API — pauses tick when the tab is hidden
 * and recalculates from the system clock when it becomes visible again.
 *
 * @param expiresAt  - Target Date (or null/undefined to disable)
 * @param intervalMs - Tick interval in ms (default 1000)
 */
export function useCountdown(
  expiresAt: Date | string | null | undefined,
  intervalMs = 1_000,
): CountdownState {
  const computeState = useCallback((): CountdownState => {
    if (!expiresAt) return makeExpired();

    const target = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
    const diff   = Math.max(0, target.getTime() - Date.now());
    return fromMs(diff);
  }, [expiresAt]);

  const [state, setState] = useState<CountdownState>(computeState);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const next = computeState();
      setState(next);
      if (next.isExpired && timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }, intervalMs);
  }, [computeState, intervalMs]);

  useEffect(() => {
    // Recalculate immediately when expiresAt changes
    setState(computeState());

    if (!expiresAt) return;

    const target = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
    if (target.getTime() <= Date.now()) return; // already expired

    startTimer();

    // Page Visibility API: recalculate from wall clock when tab regains focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setState(computeState());
        startTimer();
      } else {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [expiresAt, computeState, startTimer]);

  return state;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fromMs(ms: number): CountdownState {
  const totalSecondsLeft = Math.floor(ms / 1_000);
  const hours   = Math.floor(totalSecondsLeft / 3_600);
  const minutes = Math.floor((totalSecondsLeft % 3_600) / 60);
  const seconds = totalSecondsLeft % 60;
  const formatted = [hours, minutes, seconds]
    .map(v => String(v).padStart(2, '0'))
    .join(':');

  return { hours, minutes, seconds, totalSecondsLeft, isExpired: ms === 0, formatted };
}

function makeExpired(): CountdownState {
  return { hours: 0, minutes: 0, seconds: 0, totalSecondsLeft: 0, isExpired: true, formatted: '00:00:00' };
}
