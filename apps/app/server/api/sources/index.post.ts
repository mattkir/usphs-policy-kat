import { db, schema } from '@nuxthub/db'
import { createSourceBodySchema, normalizeCreateSourceBody } from '../../utils/sources/source-input'

/**
 * POST /api/sources
 * Create a new source (admin only)
 */
export default defineEventHandler(async (event) => {
  const requestLog = useLogger(event)
  await requireAdmin(event)
  const config = useRuntimeConfig()
  const parsedBody = await readValidatedBody(event, createSourceBodySchema.parse)
  const body = await normalizeCreateSourceBody(parsedBody, config.localSourceRoot)

  requestLog.set({ type: body.type, label: body.label })

  const [source] = await db.insert(schema.sources)
    .values({
      id: crypto.randomUUID(),
      type: body.type,
      label: body.label,
      basePath: body.basePath,
      repo: body.repo,
      branch: body.branch,
      contentPath: body.contentPath,
      outputPath: body.outputPath,
      directoryPath: body.directoryPath,
      readmeOnly: body.readmeOnly,
      channelId: body.channelId,
      handle: body.handle,
      maxVideos: body.maxVideos,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning()

  requestLog.set({ sourceId: source?.id })

  return source
})
