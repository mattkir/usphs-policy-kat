import type {} from '../../bun-test'
import { verifyLocalSourceStartup } from './local-source-diagnostics'

describe('verifyLocalSourceStartup', () => {
  it('allows startup when diagnostics are healthy', async () => {
    await expect(verifyLocalSourceStartup(() => Promise.resolve({
      healthy: true,
      checks: [],
    }))).resolves.toBeUndefined()
  })

  it('throws when diagnostics fail', async () => {
    const error = await verifyLocalSourceStartup(() => Promise.resolve({
      healthy: false,
      checks: [
        {
          label: 'pdftotext',
          message: 'pdftotext is not available on PATH',
          fix: 'Install pdftotext with: brew install poppler',
        },
      ],
    })).catch(thrownError => thrownError)

    expect(error instanceof Error).toBe(true)
    expect((error as Error).message.includes('Startup blocked by local source diagnostics')).toBe(true)
  })
})
