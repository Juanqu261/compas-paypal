import type {
  AgentAuthorizationRequest,
  AgentClient,
  AgentGrant,
  AgentTokenRecord,
} from "../domain/agent.ts";

/**
 * Agent clients, grants and tokens. Single-use secrets are consumed with
 * `markTokenUsed`, which is conditional, so a replayed code or refresh token
 * is detected instead of honoured twice.
 */
export interface AgentRepository {
  putClient(client: AgentClient): Promise<void>;
  getClient(id: string): Promise<AgentClient | undefined>;
  clientCount(): Promise<number>;

  putRequest(request: AgentAuthorizationRequest): Promise<void>;
  getRequest(id: string): Promise<AgentAuthorizationRequest | undefined>;
  /** Removes the request. True only for the call that removed it. */
  deleteRequest(id: string): Promise<boolean>;
  requestCount(): Promise<number>;

  putGrant(grant: AgentGrant): Promise<void>;
  getGrant(id: string): Promise<AgentGrant | undefined>;
  listGrants(): Promise<readonly AgentGrant[]>;
  /** Conditional: only a grant that is not revoked. Returns the revoked grant. */
  revokeGrant(id: string, at: string): Promise<AgentGrant | undefined>;

  putToken(token: AgentTokenRecord): Promise<void>;
  getToken(hash: string): Promise<AgentTokenRecord | undefined>;
  /** Conditional: sets `usedAt` once. True only for the call that set it. */
  markTokenUsed(hash: string, at: string): Promise<boolean>;
}
