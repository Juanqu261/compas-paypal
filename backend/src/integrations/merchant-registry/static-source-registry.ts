import type { JsonWebKey } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  CATEGORY_CODE_SYSTEMS,
  CATEGORY_SOURCE_KINDS,
  CATEGORY_SOURCE_TRANSPORTS,
  type CategorySource,
  LICENSE_TYPES,
  TRUST_LOG_ENTRY_TYPES,
} from "../../domain/merchant-category.ts";
import { MERCHANT_TRUST_LEVELS } from "../../domain/merchant.ts";
import type { CategorySourceRegistry } from "../../ports/category-source-registry.ts";

export class StaticCategorySourceRegistry implements CategorySourceRegistry {
  readonly #sources: ReadonlyMap<string, CategorySource>;

  constructor(sources: readonly CategorySource[]) {
    const map = new Map<string, CategorySource>();
    for (const source of sources) {
      if (map.has(source.id)) throw new Error(`Duplicate category source ${source.id}`);
      if (source.transport === "PUSH" && !source.publicKeyJwk) {
        throw new Error(`Push source ${source.id} has no public key`);
      }
      map.set(source.id, Object.freeze({ ...source }));
    }
    this.#sources = map;
  }

  async getById(sourceId: string): Promise<CategorySource | undefined> {
    return this.#sources.get(sourceId);
  }

  list(): readonly CategorySource[] {
    return [...this.#sources.values()];
  }
}

const SUBMITTABLE_ENTRY_TYPES = TRUST_LOG_ENTRY_TYPES.filter(
  (type): type is CategorySource["allowedEntryTypes"][number] => type !== "REVOCATION",
);

function oneOf<T extends string>(allowed: readonly T[], value: unknown, where: string): T {
  if (!(allowed as readonly unknown[]).includes(value)) {
    throw new Error(`${where}: ${String(value)} is not one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function listOf<T extends string>(allowed: readonly T[], value: unknown, where: string): T[] {
  if (!Array.isArray(value)) throw new Error(`${where}: must be an array`);
  return value.map((item) => oneOf(allowed, item, where));
}

/**
 * Reads a source file. Keys are not stored in the file: each source names a
 * `keyRef`, and the caller supplies the public key for it.
 */
export function loadCategorySources(
  file: string,
  keys: ReadonlyMap<string, JsonWebKey>,
): CategorySource[] {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { sources?: unknown };
  if (!Array.isArray(parsed.sources)) throw new Error(`${file}: sources must be an array`);

  return parsed.sources.map((raw: Record<string, unknown>) => {
    const id = raw.id;
    if (typeof id !== "string" || !id) throw new Error(`${file}: source id missing`);
    const transport = oneOf(CATEGORY_SOURCE_TRANSPORTS, raw.transport, `${id}.transport`);
    const publicKeyJwk = typeof raw.keyRef === "string" ? keys.get(raw.keyRef) : undefined;
    if (transport === "PUSH" && !publicKeyJwk) {
      throw new Error(`${id}: no public key supplied for keyRef ${String(raw.keyRef)}`);
    }
    return {
      id,
      kind: oneOf(CATEGORY_SOURCE_KINDS, raw.kind, `${id}.kind`),
      trustLevel: oneOf(MERCHANT_TRUST_LEVELS, raw.trustLevel, `${id}.trustLevel`),
      transport,
      allowedEntryTypes: listOf(SUBMITTABLE_ENTRY_TYPES, raw.allowedEntryTypes, `${id}.allowedEntryTypes`),
      allowedSystems: listOf(CATEGORY_CODE_SYSTEMS, raw.allowedSystems, `${id}.allowedSystems`),
      allowedLicenses: listOf(LICENSE_TYPES, raw.allowedLicenses, `${id}.allowedLicenses`),
      ...(publicKeyJwk ? { publicKeyJwk } : {}),
      simulated: raw.simulated === true,
    };
  });
}
