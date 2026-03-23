import type {} from '../../bun-test'
import { getDatabaseVersion, resolvePostgresUrl } from './version.get'

describe('resolvePostgresUrl', () => {
  it('prefers POSTGRES_URL over the other database env vars', () => {
    expect(resolvePostgresUrl({
      POSTGRES_URL: 'postgres://primary',
      POSTGRESQL_URL: 'postgres://secondary',
      DATABASE_URL: 'postgres://tertiary',
      usphs_policy_POSTGRES_URL: 'postgres://legacy-primary',
      usphs_policy_DATABASE_URL: 'postgres://legacy-secondary',
    })).toBe('postgres://primary')
  })

  it('falls back to POSTGRESQL_URL when POSTGRES_URL is missing', () => {
    expect(resolvePostgresUrl({
      POSTGRESQL_URL: 'postgres://secondary',
      DATABASE_URL: 'postgres://tertiary',
    })).toBe('postgres://secondary')
  })

  it('falls back to DATABASE_URL when it is the only configured database env var', () => {
    expect(resolvePostgresUrl({
      DATABASE_URL: 'postgres://tertiary',
    })).toBe('postgres://tertiary')
  })

  it('falls back to the legacy prefixed POSTGRES_URL when standard env vars are missing', () => {
    expect(resolvePostgresUrl({
      usphs_policy_POSTGRES_URL: 'postgres://legacy-primary',
      usphs_policy_DATABASE_URL: 'postgres://legacy-secondary',
    })).toBe('postgres://legacy-primary')
  })

  it('falls back to the legacy prefixed DATABASE_URL when it is the only configured database env var', () => {
    expect(resolvePostgresUrl({
      usphs_policy_DATABASE_URL: 'postgres://legacy-secondary',
    })).toBe('postgres://legacy-secondary')
  })

  it('prefers standard env vars over legacy prefixed env vars', () => {
    expect(resolvePostgresUrl({
      DATABASE_URL: 'postgres://tertiary',
      usphs_policy_POSTGRES_URL: 'postgres://legacy-primary',
      usphs_policy_DATABASE_URL: 'postgres://legacy-secondary',
    })).toBe('postgres://tertiary')
  })

  it('returns an empty string when no supported database env vars are configured', () => {
    expect(resolvePostgresUrl({})).toBe('')
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

  it('returns the database version for an admin request using POSTGRESQL_URL', async () => {
    const result = await getDatabaseVersion({
      env: { POSTGRESQL_URL: 'postgres://secondary' },
      requireAdminFn: () => Promise.resolve(undefined),
      createSql: (url) => {
        expect(url).toBe('postgres://secondary')
        return () => Promise.resolve([{ version: 'PostgreSQL 16.3' }])
      },
    })

    expect(result).toEqual({ version: 'PostgreSQL 16.3' })
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
