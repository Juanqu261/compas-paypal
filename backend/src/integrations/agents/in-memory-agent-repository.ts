import {
  type AgentAuthorizationRequest,
  type AgentClient,
  type AgentEvent,
  type AgentGrant,
  type AgentTokenRecord,
  MAX_EVENTS_PER_GRANT,
} from "../../domain/agent.ts";
import type { AgentRepository } from "../../ports/agent-repository.ts";

/**
 * In memory. A restart loses every client, grant and token, so every agent
 * must be authorized again. There is no Postgres table for them yet.
 */
export class InMemoryAgentRepository implements AgentRepository {
  readonly #clients = new Map<string, AgentClient>();
  readonly #requests = new Map<string, AgentAuthorizationRequest>();
  readonly #grants = new Map<string, AgentGrant>();
  readonly #tokens = new Map<string, AgentTokenRecord>();
  readonly #events = new Map<string, AgentEvent[]>();

  async putClient(client: AgentClient): Promise<void> {
    this.#clients.set(client.id, structuredClone(client));
  }

  async getClient(id: string): Promise<AgentClient | undefined> {
    const client = this.#clients.get(id);
    return client ? structuredClone(client) : undefined;
  }

  async clientCount(): Promise<number> {
    return this.#clients.size;
  }

  async putRequest(request: AgentAuthorizationRequest): Promise<void> {
    this.#requests.set(request.id, structuredClone(request));
  }

  async getRequest(id: string): Promise<AgentAuthorizationRequest | undefined> {
    const request = this.#requests.get(id);
    return request ? structuredClone(request) : undefined;
  }

  async deleteRequest(id: string): Promise<boolean> {
    return this.#requests.delete(id);
  }

  async requestCount(): Promise<number> {
    return this.#requests.size;
  }

  async putGrant(grant: AgentGrant): Promise<void> {
    this.#grants.set(grant.id, structuredClone(grant));
  }

  async getGrant(id: string): Promise<AgentGrant | undefined> {
    const grant = this.#grants.get(id);
    return grant ? structuredClone(grant) : undefined;
  }

  async listGrants(): Promise<readonly AgentGrant[]> {
    return [...this.#grants.values()].map((grant) => structuredClone(grant));
  }

  async revokeGrant(id: string, at: string): Promise<AgentGrant | undefined> {
    const grant = this.#grants.get(id);
    if (!grant || grant.revokedAt) return undefined;
    const revoked: AgentGrant = { ...grant, revokedAt: at };
    this.#grants.set(id, revoked);
    return structuredClone(revoked);
  }

  async putToken(token: AgentTokenRecord): Promise<void> {
    this.#tokens.set(token.hash, structuredClone(token));
  }

  async getToken(hash: string): Promise<AgentTokenRecord | undefined> {
    const token = this.#tokens.get(hash);
    return token ? structuredClone(token) : undefined;
  }

  // No await between the check and the write: one caller wins.
  async markTokenUsed(hash: string, at: string): Promise<boolean> {
    const token = this.#tokens.get(hash);
    if (!token || token.usedAt) return false;
    this.#tokens.set(hash, { ...token, usedAt: at });
    return true;
  }

  async addEvent(event: AgentEvent): Promise<void> {
    const log = this.#events.get(event.grantId) ?? [];
    log.push(structuredClone(event));
    this.#events.set(event.grantId, log.slice(-MAX_EVENTS_PER_GRANT));
  }

  async listEvents(grantId: string): Promise<readonly AgentEvent[]> {
    return structuredClone(this.#events.get(grantId) ?? []);
  }
}
