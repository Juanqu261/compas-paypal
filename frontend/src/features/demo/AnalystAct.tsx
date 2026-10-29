"use client";

import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { compasApi, errorCode } from "@/features/compas/api/client";
import type { AnalystFinding, AnalystJob, AnalyzedSku } from "@/features/compas/api/contracts";
import { useResource } from "@/features/compas/api/hooks";
import { DEMO_MERCHANTS } from "@/features/compas/demo-identities";
import { FlowDiagram, type Step } from "./flow-diagram";
import {
  analystRecord,
  invimaLabel,
  ITEM_CLASS_LABEL,
  JUDGMENT_TITLE,
  liveRunButton,
  runFailureText,
  runTime,
  type StandingFlag,
} from "./analyst-view";
import {
  elasticIndexLink,
  elasticQueryLink,
  invimaDatasetLink,
  invimaRecordLink,
  readEvidenceConfig,
  supabaseFlagsLink,
  supabaseSchemaLink,
} from "./evidence-links";
import {
  BoxIcon,
  CheckBadgeIcon,
  CrossIcon,
  ExternalIcon,
  FlagIcon,
  IndexSearchIcon,
  ModelIcon,
  PillIcon,
  QuestionIcon,
  RegistryIcon,
  StoreIcon,
} from "./flow-icons";

/** demo/test data: the two pharmacies with a demo catalog. */
const PHARMACIES = [
  { ...DEMO_MERCHANTS.drogueria, tagline: "The real pharmacy", lookalike: false },
  { ...DEMO_MERCHANTS.lookalike, tagline: "A lookalike, one letter off", lookalike: true },
] as const;

const EVIDENCE = readEvidenceConfig();
const POLL_MS = 1000;
/** How often the button checks whether the cooldown has passed. */
const CLOCK_MS = 30_000;

/**
 * A run this visitor watched. `findings` are read once the job ends, so the
 * verdict is never the previous run's. Without one, the screen shows the
 * pharmacy's last real run, which every visitor shares.
 */
type Run = { job?: AnalystJob; findings?: readonly AnalystFinding[]; starting?: boolean; error?: string };

function seconds(job: AnalystJob): string | undefined {
  if (!job.finishedAt) return undefined;
  const ms = Date.parse(job.finishedAt) - Date.parse(job.createdAt);
  return Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)} s` : undefined;
}

/** The pharmacy's name, with the lookalike's extra letter marked. */
function PharmacyName({ name, lookalike }: { name: string; lookalike: boolean }) {
  if (!lookalike) return <>{name}</>;
  return (
    <>
      {name.slice(0, -1)}
      <mark className="rounded-sm bg-buff px-0.5 text-ink">{name.slice(-1)}</mark>
    </>
  );
}

function ProductTile({ sku, model }: { sku: AnalyzedSku; model: string }) {
  const invima = invimaLabel(sku);
  const record = sku.outcome === "VERIFIED" && sku.cum ? invimaRecordLink(sku.cum) : undefined;
  const Icon = sku.itemClass === "MEDICINE" ? PillIcon : sku.itemClass === "NOT_MEDICINE" ? BoxIcon : QuestionIcon;
  return (
    <li className="flex gap-3 rounded-xl border border-ink/10 bg-paper p-3">
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-full ${
          sku.itemClass === "MEDICINE" ? "bg-route/10 text-route" : "bg-ink/[0.06] text-ink-soft"
        }`}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-medium text-ink" title={sku.name}>
          {sku.name}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-ink-soft">
            {model}: {ITEM_CLASS_LABEL[sku.itemClass]}
          </span>
          {invima.tone === "ok" ? (
            record ? (
              <a
                href={record}
                target="_blank"
                rel="noreferrer"
                title={`CUM ${sku.cum}: open INVIMA's record`}
                className="inline-flex items-center gap-1 rounded-full bg-route/10 px-2 py-0.5 font-semibold text-route-deep hover:bg-route/20"
              >
                <CheckBadgeIcon className="size-3.5" />
                INVIMA
                <ExternalIcon className="size-3" />
                <span className="sr-only">CUM {sku.cum}, opens INVIMA’s record in a new tab</span>
              </a>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-route/10 px-2 py-0.5 font-semibold text-route-deep">
                <CheckBadgeIcon className="size-3.5" />
                INVIMA
              </span>
            )
          ) : invima.tone === "stop" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-ink/10 px-2 py-0.5 font-semibold text-ink">
              <CrossIcon className="size-3.5" />
              No match
            </span>
          ) : null}
        </p>
      </div>
    </li>
  );
}

