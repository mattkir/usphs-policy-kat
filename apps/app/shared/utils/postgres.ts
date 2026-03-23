type PostgresEnvKeys =
  | 'POSTGRES_URL'
  | 'DATABASE_URL'

export type PostgresEnv = Record<string, string | undefined> & Partial<Record<PostgresEnvKeys, string | undefined>>

export function resolvePostgresUrl(env: PostgresEnv): string {
  return env.POSTGRES_URL
    || env.DATABASE_URL
    || ''
}

export function assertNuxtHubSafePostgresUrl(postgresUrl: string): void {
  if (!postgresUrl) {
    return
  }

  if (
    (postgresUrl.startsWith('"') && postgresUrl.endsWith('"'))
    || (postgresUrl.startsWith('\'') && postgresUrl.endsWith('\''))
  ) {
    throw new Error(
      'PostgreSQL connection values must be pasted into Vercel without wrapping quotes. Set POSTGRES_URL or DATABASE_URL to the raw Neon connection string.'
    )
  }

  if (postgresUrl.includes('\'') || postgresUrl.includes('\n') || postgresUrl.includes('\r')) {
    throw new Error(
      'POSTGRES_URL or DATABASE_URL contains characters that break NuxtHub database code generation. Regenerate the Neon connection string, rotate credentials if needed, and paste the raw value into Vercel.'
    )
  }
}
