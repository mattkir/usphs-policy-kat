import type { H3Event } from 'h3'
import { neon } from '@neondatabase/serverless'
import { requireAdmin } from '../utils/admin'
import { resolvePostgresUrl } from '../../shared/utils/postgres'
import type { PostgresEnv } from '../../shared/utils/postgres'

type DatabaseVersionRow = {
  version?: string
}

type DatabaseVersionResponse = {
  version: string
}

type SqlQuery = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<DatabaseVersionRow[]>

type GetDatabaseVersionOptions = {
  event?: H3Event
  env?: PostgresEnv
  requireAdminFn?: (event?: H3Event) => Promise<unknown>
  createSql?: (url: string) => SqlQuery
  errorFactory?: (details: { statusCode: number, statusMessage: string }) => unknown
}

export { resolvePostgresUrl }

export async function getDatabaseVersion({
  event,
  env = process.env,
  requireAdminFn = (currentEvent) => requireAdmin(currentEvent as H3Event),
  createSql = neon,
  errorFactory,
}: GetDatabaseVersionOptions = {}): Promise<DatabaseVersionResponse> {
  const makeError = errorFactory ?? ((details: { statusCode: number, statusMessage: string }) => createError(details))

  await requireAdminFn(event)

  const postgresUrl = resolvePostgresUrl(env)
  if (!postgresUrl) {
    throw makeError({
      statusCode: 500,
      statusMessage: 'Database connection URL is not configured',
    })
  }

  const sql = createSql(postgresUrl)
  const [response] = await sql`SELECT version()`

  if (!response?.version) {
    throw makeError({
      statusCode: 500,
      statusMessage: 'Database version query returned no rows',
    })
  }

  return { version: response.version }
}

const versionHandler = (event: H3Event) => getDatabaseVersion({ event })

export default typeof defineEventHandler === 'function'
  ? defineEventHandler(versionHandler)
  : versionHandler
