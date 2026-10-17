import type { GrantStore, StoredPayerGrant } from "../../ports/grant-store.ts";
import { type Database, isoOrUndefined } from "./database.ts";

type GrantRow = {
  grant_key: string;
  state: StoredPayerGrant["state"];
  payer_wallet_address_url: string;
  resource_server: string;
  continue_uri: string;
  continue_access_token: string;
  grant_endpoint: string | null;
  client_nonce: string | null;
  finish_nonce: string | null;
  access_token: string | null;
  manage_url: string | null;
  access_token_expires_at: Date | null;
};

/**
 * compas.payer_grants, keyed by the mandate id, so the mandate row must exist
 * first. Every token here is a secret: never log a row or return it over HTTP.
 */
export class PostgresGrantStore implements GrantStore {
  readonly #sql: Database;

  constructor(sql: Database) {
    this.#sql = sql;
  }

  async get(grantKey: string): Promise<StoredPayerGrant | undefined> {
    const [row] = await this.#sql<GrantRow[]>`select * from compas.payer_grants where grant_key = ${grantKey}`;
    return row && fromRow(row);
  }

  async put(grant: StoredPayerGrant): Promise<void> {
    const pending = grant.state === "PENDING" ? grant : undefined;
    const active = grant.state === "ACTIVE" ? grant : undefined;
    const row = {
      grant_key: grant.grantKey,
      state: grant.state,
      payer_wallet_address_url: grant.payerWalletAddressUrl,
      resource_server: grant.resourceServer,
      continue_uri: grant.continueUri,
      continue_access_token: grant.continueAccessToken,
      grant_endpoint: pending?.grantEndpoint ?? null,
      client_nonce: pending?.clientNonce ?? null,
      finish_nonce: pending?.finishNonce ?? null,
      access_token: active?.accessToken ?? null,
      manage_url: active?.manageUrl ?? null,
      access_token_expires_at: active?.accessTokenExpiresAt ?? null,
    };
    await this.#sql`
      insert into compas.payer_grants ${this.#sql(row)}
      on conflict (grant_key) do update set
        state = excluded.state,
        payer_wallet_address_url = excluded.payer_wallet_address_url,
        resource_server = excluded.resource_server,
        continue_uri = excluded.continue_uri,
        continue_access_token = excluded.continue_access_token,
        grant_endpoint = excluded.grant_endpoint,
        client_nonce = excluded.client_nonce,
        finish_nonce = excluded.finish_nonce,
        access_token = excluded.access_token,
        manage_url = excluded.manage_url,
        access_token_expires_at = excluded.access_token_expires_at`;
  }

  async delete(grantKey: string): Promise<void> {
    await this.#sql`delete from compas.payer_grants where grant_key = ${grantKey}`;
  }
}

function fromRow(row: GrantRow): StoredPayerGrant {
  const base = {
    grantKey: row.grant_key,
    payerWalletAddressUrl: row.payer_wallet_address_url,
    resourceServer: row.resource_server,
    continueUri: row.continue_uri,
    continueAccessToken: row.continue_access_token,
  };
  if (row.state === "PENDING") {
    return {
      ...base,
      state: "PENDING",
      grantEndpoint: row.grant_endpoint!,
      clientNonce: row.client_nonce!,
      finishNonce: row.finish_nonce!,
    };
  }
  const expiresAt = isoOrUndefined(row.access_token_expires_at);
  return {
    ...base,
    state: "ACTIVE",
    accessToken: row.access_token!,
    manageUrl: row.manage_url!,
    ...(expiresAt ? { accessTokenExpiresAt: expiresAt } : {}),
  };
}
