import type { OpenPaymentsGateway } from "../ports/open-payments-gateway";

export const OPEN_PAYMENTS_FINISH_PATH = "/open-payments/finish";

export type PayerAuthorizationResult = "granted" | "rejected" | "failed";

export type OpenPaymentsFinishDeps = {
  gateway: Pick<OpenPaymentsGateway, "finishPayerGrant">;
  /** Frontend page the payer's browser returns to. */
  returnUrl: string;
  /** The orchestrator moves the mandate to ACTIVE here. Not wired yet. */
  onPayerGrantFinished?: (grantKey: string) => Promise<void> | void;
  logError?: (message: string) => void;
};

/**
 * The payer's wallet redirects the browser here after consent, adding
 * `interact_ref` and `hash` (or `result=grant_rejected`) to the finish URI.
 * The response is only a redirect. No token or Open Payments payload
 * reaches the browser.
 */
export async function handleOpenPaymentsFinish(
  requestUrl: URL,
  deps: OpenPaymentsFinishDeps,
): Promise<{ location: string; result: PayerAuthorizationResult }> {
  const params = requestUrl.searchParams;
  const grantKey = params.get("grantKey");
  const interactRef = params.get("interact_ref");
  const hash = params.get("hash");

  let result: PayerAuthorizationResult;
  if (!grantKey) {
    result = "failed";
  } else if (params.get("result") === "grant_rejected") {
    result = "rejected";
  } else if (!interactRef || !hash) {
    result = "failed";
  } else {
    try {
      await deps.gateway.finishPayerGrant({ grantKey, interactRef, hash });
      await deps.onPayerGrantFinished?.(grantKey);
      result = "granted";
    } catch (error) {
      deps.logError?.(
        `Open Payments finish failed for ${grantKey}: ${error instanceof Error ? error.message : String(error)}`,
      );
      result = "failed";
    }
  }

  const location = new URL(deps.returnUrl);
  location.searchParams.set("payerAuthorization", result);
  if (grantKey) location.searchParams.set("grantKey", grantKey);
  return { location: location.toString(), result };
}
