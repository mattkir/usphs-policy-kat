import { getLocalSourceDiagnostics } from '../utils/local-source-diagnostics'

export async function verifyLocalSourceStartup(getDiagnostics: () => Promise<{ healthy: boolean, checks: { label: string, message: string, fix?: string }[] }>): Promise<void> {
  const diagnostics = await getDiagnostics()
  if (!diagnostics.healthy) {
    const failures = diagnostics.checks
      .map(check => `${check.label}: ${check.message}${check.fix ? ` (${check.fix})` : ''}`)
      .join('; ')
    throw new Error(`Startup blocked by local source diagnostics: ${failures}`)
  }
}

const startupPlugin = async () => {
  const config = useRuntimeConfig()
  await verifyLocalSourceStartup(() => getLocalSourceDiagnostics(config.localSourceRoot))
}

export default typeof defineNitroPlugin === 'function'
  ? defineNitroPlugin(startupPlugin)
  : startupPlugin
