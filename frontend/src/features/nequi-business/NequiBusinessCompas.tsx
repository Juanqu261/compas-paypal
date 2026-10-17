import { useId, useState, type ReactNode } from "react";
import { CompasMark } from "@/features/brand/CompasLogo";
import { useDemoSession } from "@/features/demo/DemoSession";
import { nequiBusinessDemo } from "./nequi-business-demo-content";
import {
  merchantCompasCategories,
  merchantCompasEstablishment,
  type MerchantCompasCategory,
  type MerchantCompasConfig,
} from "./nequi-business-compas-demo";
import { MerchantCategoryChip, MerchantChargeCard, MerchantChargeForm, MerchantCompasEvidence } from "./NequiBusinessCompasStatus";
import { BackIcon, ChevronDownIcon, InfoIcon, StoreIcon } from "./NequiBusinessIcons";
import { NequiBusinessScreen } from "./NequiBusinessScreen";
import { NequiBusinessStatusBar } from "./NequiBusinessStatusBar";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--nb-blue)";

const steps = [
  { title: "Generas el cobro", body: "Monto y qué compra el cliente." },
  { title: "El cliente lo revisa en Nequi", body: "Con el presupuesto que le autorizaron." },
  { title: "COMPAS decide y la billetera paga", body: "Solo si la compra cumple las reglas." },
];

/** A section that starts closed, so it never competes with charging. */
function Fold({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-(--nb-line) [&_summary::-webkit-details-marker]:hidden">
      <summary className={`flex cursor-pointer items-center gap-2 p-4 ${focusRing}`}>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold">{title}</span>
          {hint ? <span className="block text-[12px] text-(--nb-muted)">{hint}</span> : null}
        </span>
        <ChevronDownIcon className="size-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="border-t border-(--nb-line) p-4">{children}</div>
    </details>
  );
}

/**
 * The merchant's COMPAS: its status, a way to charge, and, folded away, the
 * local settings and what COMPAS verified. Saving the settings is local UI
 * state, not an enrollment or a verification. This screen decides no payment.
 */
