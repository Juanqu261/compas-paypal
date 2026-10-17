import {
  COMPAS_CATEGORIES,
  CORROBORATION_TIERS,
  type CategoryConflict,
  type CategorySource,
  type CompasCategory,
  type CorroborationTier,
  type DeclaredCategory,
  type MerchantCategoryResolution,
  type TrustLogEntry,
} from "../domain/merchant-category.ts";
import {
  type MerchantTrustLevel,
  trustRank,
  weakerTrustLevel,
} from "../domain/merchant.ts";
import type { CategoryMappingRepository } from "../ports/category-mapping-repository.ts";
import type { CategorySourceRegistry } from "../ports/category-source-registry.ts";
import type { MerchantTrustLog } from "../ports/merchant-trust-log.ts";

export type ResolveMerchantCategoriesInput = {
  walletAddressUrl: string;
  /**
   * Entries about the wallet, entries about subjects bound to it, bindings of
   * those subjects to other wallets, and revocations of any of them.
   */
  entries: readonly TrustLogEntry[];
  /** Currently registered sources. Evidence from a removed source is ignored. */
  sources: ReadonlyMap<string, CategorySource>;
  mappings: CategoryMappingRepository;
  now: Date;
};

type EvaluatedClaim = {
  entryId: string;
  sourceId: string;
  trustLevel: MerchantTrustLevel;
  categories: ReadonlySet<CompasCategory>;
  /** Categories from the main activity, a license, or codes without a role. Used for conflicts. */
  primaryCategories: ReadonlySet<CompasCategory>;
  /** What the merchant itself declared. MERCHANT sources only. */
  declared: ReadonlySet<CompasCategory>;
  /** How much this claim corroborates or contradicts a declaration. Absent for the merchant's own claims. */
  independentTier?: IndependentTier;
  /** The NIT ref the claim joined through, when it is about a TAX_ID subject. */
  viaSubjectRef?: string;
};

type IndependentTier = Exclude<CorroborationTier, "CONTRADICTED" | "UNCORROBORATED">;
type Binding = { entryId: string; level: MerchantTrustLevel };

const VERIFIED_RANK = trustRank("PROVIDER_VERIFIED");

function tierRank(tier: CorroborationTier): number {
  return CORROBORATION_TIERS.indexOf(tier);
}

/**
 * A claim from anyone but the merchant. Its capped level sets how much it
 * counts. A verified source capped by a self-declared NIT binding still counts
 * a little: the registry agrees, but nobody checked that the NIT belongs to the wallet.
 */
function independentTier(source: CategorySource, trustLevel: MerchantTrustLevel): IndependentTier | undefined {
  if (source.kind === "MERCHANT") return undefined;
  if (trustLevel === "EXTERNAL_VERIFIED") return "EXTERNAL_VERIFIED";
  if (trustLevel === "PROVIDER_VERIFIED") return "PROVIDER_VERIFIED";
  return trustRank(source.trustLevel) >= VERIFIED_RANK ? "REGISTRY_UNBOUND" : undefined;
}

/**
 * Pure: same entries, sources, mappings and time give the same resolution,
 * so an audit can replay it. Unmapped evidence never becomes a category.
 */
