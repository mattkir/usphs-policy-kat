# Environment Variables

> Back to [README](../README.md) | See also: [Architecture](./ARCHITECTURE.md), [Customization](./CUSTOMIZATION.md)

Copy the example file and fill in the values:

```bash
cp apps/app/.env.example apps/app/.env
```

## Quick Start (minimum required)

| Variable | How to get it |
|----------|---------------|
| `BETTER_AUTH_SECRET` | Run `openssl rand -hex 32` in your terminal |
| `GITHUB_CLIENT_ID` | From your [GitHub App settings](https://github.com/settings/apps) → Client ID |
| `GITHUB_CLIENT_SECRET` | From your [GitHub App settings](https://github.com/settings/apps) → Generate a client secret |

For Vercel production, you also need a PostgreSQL connection via `POSTGRES_URL`, `POSTGRESQL_URL`, or `DATABASE_URL` (Vercel Postgres recommended). Legacy project-prefixed names such as `usphs_policy_POSTGRES_URL` and `usphs_policy_DATABASE_URL` are accepted only as a temporary compatibility fallback during migration. For **local development**, you also need `AI_GATEWAY_API_KEY` (see [AI](#ai) below). Everything else is optional.

## Authentication

### `BETTER_AUTH_SECRET` (required)

Random secret used by [Better Auth](https://www.better-auth.com/docs/installation#set-environment-variables) to sign sessions and tokens. Generate one with:

```bash
openssl rand -hex 32
```

### `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` (required)

GitHub OAuth credentials for user login. You need a **GitHub App** (not an OAuth App) — the same app can also power the GitHub bot later.

1. Go to [**GitHub Settings → Developer settings → GitHub Apps → New GitHub App**](https://github.com/settings/apps/new)
2. Fill in:
   - **App name**: your bot name (e.g. `my-agent`)
   - **Homepage URL**: your instance URL (or `http://localhost:3000` for dev)
   - **Callback URL**: `<your-url>/api/auth/callback/github`
3. Under **Account permissions**, set **Email addresses** → Read-only
4. Create the app, then from the app settings page:
   - Copy the **Client ID** → `GITHUB_CLIENT_ID`
   - Click **Generate a new client secret** → `GITHUB_CLIENT_SECRET`

> See the [Getting Started guide](https://github.com/mattkir/usphs-policy-kat/blob/main/apps/app/app/content/docs/getting-started.md#github-app-setup) for the full GitHub App setup with bot permissions.

### `NUXT_SESSION_PASSWORD` (optional)

Session encryption password. Auto-generated if not set.

## AI

### `AI_GATEWAY_API_KEY` (optional — required for local dev only)

API key for [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) (used by `@ai-sdk/gateway` to route to any AI model).

On **Vercel deployments**, this is not needed — the project automatically authenticates via the platform's OIDC token. You only need to set this for **local development**.

1. Go to the [Vercel AI dashboard](https://vercel.com/~/ai)
2. Create a new Gateway (or use an existing one)
3. Copy the API key → `AI_GATEWAY_API_KEY`

## Sandbox & Sync

These control how the app syncs knowledge sources into the sandbox. Most snapshot settings are optional and can be configured from the admin UI.

**Required for snapshot sync pushes:** when the workflow commits and pushes from the Vercel sandbox to your snapshot repository, you must set `NUXT_SANDBOX_GIT_EMAIL` and `NUXT_SANDBOX_GIT_NAME` so `git` has a valid author. There are no defaults in the codebase — configure them in `.env` (local) and in your deployment environment (e.g. Vercel).

| Variable | Default | Description |
|----------|---------|-------------|
| `NUXT_GITHUB_SNAPSHOT_REPO` | — | Snapshot repository in `owner/repo` format. Configurable from admin UI. |
| `NUXT_GITHUB_SNAPSHOT_BRANCH` | `main` | Branch to use for snapshots |
| `NUXT_GITHUB_TOKEN` | — | Fallback PAT for git operations. Only needed if GitHub App tokens are unavailable. |
| `NUXT_SANDBOX_GIT_EMAIL` | — | **Required** for pushes: `git config user.email` in the sandbox. Use your [GitHub noreply or verified email](https://github.com/settings/emails). |
| `NUXT_SANDBOX_GIT_NAME` | — | **Required** for pushes: `git config user.name` in the sandbox (e.g. your display name). |

## GitHub Bot (optional)

To enable the GitHub bot that responds to mentions in issues, add these from your [GitHub App settings page](https://github.com/settings/apps):

| Variable | Where to find it |
|----------|-----------------|
| `NUXT_PUBLIC_GITHUB_APP_NAME` | Your GitHub App name (e.g. `my-agent`) |
| `NUXT_PUBLIC_GITHUB_BOT_TRIGGER` | Override mention trigger (defaults to app name) |
| `NUXT_GITHUB_APP_ID` | App settings → **App ID** |
| `NUXT_GITHUB_APP_PRIVATE_KEY` | App settings → **Generate a private key** (PEM format, can be base64-encoded) |
| `NUXT_GITHUB_WEBHOOK_SECRET` | The secret you set when creating the app's webhook |

The webhook URL should be `<your-url>/api/webhooks/github`. Subscribe to **Issues** and **Issue comments** events.

### Required GitHub App permissions for the bot

| Permission | Access | Why |
|------------|--------|-----|
| Issues | Read & Write | Read issues and post replies |
| Metadata | Read-only | Required by GitHub for all apps |
| Contents | Read & Write | Push synced content (if using snapshot management) |
| Administration | Read & Write | Auto-create snapshot repos (optional, needs org approval) |

## Discord Bot (optional)

To add a Discord bot, create an app in the [Discord Developer Portal](https://discord.com/developers/applications):

| Variable | Where to find it |
|----------|-----------------|
| `NUXT_DISCORD_BOT_TOKEN` | Bot → **Reset Token** → copy |
| `NUXT_DISCORD_PUBLIC_KEY` | General Information → **Public Key** |
| `NUXT_DISCORD_APPLICATION_ID` | General Information → **Application ID** |
| `NUXT_DISCORD_MENTION_ROLE_IDS` | Comma-separated role IDs that can trigger the bot (optional) |

Set the interactions endpoint URL to `<your-url>/api/webhooks/discord`.

## YouTube (optional)

### `NUXT_YOUTUBE_API_KEY`

Required only if syncing YouTube sources (video transcripts).

1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a project (or select an existing one)
3. Enable the [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com)
4. Go to **Credentials** → **Create Credentials** → **API Key**
5. Copy the key → `NUXT_YOUTUBE_API_KEY`

## Storage (optional)

### `BLOB_READ_WRITE_TOKEN`

[Vercel Blob](https://vercel.com/docs/storage/vercel-blob) token for file uploads. Auto-injected in Vercel deployments.

To get one manually: [Vercel Dashboard](https://vercel.com) → your project → **Storage** → **Blob** → **Connect** → copy the token.

## State (optional)

### `POSTGRES_URL` / `POSTGRESQL_URL` / `DATABASE_URL`

Production deployments require a PostgreSQL connection URL. The app uses NuxtHub with `hub.db: 'postgresql'`, and on Vercel production it now explicitly requires a network Postgres driver instead of silently falling back to local `pglite` storage.

Recommended setup:

1. Attach a [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres) database to the project
2. Confirm Vercel injects `POSTGRES_URL` or `DATABASE_URL` into the production environment
3. Redeploy so NuxtHub resolves the production database driver to `postgres-js`

If none of these variables are present in Vercel production, startup will fail fast with a configuration error instead of trying to write to `.data/db/pglite`.

Legacy note: some older Vercel setups in this repo used project-prefixed variables such as `usphs_policy_POSTGRES_URL` and `usphs_policy_DATABASE_URL`. The app still accepts those names temporarily, and `turbo.json` still forwards them during builds, but the intended long-term configuration is to standardize on unprefixed `POSTGRES_URL` or `DATABASE_URL` in Vercel.

### `REDIS_URL`

Redis connection URL for stateful features. When set, the app uses Redis for bot state persistence and NuxtHub KV storage; when unset, bot state falls back to in-memory storage and NuxtHub KV uses its local/default driver.

Any Redis-compatible provider works: [Upstash](https://upstash.com), [Redis Cloud](https://redis.io/cloud), etc. If you set `REDIS_URL`, keep `ioredis` installed in the app dependencies so clean installs and CI builds can resolve the Redis KV driver.

### `EVLOG_TRANSPORT_ENABLED`

Optional. Set to `true` to persist structured `evlog` events through the `@evlog/nuxthub` drain in production.

By default this is left unset in production so request handling fails open if log storage is slow or unavailable.

### `VERCEL_OIDC_TOKEN`

Auto-injected in Vercel deployments. No action needed.

## SDK (`@savoir/sdk`)

When using the SDK from an external application:

| Variable | Description |
|----------|-------------|
| `SAVOIR_API_URL` | Base URL of your deployed instance (e.g. `https://your-app.vercel.app`) |
| `SAVOIR_API_KEY` | API key generated from the admin panel at `/admin/api-keys` |

## Vercel (monorepo / Turborepo remote cache)

**Project settings:** Use **Bun** for installs. From the repository root, the app build is `bunx turbo run build --filter=@savoir/app` (after `bun install`). If the Vercel **Root Directory** is `apps/app`, use `bun run build` there after installing from the monorepo root as your workflow requires. **`vercel.json` is only applied from the directory Vercel treats as the project root** — see [Customization § Deploy](./CUSTOMIZATION.md#7-deploy) for Root Directory vs [`apps/app/vercel.json`](../apps/app/vercel.json) (crons).

This repo uses [Turborepo](https://turbo.build/) with a root `prepare` script that builds workspace packages (`turbo run build --filter='./packages/*'`) during `bun install`, and the app build runs `^build` again so dependencies stay up to date. That is expected; the second pass should be fast when **remote cache writes** work.

If Vercel logs show `failed to put to http cache: cache disabled` while also printing `Remote caching enabled`, Turbo cannot **upload** cache artifacts. Fix it so repeat builds get cache hits and CI time drops:

1. **Preferred (Vercel dashboard):** [Turborepo on Vercel](https://vercel.com/docs/monorepos/turborepo) — ensure the project uses the monorepo root, and in **Team Settings** enable **Turborepo Remote Cache** (or the equivalent Remote Caching toggle for your plan). Vercel can inject the right credentials for Turbo when the integration is on.
2. **Manual tokens:** Create a token in the [Turborepo dashboard](https://turbo.build/repo) (or your org’s documented process) and add to the Vercel project:
   - `TURBO_TOKEN` — API token with cache read/write
   - `TURBO_TEAM` — your team **slug** (from the Turbo or Vercel team URL), sometimes documented as `TURBO_TEAMID` depending on tooling version

After uploads succeed, you should see cache **hits** on unchanged packages instead of repeated `cache miss` for the same task hashes.

**Note:** Remote cache behavior is controlled by Vercel/Turbo; nothing in this repository substitutes for setting the above on the deployment environment.

## Database

Migrations run automatically when the application starts — no manual step needed.

```bash
# Generate new migrations after schema changes
bun run db:generate
```
