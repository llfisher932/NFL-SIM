import { useEffect, useState } from "react";
import type { DashboardIndex, DashboardRecord, DashboardWeek } from "../../../src/types/dashboard";

const cache = new Map<string, Promise<unknown>>();

function fetchJson<T>(file: string): Promise<T> {
  let request = cache.get(file) as Promise<T> | undefined;
  if (!request) {
    request = fetch(`${import.meta.env.BASE_URL}data/${file}`, { cache: "no-cache" }).then((response) => {
      if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
      return response.json() as Promise<T>;
    });
    request.catch(() => cache.delete(file));
    cache.set(file, request);
  }
  return request;
}

export interface Loadable<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

// Keeps the previous value while the next one loads, so views never flash empty.
export function useJson<T>(file: string | null): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ data: null, error: null, loading: file !== null });
  useEffect(() => {
    if (file === null) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    fetchJson<T>(file).then(
      (data) => !cancelled && setState({ data, error: null, loading: false }),
      (err: unknown) =>
        !cancelled && setState((previous) => ({ ...previous, loading: false, error: err instanceof Error ? err.message : String(err) })),
    );
    return () => {
      cancelled = true;
    };
  }, [file]);
  return state;
}

export const useIndex = () => useJson<DashboardIndex>("index.json");
export const useWeek = (file: string | null) => useJson<DashboardWeek>(file);
export const useRecord = (file: string | null) => useJson<DashboardRecord>(file);
