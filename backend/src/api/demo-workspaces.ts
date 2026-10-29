import type { IncomingMessage } from "node:http";
import { hashSecret } from "../application/agent-auth.ts";
import type { DemoWorkspaces } from "../integrations/demo-workspaces/demo-workspaces.ts";
import type { JsonResponse } from "./merchant-categories.ts";
import { OAUTH_REVOKE_PATH, OAUTH_TOKEN_PATH } from "./oauth.ts";

export const DEMO_WORKSPACES_PATH = "/demo/workspaces";
/** Names the visitor's demo on reads that have no demo person, such as the pharmacy's payments. */
export const WORKSPACE_HEADER = "x-compas-workspace";

export const UNKNOWN_WORKSPACE: JsonResponse = {
  status: 401,
  body: { error: "UNKNOWN_WORKSPACE", message: "This demo ended. Start a new one." },
};

/**
 * Who asked, for the per-address limit on new demos. Behind a proxy that
 * sets X-Forwarded-For (Next's rewrite does), `trustForwardedFor` reads its
 * first entry. A caller that reaches this server directly can set that header
 * itself, so the cap on live workspaces is what bounds memory.
 */
export function clientAddress(request: IncomingMessage, trustForwardedFor: boolean): string {
  const forwarded = request.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  if (trustForwardedFor && first) return first;
  return request.socket.remoteAddress ?? "unknown";
}

/** POST /demo/workspaces: a new, empty demo for this visitor. */
export async function handleStartDemoWorkspace(
  workspaces: Pick<DemoWorkspaces<unknown>, "create">,
  address: string,
): Promise<JsonResponse> {
  const created = await workspaces.create(address);
  if (!created.ok) return { status: 429, body: { error: created.code, message: created.message } };
  return { status: 201, body: { workspace: created.token, expiresAt: created.expiresAt, identity: "DEMO" } };
}

/** The hash of the agent token an MCP call carries, as the agent store keys it. */
export function bearerSecretHash(authorization: string | undefined): string | undefined {
  const token = authorization ? /^Bearer (\S{1,256})$/.exec(authorization.trim())?.[1] : undefined;
  return token ? hashSecret(token) : undefined;
}

/** The hash of the code, refresh token or token an OAuth token or revoke call carries. */
export function oauthSecretHash(pathname: string, rawBody: Uint8Array | undefined): string | undefined {
  if ((pathname !== OAUTH_TOKEN_PATH && pathname !== OAUTH_REVOKE_PATH) || !rawBody) return undefined;
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
  } catch {
    return undefined;
  }
  const secret = form.get("code") ?? form.get("refresh_token") ?? form.get("token");
  return secret ? hashSecret(secret) : undefined;
}
