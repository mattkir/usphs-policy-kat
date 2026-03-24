import type {} from '../../../bun-test'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { prepareDirectorySourceForSync } from './directory-source'

const tempDirs: string[] = []

function hashContent(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'directory-source-'))
  tempDirs.push(root)
  return root
}

async function createMinimalPdf(filePath: string, text: string): Promise<void> {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${23 + text.length} >>\nstream\nBT\n/F1 18 Tf\n40 100 Td\n(${text}) Tj\nET\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'))
    pdf += object
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let index = 1; index <= objects.length; index++) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  await writeFile(filePath, pdf, 'utf8')
}

async function createMinimalDocx(filePath: string, text: string): Promise<void> {
  const stagingDir = await mkdtemp(path.join(os.tmpdir(), 'docx-stage-'))
  tempDirs.push(stagingDir)

  await mkdir(path.join(stagingDir, '_rels'), { recursive: true })
  await mkdir(path.join(stagingDir, 'word'), { recursive: true })

  await writeFile(path.join(stagingDir, '[Content_Types].xml'), `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
  await writeFile(path.join(stagingDir, '_rels/.rels'), `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
  await writeFile(path.join(stagingDir, 'word/document.xml'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${text}</w:t></w:r></w:p>
  </w:body>
</w:document>`)

  execFileSync('zip', ['-q', '-r', filePath, '.'], { cwd: stagingDir })
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop()
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
})

describe('prepareDirectorySourceForSync', () => {
  it('diffs unchanged, changed, deleted, and extracted files correctly', async () => {
    const root = await makeTempRoot()
    const sourceDir = path.join(root, 'policies')
    await mkdir(sourceDir, { recursive: true })

    const unchangedMarkdown = '# Existing guide\n'
    await writeFile(path.join(sourceDir, 'guide.md'), unchangedMarkdown, 'utf8')
    await writeFile(path.join(sourceDir, 'notes.txt'), 'Fresh notes', 'utf8')
    await createMinimalPdf(path.join(sourceDir, 'manual.pdf'), 'Hello PDF source')
    await createMinimalDocx(path.join(sourceDir, 'memo.docx'), 'Hello DOCX source')
    await writeFile(path.join(sourceDir, 'ignore.bin'), 'skip me', 'utf8')

    const prepared = await prepareDirectorySourceForSync({
      id: 'directory-source',
      label: 'Policy directory',
      basePath: '/docs',
      outputPath: 'policy-directory',
      directoryPath: 'policies',
    }, [
      {
        relativePath: 'guide.md',
        contentHash: hashContent(unchangedMarkdown),
        snapshotPath: 'guide.md',
        kind: 'md',
      },
      {
        relativePath: 'removed.txt',
        contentHash: hashContent('old file'),
        snapshotPath: 'removed.txt',
        kind: 'txt',
      },
    ], root)

    expect(prepared.writes.map(write => write.path)).toEqual([
      'manual.pdf.md',
      'memo.docx.md',
      'notes.txt',
      '__manifest.json',
    ])
    expect(prepared.deletes).toEqual(['removed.txt'])
    expect(prepared.stats).toEqual({
      totalFiles: 5,
      supportedFiles: 4,
      skippedFiles: 1,
      unchangedFiles: 1,
      changedFiles: 3,
      deletedFiles: 1,
    })

    const pdfWrite = prepared.writes.find(write => write.path === 'manual.pdf.md')
    expect(pdfWrite?.content).toContain('Hello PDF source')

    const docxWrite = prepared.writes.find(write => write.path === 'memo.docx.md')
    expect(docxWrite?.content).toContain('Hello DOCX source')

    const manifestWrite = prepared.writes.find(write => write.path === '__manifest.json')
    const manifest = JSON.parse(manifestWrite!.content)
    expect(manifest.documents).toEqual(prepared.documents)
  })

  it('treats renames as delete plus add', async () => {
    const root = await makeTempRoot()
    const sourceDir = path.join(root, 'policies')
    await mkdir(sourceDir, { recursive: true })
    await writeFile(path.join(sourceDir, 'new-name.txt'), 'renamed file', 'utf8')

    const prepared = await prepareDirectorySourceForSync({
      id: 'directory-source',
      label: 'Policy directory',
      basePath: '/docs',
      outputPath: 'policy-directory',
      directoryPath: 'policies',
    }, [
      {
        relativePath: 'old-name.txt',
        contentHash: hashContent('renamed file'),
        snapshotPath: 'old-name.txt',
        kind: 'txt',
      },
    ], root)

    expect(prepared.writes.some(write => write.path === 'new-name.txt')).toBe(true)
    expect(prepared.deletes).toEqual(['old-name.txt'])
  })
})
