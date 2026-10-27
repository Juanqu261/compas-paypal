/**
 * The Cámara de Comercio's answer for a certificate's verification code: the
 * record as the Cámara holds it. A binding uses these fields, never the
 * fields a model read from the uploaded document.
 */
export type CamaraRecord = {
  verificationCode: string;
  /** Normalized NIT, without the check digit. */
  nit: string;
  razonSocial: string;
  /** CIIU Rev. 4 A.C. codes, the main activity first. */
  ciiu: readonly string[];
  /** Lower case. Absent when the Cámara record has none. */
  notificationEmail?: string;
};

export interface CamaraVerifier {
  /** Undefined when the Cámara has no certificate with this code. */
  verify(verificationCode: string): Promise<CamaraRecord | undefined>;
  /** True for a simulated Cámara. Evidence from it is labeled demo/test data. */
  readonly simulated: boolean;
}
