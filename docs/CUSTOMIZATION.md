# Customization Guide

> Back to [README](../README.md) | See also: [Sources](./SOURCES.md), [Environment](./ENVIRONMENT.md), [Architecture](./ARCHITECTURE.md)

USPHS Policy builds on the open-source knowledge-agent stack. This guide covers how to customize your instance.

## AI-Assisted Customization (Agent Skills)

USPHS Policy includes **local project skills** in `.agents/skills/` that guide an AI agent (e.g. Cursor, Claude Code) through common customization tasks. Instead of manually following each step, you can delegate the migration to an agent by referencing these skills.

| Skill | File | Purpose |
|-------|------|---------|
| **Add Tool** | `add-tool.md` | Add a new AI SDK tool to the agent (generator pattern, status yields) |
| **Add Source** | `add-source.md` | Add a knowledge source (GitHub, YouTube) via admin UI or API |
| **Add Bot Adapter** | `add-bot-adapter.md` | Add a new platform adapter (Slack, Linear, etc.) to the bot system |
| **Rename Project** | `rename-project.md` | Fully rename the project from "USPHS Policy" to a custom name |

**How to use:** When customizing the project, ask your AI assistant to follow the relevant skill. For example: *"Follow the add-bot-adapter skill to add a Slack adapter"* or *"Use the rename-project skill to rename this to MyDocs"*.

The skills provide step-by-step instructions, file locations, code patterns, and checklists so the agent can perform the changes consistently and completely.

## 1. Rename Your Instance

Edit `apps/app/app/app.config.ts` to change the branding:

```typescript
export default defineAppConfig({
  app: {
    name: 'My Assistant',
    description: 'Open source file-system and knowledge based agent template.',
    icon: 'i-custom-savoir', // Replace with your own icon
  },
  // ...
})
```

To use a custom icon:
1. Replace `apps/app/app/assets/icons/custom/savoir.svg` with your own SVG
2. Update the `icon` value in `app.config.ts` to match (e.g. `i-custom-my-icon` for `my-icon.svg`)

The name and description are used throughout the UI (login page, shared chats, SEO meta tags).

## 2. Add Sources

Sources define your knowledge base. Manage them through the **Admin UI**:

1. Navigate to `/admin`
2. Click **Add source**
3. Configure a GitHub repository or YouTube channel
4. Click **Sync** to pull content

See [Sources](./SOURCES.md) for all source options and how to add custom source types.

## 3. Add Custom AI Tools

Tools are defined in `packages/agent/src/tools/`. Tools **must use generator functions** (`async function*`) and yield status updates so the frontend can display loading state and results automatically.

1. Create a new file, e.g. `packages/agent/src/tools/my-tool.ts`:

```typescript
import { tool } from 'ai'
import { z } from 'zod'

export const myTool = tool({
  description: 'Description of what this tool does',
  inputSchema: z.object({
    query: z.string().describe('The input query'),
  }),
  execute: async function* ({ query }) {
    // Yield loading — frontend shows a spinner
    yield { status: 'loading' as const }
    const start = Date.now()

    try {
      const result = await doSomething(query)

      // Yield done — frontend displays the output
      yield {
        status: 'done' as const,
        durationMs: Date.now() - start,
        text: result,
        commands: [{
          title: `My tool: "${query}"`,
          command: '',
          stdout: result,
          stderr: '',
          exitCode: 0,
          success: true,
        }],
      }
    } catch (error) {
      yield {
        status: 'done' as const,
        durationMs: Date.now() - start,
        text: '',
        commands: [{
          title: `My tool: "${query}"`,
          command: '',
          stdout: '',
          stderr: error instanceof Error ? error.message : 'Failed',
          exitCode: 1,
          success: false,
        }],
      }
    }
  },
})
```

2. Export it from `packages/agent/src/index.ts`
3. Register it in the agent creation (e.g. in `apps/app/server/utils/chat/`)

See `packages/agent/src/tools/web-search.ts` for a complete real-world example. Tools are compatible with the [Vercel AI SDK tool format](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling).

