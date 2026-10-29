/**
 * Merchants COMPAS knows by id. A purchase names a merchant by this id and the
 * backend reads its PayPal merchant id here, so the browser never supplies the
 * account a payment goes to. Display data only: categories come from the
 * merchant registry (the trust log), never from this directory.
 */
export type DirectoryMerchant = {
  id: string;
  displayName: string;
  /** The merchant's PayPal account. Its categories and evidence are read for it. */
  paypalMerchantId: string;
  /**
   * The PayPal account an order pays, when it is not `paypalMerchantId`: a
   * visitor's sandbox business account standing in for a demo merchant.
   */
  payeeMerchantId?: string;
};

export interface MerchantDirectory {
  getById(id: string): Promise<DirectoryMerchant | undefined>;
  list(): Promise<readonly DirectoryMerchant[]>;
}
