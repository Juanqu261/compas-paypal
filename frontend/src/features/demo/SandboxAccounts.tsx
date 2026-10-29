"use client";

import { useState, type FormEvent } from "react";
import { compasApi, CompasApiError } from "@/features/compas/api/client";
import type { DemoAccountsBody, DemoAccountsView, FieldError } from "@/features/compas/api/contracts";
import { useResource } from "@/features/compas/api/hooks";

const PRESENTER_KEY = "compas.presenterKey";

/**
 * The presenter link is `/demo?presenter=<key>`. The key is kept for this tab
 * and taken out of the address bar, so it doesn't show on a shared screen.
 */
function readPresenterKey(): string | undefined {
  try {
    const url = new URL(window.location.href);
    const fromLink = url.searchParams.get("presenter");
    if (fromLink) {
      window.sessionStorage.setItem(PRESENTER_KEY, fromLink);
      url.searchParams.delete("presenter");
      window.history.replaceState(window.history.state, "", url.toString());
      return fromLink;
    }
    return window.sessionStorage.getItem(PRESENTER_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

const FIELD_TEXT: Record<string, string> = {
  INVALID_ACCOUNT_ID: "An account ID is 13 letters and digits, such as KUHH9HTUKXYMN.",
  SAME_ACCOUNT: "Use your business account here, not the personal one.",
};

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  error?: FieldError;
}) {
  return (
    <div>
      <label htmlFor={id} className="block font-semibold text-ink">
        {label}
      </label>
      <p id={`${id}-hint`} className="text-sm text-ink-soft">
        {hint}
      </p>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        maxLength={20}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
        className="mt-2 w-full rounded-xl border border-ink/20 bg-paper px-3 py-2.5 font-mono text-ink uppercase placeholder:normal-case focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-route"
        placeholder="13-character account ID"
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm font-medium text-ink">
          {FIELD_TEXT[error.code] ?? error.message}
        </p>
      ) : null}
    </div>
  );
}

