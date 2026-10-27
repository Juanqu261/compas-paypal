import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeCategoryCode, normalizeNit } from "../../domain/merchant-identifiers.ts";
import type { CamaraRecord, CamaraVerifier } from "../../ports/camara-verifier.ts";

type FixtureRecord = CamaraRecord & { merchantId: string; certificateFile: string };

/**
 * demo/test data: a simulated Cámara de Comercio, answering verification
 * codes from data/seeds/camara/demo-certificates.json. It stands in for the
 * Cámara's online check behind the same port. The pitch says it is simulated.
 */
export class FixtureCamaraVerifier implements CamaraVerifier {
  readonly simulated = true;
  readonly #records: ReadonlyMap<string, FixtureRecord>;
  readonly #dir: string;

  constructor(options: { dir: string; env?: NodeJS.ProcessEnv }) {
    const env = options.env ?? process.env;
    this.#dir = options.dir;
    const file = join(options.dir, "demo-certificates.json");
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { records?: Record<string, unknown>[] };
    if (!Array.isArray(parsed.records)) throw new Error(`${file}: records must be an array`);
    this.#records = new Map(
      parsed.records.map((raw) => {
        const code = String(raw.verificationCode ?? "");
        const nit = normalizeNit(String(raw.nit ?? ""));
        const ciiu = Array.isArray(raw.ciiu)
          ? raw.ciiu.map((value) => normalizeCategoryCode("CIIU_REV4_AC", String(value)))
          : [];
        if (!code || !nit || ciiu.length === 0 || ciiu.some((value) => !value)) {
          throw new Error(`${file}: record ${code || "(no code)"} needs a code, a valid NIT and CIIU codes`);
        }
        const email =
          typeof raw.notificationEmail === "string"
            ? raw.notificationEmail
            : typeof raw.notificationEmailEnv === "string"
              ? env[raw.notificationEmailEnv]?.trim()
              : undefined;
        const record: FixtureRecord = {
          merchantId: String(raw.merchantId ?? ""),
          certificateFile: String(raw.certificateFile ?? ""),
          verificationCode: code,
          nit,
          razonSocial: String(raw.razonSocial ?? ""),
          ciiu: ciiu as string[],
          ...(email ? { notificationEmail: email.toLowerCase() } : {}),
        };
        return [code, record];
      }),
    );
  }

  async verify(verificationCode: string): Promise<CamaraRecord | undefined> {
    const record = this.#records.get(verificationCode.trim().toUpperCase());
    if (!record) return undefined;
    const { merchantId: _merchant, certificateFile: _file, ...camara } = record;
    return { ...camara, ciiu: [...camara.ciiu] };
  }

  /** The demo certificate a merchant would upload, with its email filled in. Undefined when there is none. */
  certificateText(merchantId: string): string | undefined {
    const record = [...this.#records.values()].find((candidate) => candidate.merchantId === merchantId);
    if (!record) return undefined;
    const text = readFileSync(join(this.#dir, record.certificateFile), "utf8");
    return text.replaceAll("{{notificationEmail}}", record.notificationEmail ?? "(sin correo registrado)");
  }
}
