import type { DirectoryParty, PartyDirectory } from "../../ports/party-directory.ts";

/**
 * demo/test data: the people of the demo story, with the ids the fixtures in
 * `data/fixtures/demo/` use. The ids carry no role. A role comes from the
 * mandate that names the party.
 *
 * Pedro's wallet is `DEMO_PAYER_WALLET_ADDRESS`, a test-network wallet. With
 * it unset, Pedro can draft a budget but not authorize it.
 */
export const DEMO_PARTY_IDS = {
  pedro: "demo-payer-pedro",
  andrea: "demo-delegate-andrea",
  gladys: "demo-beneficiary-gladys",
} as const;

export function createDemoPartyDirectory(env: NodeJS.ProcessEnv = process.env): PartyDirectory {
  const payerWallet = env.DEMO_PAYER_WALLET_ADDRESS?.trim();
  const parties: readonly DirectoryParty[] = [
    {
      id: DEMO_PARTY_IDS.pedro,
      displayName: "Pedro",
      ...(payerWallet ? { walletAddressUrl: payerWallet } : {}),
    },
    { id: DEMO_PARTY_IDS.andrea, displayName: "Andrea" },
    { id: DEMO_PARTY_IDS.gladys, displayName: "Gladys" },
  ];
  return new StaticPartyDirectory(parties);
}

export class StaticPartyDirectory implements PartyDirectory {
  readonly #parties: ReadonlyMap<string, DirectoryParty>;

  constructor(parties: readonly DirectoryParty[]) {
    this.#parties = new Map(parties.map((party) => [party.id, party]));
  }

  async getById(id: string): Promise<DirectoryParty | undefined> {
    const party = this.#parties.get(id);
    return party ? { ...party } : undefined;
  }

  async list(): Promise<readonly DirectoryParty[]> {
    return [...this.#parties.values()].map((party) => ({ ...party }));
  }
}
