import type { CategorySource } from "../domain/merchant-category.ts";

/** Registered evidence sources. A source's trust level comes from here only. */
export interface CategorySourceRegistry {
  getById(sourceId: string): Promise<CategorySource | undefined>;
}