export function resolveMerchantCategories(
  input: ResolveMerchantCategoriesInput,
): MerchantCategoryResolution {
  const { walletAddressUrl, sources, mappings, now } = input;

  const revoked = new Set(
    input.entries.flatMap((entry) => (entry.type === "REVOCATION" ? [entry.revokesEntryId] : [])),
  );
  const isLive = (entry: TrustLogEntry): boolean =>
    !revoked.has(entry.id) &&
    sources.has(entry.sourceId) &&
    !("validUntil" in entry && entry.validUntil !== undefined && Date.parse(entry.validUntil) <= now.getTime());
  const live = input.entries.filter(isLive);

  // Strongest live binding per subject. A binding caps every claim joined through it.
  const bindings = new Map<string, Binding>();
  const elsewhere = new Map<string, Binding[]>();
  for (const entry of live) {
    if (entry.type !== "IDENTITY_BINDING") continue;
    const binding = { entryId: entry.id, level: sources.get(entry.sourceId)!.trustLevel };
    const ref = entry.subject.subjectRef;
    if (entry.walletAddressUrl !== walletAddressUrl) {
      elsewhere.set(ref, [...(elsewhere.get(ref) ?? []), binding]);
      continue;
    }
    const current = bindings.get(ref);
    if (!current || trustRank(binding.level) > trustRank(current.level)) bindings.set(ref, binding);
  }

  const unmapped = new Set<string>();
  const claims: EvaluatedClaim[] = [];
  for (const entry of live) {
    if (entry.type !== "CATEGORY_CLAIM" && entry.type !== "LICENSE_CLAIM") continue;
    const source = sources.get(entry.sourceId)!;

    let trustLevel: MerchantTrustLevel;
    let viaSubjectRef: string | undefined;
    if (entry.subject.kind === "WALLET_ADDRESS") {
      if (entry.subject.walletAddressUrl !== walletAddressUrl) continue;
      trustLevel = source.trustLevel;
    } else {
      const binding = bindings.get(entry.subject.subjectRef);
      if (!binding) continue;
      trustLevel = weakerTrustLevel(source.trustLevel, binding.level);
      viaSubjectRef = entry.subject.subjectRef;
    }

    const categories = new Set<CompasCategory>();
    const primaryCategories = new Set<CompasCategory>();
    if (entry.type === "LICENSE_CLAIM") {
      const mapped = mappings.categoriesForLicense(entry.licenseType);
      if (!mapped) unmapped.add(`LICENSE:${entry.licenseType}`);
      for (const category of mapped ?? []) {
        categories.add(category);
        primaryCategories.add(category);
      }
    } else {
      for (const code of entry.codes) {
        const mapped = mappings.categoriesForCode(code.system, code.code);
        if (!mapped) unmapped.add(`${code.system}:${code.code}`);
        for (const category of mapped ?? []) {
          categories.add(category);
          if (code.role !== "SECONDARY") primaryCategories.add(category);
        }
      }
      for (const category of entry.declaredCategories) categories.add(category);
    }

    if (categories.size > 0) {
      const tier = independentTier(source, trustLevel);
      claims.push({
        entryId: entry.id,
        sourceId: entry.sourceId,
        trustLevel,
        categories,
        primaryCategories,
        declared: new Set(
          source.kind === "MERCHANT" && entry.type === "CATEGORY_CLAIM" ? entry.declaredCategories : [],
        ),
        ...(tier ? { independentTier: tier } : {}),
        ...(viaSubjectRef ? { viaSubjectRef } : {}),
      });
    }
  }

  const categories = COMPAS_CATEGORIES.flatMap((category) => {
    const supporting = claims.filter((claim) => claim.categories.has(category));
    if (supporting.length === 0) return [];
    const trustLevel = supporting
      .map((claim) => claim.trustLevel)
      .reduce((best, level) => (trustRank(level) > trustRank(best) ? level : best));
    return [{
      category,
      trustLevel,
      supportingEntryIds: supporting.map((claim) => claim.entryId),
      sourceIds: [...new Set(supporting.map((claim) => claim.sourceId))],
    }];
  });

  // Two verified claims whose main activities share no category contradict each other.
  const verified = claims.filter(
    (claim) => trustRank(claim.trustLevel) >= VERIFIED_RANK && claim.primaryCategories.size > 0,
  );
  const conflicts: CategoryConflict[] = [];
  for (let i = 0; i < verified.length; i += 1) {
    for (let j = i + 1; j < verified.length; j += 1) {
      const a = verified[i];
      const b = verified[j];
      const overlap = [...a.primaryCategories].some((category) => b.primaryCategories.has(category));
      if (!overlap) {
        conflicts.push({
          categories: COMPAS_CATEGORIES.filter(
            (category) => a.primaryCategories.has(category) || b.primaryCategories.has(category),
          ),
          entryIds: [a.entryId, b.entryId],
        });
      }
    }
  }

  // One NIT bound to this wallet and, at least as strongly, to another wallet:
  // nobody can tell which wallet owns the business, so its evidence is contested.
  // A weaker binding elsewhere does not touch this wallet, so a self-declared
  // binding cannot push a KYB-verified owner into REVIEW.
  for (const [ref, here] of bindings) {
    const joined = claims.filter((claim) => claim.viaSubjectRef === ref);
    const contested = COMPAS_CATEGORIES.filter((category) => joined.some((claim) => claim.categories.has(category)));
    if (contested.length === 0) continue;
    for (const other of elsewhere.get(ref) ?? []) {
      if (trustRank(other.level) >= trustRank(here.level)) {
        conflicts.push({ categories: contested, entryIds: [here.entryId, other.entryId] });
      }
    }
  }

  const flags = live.flatMap((entry) =>
    entry.type === "FLAG" && entry.walletAddressUrl === walletAddressUrl
      ? [{ entryId: entry.id, category: entry.category }]
      : [],
  );

  return {
    walletAddressUrl,
    categories,
    declarations: declarationsOf(claims),
    conflicts,
    flags,
    unmappedEvidence: [...unmapped].sort(),
    mappingVersion: mappings.version,
    resolvedAt: now.toISOString(),
  };
}

