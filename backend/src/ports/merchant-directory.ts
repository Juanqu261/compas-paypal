/**
 * Merchants COMPAS knows by id. A purchase names a merchant by this id and the
 * backend reads its wallet address here, so the browser never supplies the
 * wallet a payment goes to. Display data only: categories come from the
 * merchant registry (the trust log), never from this directory.
 */
export type DirectoryMerchant = {
  id: string;
  displayName: string;
  /** The Open Payments wallet that receives the payment. */
  walletAddressUrl: string;
};

export interface MerchantDirectory {
  getById(id: string): Promise<DirectoryMerchant | undefined>;
  list(): Promise<readonly DirectoryMerchant[]>;
}
