type PostgresEnvKeys =
  | 'POSTGRES_URL'
  | 'POSTGRESQL_URL'
  | 'DATABASE_URL'
  | 'usphs_policy_POSTGRES_URL'
  | 'usphs_policy_DATABASE_URL'

export type PostgresEnv = Record<string, string | undefined> & Partial<Record<PostgresEnvKeys, string | undefined>>

export function resolvePostgresUrl(env: PostgresEnv): string {
  return env.POSTGRES_URL
    || env.POSTGRESQL_URL
    || env.DATABASE_URL
    || env.usphs_policy_POSTGRES_URL
    || env.usphs_policy_DATABASE_URL
    || ''
}
