import type {} from '../../../bun-test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { assertDirectoryPathExists, normalizeCreateSourceBody, normalizeRelativeDirectoryPath, normalizeUpdateSourceBody } from './source-input'

const tempDirs: string[] = []

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'source-input-'))
  tempDirs.push(root)
  return root
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop()
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
})

describe('source-input', () => {
  it('normalizes directory paths inside the configured root', async () => {
    const root = await makeTempRoot()
    await mkdir(path.join(root, 'policy', 'manuals'), { recursive: true })

    const normalized = normalizeRelativeDirectoryPath('./policy/manuals/', root)
    expect(normalized).toBe('policy/manuals')

    await expect(assertDirectoryPathExists(normalized, root)).resolves.toBeUndefined()
  })

  it('rejects paths that escape the configured root', () => {
    expect(() => normalizeRelativeDirectoryPath('../secret', '/tmp/source-root')).toThrow('escapes the configured root')
  })

  it('normalizes directory source create bodies', async () => {
    const root = await makeTempRoot()
    await mkdir(path.join(root, 'local', 'docs'), { recursive: true })

    const normalized = await normalizeCreateSourceBody({
      type: 'directory',
      label: 'Policies',
      basePath: '/docs',
      branch: 'main',
      readmeOnly: false,
      maxVideos: 50,
      directoryPath: 'local/docs',
    }, root)

    expect(normalized.directoryPath).toBe('local/docs')
  })

  it('drops directoryPath updates for non-directory sources', async () => {
    const normalized = await normalizeUpdateSourceBody({
      directoryPath: 'ignored/path',
      label: 'Updated label',
    }, 'github', '/tmp/source-root')

    expect(normalized).toEqual({ label: 'Updated label' })
  })
})
