import { waitUntil } from '@vercel/functions'
import { createError, useLogger } from 'evlog'
import { useBot } from '../../utils/bot/index'

export default defineEventHandler((event) => {
  const requestLog = useLogger(event)
  const platform = getRouterParam(event, 'platform')

  requestLog.set({ platform })

  if (!platform) {
    throw createError({
      message: 'Missing platform parameter',
      why: 'The webhook URL must include a platform segment (e.g. /api/webhooks/github)',
      fix: 'Ensure the webhook URL is correctly configured in the platform settings',
    })
  }

  let bot: ReturnType<typeof useBot>
  try {
    bot = useBot()
  } catch (error) {
    requestLog.set({ outcome: 'bot_init_failed' })
    throw createError({
      status: 503,
      message: 'Bot initialization failed',
      why: error instanceof Error ? error.message : 'Bot initialization failed unexpectedly',
      fix: 'Verify the environment variables required for the configured bot adapters',
    })
  }

  const handler = bot.webhooks[platform as keyof typeof bot.webhooks]
  if (!handler) {
    requestLog.set({ outcome: 'unknown_platform' })
    throw createError({
      message: `Unknown platform: ${platform}`,
      why: `No adapter registered for platform "${platform}"`,
      fix: 'Check that the corresponding adapter env vars are set (NUXT_GITHUB_APP_ID, NUXT_DISCORD_BOT_TOKEN, etc.)',
    })
  }

  const request = toWebRequest(event)
  return handler(request, {
    waitUntil: (task: Promise<unknown>) => waitUntil(task),
  })
})
