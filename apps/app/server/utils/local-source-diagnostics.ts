import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import path from 'node:path'

export type DiagnosticStatus = 'ok' | 'error'

export interface DiagnosticCheck {
  key: string
  label: string
  status: DiagnosticStatus
  message: string
  details?: string
  fix?: string
}

export interface BinaryDiagnostic {
  status: DiagnosticStatus
  command: string
  resolvedPath: string | null
  message: string
  fix?: string
}

export interface LocalSourceDiagnostics {
  healthy: boolean
  platform: NodeJS.Platform
  localSourceRoot: {
    status: DiagnosticStatus
    configuredValue: string | null
    resolvedPath: string | null
    exists: boolean
    isDirectory: boolean
    message: string
    fix?: string
  }
  binaries: {
    pdftotext: BinaryDiagnostic
    textutil: BinaryDiagnostic
    unzip: BinaryDiagnostic
  }
  checks: DiagnosticCheck[]
  recommendations: string[]
}

async function pathExists(value: string): Promise<boolean> {
  try {
    await stat(value)
    return true
  } catch {
    return false
  }
}

async function resolveExecutable(command: string, envPath = process.env.PATH): Promise<string | null> {
  const searchPath = envPath || ''
  const directories = searchPath.split(path.delimiter).filter(Boolean)

  for (const directory of directories) {
    const candidate = path.join(directory, command)
    try {
      await access(candidate, constants.X_OK)
      return candidate
    } catch {
      continue
    }
  }

  return null
}

function getPlatformRecommendations(platform: NodeJS.Platform, binaries: LocalSourceDiagnostics['binaries']): string[] {
  const recommendations = new Set<string>()

  if (binaries.pdftotext.status === 'error') {
    if (platform === 'darwin') recommendations.add('Install pdftotext with: brew install poppler')
    else if (platform === 'linux') recommendations.add('Install pdftotext with your package manager, for example: apt-get install poppler-utils')
    else recommendations.add('Install pdftotext (Poppler) and ensure it is on PATH')
  }

  if (binaries.textutil.status === 'error' && binaries.unzip.status === 'error') {
    if (platform === 'darwin') recommendations.add('Ensure textutil is available on the host PATH or install unzip for DOCX extraction fallback')
    else if (platform === 'linux') recommendations.add('Install unzip with your package manager, for example: apt-get install unzip')
    else recommendations.add('Install unzip or provide textutil for DOCX extraction')
  } else if (binaries.textutil.status === 'ok' && platform === 'darwin') {
    recommendations.add('textutil is provided by macOS and is available')
  }

  return Array.from(recommendations)
}

function toBinaryDiagnostic(command: string, resolvedPath: string | null, availableMessage: string, missingFix: string): BinaryDiagnostic {
  if (resolvedPath) {
    return {
      status: 'ok',
      command,
      resolvedPath,
      message: availableMessage,
    }
  }

  return {
    status: 'error',
    command,
    resolvedPath: null,
    message: `${command} is not available on PATH`,
    fix: missingFix,
  }
}

