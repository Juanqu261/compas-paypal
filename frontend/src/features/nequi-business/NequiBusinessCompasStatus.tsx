"use client";

import { useId } from "react";
import { errorCode } from "@/features/compas/api/client";
import type { DemoMerchant } from "@/features/compas/api/contracts";
import { useDemoMerchants } from "@/features/compas/api/hooks";
import { DEMO_MERCHANTS } from "@/features/compas/demo-identities";
import {
  CATEGORY_LABEL,
  CORROBORATION_LABEL,
  errorText,
  purchaseStatusLabel,
  reasonText,
  TRUST_LEVEL_LABEL,
} from "@/features/compas/lib/labels";
import { useDemoSession } from "@/features/demo/DemoSession";
import { formatMoneyAmount } from "@/lib/format-money";
import type { MerchantCompasCategory } from "./nequi-business-compas-demo";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--nb-blue)";

function Chip({ children, tone = "neutral" }: { children: string; tone?: "neutral" | "ok" | "sim" }) {
  const look = {
    neutral: "bg-neutral-100 text-(--nb-muted)",
    ok: "bg-(--nb-mint) text-(--nb-green)",
    sim: "bg-(--nb-sand) text-(--nb-plum)",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${look}`}>{children}</span>;
}

/**
 * What COMPAS itself knows about this shop, read from the backend: the
 * categories it declared and the ones independent evidence corroborates.
 * Separate from the local preferences above, which the backend never sees.
 */
export function MerchantCompasEvidence({ selected }: { selected: readonly MerchantCompasCategory[] }) {
  const headingId = useId();
  const { resource, reload, refreshError } = useDemoMerchants(true);
  const data = resource.status === "ready" ? resource.data : undefined;
  const merchant: DemoMerchant | undefined = data?.merchants.find((item) => item.id === DEMO_MERCHANTS.drogueria.id);
  const declared = new Set(merchant?.declarations.map((item) => item.category));
  const notSent = selected.filter((category) => !declared.has(category));

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="text-[15px] font-bold">
        Lo que COMPAS sabe de tu negocio
      </h3>
      <p className="mt-1 text-[13px] text-(--nb-muted)">
        Leído del servidor de COMPAS. Una casilla marcada aquí no cambia esto.
      </p>

      {resource.status === "loading" ? <p className="mt-3 text-[13px] text-(--nb-muted)">Consultando COMPAS…</p> : null}
      {resource.status === "error" ? (
        <div className="mt-3 space-y-2">
          <p role="alert" className="rounded-md bg-(--nb-sand) p-3 text-[13px]">
            {errorText(errorCode(resource.error))}
          </p>
          <button type="button" onClick={reload} className={`text-[13px] font-semibold underline ${focusRing}`}>
            Reintentar
          </button>
        </div>
      ) : null}
      {refreshError ? (
        <p className="mt-3 text-[12px] text-(--nb-muted)">Sin conexión con COMPAS. Mostrando la última consulta.</p>
      ) : null}

      {data ? (
        <div className="mt-3 space-y-4">
          {data.categorySources === "NONE_REGISTERED" ? (
            <p className="rounded-md bg-(--nb-sand) p-3 text-[13px] leading-snug">
              COMPAS no tiene fuentes de evidencia activas en este entorno, así que todavía no reconoce ninguna
              categoría de tu negocio. Las compras con COMPAS no pasarán la revisión del comercio.
            </p>
          ) : null}

          <div>
            <p className="text-[13px] font-semibold">Categorías que declaraste ante COMPAS</p>
            {merchant && merchant.declarations.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {merchant.declarations.map((item) => (
                  <li key={item.category} className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
                    <span>{CATEGORY_LABEL[item.category]}</span>
                    <Chip tone={item.corroboration === "CONTRADICTED" || item.corroboration === "UNCORROBORATED" ? "neutral" : "ok"}>
                      {CORROBORATION_LABEL[item.corroboration]}
                    </Chip>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[13px] text-(--nb-muted)">Ninguna registrada.</p>
            )}
          </div>

          <div>
            <p className="text-[13px] font-semibold">Categorías que COMPAS reconoce</p>
            {merchant && merchant.categories.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {merchant.categories.map((item) => (
                  <li key={item.category} className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
                    <span>{CATEGORY_LABEL[item.category]}</span>
                    <span className="flex gap-1">
                      <Chip tone="ok">{TRUST_LEVEL_LABEL[item.trustLevel]}</Chip>
                      {item.simulated ? <Chip tone="sim">Atestación simulada de Nequi Negocios</Chip> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[13px] text-(--nb-muted)">Ninguna por ahora.</p>
            )}
          </div>

          {notSent.length > 0 ? (
            <p className="rounded-md bg-(--nb-cyan) p-3 text-[13px] leading-snug">
              Marcaste {notSent.map((category) => CATEGORY_LABEL[category].toLowerCase()).join(", ")}, pero COMPAS no
              tiene esa declaración. Enviarla necesita la conexión autenticada de tu negocio con COMPAS, que aún no
              existe en esta demostración.
            </p>
          ) : null}

          <p className="text-[12px] leading-snug text-(--nb-muted)">
            Que una compra se pague se decide en cada cobro: depende de las reglas que puso quien autorizó el
            presupuesto, de la confianza que exige y del historial de tu negocio.
          </p>
        </div>
      ) : null}
    </section>
  );
}

/**
 * SIMULATED: a charge this phone hands to Andrea's phone in the same browser.
 * The backend stores no charge yet. Its answer to Andrea comes back here.
 */
export function MerchantDemoCharge() {
  const headingId = useId();
  const { scenario, charge, createCharge, clearCharge } = useDemoSession();
  const result = charge?.result;

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="text-[15px] font-bold">
        Probar un cobro con COMPAS
      </h3>
      <p className="mt-1 text-[13px] text-(--nb-muted)">
        Simulación: el cobro pasa al teléfono de Andrea dentro de este navegador. Escenario: {scenario.title}.
      </p>

      {!charge ? (
        <button
          type="button"
          onClick={createCharge}
          className={`mt-3 flex h-11 w-full items-center justify-center rounded-md border border-(--nb-plum) text-[15px] font-semibold hover:bg-(--nb-card) ${focusRing}`}
        >
          Generar cobro de {formatMoneyAmount(scenario.purchaseIntent.amount)}
        </button>
      ) : (
        <div className="mt-3 space-y-2 rounded-lg border border-(--nb-line) p-3.5">
          <p className="text-[14px] font-semibold">
            Cobro de {charge.merchantDisplayName} · {formatMoneyAmount(charge.amount)}
          </p>
          {charge.merchantId !== DEMO_MERCHANTS.drogueria.id ? (
            <p className="text-[12px] text-(--nb-muted)">En este escenario cobra otro comercio, no tu droguería.</p>
          ) : null}
          <p role="status" className="text-[13px] leading-snug">
            {!result
              ? "Esperando a que Andrea lo revise en Nequi."
              : result.kind === "PREVIEW"
                ? result.preview.next === "QUOTE"
                  ? "Andrea lo revisó: pasa las comprobaciones previas de COMPAS. Aún no es una aprobación ni un pago."
                  : "Andrea lo revisó: COMPAS detendría esta compra antes de cualquier pago."
                : result.kind === "PURCHASE"
                  ? purchaseStatusLabel(result.purchase)
                  : errorText(result.code)}
          </p>
          {result?.kind === "PURCHASE" && result.purchase.reasonCodes.length > 0 ? (
            <p className="text-[12px] text-(--nb-muted)">
              {result.purchase.reasonCodes.map((code) => reasonText(code)).join(". ")}.
            </p>
          ) : null}
          <button type="button" onClick={clearCharge} className={`text-[13px] font-semibold underline ${focusRing}`}>
            Cerrar cobro
          </button>
        </div>
      )}
    </section>
  );
}
