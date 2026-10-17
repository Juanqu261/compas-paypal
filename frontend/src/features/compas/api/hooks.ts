"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { compasApi } from "./client";
import type { DemoMerchantsResponse, MandateView, MeResponse, ParticipantsResponse, SpendingResponse } from "./contracts";

export type Resource<T> =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; data: T };

type Loaded<T> = { key: string | null; resource: Resource<T>; refreshError?: unknown };

/**
 * Loads `load()` for `key`, again on `reload()`, when `refresh` changes, and
 * every `pollMs` while `key` is not null. `key` says what the data is: data
 * loaded for another key is never shown, so a screen can't show the previous
 * mandate or person while the next one loads. A failed refresh keeps the last
 * good data on screen and reports `refreshError`. Data only: no decision is made here.
 */
export function useResource<T>(
  key: string | null,
  load: () => Promise<T>,
  options: { pollMs?: number; refresh?: number } = {},
): { resource: Resource<T>; reload: () => void; refreshError?: unknown } {
  const [loaded, setLoaded] = useState<Loaded<T>>({ key, resource: { status: "loading" } });
  const [version, setVersion] = useState(0);
  const run = useEffectEvent(() => load());

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    run().then(
      (data) => {
        if (!cancelled) setLoaded({ key, resource: { status: "ready", data } });
      },
      (error: unknown) => {
        if (cancelled) return;
        setLoaded((current) =>
          current.key === key && current.resource.status === "ready"
            ? { ...current, refreshError: error }
            : { key, resource: { status: "error", error } },
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, version, options.refresh]);

  useEffect(() => {
    if (key === null || !options.pollMs) return;
    const timer = setInterval(() => setVersion((n) => n + 1), options.pollMs);
    return () => clearInterval(timer);
  }, [key, options.pollMs]);

  // A closed screen (null key) keeps what it showed. Another key starts from loading.
  const current = key === null || loaded.key === key;
  return {
    resource: current ? loaded.resource : { status: "loading" },
    reload: () => setVersion((n) => n + 1),
    ...(current && loaded.refreshError !== undefined ? { refreshError: loaded.refreshError } : {}),
  };
}

export function useMe(partyId: string, active: boolean, openCount: number) {
  return useResource<MeResponse>(active ? partyId : null, () => compasApi.me(partyId), { refresh: openCount });
}

export function useParticipants(partyId: string, active: boolean) {
  return useResource<ParticipantsResponse>(active ? partyId : null, () => compasApi.participants(partyId));
}

export function useMandateList(partyId: string, role: "payer" | "delegate", active: boolean, openCount: number) {
  return useResource<MandateView[]>(
    active ? `${partyId}:${role}` : null,
    () => compasApi.listMandates(partyId, role),
    { pollMs: 5000, refresh: openCount },
  );
}

export function useMandate(partyId: string, id: string | null, active: boolean) {
  return useResource<MandateView>(
    active && id ? `${partyId}:${id}` : null,
    () => compasApi.getMandate(partyId, id ?? ""),
    { pollMs: 5000 },
  );
}

export function useSpending(partyId: string, id: string | null, active: boolean) {
  return useResource<SpendingResponse>(
    active && id ? `${partyId}:spending:${id}` : null,
    () => compasApi.spending(partyId, id ?? ""),
    { pollMs: 8000 },
  );
}

/** demo/test data: the demo merchants and the categories COMPAS resolves for them now. */
export function useDemoMerchants(active: boolean) {
  return useResource<DemoMerchantsResponse>(active ? "demo-merchants" : null, () => compasApi.demoMerchants(), {
    pollMs: 15000,
  });
}
