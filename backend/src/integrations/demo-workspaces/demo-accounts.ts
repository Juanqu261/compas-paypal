import { createHash, timingSafeEqual } from "node:crypto";
import { DEMO_PARTY_IDS } from "../mandates/demo-party-directory.ts";
import { normalizePayPalAccountId } from "../../domain/merchant-identifiers.ts";
import type { DirectoryMerchant, MerchantDirectory } from "../../ports/merchant-directory.ts";
import type { DirectoryParty, PartyDirectory } from "../../ports/party-directory.ts";

/**
 * demo/test data: the PayPal sandbox accounts a visitor's demo pays with.
 * Account IDs only, never a password: the visitor logs in at PayPal
 * themselves. They live in this workspace's memory and nowhere else.
 *
 * VISITOR: the visitor's own personal account plays Pedro, and their own
 * business account receives every demo payment, standing in for the demo
 * shops. The shops' evidence stays theirs.
 * PRESENTER: the accounts this server is configured with
 * (DEMO_MERCHANT_PAYPAL_ID, DEMO_PAYER_PAYPAL_ID), for a live presentation.
 */
export type DemoAccounts =
  | { source: "VISITOR"; payerPayPalId: string; payeeMerchantId: string }
  | { source: "PRESENTER" };

/**
 * Whether visitors may use the configured accounts. OPEN: anyone, the local
 * default. KEY: only a browser that opened the presenter link
 * (COMPAS_PRESENTER_KEY). UNAVAILABLE: DEMO_MERCHANT_PAYPAL_ID is not set.
 */
export type PresenterAccess = "OPEN" | "KEY" | "UNAVAILABLE";

export type PresenterAccounts = { access: PresenterAccess; payerPinned: boolean; key?: string };

export function readPresenterAccounts(env: NodeJS.ProcessEnv = process.env): PresenterAccounts {
  const payee = normalizePayPalAccountId(env.DEMO_MERCHANT_PAYPAL_ID ?? "");
  const payerPinned = Boolean(normalizePayPalAccountId(env.DEMO_PAYER_PAYPAL_ID ?? ""));
  const key = env.COMPAS_PRESENTER_KEY?.trim();
  if (!payee) return { access: "UNAVAILABLE", payerPinned };
  return key ? { access: "KEY", payerPinned, key } : { access: "OPEN", payerPinned };
}

/** Constant-time: the presenter key is a secret. */
export function presenterKeyMatches(presenter: PresenterAccounts, offered: unknown): boolean {
  if (presenter.access === "OPEN") return true;
  if (presenter.access !== "KEY" || typeof offered !== "string" || !presenter.key) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(offered), digest(presenter.key));
}

export type AccountsInputError = { field: string; code: string; message: string };

/** A visitor's two account IDs, checked for form only. Whether they exist is PayPal's answer at the first order. */
export function parseVisitorAccounts(
  body: { payerPayPalId?: unknown; payeeMerchantId?: unknown },
): { ok: true; accounts: Extract<DemoAccounts, { source: "VISITOR" }> } | { ok: false; errors: AccountsInputError[] } {
  const read = (value: unknown) => (typeof value === "string" ? normalizePayPalAccountId(value) : undefined);
  const payer = read(body.payerPayPalId);
  const payee = read(body.payeeMerchantId);
  const message = "a PayPal sandbox account ID: 13 letters and digits";
  const errors: AccountsInputError[] = [];
  if (!payer) errors.push({ field: "payerPayPalId", code: "INVALID_ACCOUNT_ID", message });
  if (!payee) errors.push({ field: "payeeMerchantId", code: "INVALID_ACCOUNT_ID", message });
  if (payer && payee && payer === payee) {
    errors.push({ field: "payeeMerchantId", code: "SAME_ACCOUNT", message: "a business account, not the personal one" });
  }
  if (!payer || !payee || errors.length > 0) return { ok: false, errors };
  return { ok: true, accounts: { source: "VISITOR", payerPayPalId: payer, payeeMerchantId: payee } };
}

/** One workspace's accounts. Unset until the visitor picks: no PayPal order before then. */
export class WorkspaceAccounts {
  #accounts?: DemoAccounts;

  get(): DemoAccounts | undefined {
    return this.#accounts;
  }

  set(accounts: DemoAccounts): void {
    this.#accounts = accounts;
  }
}

/** The demo shops, with the visitor's business account as the payee of every order. */
export class WorkspaceMerchantDirectory implements MerchantDirectory {
  readonly #shared: MerchantDirectory;
  readonly #accounts: WorkspaceAccounts;

  constructor(shared: MerchantDirectory, accounts: WorkspaceAccounts) {
    this.#shared = shared;
    this.#accounts = accounts;
  }

  #view(merchant: DirectoryMerchant): DirectoryMerchant {
    const accounts = this.#accounts.get();
    return accounts?.source === "VISITOR" ? { ...merchant, payeeMerchantId: accounts.payeeMerchantId } : merchant;
  }

  async getById(id: string): Promise<DirectoryMerchant | undefined> {
    const merchant = await this.#shared.getById(id);
    return merchant ? this.#view(merchant) : undefined;
  }

  async list(): Promise<readonly DirectoryMerchant[]> {
    return (await this.#shared.list()).map((merchant) => this.#view(merchant));
  }
}

/** The demo people, with the visitor's personal account as the only one that may approve Pedro's orders. */
export class WorkspacePartyDirectory implements PartyDirectory {
  readonly #shared: PartyDirectory;
  readonly #accounts: WorkspaceAccounts;

  constructor(shared: PartyDirectory, accounts: WorkspaceAccounts) {
    this.#shared = shared;
    this.#accounts = accounts;
  }

  #view(party: DirectoryParty): DirectoryParty {
    const accounts = this.#accounts.get();
    return accounts?.source === "VISITOR" && party.id === DEMO_PARTY_IDS.pedro
      ? { ...party, paypalPayerId: accounts.payerPayPalId }
      : party;
  }

  async getById(id: string): Promise<DirectoryParty | undefined> {
    const party = await this.#shared.getById(id);
    return party ? this.#view(party) : undefined;
  }

  async list(): Promise<readonly DirectoryParty[]> {
    return (await this.#shared.list()).map((party) => this.#view(party));
  }
}
