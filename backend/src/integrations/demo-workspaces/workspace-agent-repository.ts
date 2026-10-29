import type {
  AgentAuthorizationRequest,
  AgentClient,
  AgentEvent,
  AgentGrant,
  AgentTokenRecord,
} from "../../domain/agent.ts";
import type { AgentRepository } from "../../ports/agent-repository.ts";

/**
 * One demo workspace's view of the agent store. An MCP client registers and
 * asks for authorization before anyone knows which visitor will answer, so
 * clients and pending requests are shared by every workspace. The grant the
 * delegate gives, its tokens and its log belong to the workspace, and each
 * token's hash is announced so a call that carries only the token finds it.
 */
export class WorkspaceAgentRepository implements AgentRepository {
  readonly #shared: AgentRepository;
  readonly #own: AgentRepository;
  readonly #onToken: (hash: string) => void;

  constructor(deps: { shared: AgentRepository; own: AgentRepository; onToken: (hash: string) => void }) {
    this.#shared = deps.shared;
    this.#own = deps.own;
    this.#onToken = deps.onToken;
  }

  putClient(client: AgentClient): Promise<void> {
    return this.#shared.putClient(client);
  }

  getClient(id: string): Promise<AgentClient | undefined> {
    return this.#shared.getClient(id);
  }

  clientCount(): Promise<number> {
    return this.#shared.clientCount();
  }

  putRequest(request: AgentAuthorizationRequest): Promise<void> {
    return this.#shared.putRequest(request);
  }

  getRequest(id: string): Promise<AgentAuthorizationRequest | undefined> {
    return this.#shared.getRequest(id);
  }

  deleteRequest(id: string): Promise<boolean> {
    return this.#shared.deleteRequest(id);
  }

  requestCount(): Promise<number> {
    return this.#shared.requestCount();
  }

  putGrant(grant: AgentGrant): Promise<void> {
    return this.#own.putGrant(grant);
  }

  getGrant(id: string): Promise<AgentGrant | undefined> {
    return this.#own.getGrant(id);
  }

  listGrants(): Promise<readonly AgentGrant[]> {
    return this.#own.listGrants();
  }

  revokeGrant(id: string, at: string): Promise<AgentGrant | undefined> {
    return this.#own.revokeGrant(id, at);
  }

  async putToken(token: AgentTokenRecord): Promise<void> {
    await this.#own.putToken(token);
    this.#onToken(token.hash);
  }

  getToken(hash: string): Promise<AgentTokenRecord | undefined> {
    return this.#own.getToken(hash);
  }

  markTokenUsed(hash: string, at: string): Promise<boolean> {
    return this.#own.markTokenUsed(hash, at);
  }

  addEvent(event: AgentEvent): Promise<void> {
    return this.#own.addEvent(event);
  }

  listEvents(grantId: string): Promise<readonly AgentEvent[]> {
    return this.#own.listEvents(grantId);
  }
}
