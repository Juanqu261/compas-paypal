/**
 * Console logging for watching what the backend does. Nothing is written to
 * a file. `LOG_LEVEL` sets the threshold: debug, info (default), warn, error
 * or silent. Under `node --test` the default is silent.
 *
 * Log ids, codes, states and amounts only. Never a secret, a token, an
 * errand's contents, a cart's descriptions or a model's text.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 } as const;
type Level = Exclude<keyof typeof LEVELS, "silent">;

export type LogFields = Record<string, string | number | boolean | undefined | null>;

export type Logger = {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
};

function readThreshold(): number {
  const configured = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (configured && configured in LEVELS) return LEVELS[configured as keyof typeof LEVELS];
  return process.env.NODE_TEST_CONTEXT ? LEVELS.silent : LEVELS.info;
}

const threshold = readThreshold();
const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const LABELS: Record<Level, { text: string; ansi: string }> = {
  debug: { text: "DEBUG", ansi: "\x1b[90m" },
  info: { text: "INFO ", ansi: "\x1b[36m" },
  warn: { text: "WARN ", ansi: "\x1b[33m" },
  error: { text: "ERROR", ansi: "\x1b[31m" },
};

function formatValue(value: string | number | boolean): string {
  const text = String(value);
  return /^[^\s"=]+$/.test(text) ? text : JSON.stringify(text);
}

function formatFields(fields: LogFields | undefined): string {
  if (!fields) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    parts.push(`${key}=${formatValue(value)}`);
  }
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function write(level: Level, scope: string, message: string, fields?: LogFields): void {
  if (LEVELS[level] < threshold) return;
  const time = new Date().toISOString().slice(11, 23);
  const label = LABELS[level];
  const head = color
    ? `\x1b[90m${time}\x1b[0m ${label.ansi}${label.text}\x1b[0m \x1b[35m[${scope}]\x1b[0m`
    : `${time} ${label.text} [${scope}]`;
  const line = `${head} ${message}${formatFields(fields)}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** A logger whose lines are tagged with `scope`, such as "http" or "paypal". */
export function logger(scope: string): Logger {
  return {
    debug: (message, fields) => write("debug", scope, message, fields),
    info: (message, fields) => write("info", scope, message, fields),
    warn: (message, fields) => write("warn", scope, message, fields),
    error: (message, fields) => write("error", scope, message, fields),
  };
}

/** `ms` since `start`, for a duration field. */
export function elapsed(start: number): number {
  return Math.round(performance.now() - start);
}

/** An amount as "12.50 USD". */
export function formatAmount(amount: { value: string; assetCode: string; assetScale: number }): string {
  const scale = amount.assetScale;
  const raw = BigInt(amount.value);
  const negative = raw < 0n;
  const digits = (negative ? -raw : raw).toString().padStart(scale + 1, "0");
  const whole = scale > 0 ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  return `${negative ? "-" : ""}${whole} ${amount.assetCode}`;
}

/** An error's code, or its name, never its message (which may quote an upstream body). */
export function errorLabel(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string") return code;
  return error instanceof Error ? error.name : "error";
}
