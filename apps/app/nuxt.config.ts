import { resolvePostgresUrl } from './shared/utils/postgres'

// https://nuxt.com/docs/api/configuration/nuxt-config
const postgresUrl = resolvePostgresUrl(process.env)
const isVercelProduction = process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production'

if (isVercelProduction && !postgresUrl) {
  throw new Error(
    'Production PostgreSQL is required on Vercel. Attach Vercel Postgres or set POSTGRES_URL, POSTGRESQL_URL, or DATABASE_URL.'
  )
}

const hubDatabase = postgresUrl
  ? {
    dialect: 'postgresql' as const,
    driver: 'postgres-js' as const,
    connection: {
      url: postgresUrl,
    },
  }
  : 'postgresql'

export default defineNuxtConfig({
  extends: ['../../packages/github'],

  modules: [
    '@nuxt/ui',
    '@nuxtjs/mdc',
    '@nuxthub/core',
    '@onmax/nuxt-better-auth',
    'workflow/nuxt',
    '@evlog/nuxthub',
    'nuxt-charts',
  ],

  auth: {
    redirects: {
      login: '/login',
      guest: '/',
    },
    schema: {
      usePlural: false,
      casing: 'camelCase',
    },
  },

  evlog: {
    retention: '7d',
    env: {
      service: 'usphs-policy',
      version: '0.1.0',
    },
    routes: {
      '/api/admin/**': { service: 'admin-api' },
      '/api/webhooks/**': { service: 'webhook-api' },
      '/api/sync/**': { service: 'sync-api' },
      '/api/sandbox/**': { service: 'sandbox-api' },
      '/api/stats/**': { service: 'stats-api' },
    },
    transport: {
      // Fail open in production unless explicitly re-enabled. A blocked log drain
      // should never take down public request handling.
      enabled: process.env.NODE_ENV !== 'production' || process.env.EVLOG_TRANSPORT_ENABLED === 'true',
    },
  },

  vite: {
    build: {
      // Default Rollup chunking keeps Nuxt UI / Vue / charts in a consistent graph; aggressive manualChunks caused circular chunk warnings and oversized output.
      // ~1.2–1.4 MB minified vendor chunks are expected for this stack; raise limit to avoid noisy CI warnings (optimize further with route-level lazy imports if needed).
      chunkSizeWarningLimit: 1500,
    },
  },

  $production: {
    evlog: {
      sampling: {
        rates: {
          debug: 0,
          info: 10,
          warn: 50,
        },
        keep: [
          { status: 400 },
          { duration: 2000 },
          { path: '/api/webhooks/**' },
          { path: '/api/sandbox/**' },
        ],
      },
    },
  },

  devtools: { enabled: true },

  $development: {
    vite: {
      server: {
        allowedHosts: true // Allow ngrok and other tunnels
      }
    },
  },

  css: ['~/assets/css/main.css'],

  mdc: {
    headings: {
      anchorLinks: false
    },
    highlight: {
      shikiEngine: 'javascript'
    }
  },

  experimental: {
    viewTransition: true
  },

  icon: {
    customCollections: [
      {
        prefix: 'custom',
        dir: './app/assets/icons/custom',
      },
    ],
    clientBundle: {
      scan: true,
      includeCustomCollections: true,
    },
    provider: 'iconify',
  },

  compatibilityDate: 'latest',

  nitro: {
    experimental: {
      asyncContext: true,
      openAPI: true
    }
  },

  hub: {
    db: hubDatabase,
    kv: true,
    blob: true,
    cache: true
  },

  routeRules: {
    '/shared/**': { isr: { expiration: 300 } },
    '/api/auth/**': { isr: false, cache: false },
    '/api/chats/**': { isr: false, cache: false },
    '/api/version': { isr: false, cache: false },
    '/api/webhooks/**': { isr: false, cache: false },
    '/admin/docs/**': { isr: { expiration: false } },
    '/admin/**': { auth: { user: { role: 'admin' } as any } },
  },

  runtimeConfig: {
    github: {
      token: '',
      snapshotRepo: '',
      snapshotBranch: 'main',
      appId: '',
      appPrivateKey: '',
      webhookSecret: '',
      replyToNewIssues: false,
    },
    discord: {
      botToken: '',
      publicKey: '',
      applicationId: '',
      mentionRoleIds: '',
    },
    youtube: {
      apiKey: '',
    },
    public: {
      github: {
        appName: '',
        botTrigger: '',
      },
      discordBotUrl: '',
    },
  }
})
