import { AgentAuthService } from "../../application/agent-auth.ts";
import { AgentShoppingService } from "../../application/agent-shopping.ts";
import { DelegatePurchaseService, type PurchaseExecutionMode } from "../../application/delegate-purchases.ts";
import { DemoAgentRuns } from "../../application/demo-agent-run.ts";
import { ErrandService } from "../../application/errands.ts";
import { MandateService } from "../../application/mandates.ts";
import { PayPalOrderSettlement } from "../../application/settle-paypal-order.ts";
import type { FetchLike } from "../../lib/fetch-like.ts";
import type { AgentRepository } from "../../ports/agent-repository.ts";
import type { AnalystModel } from "../../ports/analyst-model.ts";
import type { CatalogMappingRepository } from "../../ports/catalog-mapping-repository.ts";
import type { CumCandidateSearch } from "../../ports/cum-candidate-search.ts";
import type { CumRegistry } from "../../ports/cum-registry.ts";
import type { MerchantCatalogRepository } from "../../ports/merchant-catalog.ts";
import type { MerchantDirectory } from "../../ports/merchant-directory.ts";
import type { MerchantRegistry } from "../../ports/merchant-registry.ts";
import type { PartyDirectory } from "../../ports/party-directory.ts";
import type { PayPalGateway } from "../../ports/paypal-gateway.ts";
import { InMemoryAgentRepository } from "../agents/in-memory-agent-repository.ts";
import { InMemoryAuditRepository } from "../audit/in-memory-audit-repository.ts";
import { InMemoryErrandRepository } from "../errands/in-memory-errand-repository.ts";
import { InMemoryMandateRepository } from "../mandates/in-memory-mandate-repository.ts";
import { createMerchantHistoryService } from "../merchant-history/create-merchant-history-service.ts";
import { paypalAcceptsAsset } from "../paypal/amounts.ts";
import { InMemorySpendingLog } from "../spending/in-memory-spending-log.ts";
import { WorkspaceAccounts, WorkspaceMerchantDirectory, WorkspacePartyDirectory } from "./demo-accounts.ts";
import { WorkspaceAgentRepository } from "./workspace-agent-repository.ts";

/** What every visitor's workspace uses and none of them owns: merchants, their evidence, the analyst's output, PayPal. */
export type DemoWorkspaceShared = {
  paypal: { gateway: PayPalGateway; configured: boolean };
  merchants: MerchantDirectory;
  registry: MerchantRegistry;
  catalogs: MerchantCatalogRepository;
  mappings: CatalogMappingRepository;
  cumRegistry: CumRegistry;
  /** The errand drafter's model and CUM search. */
  model: AnalystModel;
  search: CumCandidateSearch;
  execution: PurchaseExecutionMode;
  /** Agent clients and pending authorization requests, before any workspace answers them. */
  agents: AgentRepository;
  /** This server's public URL, the issuer the scripted agent talks to. */
  publicUrl: string;
  mcpUrl: string;
  fetch?: FetchLike;
  logWarning?: (message: string) => void;
};

/** How a call that carries only a PayPal order id or an agent token finds its workspace. */
export type DemoWorkspaceHooks = {
  onOrder: (orderId: string) => void;
  onAgentToken: (hash: string) => void;
};

/**
 * demo/test data: one visitor's demo. Their budgets, spending, errands, agent
 * grants and the demo merchant history they add to live here, in memory, and
 * nowhere else. Nothing a visitor does reaches the database or another
 * visitor's demo. Each workspace has its own Pedro, Andrea and Gladys.
 *
 * No PayPal order is created until the visitor picks the sandbox accounts
 * the demo pays with: their own, or the presenter's (see demo-accounts.ts).
 */
export async function createDemoWorkspace(
  shared: DemoWorkspaceShared,
  baseParties: PartyDirectory,
  hooks: DemoWorkspaceHooks,
) {
  const logWarning = shared.logWarning ?? (() => {});
  const accounts = new WorkspaceAccounts();
  const parties = new WorkspacePartyDirectory(baseParties, accounts);
  const merchants = new WorkspaceMerchantDirectory(shared.merchants, accounts);
  const mandateRepository = new InMemoryMandateRepository();
  const spending = new InMemorySpendingLog();
  const errands = new InMemoryErrandRepository();
  const history = await createMerchantHistoryService();

  // Every order this workspace creates is announced, so PayPal's return finds it here.
  const payments: PayPalGateway = {
    createOrder: async (input) => {
      const order = await shared.paypal.gateway.createOrder(input);
      hooks.onOrder(order.id);
      return order;
    },
    getOrder: (orderId) => shared.paypal.gateway.getOrder(orderId),
    captureOrder: (input) => shared.paypal.gateway.captureOrder(input),
  };

  // The only path to a capture: it reads the order from PayPal and the mandate
  // from the repository again, and captures only what still matches.
  const settlement = new PayPalOrderSettlement({
    payments,
    spending,
    mandates: mandateRepository,
    parties,
    history,
    errands,
    logWarning,
  });

  const mandates = new MandateService({
    mandates: mandateRepository,
    parties,
    audit: new InMemoryAuditRepository(),
    spending,
    acceptsAsset: paypalAcceptsAsset,
    ...(shared.paypal.configured ? { settlement } : {}),
    logWarning,
  });

  const purchases = new DelegatePurchaseService({
    mandates,
    merchants,
    registry: shared.registry,
    history,
    payments,
    spending,
    capacity: mandateRepository,
    catalog: { catalogs: shared.catalogs, mappings: shared.mappings },
    errands,
    execution: () =>
      !shared.execution.allowed || accounts.get()
        ? shared.execution
        : {
            allowed: false,
            code: "SANDBOX_ACCOUNTS_REQUIRED",
            reason: "Choose the PayPal sandbox accounts this demo pays with first.",
          },
    logWarning,
  });

  const errandService = new ErrandService({
    mandates,
    errands,
    registry: shared.cumRegistry,
    model: shared.model,
    search: shared.search,
  });

  // AI agents over MCP (ADR 0011). An agent holds a grant bound to the errands
  // its delegate picked, and reaches PayPal only through `purchases` above.
  const agentAuth = new AgentAuthService({
    repo: new WorkspaceAgentRepository({ shared: shared.agents, own: new InMemoryAgentRepository(), onToken: hooks.onAgentToken }),
    errands,
    mandates,
    resource: shared.mcpUrl,
  });
  const agentShopping = new AgentShoppingService({
    errands,
    mandates,
    merchants,
    registry: shared.registry,
    history,
    catalogs: shared.catalogs,
    mappings: shared.mappings,
    cum: shared.cumRegistry,
    purchases,
  });

  // The demo's scripted agent: a client of this same MCP endpoint, over HTTP. It is a script, not a model.
  const demoAgents = new DemoAgentRuns({
    origin: shared.publicUrl,
    mcpUrl: shared.mcpUrl,
    fetch: shared.fetch ?? ((url, init) => fetch(url, init)),
    errands,
    mandates,
    merchants,
    catalogs: shared.catalogs,
    mappings: shared.mappings,
    grantIdOf: async (accessToken) => (await agentAuth.authenticate(`Bearer ${accessToken}`))?.grant.id,
  });

  return { accounts, parties, merchants, payments, mandates, spending, settlement, purchases, errandService, agentAuth, agentShopping, demoAgents };
}

export type DemoWorkspace = Awaited<ReturnType<typeof createDemoWorkspace>>;
