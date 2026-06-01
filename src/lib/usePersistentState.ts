"use client";

import { useEffect, useState } from "react";

/**
 * useState that persists to localStorage. Starts from `initial` on the server
 * and during the first client render, then hydrates from storage after mount
 * to avoid hydration mismatches.
 *
 * Returns [value, setValue, hydrated].
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) {
        setValue(JSON.parse(raw) as T);
      }
    } catch {
      /* ignore malformed storage */
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage may be unavailable (private mode, quota) */
    }
  }, [key, value, hydrated]);

  return [value, setValue, hydrated] as const;
}
