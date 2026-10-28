import { Suspense } from "react";
import { AuthorizeAgent } from "@/features/demo/AuthorizeAgent";

export const metadata = { title: "Allow an AI agent · COMPAS" };

/** Reads the request id inside Suspense: search params are per request, not part of the cached shell. */
async function Request({ searchParams }: { searchParams: Promise<{ request?: string | string[] }> }) {
  const { request } = await searchParams;
  return <AuthorizeAgent requestId={typeof request === "string" && /^areq-[0-9a-f-]{36}$/.test(request) ? request : null} />;
}

export default function AuthorizeAgentPage({ searchParams }: { searchParams: Promise<{ request?: string | string[] }> }) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-xl px-4 py-12 text-ink-soft">Looking up the request…</p>}>
      <Request searchParams={searchParams} />
    </Suspense>
  );
}
