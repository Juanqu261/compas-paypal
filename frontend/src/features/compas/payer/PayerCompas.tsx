"use client";

import { useState } from "react";
import { useMe, useParticipants } from "../api/hooks";
import { DEMO_PARTY_IDS } from "../demo-identities";
import { datesFor, initialDraft, type WizardDraft, type WizardStep } from "../lib/wizard";
import { ErrorState, LoadingState } from "../ui/primitives";
import { CreateBudgetWizard } from "./CreateBudgetWizard";
import { MandateHistory } from "./MandateHistory";
import { type DetailNotice, PayerMandateDetail } from "./PayerMandateDetail";
import { PayerHome } from "./PayerHome";

export type PayerRoute =
  | { name: "home" }
  | { name: "create" }
  | { name: "detail"; id: string; notice?: DetailNotice }
  | { name: "history"; id: string };

export const PAYER_ROUTE_TITLE: Record<PayerRoute["name"], string> = {
  home: "COMPAS",
  create: "Crear presupuesto",
  detail: "Presupuesto",
  history: "Movimientos",
};

/**
 * Navigation inside COMPAS, kept by the host shell so its header and back
 * arrow follow the current screen. It never leaves the host app.
 */
export function usePayerNavigation(initial: readonly PayerRoute[] = [{ name: "home" }]) {
  const [stack, setStack] = useState<readonly PayerRoute[]>(initial);
  const [moves, setMoves] = useState(0);
  return {
    stack,
    current: stack[stack.length - 1],
    canGoBack: stack.length > 1,
    /** How many times the person moved. A view focuses its heading only after a move. */
    moves,
    push(route: PayerRoute) {
      setStack((current) => [...current, route]);
      setMoves((n) => n + 1);
    },
    back() {
      setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
      setMoves((n) => n + 1);
    },
    reset(next: readonly PayerRoute[]) {
      setStack(next);
      setMoves((n) => n + 1);
    },
  };
}

export type PayerNavigation = ReturnType<typeof usePayerNavigation>;

/** Only an https consent URL from the backend is followed. */
function goToWallet(redirectUrl: string) {
  try {
    if (new URL(redirectUrl).protocol === "https:") window.location.assign(redirectUrl);
  } catch {
    // A malformed URL is ignored. The mandate stays waiting for authorization.
  }
}

/** Pedro's COMPAS (payer). Rendered by the ARQ host inside its own shell. */
export function PayerCompas({
  nav,
  active,
  openCount,
  partyId = DEMO_PARTY_IDS.pedro,
}: {
  nav: PayerNavigation;
  active: boolean;
  openCount: number;
  partyId?: string;
}) {
  // Dates are filled when the person opens the wizard, never during prerender:
  // "today" belongs to the visit, not to the build.
  // Nobody is chosen for the payer: not Andrea, not Gladys.
  const [draft, setDraft] = useState<WizardDraft>(() => initialDraft({ startDate: "", endDate: "" }));
  const resetWizard = () => {
    setDraft(initialDraft({ startDate: "", endDate: "" }));
    setStep("contact");
  };
  const openWizard = () => {
    if (!draft.startDate) setDraft((current) => ({ ...current, ...datesFor(30) }));
    nav.push({ name: "create" });
  };
  const [step, setStep] = useState<WizardStep>("contact");
  const creating = active && nav.current.name === "create";
  const me = useMe(partyId, active, openCount);
  const participants = useParticipants(partyId, creating);
  const focusOnMount = nav.moves > 0;
  const route = nav.current;
  const persistence = me.resource.status === "ready" ? me.resource.data.persistence : undefined;

  if (route.name === "home") {
    return (
      <PayerHome
        partyId={partyId}
        active={active}
        openCount={openCount}
        focusOnMount={focusOnMount}
        persistence={persistence}
        onCreate={openWizard}
        onOpen={(id) => nav.push({ name: "detail", id })}
      />
    );
  }

  if (route.name === "create") {
    if (me.resource.status === "error") return <ErrorState error={me.resource.error} onRetry={me.reload} />;
    if (participants.resource.status === "error") {
      return <ErrorState error={participants.resource.error} onRetry={participants.reload} />;
    }
    if (me.resource.status !== "ready" || participants.resource.status !== "ready") {
      return <LoadingState label="Preparando el formulario" />;
    }
    return (
      <CreateBudgetWizard
        partyId={partyId}
        me={me.resource.data}
        participants={participants.resource.data.participants}
        draft={draft}
        onDraftChange={setDraft}
        step={step}
        onStepChange={setStep}
        focusOnMount={focusOnMount}
        onAuthorizationStarted={(_id, redirectUrl) => goToWallet(redirectUrl)}
        onCreatedWithoutConsent={(id, code) => {
          resetWizard();
          nav.reset([{ name: "home" }, { name: "detail", id, notice: { kind: "authorize-error", code } }]);
        }}
        onDraftSaved={(id, reason) => {
          resetWizard();
          nav.reset([{ name: "home" }, { name: "detail", id, notice: { kind: "draft-saved", reason } }]);
        }}
      />
    );
  }

  if (route.name === "detail") {
    return (
      <PayerMandateDetail
        key={route.id}
        partyId={partyId}
        id={route.id}
        active={active}
        focusOnMount={focusOnMount}
        notice={route.notice}
        onOpenHistory={() => nav.push({ name: "history", id: route.id })}
        payerGrants={me.resource.status === "ready" ? me.resource.data.payerGrants : undefined}
        onRedirectToWallet={goToWallet}
      />
    );
  }

  return <MandateHistory partyId={partyId} id={route.id} active={active} focusOnMount={focusOnMount} />;
}
