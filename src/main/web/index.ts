import { resolve } from 'path'
import { generateManagementSecret } from '../proxy/middleware/managementAuth'
import { storeManager } from '../store/store'
import type { ProxyServer } from '../proxy/server'

let activeProxyServer: ProxyServer | null = null

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return undefined
}

function parseNumberEnv(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return undefined
  return parsed
}

function formatUrlHost(host: string): string {
  if (host.includes(':') && !host.startsWith('[')) {
    return `[${host}]`
  }
  return host
}

function getLocalAccessHost(host: string): string {
  if (host === '0.0.0.0' || host === '::') {
    return '127.0.0.1'
  }
  return host
}

function applyWebEnvOverrides(): void {
  const currentConfig = storeManager.getConfig()
  const updates: Record<string, unknown> = {}

  const proxyPort = parseNumberEnv(process.env.HEADLESS_PROXY_PORT || process.env.WEB_PROXY_PORT)
  const proxyHost = process.env.HEADLESS_PROXY_HOST || process.env.WEB_PROXY_HOST || process.env.PROXY_HOST
  const forceAutoStartProxy = parseBooleanEnv(process.env.HEADLESS_AUTO_START_PROXY)

  const managementEnabled =
    parseBooleanEnv(process.env.HEADLESS_MANAGEMENT_ENABLED) ??
    parseBooleanEnv(process.env.WEB_MANAGEMENT_ENABLED)
  const persistedManagementSecret = currentConfig.managementApi.managementApiSecret?.trim()
  const hasValidPersistedManagementSecret =
    !!persistedManagementSecret && persistedManagementSecret !== '***'
  const managementSecret =
    process.env.HEADLESS_MANAGEMENT_SECRET ||
    process.env.WEB_MANAGEMENT_SECRET ||
    (hasValidPersistedManagementSecret ? persistedManagementSecret : '') ||
    generateManagementSecret()

  if (proxyPort && proxyPort > 0 && proxyPort <= 65535) {
    updates.proxyPort = proxyPort
  }

  if (proxyHost) {
    updates.proxyHost = proxyHost
  } else {
    updates.proxyHost = '0.0.0.0'
  }

  updates.autoStartProxy = forceAutoStartProxy ?? true

  updates.managementApi = {
    ...currentConfig.managementApi,
    enableManagementApi: managementEnabled ?? true,
    managementApiSecret: managementSecret,
  }

  if (Object.keys(updates).length > 0) {
    storeManager.updateConfig(updates as any)
    console.log('[Web] Applied environment config overrides')
  }
}

async function bootstrap(): Promise<void> {
  process.env.CHAT2API_WEB_UI = process.env.CHAT2API_WEB_UI || '1'
  process.env.WEB_UI_ENABLED = process.env.WEB_UI_ENABLED || '1'
  process.env.WEB_UI_DIR = process.env.WEB_UI_DIR || resolve(process.cwd(), 'out', 'renderer')

  const { proxyServer } = await import('../proxy/server')
  activeProxyServer = proxyServer

  await storeManager.initialize()
  storeManager.setMainWindow(null)
  applyWebEnvOverrides()

  const config = storeManager.getConfig()
  const host = config.proxyHost || '0.0.0.0'
  const port = config.proxyPort

  const started = await activeProxyServer.start(port, host)
  if (!started) {
    throw new Error(`[Web] Failed to start server on ${host}:${port}`)
  }

  const bindHost = formatUrlHost(host)
  const accessHost = formatUrlHost(getLocalAccessHost(host))

  console.log(`[Web] Chat2API Web service bound to http://${bindHost}:${port}`)
  console.log(`[Web] Local Management API: http://${accessHost}:${port}/v0/management`)
  console.log(`[Web] Local Web UI: http://${accessHost}:${port}/`)
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[Web] Received ${signal}, shutting down...`)
  try {
    if (activeProxyServer) {
      await activeProxyServer.stop()
    }
  } finally {
    process.exit(0)
  }
}

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

bootstrap().catch((error) => {
  console.error('[Web] Bootstrap failed:', error)
  process.exit(1)
})
