/**
 * Logger — wraps console methods behind __DEV__ so no logs leak in production.
 */

/* eslint-disable no-console */

export function log(...args: unknown[]): void {
  if (__DEV__) console.log(...args);
}

export function warn(...args: unknown[]): void {
  if (__DEV__) console.warn(...args);
}

export function error(...args: unknown[]): void {
  if (__DEV__) console.error(...args);
}

export function info(...args: unknown[]): void {
  if (__DEV__) console.info(...args);
}

export function debug(...args: unknown[]): void {
  if (__DEV__) console.debug(...args);
}
