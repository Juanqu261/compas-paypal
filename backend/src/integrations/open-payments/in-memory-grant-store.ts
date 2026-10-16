import type { GrantStore, StoredPayerGrant } from "../../ports/grant-store";

/**
 * Hackathon grant store. A backend restart loses every grant, and the payer
 * consents again. That is a known limit, not a fallback.
 */
export class InMemoryGrantStore implements GrantStore {
  readonly #grants = new Map<string, StoredPayerGrant>();

  async get(grantKey: string): Promise<StoredPayerGrant | undefined> {
    return this.#grants.get(grantKey);
  }

  async put(grant: StoredPayerGrant): Promise<void> {
    this.#grants.set(grant.grantKey, grant);
  }

  async delete(grantKey: string): Promise<void> {
    this.#grants.delete(grantKey);
  }
}