/**
 * Each category the merchant declared, against the independent evidence.
 * The strongest contradicting claim must outrank the strongest supporting one
 * to make it CONTRADICTED. A secondary activity counts as support.
 */
function declarationsOf(claims: readonly EvaluatedClaim[]): DeclaredCategory[] {
  const independent = claims.filter((claim) => claim.independentTier !== undefined);
  const strongest = (list: readonly EvaluatedClaim[]): CorroborationTier =>
    list
      .map((claim): CorroborationTier => claim.independentTier!)
      .reduce((best, tier) => (tierRank(tier) > tierRank(best) ? tier : best), "UNCORROBORATED");

  return COMPAS_CATEGORIES.flatMap((category) => {
    const declaring = claims.filter((claim) => claim.declared.has(category));
    if (declaring.length === 0) return [];

    const supporting = independent.filter((claim) => claim.categories.has(category));
    const contradicting = independent.filter(
      (claim) => claim.primaryCategories.size > 0 && !claim.categories.has(category),
    );
    const support = strongest(supporting);
    const contradiction = strongest(contradicting);
    return [{
      category,
      corroboration: tierRank(contradiction) > tierRank(support) ? "CONTRADICTED" : support,
      declarationEntryIds: declaring.map((claim) => claim.entryId),
      supportingEntryIds: supporting.map((claim) => claim.entryId),
      contradictingEntryIds: contradicting.map((claim) => claim.entryId),
    }];
  });
}

export type LoadMerchantCategoriesDeps = {
  trustLog: MerchantTrustLog;
  sources: CategorySourceRegistry;
  mappings: CategoryMappingRepository;
  now?: () => Date;
};

/** Gathers the relevant trust-log entries and resolves them. */
export async function loadMerchantCategoryResolution(
  walletAddressUrl: string,
  deps: LoadMerchantCategoriesDeps,
): Promise<MerchantCategoryResolution> {
  const walletEntries = await deps.trustLog.listByWalletAddress(walletAddressUrl);
  const subjectRefs = new Set(
    walletEntries.flatMap((entry) => (entry.type === "IDENTITY_BINDING" ? [entry.subject.subjectRef] : [])),
  );
  const subjectEntries = (
    await Promise.all(
      [...subjectRefs].flatMap((ref) => [
        deps.trustLog.listBySubjectRef(ref),
        deps.trustLog.listBindingsBySubjectRef(ref),
      ]),
    )
  )
    .flat()
    // This wallet's own bindings are already in walletEntries.
    .filter((entry) => entry.type !== "IDENTITY_BINDING" || entry.walletAddressUrl !== walletAddressUrl);
  const related = [...walletEntries, ...subjectEntries];
  const revocations = await deps.trustLog.listRevocationsFor(related.map((entry) => entry.id));

  const sources = new Map<string, CategorySource>();
  for (const sourceId of new Set(related.map((entry) => entry.sourceId))) {
    const source = await deps.sources.getById(sourceId);
    if (source) sources.set(sourceId, source);
  }

  return resolveMerchantCategories({
    walletAddressUrl,
    entries: [...related, ...revocations],
    sources,
    mappings: deps.mappings,
    now: deps.now?.() ?? new Date(),
  });
}
