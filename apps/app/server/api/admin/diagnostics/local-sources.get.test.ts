import type {} from '../../../../bun-test'
import { getLocalSourceDiagnosticsResponse } from './local-sources.get'

describe('getLocalSourceDiagnosticsResponse', () => {
  it('returns diagnostics for an admin request', async () => {
    const diagnostics = await getLocalSourceDiagnosticsResponse({
      localSourceRoot: '/srv/local-sources',
      requireAdminFn: () => Promise.resolve(undefined),
      diagnosticsFn: () => Promise.resolve({
        healthy: true,
        platform: 'darwin',
        localSourceRoot: {
          status: 'ok',
          configuredValue: '/srv/local-sources',
          resolvedPath: '/srv/local-sources',
          exists: true,
          isDirectory: true,
          message: 'ready',
        },
        binaries: {
          pdftotext: { status: 'ok', command: 'pdftotext', resolvedPath: '/opt/homebrew/bin/pdftotext', message: 'ok' },
          textutil: { status: 'ok', command: 'textutil', resolvedPath: '/usr/bin/textutil', message: 'ok' },
          unzip: { status: 'ok', command: 'unzip', resolvedPath: '/usr/bin/unzip', message: 'ok' },
        },
        checks: [],
        recommendations: ['brew install poppler'],
      }),
    })

    expect(diagnostics.healthy).toBe(true)
    expect(diagnostics.platform).toBe('darwin')
    expect(diagnostics.recommendations[0]).toBe('brew install poppler')
  })

  it('rejects non-admin requests', async () => {
    const forbidden = new Error('Admin access required')

    await expect(getLocalSourceDiagnosticsResponse({
      requireAdminFn: () => Promise.reject(forbidden),
      diagnosticsFn: () => {
        throw new Error('Diagnostics should not execute')
      },
    })).rejects.toBe(forbidden)
  })
})
