import type { DiscordAdapter } from '@chat-adapter/discord'
import { waitUntil } from '@vercel/functions'
import { createError, useLogger } from 'evlog'
import { useBot } from '../../utils/bot/index'

export default defineEventHandler(async (event) => {
  const requestLog = useLogger(event)
  let bot: ReturnType<typeof useBot>
  try {
    bot = useBot()
    await bot.initialize()
  } catch (error) {
    requestLog.set({ outcome: 'bot_init_failed' })
    throw createError({
      status: 503,
      message: 'Discord gateway initialization failed',
      why: error instanceof Error ? error.message : 'Bot initialization failed unexpectedly',
      fix: 'Verify Discord, GitHub, Redis, KV, and database configuration required during bot startup',
    })
  }

  let discord: DiscordAdapter | undefined
  try {
    discord = bot.getAdapter('discord') as DiscordAdapter
  } catch {
    requestLog.set({ outcome: 'adapter_not_configured' })
    throw createError({
      message: 'Discord adapter not configured',
      why: 'The Discord adapter requires NUXT_DISCORD_BOT_TOKEN to be set',
      fix: 'Set NUXT_DISCORD_BOT_TOKEN, NUXT_DISCORD_PUBLIC_KEY, and NUXT_DISCORD_APPLICATION_ID in your environment',
    })
  }

  if (!discord || typeof discord.startGatewayListener !== 'function') {
    requestLog.set({ outcome: 'adapter_not_configured' })
    throw createError({
      status: 503,
      message: 'Discord adapter not configured',
      why: 'The Discord adapter is not available for gateway startup',
      fix: 'Set NUXT_DISCORD_BOT_TOKEN, NUXT_DISCORD_PUBLIC_KEY, and NUXT_DISCORD_APPLICATION_ID in your environment',
    })
  }

  const durationMs = 10 * 60 * 1000
  const { origin } = getRequestURL(event)
  const webhookUrl = `${origin}/api/webhooks/discord`

  requestLog.set({ gatewayDurationMs: durationMs, webhookUrl })

  return discord.startGatewayListener(
    {
      waitUntil: (task: Promise<unknown>) => waitUntil(task),
    },
    durationMs,
    undefined,
    webhookUrl,
  )
})
