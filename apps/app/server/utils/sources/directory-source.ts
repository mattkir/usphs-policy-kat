import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { DirectorySource, DirectorySourceDocument, DirectorySourceWrite } from '../../workflows/sync-docs/types'
import { normalizeRelativeDirectoryPath, resolveLocalSourceRoot } from './source-input'

const execFileAsync = promisify(execFile)

const TEXT_FILE_EXTENSIONS = new Set(['.md', '.mdx', '.txt'])
const SUPPORTED_FILE_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.pdf', '.docx'])
const MANIFEST_FILENAME = '__manifest.json'

interface ExistingSourceDocumentRecord {
  relativePath: string
  contentHash: string
  snapshotPath: string
  kind: DirectorySourceDocument['kind']
}

interface ScannedDirectoryFile {
  absolutePath: string
  relativePath: string
  kind: DirectorySourceDocument['kind']
  contentHash: string
  buffer: Buffer
}

interface DirectorySourceLike {
  id: string
  label: string
  basePath: string | null
  outputPath: string | null
  directoryPath: string | null
}

export type DirectorySourcePreparationResult = DirectorySource

export function getDirectorySnapshotPath(relativePath: string, kind: DirectorySourceDocument['kind']): string {
  if (kind === 'pdf' || kind === 'docx') {
    return `${relativePath}.md`
  }

  return relativePath
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function createContentHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

function inferDocumentKind(relativePath: string): DirectorySourceDocument['kind'] | null {
  const extension = path.extname(relativePath).toLowerCase()
  switch (extension) {
    case '.md':
      return 'md'
    case '.mdx':
      return 'mdx'
    case '.txt':
      return 'txt'
    case '.pdf':
      return 'pdf'
    case '.docx':
      return 'docx'
    default:
      return null
  }
}

async function walkDirectory(directoryPath: string, rootPath: string, results: ScannedDirectoryFile[], counters: { totalFiles: number, supportedFiles: number, skippedFiles: number }): Promise<void> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true })

  entries.sort((a, b) => a.name.localeCompare(b.name))

  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name)

    if (entry.isDirectory()) {
      await walkDirectory(absolutePath, rootPath, results, counters)
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    counters.totalFiles++

    const relativePath = path.relative(rootPath, absolutePath).split(path.sep).join('/')
    const kind = inferDocumentKind(relativePath)
    if (!kind || !SUPPORTED_FILE_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) {
      counters.skippedFiles++
      continue
    }

    const buffer = await fs.readFile(absolutePath)
    results.push({
      absolutePath,
      relativePath,
      kind,
      buffer,
      contentHash: createContentHash(buffer),
    })
    counters.supportedFiles++
  }
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`')
}

function renderBinaryDocumentMarkdown(kind: 'pdf' | 'docx', relativePath: string, extractedText: string): string {
  const title = path.basename(relativePath)
  const normalizedText = normalizeNewlines(extractedText).trim()
  const fileTypeLabel = kind === 'pdf' ? 'PDF' : 'Word document'

  return [
    `# ${title}`,
    '',
    `Source file: \`${escapeMarkdownLabel(relativePath)}\``,
    '',
    `Extracted from ${fileTypeLabel}.`,
    '',
    normalizedText || '_No extractable text found._',
    '',
  ].join('\n')
}

async function extractPdfText(absolutePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('pdftotext', ['-q', absolutePath, '-'], {
      maxBuffer: 20 * 1024 * 1024,
    })
    return stdout
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`PDF extraction failed for ${absolutePath}: ${detail}`)
  }
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&amp;/g, '&')
}

async function extractDocxText(absolutePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('textutil', ['-convert', 'txt', '-stdout', absolutePath], {
      maxBuffer: 20 * 1024 * 1024,
    })
    return stdout
  } catch {
    try {
      const { stdout } = await execFileAsync('unzip', ['-p', absolutePath, 'word/document.xml'], {
        maxBuffer: 20 * 1024 * 1024,
      })

      return decodeXmlEntities(
        stdout
          .replace(/<\/w:p>/g, '\n')
          .replace(/<w:tab\/>/g, '\t')
          .replace(/<[^>]+>/g, ' ')
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n'),
      )
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`DOCX extraction failed for ${absolutePath}: ${detail}`)
    }
  }
}

