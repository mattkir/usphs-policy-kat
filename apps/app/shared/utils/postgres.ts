export type PostgresEnv = Record<string, string | undefined> & Partial<Record<'POSTGRES_URL' | 'POSTGRESQL_URL' | 'DATABASE_URL', string | undefined>>

export function resolvePostgresUrl(env: PostgresEnv): string {
  return env.POSTGRES_URL || env.POSTGRESQL_URL || env.DATABASE_URL || ''
}
