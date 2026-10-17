import {
  COMPAS_CATEGORIES,
  type CategoryConflict,
  type CategorySource,
  type CompasCategory,
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
  /** Entries about the wallet, entries about subjects bound to it, and revocations of any of them. */
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
};

const VERIFIED_RANK = trustRank("PROVIDER_VERIFIED");

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
  const bindings = new Map<string, MerchantTrustLevel>();
  for (const entry of live) {
    if (entry.type !== "IDENTITY_BINDING" || entry.walletAddressUrl !== walletAddressUrl) continue;
    const level = sources.get(entry.sourceId)!.trustLevel;
    const current = bindings.get(entry.subject.subjectRef);
    if (!current || trustRank(level) > trustRank(current)) bindings.set(entry.subject.subjectRef, level);
  }

  const unmapped = new Set<string>();
  const claims: EvaluatedClaim[] = [];
  for (const entry of live) {
    if (entry.type !== "CATEGORY_CLAIM" && entry.type !== "LICENSE_CLAIM") continue;
    const sourceLevel = sources.get(entry.sourceId)!.trustLevel;

    let trustLevel: MerchantTrustLevel;
    if (entry.subject.kind === "WALLET_ADDRESS") {
      if (entry.subject.walletAddressUrl !== walletAddressUrl) continue;
      trustLevel = sourceLevel;
    } else {
      const binding = bindings.get(entry.subject.subjectRef);
      if (!binding) continue;
      trustLevel = weakerTrustLevel(sourceLevel, binding);
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
      claims.push({ entryId: entry.id, sourceId: entry.sourceId, trustLevel, categories, primaryCategories });
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

  const flags = live.flatMap((entry) =>
    entry.type === "FLAG" && entry.walletAddressUrl === walletAddressUrl
      ? [{ entryId: entry.id, category: entry.category }]
      : [],
  );

  return {
    walletAddressUrl,
    categories,
    conflicts,
    flags,
    unmappedEvidence: [...unmapped].sort(),
    mappingVersion: mappings.version,
    resolvedAt: now.toISOString(),
  };
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
    await Promise.all([...subjectRefs].map((ref) => deps.trustLog.listBySubjectRef(ref)))
  ).flat();
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
