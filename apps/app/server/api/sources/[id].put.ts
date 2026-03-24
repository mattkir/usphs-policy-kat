import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { normalizeUpdateSourceBody, updateSourceBodySchema, type SourceType } from '../../utils/sources/source-input'

const paramsSchema = z.object({
  id: z.string().min(1, 'Missing source ID'),
})

/**
 * PUT /api/sources/:id
 * Update an existing source
 */
export default defineEventHandler(async (event) => {
  const requestLog = useLogger(event)
  await requireAdmin(event)
  const config = useRuntimeConfig()
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const existing = await db.query.sources.findFirst({
    where: () => eq(schema.sources.id, id),
  })

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Source not found', data: { why: 'No source exists with this ID', fix: 'Verify the source ID from the sources list' } })
  }

  const parsedBody = await readValidatedBody(event, updateSourceBodySchema.parse)
  const body = await normalizeUpdateSourceBody(parsedBody, existing.type as SourceType, config.localSourceRoot)

  requestLog.set({ sourceId: id, fieldsUpdated: Object.keys(body) })

  const [source] = await db.update(schema.sources)
    .set({
      ...body,
      updatedAt: new Date(),
    })
    .where(eq(schema.sources.id, id))
    .returning()

  return source
})