function FlagCard({ flag, model }: { flag: StandingFlag; model: string }) {
  const fromModel = flag.judgment === "LOOKALIKE_SIGNALS";
  return (
    <li className="flex gap-3 rounded-xl border border-ink/15 bg-buff/40 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-buff text-ink">
        <FlagIcon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-ink">{JUDGMENT_TITLE[flag.judgment]}</p>
        <blockquote className="mt-1 text-sm text-ink">
          {fromModel ? <>“{flag.note}”</> : flag.note}
          <footer className="mt-0.5 text-xs text-ink-soft">{fromModel ? model : `COMPAS’s rule, over ${model}’s answers`}</footer>
        </blockquote>
        <p className="mt-2 text-xs font-medium text-ink-soft">
          {flag.status === "RESPONDED" ? "The merchant answered · a person decides" : "Held for review · only a person can lift it"}
        </p>
      </div>
    </li>
  );
}

/**
 * Act 1 of /demo: the AI analyst reads a pharmacy's catalog, days before
 * anyone buys, shown as a diagram for people who don't read code. A live run
 * on the backend. What the model says is shown as the model's; only the
 * verifier's outcome counts, and a flag can only hold a merchant for review.
 */
export function AnalystAct() {
  const [merchantId, setMerchantId] = useState<string>(PHARMACIES[0].id);
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [now, setNow] = useState(() => Date.now());
  const shared = useResource(`analyst-latest:${merchantId}`, () => compasApi.analystLatestRun(merchantId));
  const runStatus = shared.resource.status === "ready" ? shared.resource.data : undefined;
  const run = runs[merchantId];
  // This visitor's run, else one another visitor started, else the last real run.
  const job = run?.job ?? runStatus?.running ?? runStatus?.latest;
  const refreshShared = useEffectEvent(() => shared.reload());
  const pharmacy = PHARMACIES.find((item) => item.id === merchantId) ?? PHARMACIES[0];
  const health = useResource("health", () => compasApi.health());
  const onFile = useResource(`analyst-findings:${merchantId}`, () => compasApi.analystFindings(merchantId));
  const facts = health.resource.status === "ready" ? health.resource.data : undefined;
  // The analyst can run on Elastic's Inference API instead. Claude is named only when it is Claude.
  const model = facts?.analystModel === "claude" ? "Claude" : "The model";

  // Polls the selected merchant's job until it ends, then reads the findings it left. Each answer is a new object, so the next poll follows it.
  useEffect(() => {
    if (!job || (job.status !== "QUEUED" && job.status !== "RUNNING")) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const next = await compasApi.analystJob(job.id);
        const findings =
          next.status === "COMPLETED"
            ? await compasApi.analystFindings(next.merchantId).then((body) => body.findings, () => undefined)
            : undefined;
        if (!cancelled) setRuns((current) => ({ ...current, [next.merchantId]: { job: next, ...(findings ? { findings } : {}) } }));
        if (!cancelled && next.status !== "QUEUED" && next.status !== "RUNNING") refreshShared();
      } catch (error) {
        if (!cancelled) setRuns((current) => ({ ...current, [job.merchantId]: { job, error: errorCode(error) } }));
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [job]);

  // The button re-enables itself when the cooldown passes.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => clearInterval(timer);
  }, []);

  const start = () => {
    const id = merchantId;
    setRuns((current) => ({ ...current, [id]: { starting: true } }));
    compasApi.startAnalystJob(id).then(
      (queued) => setRuns((current) => ({ ...current, [id]: { job: queued } })),
      (error: unknown) => {
        const code = errorCode(error);
        // Someone else's real run started the cooldown meanwhile: show theirs.
        setRuns((current) => {
          const rest = { ...current };
          delete rest[id];
          return code === "ANALYST_COOLDOWN" ? rest : { ...current, [id]: { error: code } };
        });
        if (code === "ANALYST_COOLDOWN") shared.reload();
      },
    );
  };

  const busy = Boolean(run?.starting || job?.status === "QUEUED" || job?.status === "RUNNING");
  const button = liveRunButton({
    busy,
    hasRun: Boolean(runStatus?.latest),
    ...(runStatus?.nextRunAt ? { nextRunAt: runStatus.nextRunAt } : {}),
    now,
  });
  // The last live try failed after the real run on screen (no credits, a rate limit): said, not hidden.
  const lastTryFailed =
    !run && runStatus?.failure?.finishedAt && (!runStatus.latest?.finishedAt || runStatus.failure.finishedAt > runStatus.latest.finishedAt)
      ? runStatus.failure
      : undefined;
  const failure = run?.error ?? (job?.status === "FAILED" ? (job.error ?? "Error") : undefined);
  const result = job?.status === "COMPLETED" && job.result?.status === "COMPLETED" ? job.result : undefined;
  const findings = run?.findings ?? (onFile.resource.status === "ready" ? onFile.resource.data.findings : undefined);
  const record = findings ? analystRecord(findings) : undefined;
  const flags = record?.flags ?? [];

  const skus = result?.skus ?? [];
  const medicines = skus.filter((sku) => sku.itemClass === "MEDICINE").length;
  const others = skus.length - medicines;
  const proposed = skus.reduce((sum, sku) => sum + sku.candidates, 0);
  const picked = skus.flatMap((sku) => (sku.cum ? [sku.cum] : []));
  const demoRegistry = facts?.cumRegistry?.startsWith("demo/test data");
  const showVerdict = Boolean(result) || (record !== undefined && (record.verified > 0 || flags.length > 0));

  const query = elasticQueryLink(EVIDENCE, picked);
  const index = elasticIndexLink(EVIDENCE);
  const trustLog = facts?.storage === "postgres" ? supabaseFlagsLink(EVIDENCE) : undefined;
  const schema = supabaseSchemaLink(EVIDENCE);

  const steps: Step[] = [
    {
      icon: StoreIcon,
      title: <PharmacyName name={pharmacy.displayName} lookalike={pharmacy.lookalike} />,
      caption: "Shares its product catalog",
      ...(result ? { metric: `${skus.length} products` } : {}),
      tone: "neutral",
    },
    {
      icon: IndexSearchIcon,
      // Elastic's own mark, unmodified, from its EUI repo (packages/eui/src/components/icon/svgs/logo_elastic.svg).
      logo: { src: "/brand/elastic-logo.svg", alt: "Elastic", width: 36, height: 36 },
      title: "Elastic",
      caption: "Finds similar medicines in INVIMA’s list",
      ...(result ? { metric: `${proposed} candidates`, detail: "Suggestions, not proof" } : {}),
      tone: "neutral",
      links: [...(query ? [{ href: query, text: "This run’s matches" }] : []), ...(index ? [{ href: index, text: "The index" }] : [])],
    },
    {
      icon: ModelIcon,
      // Claude's mark from claude.ai, unmodified. Shown only when the backend's model is Claude.
      ...(model === "Claude" ? { logo: { src: "/brand/claude-logo.svg", alt: "Claude", width: 36, height: 36 } } : {}),
      title: model === "Claude" ? "Claude" : "AI model",
      caption: "Picks the exact medicine, or none",
      ...(result ? { metric: `${medicines} medicines`, ...(others > 0 ? { detail: `${others} not medicine` } : {}) } : {}),
      tone: "model",
    },
    {
      icon: RegistryIcon,
      // INVIMA's wordmark, cut from the co-branded lockup on invima.gov.co (custom_event_badge/static/src/img/invima_logo.png).
      logo: { src: "/brand/invima-logo.png", alt: "INVIMA", width: 480, height: 198, wide: true },
      title: "INVIMA",
      caption: "The official record confirms",
      ...(result
        ? {
            metric: `${result.verifiedMappings} confirmed`,
            ...(result.rejectedMappings > 0 ? { detail: `${result.rejectedMappings} rejected` } : {}),
          }
        : demoRegistry !== undefined
          ? { detail: demoRegistry ? "Demo copy of INVIMA’s data" : "Live from datos.gov.co" }
          : {}),
      tone: "ok",
      links: [{ href: invimaDatasetLink(), text: "INVIMA open data" }],
    },
    {
      icon: showVerdict && flags.length > 0 ? FlagIcon : CheckBadgeIcon,
      title: "Result",
      caption: !showVerdict
        ? "Clear, or flagged for a person"
        : flags.length > 0
          ? "Purchases here are held for review"
          : "Nothing contradicts “pharmacy”",
      ...(showVerdict ? { metric: flags.length > 0 ? `${flags.length} ${flags.length === 1 ? "flag" : "flags"}` : "No red flags" } : {}),
      tone: showVerdict && flags.length > 0 ? "flag" : "ok",
      links: trustLog && flags.length > 0 ? [{ href: trustLog, text: "Flag in the trust log" }] : schema ? [{ href: schema, text: "COMPAS database" }] : [],
    },
  ];

  const took = job?.status === "COMPLETED" ? seconds(job) : undefined;

  return (
    <section aria-labelledby="act-1-title" className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-wide text-route-deep uppercase">Days before anyone buys</p>
          <h2 id="act-1-title" className="mt-1 font-display text-3xl text-ink sm:text-4xl">
            How COMPAS checks a pharmacy
          </h2>
          <p className="mt-2 text-lg text-ink-soft">An AI reads the catalog. An official registry has the last word.</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <fieldset>
            <legend className="sr-only">Pharmacy</legend>
            <div className="flex gap-2">
              {PHARMACIES.map((item) => {
                const checked = item.id === merchantId;
                return (
                  <label
                    key={item.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-200 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-route motion-reduce:transition-none ${
                      checked ? "border-ink bg-ink text-paper" : "border-ink/20 bg-paper text-ink hover:border-ink/45"
                    }`}
                  >
                    <input
                      type="radio"
                      name="analyst-pharmacy"
                      value={item.id}
                      checked={checked}
                      onChange={() => startTransition(() => setMerchantId(item.id))}
                      className="sr-only"
                    />
                    <StoreIcon className="size-6 shrink-0" />
                    <span className="leading-tight">
                      <span className="block font-semibold">
                        <PharmacyName name={item.displayName} lookalike={item.lookalike} />
                      </span>
                      <span className={`block text-xs ${checked ? "text-paper/75" : "text-ink-soft"}`}>{item.tagline}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <button
            type="button"
            onClick={start}
            disabled={button.disabled}
            className={`rounded-xl bg-route px-5 py-3 font-semibold text-paper transition-colors duration-200 hover:bg-route-deep disabled:opacity-60 motion-reduce:transition-none ${
              busy ? "disabled:cursor-progress" : "disabled:cursor-not-allowed"
            }`}
          >
            {button.label}
          </button>
        </div>
      </div>

      <div className="mt-8 rounded-3xl border border-ink/10 bg-shoal/35 p-4 sm:p-6">
        <div className="mb-4 flex min-h-7 items-center justify-end" aria-live="polite">
          {busy ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-paper px-3 py-1 text-sm font-medium text-ink">
              <span className="size-2 animate-pulse rounded-full bg-route motion-reduce:animate-none" aria-hidden />
              {job?.status === "RUNNING" ? "Reading the catalog" : "Starting"}
            </span>
          ) : job?.status === "COMPLETED" && job.finishedAt ? (
            <span className="rounded-full bg-paper px-3 py-1 text-sm font-medium text-ink">
              A real run at {runTime(job.finishedAt, new Date(now))}
              {took ? ` · took ${took}` : ""}
            </span>
          ) : null}
        </div>
        <FlowDiagram key={job?.id ?? "idle"} steps={steps} state={busy ? "running" : result ? "done" : "idle"} />
      </div>

      {runStatus && runStatus.cooldownHours > 0 ? (
        <p className="mt-3 text-sm text-ink-soft">
          Each pharmacy runs live at most once every {runStatus.cooldownHours} hours, to keep the demo’s AI costs bounded.
          Everyone sees the last real run meanwhile.
        </p>
      ) : null}

      {failure ? (
        <p role="alert" className="mt-6 rounded-xl border border-ink/20 bg-paper px-4 py-3 text-ink">
          {runFailureText(failure)}
        </p>
      ) : lastTryFailed?.finishedAt ? (
        <p className="mt-6 rounded-xl border border-ink/20 bg-paper px-4 py-3 text-ink">
          The last live try, at {runTime(lastTryFailed.finishedAt, new Date(now))}, failed: {runFailureText(lastTryFailed.error ?? "Error")}
          {runStatus?.latest ? " The run shown is the last one that completed." : ""}
        </p>
      ) : null}
      {job?.result?.status === "NO_CATALOG" ? <p className="mt-6 text-ink-soft">This merchant has no catalog to read.</p> : null}
      {job?.result?.status === "NOT_APPLICABLE" ? (
        <p className="mt-6 text-ink-soft">This merchant doesn’t sell medicine, so there is nothing to check.</p>
      ) : null}

      {result || flags.length > 0 ? (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          {result ? (
            <div>
              <h3 className="font-semibold text-ink">
                {model === "Claude" ? "Claude" : "The model"}, product by product
              </h3>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {result.skus.map((sku) => (
                  <ProductTile key={sku.skuId} sku={sku} model={model} />
                ))}
              </ul>
            </div>
          ) : null}
          {flags.length > 0 ? (
            <div className={result ? "" : "lg:col-span-2"}>
              <h3 className="font-semibold text-ink">Red flags</h3>
              <ul className="mt-3 space-y-2">
                {flags.map((flag) => (
                  <FlagCard key={flag.id} flag={flag} model={model} />
                ))}
              </ul>
            </div>
          ) : result ? (
            <div className="flex items-start gap-3 self-start rounded-xl border border-route/25 bg-paper p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-route text-paper">
                <CheckBadgeIcon className="size-5" />
              </span>
              <p className="text-ink">
                <span className="block font-semibold">No red flags</span>
                <span className="text-sm text-ink-soft">The catalog reads like the pharmacy it says it is.</span>
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

    </section>
  );
}
