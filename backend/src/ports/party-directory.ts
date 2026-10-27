/**
 * People COMPAS knows by id. It mirrors `compas.parties`. A party has no
 * role here: payer, delegate or beneficiary comes from the mandate that names
 * them, so one person can be the payer of one mandate and the delegate of another.
 */
export type DirectoryParty = {
  id: string;
  displayName: string;
  /**
   * The only PayPal account allowed to approve orders under this payer's
   * mandates. Without it, COMPAS captures an order whoever approved it at
   * PayPal. Delegates and beneficiaries need none.
   */
  paypalPayerId?: string;
};

export interface PartyDirectory {
  getById(id: string): Promise<DirectoryParty | undefined>;
  list(): Promise<readonly DirectoryParty[]>;
}
