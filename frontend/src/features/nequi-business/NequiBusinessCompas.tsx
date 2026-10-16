import { useId, useState } from "react";
import { nequiBusinessDemo } from "./nequi-business-demo-content";
import {
  merchantCompasCategories,
  merchantCompasEstablishment,
  type MerchantCompasCategory,
  type MerchantCompasConfig,
} from "./nequi-business-compas-demo";
import { BackIcon, CompassIcon, InfoIcon, StoreIcon } from "./NequiBusinessIcons";
import { NequiBusinessScreen } from "./NequiBusinessScreen";
import { NequiBusinessStatusBar } from "./NequiBusinessStatusBar";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--nb-blue)";

const steps = [
  {
    title: "Configura tus categorías",
    body: "Elige qué tipo de compras aceptas.",
  },
  {
    title: "Cobra como siempre",
    body: "Con tu QR·Bre-B, link o tarjeta. No necesitas otro QR, datáfono ni app.",
  },
  {
    title: "COMPAS valida automáticamente",
    body: "Revisa que el propósito del pago coincida con tus categorías.",
  },
];

/**
 * Merchant COMPAS settings. Edits a local draft and hands it to the parent on
 * save. Saving is local UI state, not an enrollment, a registry write, or a
 * verification. This screen makes no payment decision.
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
  const statusId = useId();
  const businessId = useId();
  const categoriesId = useId();
  const stepsId = useId();
  const [draft, setDraft] = useState<MerchantCompasConfig>(config);
  const [saved, setSaved] = useState(false);
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
      categories: merchantCompasCategories
        .map((category) => category.id)
        .filter((category) => selected.includes(category)),
    });
  }

  return (
    <NequiBusinessScreen labelledBy={titleId} onBack={onBack}>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="bg-[linear-gradient(to_bottom,var(--nb-card)_calc(100%_-_4rem),#fff_calc(100%_-_4rem))] px-5 @min-[380px]:px-6">
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
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-(--nb-sky)">
              <CompassIcon className="size-7" />
            </span>
            <h2 id={titleId} className="text-[24px] leading-tight font-bold tracking-tight">
              COMPAS
            </h2>
          </div>
          <p className="mt-4 text-[17px] font-bold">Recibe pagos con propósito</p>
          <p className="mt-1 text-[14px] leading-snug text-(--nb-plum)/80">
            Cobras como siempre. COMPAS valida si el propósito autorizado por
            el cliente coincide con las categorías habilitadas de tu negocio.
          </p>

          <section
            aria-labelledby={statusId}
            className="mt-5 rounded-lg border border-(--nb-line) bg-white p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 id={statusId} className="text-[15px] font-bold">
                COMPAS en tu negocio
              </h3>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
                  draft.enabled
                    ? "bg-(--nb-mint) text-(--nb-green)"
                    : "bg-neutral-100 text-(--nb-muted)"
                }`}
              >
                {draft.enabled ? "Activo" : "Inactivo"}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span id={`${statusId}-switch`} className="text-[14px]">
                Aceptar pagos con COMPAS
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={draft.enabled}
                aria-labelledby={`${statusId}-switch`}
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
          </section>
        </div>

        <div className="space-y-7 px-5 pt-6 pb-6 @min-[380px]:px-6">
          <section aria-labelledby={businessId}>
            <h3 id={businessId} className="text-[15px] font-bold">
              Tu negocio
            </h3>
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-(--nb-line) p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-(--nb-tile)">
                <StoreIcon className="size-7" />
              </span>
              <p className="min-w-0">
                <span className="block text-[15px] font-bold">
                  {merchantCompasEstablishment}
                </span>
                <span className="block text-[13px] text-(--nb-muted)">
                  Perfil comercial · {nequiBusinessDemo.ownerName}
                </span>
              </p>
            </div>
          </section>

          <fieldset
            aria-describedby={`${categoriesId}-note`}
            disabled={!draft.enabled}
            className="min-w-0 disabled:opacity-60"
          >
            <legend id={categoriesId} className="text-[15px] font-bold">
              Categorías que aceptas con COMPAS
            </legend>
            <p className="mt-1 text-[13px] text-(--nb-muted)">
              Puedes elegir varias.
            </p>
            <ul className="mt-3 space-y-2">
              {merchantCompasCategories.map((category) => (
                <li key={category.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-(--nb-line) p-3.5 transition-colors has-checked:border-(--nb-plum) has-checked:bg-(--nb-card) has-disabled:cursor-not-allowed has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--nb-blue)">
                    <input
                      type="checkbox"
                      checked={draft.categories.includes(category.id)}
                      onChange={() => toggleCategory(category.id)}
                      className="size-5 shrink-0 accent-(--nb-plum) focus:outline-none"
                    />
                    <span className="min-w-0">
                      <span className="block text-[15px]">{category.label}</span>
                      <span className="block text-[13px] text-(--nb-muted)">
                        {category.description}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p
              id={`${categoriesId}-note`}
              className="mt-3 flex gap-2 rounded-md bg-(--nb-cyan) p-3 text-[13px] leading-snug"
            >
              <InfoIcon className="size-5 shrink-0" />
              Tus categorías se contrastarán con la información disponible de
              tu negocio y de cada compra.
            </p>
          </fieldset>

          <section aria-labelledby={stepsId}>
            <h3 id={stepsId} className="text-[15px] font-bold">
              ¿Cómo funciona?
            </h3>
            <ol className="mt-3 space-y-3">
              {steps.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-(--nb-sky) text-[13px] font-bold"
                  >
                    {index + 1}
                  </span>
                  <p className="min-w-0">
                    <span className="block text-[15px] font-semibold">{step.title}</span>
                    <span className="block text-[13px] leading-snug text-(--nb-muted)">
                      {step.body}
                    </span>
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <div className="shrink-0 border-t border-(--nb-line) bg-white px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] @min-[380px]:px-6">
        <p role="status" className="min-h-5 pb-2 text-center text-[13px]">
          {missingCategory
            ? "Elige al menos una categoría."
            : saved
              ? "Configuración guardada."
              : ""}
        </p>
        <button
          type="button"
          disabled={missingCategory}
          onClick={() => {
            onSave(draft);
            setSaved(true);
          }}
          className={`flex h-13 w-full items-center justify-center rounded-md bg-(--nb-plum) text-[16px] font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
        >
          Guardar configuración
        </button>
      </div>
    </NequiBusinessScreen>
  );
}
