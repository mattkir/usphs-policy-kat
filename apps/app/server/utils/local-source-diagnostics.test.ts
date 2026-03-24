import type {} from '../../bun-test'
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { getLocalSourceDiagnostics } from './local-source-diagnostics'

const tempDirs: string[] = []
const originalPath = process.env.PATH

async function makeTempDir(prefix: string): Promise<string> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), prefix))
  tempDirs.push(tempDir)
  return tempDir
}

async function createExecutable(directory: string, name: string): Promise<void> {
  const filePath = path.join(directory, name)
  await writeFile(filePath, '#!/bin/sh\nexit 0\n', 'utf8')
  await chmod(filePath, 0o755)
}

afterEach(async () => {
  process.env.PATH = originalPath
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop()
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
})

describe('getLocalSourceDiagnostics', () => {
  it('reports root missing when NUXT_LOCAL_SOURCE_ROOT is unset', async () => {
    const binDir = await makeTempDir('local-source-bin-')
    await createExecutable(binDir, 'pdftotext')
    await createExecutable(binDir, 'unzip')
    process.env.PATH = binDir

    const diagnostics = await getLocalSourceDiagnostics('')

    expect(diagnostics.healthy).toBe(false)
    expect(diagnostics.localSourceRoot.status).toBe('error')
  })

  it('reports when the configured root is a file instead of a directory', async () => {
    const binDir = await makeTempDir('local-source-bin-')
    await createExecutable(binDir, 'pdftotext')
    await createExecutable(binDir, 'unzip')
    process.env.PATH = binDir

    const rootFile = path.join(await makeTempDir('local-source-root-'), 'root.txt')
    await writeFile(rootFile, 'not a directory', 'utf8')

    const diagnostics = await getLocalSourceDiagnostics(rootFile)

    expect(diagnostics.healthy).toBe(false)
    expect(diagnostics.localSourceRoot.isDirectory).toBe(false)
  })

  it('reports pdftotext availability', async () => {
    const binDir = await makeTempDir('local-source-bin-')
    const rootDir = await makeTempDir('local-source-root-')
    await mkdir(path.join(rootDir, 'docs'), { recursive: true })
    await createExecutable(binDir, 'pdftotext')
    await createExecutable(binDir, 'unzip')
    process.env.PATH = binDir

    const diagnostics = await getLocalSourceDiagnostics(rootDir)

    expect(diagnostics.binaries.pdftotext.status).toBe('ok')
    expect(!!diagnostics.binaries.pdftotext.resolvedPath).toBe(true)
  })

  it('reports pdftotext missing', async () => {
    const binDir = await makeTempDir('local-source-bin-')
    const rootDir = await makeTempDir('local-source-root-')
    await createExecutable(binDir, 'unzip')
    process.env.PATH = binDir

    const diagnostics = await getLocalSourceDiagnostics(rootDir)

    expect(diagnostics.binaries.pdftotext.status).toBe('error')
  })

  it('accepts textutil as DOCX support', async () => {
    const binDir = await makeTempDir('local-source-bin-')
    const rootDir = await makeTempDir('local-source-root-')
    await createExecutable(binDir, 'pdftotext')
    await createExecutable(binDir, 'textutil')
    process.env.PATH = binDir

    const diagnostics = await getLocalSourceDiagnostics(rootDir)

    const docxSupport = diagnostics.checks.find(check => check.key === 'docx-support')
    expect(docxSupport?.status).toBe('ok')
    expect(docxSupport?.message).toBe('DOCX extraction is available via textutil')
  })

  it('accepts unzip when textutil is missing', async () => {
    const binDir = await makeTempDir('local-source-bin-')
    const rootDir = await makeTempDir('local-source-root-')
    await createExecutable(binDir, 'pdftotext')
    await createExecutable(binDir, 'unzip')
    process.env.PATH = binDir

    const diagnostics = await getLocalSourceDiagnostics(rootDir)

    const docxSupport = diagnostics.checks.find(check => check.key === 'docx-support')
    expect(docxSupport?.status).toBe('ok')
    expect(docxSupport?.message).toBe('DOCX extraction is available via unzip fallback')
  })

  it('reports DOCX support missing when both textutil and unzip are unavailable', async () => {
    const binDir = await makeTempDir('local-source-bin-')
    const rootDir = await makeTempDir('local-source-root-')
    await createExecutable(binDir, 'pdftotext')
    process.env.PATH = binDir

    const diagnostics = await getLocalSourceDiagnostics(rootDir)

    const docxSupport = diagnostics.checks.find(check => check.key === 'docx-support')
    expect(docxSupport?.status).toBe('error')
    expect(diagnostics.healthy).toBe(false)
  })
})