async function renderScannedFile(entry: ScannedDirectoryFile): Promise<string> {
  if (TEXT_FILE_EXTENSIONS.has(path.extname(entry.relativePath).toLowerCase())) {
    return normalizeNewlines(entry.buffer.toString('utf-8'))
  }

  if (entry.kind === 'pdf') {
    const extractedText = await extractPdfText(entry.absolutePath)
    return renderBinaryDocumentMarkdown('pdf', entry.relativePath, extractedText)
  }

  if (entry.kind === 'docx') {
    const extractedText = await extractDocxText(entry.absolutePath)
    return renderBinaryDocumentMarkdown('docx', entry.relativePath, extractedText)
  }

  throw new Error(`Unsupported file kind: ${entry.kind}`)
}

function createManifestContent(source: DirectorySourceLike, documents: DirectorySourceDocument[], stats: DirectorySourcePreparationResult['stats']): string {
  return `${JSON.stringify({
    sourceId: source.id,
    label: source.label,
    directoryPath: source.directoryPath,
    generatedAt: new Date().toISOString(),
    hostname: os.hostname(),
    stats,
    documents,
  }, null, 2)}\n`
}

export async function prepareDirectorySourceForSync(
  source: DirectorySourceLike,
  existingDocuments: ExistingSourceDocumentRecord[],
  localSourceRoot: string | undefined | null,
): Promise<DirectorySourcePreparationResult> {
  if (!source.directoryPath) {
    throw new Error(`Directory source "${source.label}" is missing directoryPath`)
  }

  const rootPath = resolveLocalSourceRoot(localSourceRoot)
  const normalizedDirectoryPath = normalizeRelativeDirectoryPath(source.directoryPath, rootPath)
  const absoluteDirectoryPath = path.resolve(rootPath, normalizedDirectoryPath)

  let directoryStats
  try {
    directoryStats = await fs.stat(absoluteDirectoryPath)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Directory source path "${normalizedDirectoryPath}" is not readable: ${detail}`)
  }

  if (!directoryStats.isDirectory()) {
    throw new Error(`Directory source path "${normalizedDirectoryPath}" is not a directory`)
  }

  const stats = {
    totalFiles: 0,
    supportedFiles: 0,
    skippedFiles: 0,
    unchangedFiles: 0,
    changedFiles: 0,
    deletedFiles: 0,
  }

  const scannedFiles: ScannedDirectoryFile[] = []
  await walkDirectory(absoluteDirectoryPath, absoluteDirectoryPath, scannedFiles, stats)

  const existingByRelativePath = new Map(existingDocuments.map(doc => [doc.relativePath, doc]))
  const writes: DirectorySourceWrite[] = []
  const deletes = new Set<string>()
  const documents: DirectorySourceDocument[] = []

  for (const entry of scannedFiles) {
    const snapshotPath = getDirectorySnapshotPath(entry.relativePath, entry.kind)
    const document: DirectorySourceDocument = {
      relativePath: entry.relativePath,
      contentHash: entry.contentHash,
      snapshotPath,
      kind: entry.kind,
    }
    documents.push(document)

    const previous = existingByRelativePath.get(entry.relativePath)
    if (previous?.snapshotPath === snapshotPath && previous.contentHash === entry.contentHash && previous.kind === entry.kind) {
      stats.unchangedFiles++
      existingByRelativePath.delete(entry.relativePath)
      continue
    }

    if (previous?.snapshotPath && previous.snapshotPath !== snapshotPath) {
      deletes.add(previous.snapshotPath)
    }

    writes.push({
      path: snapshotPath,
      content: await renderScannedFile(entry),
    })
    stats.changedFiles++
    existingByRelativePath.delete(entry.relativePath)
  }

  for (const previous of existingByRelativePath.values()) {
    deletes.add(previous.snapshotPath)
  }
  stats.deletedFiles = deletes.size

  writes.push({
    path: MANIFEST_FILENAME,
    content: createManifestContent(source, documents, stats),
  })

  return {
    id: source.id,
    type: 'directory',
    label: source.label,
    basePath: source.basePath || '/docs',
    outputPath: source.outputPath || source.id,
    directoryPath: normalizedDirectoryPath,
    writes,
    deletes: Array.from(deletes).sort(),
    documents,
    stats,
  }
}
