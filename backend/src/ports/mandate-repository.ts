import type { Mandate } from "../domain/mandate";

export interface MandateRepository {
  getById(id: string): Promise<Mandate | undefined>;
  save(mandate: Mandate): Promise<void>;
}
