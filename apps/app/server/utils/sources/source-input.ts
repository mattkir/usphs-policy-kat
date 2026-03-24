import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createError } from 'h3'
import { z } from 'zod'

export const sourceTypeSchema = z.enum(['github', 'youtube', 'file', 'directory'])

export const createSourceBodySchema = z.object({
  type: sourceTypeSchema,
  label: z.string().min(1),
  basePath: z.string().optional().default('/docs'),
  repo: z.string().optional(),
  branch: z.string().optional().default('main'),
  contentPath: z.string().optional(),
  outputPath: z.string().optional(),
  directoryPath: z.string().optional(),
  readmeOnly: z.boolean().optional().default(false),
  channelId: z.string().optional(),
  handle: z.string().optional(),
  maxVideos: z.number().optional().default(50),
})

export const updateSourceBodySchema = z.object({
  label: z.string().min(1).optional(),
  basePath: z.string().optional(),
  repo: z.string().optional(),
  branch: z.string().optional(),
  contentPath: z.string().optional(),
  outputPath: z.string().optional(),
  directoryPath: z.string().optional(),
  readmeOnly: z.boolean().optional(),
  channelId: z.string().optional(),
  handle: z.string().optional(),
  maxVideos: z.number().optional(),
})

export type SourceType = z.infer<typeof sourceTypeSchema>
export type CreateSourceBody = z.infer<typeof createSourceBodySchema>
export type UpdateSourceBody = z.infer<typeof updateSourceBodySchema>

function normalizeSourcePath(input: string): string {
  const trimmed = input.trim().replace(/\\/g, '/')
  const withoutSlashes = trimmed.replace(/^\/+|\/+$/g, '')

  if (!withoutSlashes) {
    throw createError({
      statusCode: 400,
      message: 'Directory path is required',
      data: {
        why: 'The directory source path was empty after trimming',
        fix: 'Enter a directory path relative to NUXT_LOCAL_SOURCE_ROOT',
      },
    })
  }

  if (path.posix.isAbsolute(trimmed) || path.win32.isAbsolute(trimmed)) {
    throw createError({
      statusCode: 400,
      message: 'Directory path must be relative',
      data: {
        why: 'Absolute paths are not allowed for directory sources',
        fix: 'Enter a path relative to NUXT_LOCAL_SOURCE_ROOT',
      },
    })
  }

  const normalized = path.posix.normalize(withoutSlashes)
  if (normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw createError({
      statusCode: 400,
      message: 'Directory path escapes the configured root',
      data: {
        why: 'The normalized path attempted to traverse outside the local source root',
        fix: 'Remove any `..` segments and use a path inside NUXT_LOCAL_SOURCE_ROOT',
      },
    })
  }

  return normalized
}

export function resolveLocalSourceRoot(localSourceRoot: string | undefined | null): string {
  const root = localSourceRoot?.trim()
  if (!root) {
    throw createError({
      statusCode: 400,
      message: 'Local directory sources are not configured',
      data: {
        why: 'NUXT_LOCAL_SOURCE_ROOT is not set',
        fix: 'Set NUXT_LOCAL_SOURCE_ROOT to the server-readable base directory for local sources',
      },
    })
  }

  return path.resolve(root)
}

export function normalizeRelativeDirectoryPath(directoryPath: string, localSourceRoot: string | undefined | null): string {
  const normalized = normalizeSourcePath(directoryPath)
  const root = resolveLocalSourceRoot(localSourceRoot)
  const absolutePath = path.resolve(root, normalized)
  const relativeToRoot = path.relative(root, absolutePath)

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw createError({
      statusCode: 400,
      message: 'Directory path escapes the configured root',
      data: {
        why: 'The resolved path falls outside NUXT_LOCAL_SOURCE_ROOT',
        fix: 'Choose a directory inside the configured local source root',
      },
    })
  }

  return relativeToRoot.split(path.sep).join('/')
}

export async function assertDirectoryPathExists(directoryPath: string, localSourceRoot: string | undefined | null): Promise<void> {
  const root = resolveLocalSourceRoot(localSourceRoot)
  const normalized = normalizeRelativeDirectoryPath(directoryPath, root)
  const absolutePath = path.resolve(root, normalized)

  let stats
  try {
    stats = await fs.stat(absolutePath)
  } catch {
    throw createError({
      statusCode: 400,
      message: 'Directory path does not exist',
      data: {
        why: `The directory "${normalized}" could not be found under NUXT_LOCAL_SOURCE_ROOT`,
        fix: 'Check the path and ensure the server can read it',
      },
    })
  }

  if (!stats.isDirectory()) {
    throw createError({
      statusCode: 400,
      message: 'Directory path is not a directory',
      data: {
        why: `The path "${normalized}" resolved to a file, not a directory`,
        fix: 'Choose a directory path relative to NUXT_LOCAL_SOURCE_ROOT',
      },
    })
  }
}

export async function normalizeCreateSourceBody(body: CreateSourceBody, localSourceRoot: string | undefined | null): Promise<CreateSourceBody> {
  if (body.type !== 'directory') {
    return {
      ...body,
      directoryPath: undefined,
    }
  }

  const directoryPath = normalizeRelativeDirectoryPath(body.directoryPath || '', localSourceRoot)
  await assertDirectoryPathExists(directoryPath, localSourceRoot)

  return {
    ...body,
    basePath: body.basePath || '/docs',
    directoryPath,
  }
}

export async function normalizeUpdateSourceBody(
  body: UpdateSourceBody,
  currentType: SourceType,
  localSourceRoot: string | undefined | null,
): Promise<UpdateSourceBody> {
  if (currentType !== 'directory') {
    const { directoryPath: _directoryPath, ...rest } = body
    return rest
  }

  if (!Object.hasOwn(body, 'directoryPath')) {
    return body
  }

  const directoryPath = normalizeRelativeDirectoryPath(body.directoryPath || '', localSourceRoot)
  await assertDirectoryPathExists(directoryPath, localSourceRoot)

  return {
    ...body,
    directoryPath,
  }
}