function AccountsForm({
  view,
  presenterKey,
  onSaved,
  onCancel,
}: {
  view: DemoAccountsView;
  presenterKey?: string;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const current = view.accounts?.source === "VISITOR" ? view.accounts : undefined;
  const [payer, setPayer] = useState(current?.payerPayPalId ?? "");
  const [payee, setPayee] = useState(current?.payeeMerchantId ?? "");
  const [busy, setBusy] = useState<"VISITOR" | "PRESENTER" | null>(null);
  const [errors, setErrors] = useState<readonly FieldError[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const canUsePresenter = view.presenter === "OPEN" || (view.presenter === "KEY" && presenterKey !== undefined);

  const save = async (body: DemoAccountsBody) => {
    setBusy(body.source);
    setErrors([]);
    setFailure(null);
    try {
      await compasApi.setDemoAccounts(body);
      onSaved();
    } catch (error) {
      if (error instanceof CompasApiError && error.fieldErrors.length > 0) setErrors(error.fieldErrors);
      else if (error instanceof CompasApiError && error.code === "PRESENTER_KEY_REQUIRED") {
        setFailure("This presenter link isn’t valid any more. Use your own accounts.");
      } else setFailure("Couldn’t save the accounts. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save({ source: "VISITOR", payerPayPalId: payer.trim(), payeeMerchantId: payee.trim() });
  };
  const fieldError = (field: string) => errors.find((error) => error.field === field);

  return (
    <form onSubmit={submit} className="rounded-3xl border border-ink/15 bg-paper p-5 sm:p-6">
      <h3 className="font-display text-2xl text-ink">Pay with your own PayPal sandbox accounts</h3>
      <p className="mt-2 max-w-3xl text-ink-soft">
        The money in this demo is PayPal sandbox money. Bring one personal and one business account from your PayPal
        developer dashboard: your personal account plays Pedro and approves each payment; your business account receives
        it, standing in for Droguería Central.
      </p>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Field
          id="payer-account"
          label="Personal account ID (Pedro)"
          hint="Only this account’s approvals are captured."
          value={payer}
          onChange={setPayer}
          error={fieldError("payerPayPalId")}
        />
        <Field
          id="payee-account"
          label="Business account ID (receives the payments)"
          hint="The trust evidence shown stays Droguería Central’s (demo/test data)."
          value={payee}
          onChange={setPayee}
          error={fieldError("payeeMerchantId")}
        />
      </div>

      <details className="mt-4 text-sm text-ink-soft [&_summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer font-semibold text-route-deep">Where do I find the account IDs?</summary>
        <p className="mt-2 max-w-3xl">
          At developer.paypal.com, open Testing Tools, then Sandbox Accounts. Open each account’s details: the Account ID
          is the 13-character code. Not the email.
        </p>
      </details>

      <p className="mt-4 max-w-3xl rounded-xl bg-shoal/45 px-4 py-3 text-sm text-ink">
        COMPAS never asks for a password: when Pedro approves, you log in at the PayPal sandbox yourself. These two IDs
        are kept only in this demo’s memory, are not stored anywhere else, and are gone when the demo ends.
      </p>

      {failure ? (
        <p role="alert" className="mt-4 text-ink">
          {failure}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy !== null}
          className="rounded-xl bg-route px-5 py-3 font-semibold text-paper transition-colors duration-200 hover:bg-route-deep disabled:cursor-progress disabled:opacity-60 motion-reduce:transition-none"
        >
          {busy === "VISITOR" ? "Saving…" : "Use my accounts"}
        </button>
        {canUsePresenter ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void save({ source: "PRESENTER", ...(presenterKey ? { presenterKey } : {}) })}
            className="rounded-xl border border-ink/20 bg-paper px-5 py-3 font-semibold text-ink transition-colors duration-200 hover:bg-shoal/45 disabled:cursor-progress disabled:opacity-60 motion-reduce:transition-none"
          >
            {busy === "PRESENTER" ? "Saving…" : "Use the presenter’s demo accounts"}
          </button>
        ) : null}
        {onCancel ? (
          <button type="button" onClick={onCancel} className="px-2 py-3 font-semibold text-ink-soft hover:text-ink">
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Act 2's first step: the PayPal sandbox accounts this demo pays with. No
 * PayPal order is created before one is chosen. The backend decides what each
 * choice allows; this card only asks and shows.
 */
export function SandboxAccounts() {
  const [presenterKey] = useState(readPresenterKey);
  const [editing, setEditing] = useState(false);
  const { resource, reload } = useResource("demo-accounts", () => compasApi.demoAccounts());

  if (resource.status === "loading") {
    return <p className="text-ink-soft">Reading this demo’s PayPal sandbox accounts…</p>;
  }
  if (resource.status === "error") {
    return (
      <p role="alert" className="text-ink">
        Couldn’t read this demo’s PayPal sandbox accounts.{" "}
        <button type="button" onClick={reload} className="font-semibold text-route-deep underline">
          Try again
        </button>
      </p>
    );
  }

  const view = resource.data;
  const saved = () => {
    setEditing(false);
    reload();
  };
  if (!view.accounts || editing) {
    return (
      <AccountsForm
        view={view}
        {...(presenterKey ? { presenterKey } : {})}
        onSaved={saved}
        {...(view.accounts ? { onCancel: () => setEditing(false) } : {})}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-ink/15 bg-paper px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-ink">
        {view.accounts.source === "VISITOR" ? (
          <>
            <span className="font-semibold">Your sandbox accounts.</span> Pedro approves as{" "}
            <span className="font-mono">{view.accounts.payerPayPalId}</span>; payments go to{" "}
            <span className="font-mono">{view.accounts.payeeMerchantId}</span>, standing in for Droguería Central.
          </>
        ) : (
          <>
            <span className="font-semibold">The presenter’s sandbox accounts.</span> Pedro approves at PayPal as the
            presenter’s test account.
          </>
        )}
        <span className="block text-sm text-ink-soft">Kept only in this demo’s memory. No password is ever asked for.</span>
      </p>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="shrink-0 rounded-xl border border-ink/20 px-4 py-2 font-semibold text-ink hover:bg-shoal/45"
      >
        Change
      </button>
    </div>
  );
}
