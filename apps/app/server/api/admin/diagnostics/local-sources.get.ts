import type { H3Event } from 'h3'
import { requireAdmin } from '../../../utils/admin'
import { getLocalSourceDiagnostics, type LocalSourceDiagnostics } from '../../../utils/local-source-diagnostics'

type GetLocalSourceDiagnosticsOptions = {
  event?: H3Event
  localSourceRoot?: string | null
  requireAdminFn?: (event?: H3Event) => Promise<unknown>
  diagnosticsFn?: (localSourceRoot: string | null | undefined) => Promise<LocalSourceDiagnostics>
}

export async function getLocalSourceDiagnosticsResponse({
  event,
  localSourceRoot,
  requireAdminFn = (currentEvent) => requireAdmin(currentEvent as H3Event),
  diagnosticsFn = getLocalSourceDiagnostics,
}: GetLocalSourceDiagnosticsOptions = {}): Promise<LocalSourceDiagnostics> {
  await requireAdminFn(event)
  return await diagnosticsFn(localSourceRoot ?? useRuntimeConfig().localSourceRoot)
}

const diagnosticsHandler = (event: H3Event) => getLocalSourceDiagnosticsResponse({ event })

export default typeof defineEventHandler === 'function'
  ? defineEventHandler(diagnosticsHandler)
  : diagnosticsHandler