export function NequiBusinessCompas({
  config,
  onSave,
  onBack,
}: {
  config: MerchantCompasConfig;
  onSave: (next: MerchantCompasConfig) => void;
  onBack: () => void;
}) {
  const titleId = useId();
  const switchId = useId();
  const [draft, setDraft] = useState<MerchantCompasConfig>(config);
  const [saved, setSaved] = useState(false);
  const [charging, setCharging] = useState(false);
  const { charge } = useDemoSession();
  const missingCategory = draft.enabled && draft.categories.length === 0;

  function update(next: MerchantCompasConfig) {
    setDraft(next);
    setSaved(false);
  }

  function toggleCategory(id: MerchantCompasCategory) {
    const selected = draft.categories.includes(id)
      ? draft.categories.filter((category) => category !== id)
      : [...draft.categories, id];
    update({
      ...draft,
      categories: merchantCompasCategories.map((category) => category.id).filter((category) => selected.includes(category)),
    });
  }

  return (
    <NequiBusinessScreen labelledBy={titleId} onBack={onBack}>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="bg-(--nb-card) px-5 pb-5 @min-[380px]:px-6">
          <NequiBusinessStatusBar tone="dark" />
          <button
            type="button"
            data-initial-focus
            onClick={onBack}
            aria-label="Volver a Conoce más"
            className={`-ml-2 mt-2 grid size-11 place-items-center rounded-full hover:bg-black/5 ${focusRing}`}
          >
            <BackIcon className="size-7" />
          </button>
          <div className="mt-2 flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-md bg-white">
              <CompasMark className="size-8" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-[24px] leading-tight font-bold tracking-tight">
                COMPAS
              </h2>
              <p className="text-[13px] text-(--nb-muted)">Pagos con propósito</p>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
                config.enabled ? "bg-(--nb-mint) text-(--nb-green)" : "bg-neutral-200 text-(--nb-muted)"
              }`}
            >
              {config.enabled ? "Activo" : "Inactivo"}
            </span>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-lg bg-white p-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-(--nb-tile)">
              <StoreIcon className="size-7" />
            </span>
            <p className="min-w-0">
              <span className="block truncate text-[15px] font-bold">{merchantCompasEstablishment}</span>
              <span className="block text-[12px] text-(--nb-muted)">{nequiBusinessDemo.ownerName}</span>
            </p>
          </div>
          {config.enabled && config.categories.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Categorías que aceptas">
              {config.categories.map((category) => (
                <span key={category} className="rounded-full bg-white">
                  <MerchantCategoryChip category={category} />
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-4 px-5 pt-5 pb-6 @min-[380px]:px-6">
          {charging ? (
            <MerchantChargeForm onDone={() => setCharging(false)} onCancel={() => setCharging(false)} />
          ) : (
            <>
              {charge ? (
                <MerchantChargeCard onNew={() => setCharging(true)} />
              ) : (
                <button
                  type="button"
                  disabled={!config.enabled}
                  onClick={() => setCharging(true)}
                  className={`flex h-14 w-full items-center justify-center gap-2 rounded-md bg-(--nb-plum) text-[17px] font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
                >
                  <CompasMark className="size-7" />
                  Cobrar con COMPAS
                </button>
              )}
              {!config.enabled ? (
                <p className="text-center text-[13px] text-(--nb-muted)">Activa COMPAS en Configuración para cobrar.</p>
              ) : null}

              <Fold title="Configuración" hint="Guardada solo en este teléfono">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <span id={switchId} className="text-[14px]">
                      Aceptar pagos con COMPAS
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={draft.enabled}
                      aria-labelledby={switchId}
                      onClick={() => update({ ...draft, enabled: !draft.enabled })}
                      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors motion-reduce:transition-none ${focusRing} ${
                        draft.enabled ? "bg-(--nb-plum)" : "bg-neutral-300"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
                          draft.enabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                  <fieldset disabled={!draft.enabled} className="min-w-0 disabled:opacity-60">
                    <legend className="text-[14px] font-semibold">Categorías que aceptas</legend>
                    <ul className="mt-2 space-y-2">
                      {merchantCompasCategories.map((category) => (
                        <li key={category.id}>
                          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-(--nb-line) p-3 has-checked:border-(--nb-plum) has-checked:bg-(--nb-card) has-disabled:cursor-not-allowed has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--nb-blue)">
                            <input
                              type="checkbox"
                              checked={draft.categories.includes(category.id)}
                              onChange={() => toggleCategory(category.id)}
                              className="size-5 shrink-0 accent-(--nb-plum) focus:outline-none"
                            />
                            <span className="min-w-0">
                              <span className="block text-[15px]">{category.label}</span>
                              <span className="block text-[12px] text-(--nb-muted)">{category.description}</span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 flex gap-2 text-[12px] leading-snug text-(--nb-muted)">
                      <InfoIcon className="size-4 shrink-0" />
                      Marcar una categoría no la verifica. COMPAS la acepta cuando una fuente independiente la corrobora.
                    </p>
                  </fieldset>
                  <p role="status" className="min-h-5 text-center text-[13px]">
                    {missingCategory ? "Elige al menos una categoría." : saved ? "Guardado en este teléfono." : ""}
                  </p>
                  <button
                    type="button"
                    disabled={missingCategory}
                    onClick={() => {
                      onSave(draft);
                      setSaved(true);
                    }}
                    className={`flex h-12 w-full items-center justify-center rounded-md border border-(--nb-plum) text-[15px] font-semibold transition-opacity hover:bg-(--nb-card) disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
                  >
                    Guardar configuración
                  </button>
                </div>
              </Fold>

              <Fold title="Verificación en COMPAS" hint="Lo que COMPAS sabe de tu negocio">
                <MerchantCompasEvidence selected={draft.categories} />
              </Fold>

              <Fold title="¿Cómo funciona?">
                <ol className="space-y-3">
                  {steps.map((step, index) => (
                    <li key={step.title} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className="grid size-7 shrink-0 place-items-center rounded-full bg-(--nb-sky) text-[13px] font-bold"
                      >
                        {index + 1}
                      </span>
                      <p className="min-w-0">
                        <span className="block text-[14px] font-semibold">{step.title}</span>
                        <span className="block text-[12px] text-(--nb-muted)">{step.body}</span>
                      </p>
                    </li>
                  ))}
                </ol>
              </Fold>
            </>
          )}
        </div>
      </div>
    </NequiBusinessScreen>
  );
}
