import type { MerchantProfile } from "../domain/merchant";

export interface MerchantRegistry {
  getById(id: string): Promise<MerchantProfile | undefined>;
}
