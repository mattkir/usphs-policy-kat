import type {} from '../../bun-test'
import { assertNuxtHubSafePostgresUrl, resolvePostgresUrl } from '../../shared/utils/postgres'
import { getDatabaseVersion } from './version.get'

describe('resolvePostgresUrl', () => {
  it('prefers POSTGRES_URL over DATABASE_URL', () => {
    expect(resolvePostgresUrl({
      POSTGRES_URL: 'postgres://primary',
      DATABASE_URL: 'postgres://tertiary',
    })).toBe('postgres://primary')
  })

  it('falls back to DATABASE_URL when it is the only configured database env var', () => {
    expect(resolvePostgresUrl({
      DATABASE_URL: 'postgres://tertiary',
    })).toBe('postgres://tertiary')
  })

  it('returns an empty string when no supported database env vars are configured', () => {
    expect(resolvePostgresUrl({})).toBe('')
  })
})

describe('assertNuxtHubSafePostgresUrl', () => {
  it('allows a raw postgres connection string', () => {
    assertNuxtHubSafePostgresUrl('postgres://primary')
  })

  it('rejects connection strings wrapped in quotes', () => {
    const error = (() => {
      try {
        assertNuxtHubSafePostgresUrl('"postgres://primary"')
      } catch (thrownError) {
        return thrownError
      }
      return null
    })()

    expect(error instanceof Error ? error.message : error).toBe(
      'PostgreSQL connection values must be pasted into Vercel without wrapping quotes. Set POSTGRES_URL or DATABASE_URL to the raw Neon connection string.'
    )
  })

  it('rejects connection strings with characters that break NuxtHub code generation', () => {
    const error = (() => {
      try {
        assertNuxtHubSafePostgresUrl('postgres://pa\'ss@host/db')
      } catch (thrownError) {
        return thrownError
      }
      return null
    })()

    expect(error instanceof Error ? error.message : error).toBe(
      'POSTGRES_URL or DATABASE_URL contains characters that break NuxtHub database code generation. Regenerate the Neon connection string, rotate credentials if needed, and paste the raw value into Vercel.'
    )
  })
})

describe('getDatabaseVersion', () => {
  it('returns the database version for an admin request using POSTGRES_URL', async () => {
    const result = await getDatabaseVersion({
      env: { POSTGRES_URL: 'postgres://primary' },
      requireAdminFn: () => Promise.resolve(undefined),
      createSql: (url) => {
        expect(url).toBe('postgres://primary')
        return () => Promise.resolve([{ version: 'PostgreSQL 16.2' }])
      },
    })

    expect(result).toEqual({ version: 'PostgreSQL 16.2' })
  })

  it('returns the database version for an admin request using DATABASE_URL', async () => {
    const result = await getDatabaseVersion({
      env: { DATABASE_URL: 'postgres://tertiary' },
      requireAdminFn: () => Promise.resolve(undefined),
      createSql: (url) => {
        expect(url).toBe('postgres://tertiary')
        return () => Promise.resolve([{ version: 'PostgreSQL 16.4' }])
      },
    })

    expect(result).toEqual({ version: 'PostgreSQL 16.4' })
  })

  it('rejects unauthenticated requests', async () => {
    const unauthenticated = new Error('Unauthenticated')

    await expect(getDatabaseVersion({
      env: { POSTGRES_URL: 'postgres://primary' },
      requireAdminFn: () => Promise.reject(unauthenticated),
      createSql: () => {
        throw new Error('SQL client should not be created')
      },
    })).rejects.toBe(unauthenticated)
  })

  it('rejects authenticated non-admin requests', async () => {
    const forbidden = Object.assign(new Error('Admin access required'), { statusCode: 403 })

    await expect(getDatabaseVersion({
      env: { POSTGRES_URL: 'postgres://primary' },
      requireAdminFn: () => Promise.reject(forbidden),
      createSql: () => {
        throw new Error('SQL client should not be created')
      },
    })).rejects.toBe(forbidden)
  })

  it('returns a controlled 500 when no postgres url is configured', async () => {
    const error = await getDatabaseVersion({
      env: {},
      requireAdminFn: () => Promise.resolve(undefined),
      createSql: () => {
        throw new Error('SQL client should not be created')
      },
      errorFactory: (details) => details,
    }).catch(err => err)

    expect(error).toEqual({
      statusCode: 500,
      statusMessage: 'Database connection URL is not configured',
    })
  })
})