## 4. Add a Bot Adapter

Bot adapters connect the app to messaging platforms. The project includes GitHub and Discord adapters. To add a new one (e.g. Slack, Linear):

1. Look at `apps/app/server/utils/bot/` for the existing adapter pattern
2. The GitHub adapter (`SavoirGitHubAdapter`) is a good reference for custom adapters
3. Create your adapter implementing the [Chat SDK](https://github.com/vercel-labs/chat) adapter interface
4. Register the webhook endpoint in `apps/app/server/api/webhooks/`
5. Add the adapter to the bot instance in `apps/app/server/utils/bot/`

## 5. Customize AI Prompts

Prompts are in `packages/agent/src/prompts/`:

| File | Purpose |
|------|---------|
| `router.ts` | Question complexity classification |
| `chat.ts` | Chat interface system prompt + admin prompt |
| `bot.ts` | Bot system prompt (GitHub, Discord) |
| `shared.ts` | Shared utilities (style, complexity hints) |

You can also customize the agent behavior through the admin UI at `/admin/agent` without touching code — this includes response style, language, temperature, citation format, and additional instructions.

## 6. Customize the UI Theme

Edit `apps/app/app/app.config.ts` to change colors:

```typescript
export default defineAppConfig({
  // ...
  ui: {
    colors: {
      primary: 'blue',    // Any Tailwind color
      neutral: 'slate',
    },
    // Override component slots as needed
  }
})
```

See the [Nuxt UI documentation](https://ui.nuxt.com) for all theming options. For a deeper understanding of the app structure, see [Architecture](./ARCHITECTURE.md).

## 7. Deploy

This project is designed to be deployed on [Vercel](https://vercel.com).

### Monorepo layout

The repo root is a [Bun](https://bun.sh) + [Turborepo](https://turbo.build) workspace. Workspace packages under `packages/*` must build before the Nuxt app (`prepare` runs `turbo run build --filter='./packages/*'` on `bun install`).

**Pick one Root Directory strategy** (Vercel → Project → Settings → General):

| Root Directory | Install Command | Build Command | `vercel.json` |
|------------------|-----------------|---------------|---------------|
| **Repository root** (`.`) | `bun install` | `bunx turbo run build --filter=@savoir/app` | Put a `vercel.json` at the **repo root** if you need [crons](https://vercel.com/docs/cron-jobs) — the app ships [`apps/app/vercel.json`](../apps/app/vercel.json) only; Vercel reads `vercel.json` from the configured Root Directory. |
| **`apps/app`** | `cd ../.. && bun install` (or set via monorepo docs) | `bun run build` | The existing [`apps/app/vercel.json`](../apps/app/vercel.json) applies (Discord gateway + evlog cleanup crons). |

If Root Directory is the repo root and you do not add a root `vercel.json`, **scheduled crons defined in `apps/app/vercel.json` will not run** unless you duplicate or relocate that config.

Framework preset: **Nuxt.js** (or “Other” with the build command above). Output is handled by Nitro / Nuxt; do not set a custom Output Directory unless you know you need it.

### NuxtHub

Link the Vercel project to [NuxtHub](https://hub.nuxt.com) and provision **PostgreSQL** (plus KV, Blob, Cache as used by the app). See [ENVIRONMENT.md](./ENVIRONMENT.md) for env vars and [Architecture](./ARCHITECTURE.md) for storage.

### Checklist

1. Connect the repository to Vercel and set Root Directory + install/build as above.
2. Link **NuxtHub** and set required environment variables (see [ENVIRONMENT.md](./ENVIRONMENT.md)).
3. Configure your **GitHub App** callback URL: `https://<your-domain>/api/auth/callback/github`.
4. Deploy.

Vercel provides: [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) for code execution, [Vercel Workflow](https://useworkflow.dev) for content sync, and serverless functions for bot webhooks. For Turborepo remote cache and env vars, see [ENVIRONMENT.md](./ENVIRONMENT.md).

