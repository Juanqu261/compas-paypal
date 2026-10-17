"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { compasApi } from "./client";
import type { MandateView, MeResponse, ParticipantsResponse, SpendingResponse } from "./contracts";

export type Resource<T> =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; data: T };

/**
 * Loads `load()` whenever `key` changes, and again on `reload()` or every
 * `pollMs` while `key` is not null. The last good data stays on screen while a
 * reload runs. Data only: no decision is made here.
 */
export function useResource<T>(
  key: string | null,
  load: () => Promise<T>,
  options: { pollMs?: number } = {},
): { resource: Resource<T>; reload: () => void } {
  const [resource, setResource] = useState<Resource<T>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const run = useEffectEvent(() => load());

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    run().then(
      (data) => {
        if (!cancelled) setResource({ status: "ready", data });
      },
      (error: unknown) => {
        if (!cancelled) setResource((current) => (current.status === "ready" ? current : { status: "error", error }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, version]);

  useEffect(() => {
    if (key === null || !options.pollMs) return;
    const timer = setInterval(() => setVersion((n) => n + 1), options.pollMs);
    return () => clearInterval(timer);
  }, [key, options.pollMs]);

  return { resource, reload: () => setVersion((n) => n + 1) };
}

export function useMe(partyId: string, active: boolean, openCount: number) {
  return useResource<MeResponse>(active ? `${partyId}:${openCount}` : null, () => compasApi.me(partyId));
}

export function useParticipants(partyId: string, active: boolean) {
  return useResource<ParticipantsResponse>(active ? partyId : null, () => compasApi.participants(partyId));
}

export function useMandateList(partyId: string, role: "payer" | "delegate", active: boolean, openCount: number) {
  return useResource<MandateView[]>(
    active ? `${partyId}:${role}:${openCount}` : null,
    () => compasApi.listMandates(partyId, role),
    { pollMs: 5000 },
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
