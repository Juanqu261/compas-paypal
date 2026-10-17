import postgres from "postgres";

export type Database = postgres.Sql;

/**
 * One connection pool for the process, or undefined when DATABASE_URL is not
 * set and every log stays in memory. Supabase's pooler in transaction mode
 * does not support prepared statements, so they are off.
 * Schema: data/migrations/. The URL is a secret and never a NEXT_PUBLIC_* variable.
 */
export function connectDatabase(env: Record<string, string | undefined> = process.env): Database | undefined {
  const url = env.DATABASE_URL?.trim();
  if (!url) return undefined;
  return postgres(url, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connection: { application_name: "compas-backend" },
    onnotice: () => {},
  });
}

/** `timestamptz` comes back as a Date. The domain keeps ISO strings. */
export function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function isoOrUndefined(value: Date | string | null): string | undefined {
  return value === null ? undefined : iso(value);
}
