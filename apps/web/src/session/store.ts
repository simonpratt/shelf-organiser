// Work in progress kept for the browser tab (sessionStorage), so a stray Back
// or reload doesn't lose it. Storage can be missing or throw (private
// windows, blocked site data), so every access falls back quietly.

export function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Stores value as JSON; null removes the key. */
export function writeSession(key: string, value: unknown): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not kept; the screen still works.
  }
}