export async function getLocalSourceDiagnostics(localSourceRoot: string | undefined | null): Promise<LocalSourceDiagnostics> {
  const configuredValue = localSourceRoot?.trim() || null
  const resolvedPath = configuredValue ? path.resolve(configuredValue) : null
  const rootExists = resolvedPath ? await pathExists(resolvedPath) : false
  const rootStats = rootExists && resolvedPath ? await stat(resolvedPath) : null
  const isDirectory = !!rootStats?.isDirectory()

  const pdftotextPath = await resolveExecutable('pdftotext')
  const textutilPath = await resolveExecutable('textutil')
  const unzipPath = await resolveExecutable('unzip')

  const binaries = {
    pdftotext: toBinaryDiagnostic(
      'pdftotext',
      pdftotextPath,
      'pdftotext is available',
      process.platform === 'darwin' ? 'Install pdftotext with: brew install poppler' : 'Install pdftotext (for example: apt-get install poppler-utils)',
    ),
    textutil: toBinaryDiagnostic(
      'textutil',
      textutilPath,
      'textutil is available',
      'textutil is missing; install unzip or provide textutil for DOCX extraction',
    ),
    unzip: toBinaryDiagnostic(
      'unzip',
      unzipPath,
      'unzip is available',
      process.platform === 'linux' ? 'Install unzip with: apt-get install unzip' : 'Install unzip and ensure it is available on PATH',
    ),
  }

  const checks: DiagnosticCheck[] = [
    configuredValue
      ? {
        key: 'local-source-root-configured',
        label: 'NUXT_LOCAL_SOURCE_ROOT',
        status: 'ok',
        message: 'NUXT_LOCAL_SOURCE_ROOT is configured',
        details: configuredValue,
      }
      : {
        key: 'local-source-root-configured',
        label: 'NUXT_LOCAL_SOURCE_ROOT',
        status: 'error',
        message: 'NUXT_LOCAL_SOURCE_ROOT is not configured',
        fix: 'Set NUXT_LOCAL_SOURCE_ROOT to an absolute server-readable directory path',
      },
    configuredValue && resolvedPath && rootExists
      ? {
        key: 'local-source-root-exists',
        label: 'Root path exists',
        status: 'ok',
        message: 'Configured local source root exists',
        details: resolvedPath,
      }
      : {
        key: 'local-source-root-exists',
        label: 'Root path exists',
        status: 'error',
        message: 'Configured local source root does not exist',
        details: resolvedPath || undefined,
        fix: 'Create the directory or correct NUXT_LOCAL_SOURCE_ROOT',
      },
    configuredValue && resolvedPath && isDirectory
      ? {
        key: 'local-source-root-is-directory',
        label: 'Root path is a directory',
        status: 'ok',
        message: 'Configured local source root is a directory',
        details: resolvedPath,
      }
      : {
        key: 'local-source-root-is-directory',
        label: 'Root path is a directory',
        status: 'error',
        message: 'Configured local source root is not a directory',
        details: resolvedPath || undefined,
        fix: 'Point NUXT_LOCAL_SOURCE_ROOT to a directory, not a file',
      },
    {
      key: 'pdftotext',
      label: 'pdftotext',
      status: binaries.pdftotext.status,
      message: binaries.pdftotext.message,
      details: binaries.pdftotext.resolvedPath || undefined,
      fix: binaries.pdftotext.fix,
    },
    {
      key: 'docx-support',
      label: 'DOCX extraction support',
      status: binaries.textutil.status === 'ok' || binaries.unzip.status === 'ok' ? 'ok' : 'error',
      message: binaries.textutil.status === 'ok'
        ? 'DOCX extraction is available via textutil'
        : binaries.unzip.status === 'ok'
          ? 'DOCX extraction is available via unzip fallback'
          : 'No DOCX extraction binary is available',
      details: binaries.textutil.resolvedPath || binaries.unzip.resolvedPath || undefined,
      fix: binaries.textutil.status === 'ok' || binaries.unzip.status === 'ok'
        ? undefined
        : process.platform === 'linux'
          ? 'Install unzip with: apt-get install unzip'
          : 'Provide textutil or install unzip for DOCX extraction',
    },
  ]

  const healthy = checks.every(check => check.status === 'ok')

  return {
    healthy,
    platform: process.platform,
    localSourceRoot: {
      status: configuredValue && rootExists && isDirectory ? 'ok' : 'error',
      configuredValue,
      resolvedPath,
      exists: rootExists,
      isDirectory,
      message: configuredValue && rootExists && isDirectory
        ? 'Local source root is configured and readable'
        : 'Local source root is not ready',
      fix: configuredValue && rootExists && isDirectory
        ? undefined
        : 'Set NUXT_LOCAL_SOURCE_ROOT to an existing directory that the app server can read',
    },
    binaries,
    checks,
    recommendations: getPlatformRecommendations(process.platform, binaries),
  }
}

export async function assertLocalSourceDiagnosticsHealthy(localSourceRoot: string | undefined | null): Promise<LocalSourceDiagnostics> {
  const diagnostics = await getLocalSourceDiagnostics(localSourceRoot)
  if (!diagnostics.healthy) {
    const failures = diagnostics.checks
      .filter(check => check.status === 'error')
      .map(check => `${check.label}: ${check.message}${check.fix ? ` (${check.fix})` : ''}`)
      .join('; ')

    throw new Error(`Local source diagnostics failed: ${failures}`)
  }

  return diagnostics
}
