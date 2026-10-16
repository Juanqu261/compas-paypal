export type Party = {
  id: string;
  displayName: string;
};

export type Payer = Party & {
  role: "PAYER";
};

export type Delegate = Party & {
  role: "DELEGATE";
};

export type Beneficiary = Party & {
  role: "BENEFICIARY";
};
