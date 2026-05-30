import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names using clsx and tailwind-merge.
 * This ensures Tailwind classes are properly merged without conflicts.
 *
 * Usage:
 * ```tsx
 * cn("px-4 py-2", isActive && "bg-primary", className)
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns a compact relative-time string for a given ISO timestamp.
 * Examples: "just now", "5m ago", "2h ago", "3d ago", "Jan 5"
 * Returns null when the input is null/undefined so callers can skip rendering.
 */
/**
 * Returns a valid Date object from any input, or null if the input is
 * null / undefined / empty / NaN. Use this before calling any toLocale* method
 * to prevent the Hermes SIGSEGV crash on iOS (EXC_BAD_ACCESS in DateTimeFormatApple).
 *
 * Usage:
 * ```ts
 * const d = safeDate(record.dateTime);
 * const label = d ? d.toLocaleDateString() : '—';
 * ```
 */
export function safeDate(value: string | Date | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value as string | number);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Safe wrapper around Date.toLocaleDateString().
 * Returns `fallback` (default '—') when the date is null / invalid.
 */
export function safeFormatDate(
  value: string | Date | number | null | undefined,
  localeOrOptions?: string | string[] | Intl.DateTimeFormatOptions,
  options?: Intl.DateTimeFormatOptions,
  fallback = '—',
): string {
  const d = safeDate(value);
  if (!d) return fallback;
  try {
    // Support both safeFormatDate(v, locale, options) and safeFormatDate(v, options)
    if (typeof localeOrOptions === 'string' || Array.isArray(localeOrOptions)) {
      return d.toLocaleDateString(localeOrOptions as string | string[], options);
    }
    return d.toLocaleDateString(undefined, localeOrOptions as Intl.DateTimeFormatOptions | undefined);
  } catch {
    return fallback;
  }
}

/**
 * Safe wrapper around Date.toLocaleTimeString().
 * Returns `fallback` (default '—') when the date is null / invalid.
 */
export function safeFormatTime(
  value: string | Date | number | null | undefined,
  localeOrOptions?: string | string[] | Intl.DateTimeFormatOptions,
  options?: Intl.DateTimeFormatOptions,
  fallback = '—',
): string {
  const d = safeDate(value);
  if (!d) return fallback;
  try {
    // Support both safeFormatTime(v, locale, options) and safeFormatTime(v, options)
    if (typeof localeOrOptions === 'string' || Array.isArray(localeOrOptions)) {
      return d.toLocaleTimeString(localeOrOptions as string | string[], options);
    }
    return d.toLocaleTimeString(undefined, localeOrOptions as Intl.DateTimeFormatOptions | undefined);
  } catch {
    return fallback;
  }
}

export function formatRelativeTime(isoTimestamp: string | null | undefined): string | null {
  if (!isoTimestamp) return null;
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  if (diffMs < 0) return null; // future timestamp — ignore
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr  = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr  < 24) return `${diffHr}h ago`;
  if (diffDay <  7) return `${diffDay}d ago`;
  return new Date(isoTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
