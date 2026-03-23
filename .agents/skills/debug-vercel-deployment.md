# Debug Vercel deployment issues

Use this playbook when a Vercel deployment fails or production behaves differently from local dev. This project is a Bun + Turborepo monorepo with a Nuxt app in `apps/app`, **PostgreSQL via NuxtHub**, `@evlog/nuxthub`, and optional crons in `apps/app/vercel.json`.

## 1. Classify the failure

| Symptom | Where to look first |
|--------|---------------------|
| Build fails (red deployment) | Vercel **Build** logs: install, `prepare`, Turbo, `nuxt build` |
| Deploy succeeds but 500 / errors in browser | **Runtime** logs (Functions / Observability), Postgres / migrations, auth |
| Crons never run | **Root Directory** vs location of `vercel.json` (see [docs/CUSTOMIZATION.md](../../docs/CUSTOMIZATION.md#7-deploy)) |
| GitHub / Discord webhooks misbehave | Webhook URL, secrets, `NUXT_*` env in Vercel |

Always verify **fork-specific** pieces before comparing to [vercel-labs/knowledge-agent-template](https://github.com/vercel-labs/knowledge-agent-template): Postgres + NuxtHub link, monorepo build command, Evlog.

## 2. Build phase

1. Confirm **Root Directory**, **Install Command**, and **Build Command** match [docs/CUSTOMIZATION.md § Deploy](../../docs/CUSTOMIZATION.md#7-deploy).
2. Ensure **Bun** is used (`packageManager` in root [package.json](../../package.json)).
3. In logs, confirm `bun install` runs `prepare` and builds `packages/*` before the app build.
4. If Turbo prints remote cache warnings, see [docs/ENVIRONMENT.md](../../docs/ENVIRONMENT.md) (Turborepo remote cache / `TURBO_TOKEN`).
5. If `nuxt build` fails on missing env, check [turbo.json](../../turbo.json) `build` `env` list — some vars affect cache hashes; NuxtHub may need linkage or placeholders for CI.

## 3. Runtime phase

1. **Database:** NuxtHub PostgreSQL must be linked; migrations run at startup ([docs/ENVIRONMENT.md](../../docs/ENVIRONMENT.md)). Check logs for migration or connection errors.
2. **Auth:** `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` set on Vercel. GitHub App **Callback URL** must be `https://<production-domain>/api/auth/callback/github`.
3. **Snapshot sync:** If sandbox pushes to GitHub fail, set `NUXT_SANDBOX_GIT_EMAIL` and `NUXT_SANDBOX_GIT_NAME` in the deployment environment.
4. **Evlog:** If structured logs are missing, confirm `@evlog/nuxthub` config in [apps/app/nuxt.config.ts](../../apps/app/nuxt.config.ts) and NuxtHub DB availability.

## 4. Crons

[`apps/app/vercel.json`](../../apps/app/vercel.json) defines crons for `/api/discord/gateway` and `/api/_cron/evlog-cleanup`.

Vercel only loads `vercel.json` from the **configured Root Directory**. If Root Directory is the repo root and there is **no** root `vercel.json`, these crons will not register — either set Root Directory to `apps/app` or add a root `vercel.json` with the same `crons` block.

Sanity check: after deploy, hit the cron paths with appropriate auth/headers only if your routes allow it, or confirm in Vercel **Cron Jobs** UI.

## 5. Compare with upstream template

Only diff features that exist in both codebases. Upstream docs may still describe SQLite; **this fork uses PostgreSQL** — do not assume template env or NuxtHub setup matches without checking [apps/app/server/db/schema.ts](../../apps/app/server/db/schema.ts) and `hub.db` in Nuxt config.

## References

- [docs/ENVIRONMENT.md](../../docs/ENVIRONMENT.md)
- [docs/CUSTOMIZATION.md](../../docs/CUSTOMIZATION.md)
- [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
