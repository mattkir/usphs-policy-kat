/**
 * Step: Persist Directory Metadata
 *
 * Replaces stored source-document hashes after a successful sync/push/snapshot.
 */

import { getStepMetadata } from 'workflow'
import { log } from 'evlog'
import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { DirectorySource, Source } from '../types'

function isDirectorySource(source: Source): source is DirectorySource {
  return source.type === 'directory'
}

export async function stepPersistDirectoryMetadata(sources: Source[]): Promise<void> {
  'use step'

  const { stepId } = getStepMetadata()
  const directorySources = sources.filter(isDirectorySource)

  if (directorySources.length === 0) {
    return
  }

  for (const source of directorySources) {
    log.info('sync', `[${stepId}] Persisting directory metadata for "${source.label}"`)

    await db.delete(schema.sourceDocuments).where(eq(schema.sourceDocuments.sourceId, source.id))

    if (source.documents.length > 0) {
      await db.insert(schema.sourceDocuments).values(
        source.documents.map(document => ({
          sourceId: source.id,
          relativePath: document.relativePath,
          contentHash: document.contentHash,
          snapshotPath: document.snapshotPath,
          kind: document.kind,
          updatedAt: new Date(),
        })),
      )
    }
  }
}
