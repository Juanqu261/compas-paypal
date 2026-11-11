import type { AuthoritativeRefund } from "../../application/capabilities.ts";
import { fromPayPalAmount } from "./amounts.ts";
import type { PayPalConfig } from "./config.ts";
import { readPayPalConfig } from "./config.ts";
import { PayPalRestClient } from "./rest-client.ts";

/**
 * PayPal's verify-webhook-signature API. A notification is authentic only
 * when PayPal returns SUCCESS. The certificate URL has to be on paypal.com.
 * Without PAYPAL_WEBHOOK_ID every notification is refused and capacity is unchanged.
 */

const CERT_URL = /^https:\/\/([a-z0-9.-]+\.)?paypal\.com\//i;

export type WebhookVerdict = { ok: true } | { ok: false; reason: string };

export type PayPalRefundPorts = {
  verifyWebhook(input: { headers: Record<string, string | undefined>; event: unknown }): Promise<WebhookVerdict>;
  getRefund(paypalRefundId: string): Promise<AuthoritativeRefund>;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function captureIdOf(body: Record<string, unknown>): string | undefined {
  if (typeof body.capture_id === "string") return body.capture_id;
  const links = Array.isArray(body.links) ? body.links : [];
  for (const link of links) {
    const item = record(link);
    if (item?.rel !== "up" || typeof item.href !== "string") continue;
    const match = /\/captures\/([2-9A-HJ-NP-Z]+)/.exec(item.href);
    if (match) return match[1];
  }
  return undefined;
}

const REFUND_STATUS = new Set(["COMPLETED", "PENDING", "CANCELLED", "FAILED"]);

export function readRefund(body: unknown): AuthoritativeRefund | undefined {
  const recordBody = record(body);
  if (!recordBody || typeof recordBody.id !== "string" || !REFUND_STATUS.has(String(recordBody.status))) return undefined;
  const captureId = captureIdOf(recordBody);
  if (!captureId) return undefined;
  try {
    const amount = fromPayPalAmount(recordBody.amount);
    return {
      paypalRefundId: recordBody.id,
      paypalCaptureId: captureId,
      amount,
      status: recordBody.status as AuthoritativeRefund["status"],
    };
  } catch {
    return undefined;
  }
}

export function createPayPalRefundPorts(env: NodeJS.ProcessEnv = process.env): PayPalRefundPorts {
  const config = readPayPalConfig(env);
  const webhookId = env.PAYPAL_WEBHOOK_ID?.trim();
  if (!config.configured || !webhookId) {
    return {
      verifyWebhook: async () => ({ ok: false, reason: "WEBHOOK_NOT_CONFIGURED" }),
      getRefund: async () => {
        throw new Error("PAYPAL_NOT_CONFIGURED");
      },
    };
  }
  const client = new PayPalRestClient({ config: config.config });
  return portsFor(client, webhookId);
}

export function portsFor(client: Pick<PayPalRestClient, "request">, webhookId: string): PayPalRefundPorts {
  return {
    async verifyWebhook({ headers, event }) {
      const certUrl = headers["paypal-cert-url"];
      const transmissionId = headers["paypal-transmission-id"];
      const transmissionSig = headers["paypal-transmission-sig"];
      const transmissionTime = headers["paypal-transmission-time"];
      const authAlgo = headers["paypal-auth-algo"];
      if (!certUrl || !CERT_URL.test(certUrl) || !transmissionId || !transmissionSig || !transmissionTime || !authAlgo) {
        return { ok: false, reason: "MISSING_HEADERS" };
      }
      const response = await client.request("PayPal verify webhook", "POST", "/v1/notifications/verify-webhook-signature", {
        body: {
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: webhookId,
          webhook_event: event,
        },
      });
      const status = record(response)?.verification_status;
      return status === "SUCCESS" ? { ok: true } : { ok: false, reason: "INVALID_SIGNATURE" };
    },
    async getRefund(paypalRefundId) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(paypalRefundId)) throw new Error("INVALID_REFUND_ID");
      const body = await client.request("PayPal get refund", "GET", `/v2/payments/refunds/${paypalRefundId}`);
      const refund = readRefund(body);
      if (!refund) throw new Error("UNREADABLE_REFUND");
      return refund;
    },
  };
}

/** Exposed so a test can build the ports around a fake client. The config type is unused at runtime. */
export type RefundConfig = PayPalConfig;
