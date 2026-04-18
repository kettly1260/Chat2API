import type { AppConfig } from '@/types/electron'

type MgmtResponse<T> = {
  success: boolean
  data?: T
  error?: {
    code?: string
    message?: string
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  auth?: boolean
  secretOverride?: string
}

const NOOP_UNSUBSCRIBE = () => {}
const MANAGEMENT_SECRET_KEY = 'chat2api.managementSecret'
const MASKED_SECRET = '***'
let runtimeManagementSecretOverride: string | null = null

function isWebRuntime(): boolean {
  return typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)
}

function normalizeSecret(secret: string | null | undefined): string {
  const normalized = (secret || '').trim()
  return normalized === MASKED_SECRET ? '' : normalized
}

function getBaseUrl(): string {
  const fromEnv = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.replace(/\/$/, '')
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }

  return ''
}

function getManagementSecret(): string {
  if (runtimeManagementSecretOverride) {
    return normalizeSecret(runtimeManagementSecretOverride)
  }

  try {
    const fromStorage = localStorage.getItem(MANAGEMENT_SECRET_KEY)
    const normalizedFromStorage = normalizeSecret(fromStorage)
    if (normalizedFromStorage) {
      return normalizedFromStorage
    }
  } catch {
    // Ignore storage errors in restricted browser contexts.
  }

  const fromEnv = (import.meta as any).env?.VITE_MANAGEMENT_API_SECRET as string | undefined
  return normalizeSecret(fromEnv)
}

function setManagementSecret(secret: string): void {
  const normalized = normalizeSecret(secret)
  runtimeManagementSecretOverride = normalized || null

  try {
    if (normalized) {
      localStorage.setItem(MANAGEMENT_SECRET_KEY, normalized)
    } else {
      localStorage.removeItem(MANAGEMENT_SECRET_KEY)
    }
  } catch {
    // Ignore storage errors in restricted browser contexts.
  }
}

function clearManagementSecret(): void {
  runtimeManagementSecretOverride = null

  try {
    localStorage.removeItem(MANAGEMENT_SECRET_KEY)
  } catch {
    // Ignore storage errors in restricted browser contexts.
  }
}

function toUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  const base = getBaseUrl()
  if (!base) return path
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return requestInternal<T>(path, options, false)
}

async function requestInternal<T>(path: string, options: RequestOptions, prompted: boolean): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const shouldUseAuth = options.auth !== false && !(isWebRuntime() && path.startsWith('/v0/management'))

  if (shouldUseAuth) {
    const secret = options.secretOverride ?? getManagementSecret()
    if (secret) {
      headers.Authorization = `Bearer ${secret}`
    }
  }

  const res = await fetch(toUrl(path), {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  const text = await res.text()
  let parsed: MgmtResponse<T> | null = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error(`Invalid JSON response from ${path}`)
    }
  }

  if (!res.ok) {
    const authErrorCode = parsed?.error?.code

    if (res.status === 401 && authErrorCode === 'invalid_secret') {
      clearManagementSecret()
    }

    if (
      res.status === 401 &&
      shouldUseAuth &&
      !prompted &&
      (authErrorCode === 'missing_authentication' || authErrorCode === 'invalid_secret') &&
      typeof window !== 'undefined'
    ) {
      const input = window.prompt(
        authErrorCode === 'invalid_secret'
          ? 'Management API secret is invalid.\nPlease re-enter the correct management secret:'
          : 'Management API secret is required.\nPlease paste your management secret:',
      )

      if (input && input.trim()) {
        const secret = input.trim()
        setManagementSecret(secret)
        return requestInternal<T>(path, { ...options, secretOverride: secret }, true)
      }
    }

    const message = parsed?.error?.message || `HTTP ${res.status}`
    throw new Error(message)
  }

  if (!parsed) {
    throw new Error(`Empty response from ${path}`)
  }

  if (!parsed.success) {
    throw new Error(parsed.error?.message || 'Request failed')
  }

  return parsed.data as T
}

async function getConfig(): Promise<AppConfig> {
  return request<AppConfig>('/v0/management/config')
}

async function updateConfig(updates: Partial<AppConfig> & Record<string, unknown>): Promise<boolean> {
  await request('/v0/management/config', {
    method: 'PUT',
    body: updates,
  })
  return true
}

function getTodayDateKey(): string {
  return new Date().toISOString().split('T')[0]
}

function buildProxyStatusPoller(callback: (status: any) => void): () => void {
  let disposed = false

  const tick = async () => {
    if (disposed) return
    try {
      const status = await request('/v0/management/proxy/status')
      callback(status)
    } catch {
      // Ignore polling errors to avoid noisy UI failures.
    }
  }

  const timer = window.setInterval(tick, 5000)
  void tick()

  return () => {
    disposed = true
    window.clearInterval(timer)
  }
}

function buildNoopUpdateStatus() {
  return {
    checking: false,
    available: false,
    downloading: false,
    downloaded: false,
    error: null,
    progress: null,
    version: null,
    releaseDate: null,
    releaseNotes: null,
  }
}

const webElectronAPI: any = {
  proxy: {
    start: async (port?: number) => {
      await request('/v0/management/proxy/start', {
        method: 'POST',
        body: port ? { port } : {},
      })
      return true
    },
    stop: async () => {
      await request('/v0/management/proxy/stop', { method: 'POST', body: {} })
      return true
    },
    getStatus: async () => request('/v0/management/proxy/status'),
    onStatusChanged: (callback: (status: any) => void) => buildProxyStatusPoller(callback),
  },

  store: {
    get: async <T>(key: string) => {
      if (key === 'config') {
        return (await getConfig()) as T
      }
      return undefined
    },
    set: async <T>(key: string, value: T) => {
      if (key === 'config') {
        await updateConfig(value as any)
      }
    },
    delete: async () => {},
    clearAll: async () => {
      throw new Error('clearAll is not supported in Web mode yet')
    },
  },

  providers: {
    getAll: async () => request('/v0/management/providers'),
    getBuiltin: async () => {
      try {
        return await request('/v0/management/providers/builtin')
      } catch {
        return []
      }
    },
    add: async (data: any) => request('/v0/management/providers', { method: 'POST', body: data }),
    update: async (id: string, updates: any) => request(`/v0/management/providers/${id}`, { method: 'PUT', body: updates }),
    delete: async (id: string) => {
      await request(`/v0/management/providers/${id}`, { method: 'DELETE' })
      return true
    },
    checkStatus: async (providerId: string) => request(`/v0/management/providers/${providerId}/check-status`, { method: 'POST', body: {} }),
    checkAllStatus: async () => request('/v0/management/providers/check-all-status', { method: 'POST', body: {} }),
    duplicate: async (id: string) => request(`/v0/management/providers/${id}/duplicate`, { method: 'POST', body: {} }),
    export: async (id: string) => JSON.stringify(await request(`/v0/management/providers/${id}`), null, 2),
    import: async (jsonData: string) => request('/v0/management/providers', { method: 'POST', body: JSON.parse(jsonData) }),
    updateModels: async (providerId: string) => request(`/v0/management/providers/${providerId}/update-models`, { method: 'POST', body: {} }),
    getEffectiveModels: async (providerId: string) => request(`/v0/management/providers/${providerId}/effective-models`),
    addCustomModel: async (providerId: string, model: { displayName: string; actualModelId: string }) =>
      request(`/v0/management/providers/${providerId}/custom-models`, {
        method: 'POST',
        body: model,
      }),
    removeModel: async (providerId: string, modelName: string) =>
      request(`/v0/management/providers/${providerId}/models/${encodeURIComponent(modelName)}`, {
        method: 'DELETE',
      }),
    resetModels: async (providerId: string) =>
      request(`/v0/management/providers/${providerId}/reset-models`, {
        method: 'POST',
        body: {},
      }),
  },

  accounts: {
    getAll: async () => request('/v0/management/accounts'),
    getById: async (id: string) => request(`/v0/management/accounts/${id}`),
    getByProvider: async (providerId: string) => request(`/v0/management/providers/${providerId}/accounts`),
    add: async (data: any) => request('/v0/management/accounts', { method: 'POST', body: data }),
    update: async (id: string, updates: any) => request(`/v0/management/accounts/${id}`, { method: 'PUT', body: updates }),
    delete: async (id: string) => {
      await request(`/v0/management/accounts/${id}`, { method: 'DELETE' })
      return true
    },
    validate: async (accountId: string) => {
      const result = await request<{ valid: boolean }>(`/v0/management/accounts/${accountId}/validate`, {
        method: 'POST',
        body: {},
      })
      return !!result.valid
    },
    validateToken: async (providerId: string, credentials: Record<string, string>) =>
      request(`/v0/management/providers/${providerId}/validate-token`, {
        method: 'POST',
        body: { credentials },
      }),
    getCredits: async () => null,
    clearChats: async () => ({ success: false, error: 'clearChats is not supported in Web mode yet' }),
  },

  oauth: {
    startLogin: async () => ({ success: false, error: 'OAuth browser login is not supported in Web mode' }),
    cancelLogin: async () => {},
    loginWithToken: async (_providerId: string, _providerType: string, token: string) => ({
      success: !!token,
      credentials: token ? { token } : undefined,
      error: token ? undefined : 'Token is required',
    }),
    validateToken: async () => ({ valid: false, error: 'Use accounts.validateToken in Web mode' }),
    refreshToken: async () => null,
    getStatus: async () => 'idle',
    startInAppLogin: async () => ({ success: false, error: 'In-app login is not supported in Web mode' }),
    cancelInAppLogin: async () => {},
    isInAppLoginOpen: async () => false,
    onCallback: () => NOOP_UNSUBSCRIBE,
    onProgress: () => NOOP_UNSUBSCRIBE,
  },

  logs: {
    get: async (filter?: any) => {
      const params = new URLSearchParams()
      params.set('type', 'system')
      if (filter?.limit) params.set('limit', String(filter.limit))
      if (filter?.level && filter.level !== 'all') params.set('level', String(filter.level))
      const data = await request<{ logs: any[] }>(`/v0/management/logs?${params.toString()}`)
      return data.logs || []
    },
    getStats: async () => {
      const logs = await webElectronAPI.logs.get({ limit: 500 })
      const stats = { total: logs.length, info: 0, warn: 0, error: 0, debug: 0 }
      logs.forEach((l: any) => {
        if (l.level in stats) stats[l.level as keyof typeof stats] += 1
      })
      return stats
    },
    getTrend: async () => {
      const statistics = await request<any>('/v0/management/statistics')
      const dailyStats = statistics?.dailyStats || {}
      return Object.entries(dailyStats).map(([date, value]: any) => ({
        date,
        total: value.totalRequests || 0,
        info: value.successRequests || 0,
        warn: 0,
        error: value.failedRequests || 0,
      }))
    },
    getAccountTrend: async (_accountId: string, _days?: number) => [],
    clear: async () => {
      await request('/v0/management/logs/clear', {
        method: 'POST',
        body: { type: 'system' },
      })
    },
    export: async (format?: 'json' | 'txt') => {
      const logs = await webElectronAPI.logs.get({ limit: 1000 })
      return format === 'txt' ? logs.map((l: any) => `${l.level}: ${l.message}`).join('\n') : JSON.stringify(logs, null, 2)
    },
    getById: async (id: string) => {
      const logs = await webElectronAPI.logs.get({ limit: 1000 })
      return logs.find((l: any) => l.id === id)
    },
    onNewLog: () => NOOP_UNSUBSCRIBE,
  },

  requestLogs: {
    get: async (filter?: any) => {
      const params = new URLSearchParams()
      params.set('type', 'request')
      if (filter?.limit) params.set('limit', String(filter.limit))
      if (filter?.status === 'error') params.set('level', 'error')
      if (filter?.status === 'success') params.set('level', 'info')
      const data = await request<{ logs: any[] }>(`/v0/management/logs?${params.toString()}`)
      return data.logs || []
    },
    getById: async (id: string) => {
      const logs = await webElectronAPI.requestLogs.get({ limit: 1000 })
      return logs.find((l: any) => l.id === id)
    },
    getStats: async () => {
      const logs = await webElectronAPI.requestLogs.get({ limit: 1000 })
      const total = logs.length
      const success = logs.filter((l: any) => l.status === 'success').length
      const error = logs.filter((l: any) => l.status === 'error').length
      return {
        total,
        success,
        error,
        todayTotal: total,
        todaySuccess: success,
        todayError: error,
      }
    },
    getTrend: async () => {
      const logs = await webElectronAPI.requestLogs.get({ limit: 5000 })
      const grouped: Record<string, { total: number; success: number; error: number; avgLatency: number; latencySum: number }> = {}
      logs.forEach((log: any) => {
        const date = new Date(log.timestamp || Date.now()).toISOString().slice(0, 10)
        if (!grouped[date]) {
          grouped[date] = { total: 0, success: 0, error: 0, avgLatency: 0, latencySum: 0 }
        }
        grouped[date].total += 1
        if (log.status === 'success') grouped[date].success += 1
        if (log.status === 'error') grouped[date].error += 1
        grouped[date].latencySum += log.latency || 0
      })
      return Object.entries(grouped).map(([date, stat]) => ({
        date,
        total: stat.total,
        success: stat.success,
        error: stat.error,
        avgLatency: stat.total > 0 ? Math.round(stat.latencySum / stat.total) : 0,
      }))
    },
    clear: async () => {
      await request('/v0/management/logs/clear', {
        method: 'POST',
        body: { type: 'request' },
      })
    },
    onNewLog: () => NOOP_UNSUBSCRIBE,
  },

  statistics: {
    get: async () => {
      const statistics = await request<any>('/v0/management/statistics')
      return {
        totalRequests: statistics.totalRequests || 0,
        successRequests: statistics.successRequests || 0,
        failedRequests: statistics.failedRequests || 0,
        totalLatency: 0,
        lastUpdated: Date.now(),
        modelUsage: statistics.modelUsage || {},
        providerUsage: statistics.providerUsage || {},
        accountUsage: statistics.accountUsage || {},
        dailyStats: statistics.dailyStats || {},
      }
    },
    getToday: async () => {
      const statistics = await request<any>('/v0/management/statistics')
      const dailyStats = statistics.dailyStats || {}
      const key = getTodayDateKey()
      return {
        date: key,
        ...(dailyStats[key] || { totalRequests: 0, successRequests: 0, failedRequests: 0, totalLatency: 0, modelUsage: {}, providerUsage: {} }),
      }
    },
  },

  app: {
    getVersion: async () => (import.meta as any).env?.VITE_APP_VERSION || 'web',
    checkUpdate: async () => ({ hasUpdate: false, currentVersion: 'web', latestVersion: 'web' }),
    downloadUpdate: async () => {},
    installUpdate: async () => {},
    getUpdateStatus: async () => buildNoopUpdateStatus(),
    onUpdateChecking: () => NOOP_UNSUBSCRIBE,
    onUpdateAvailable: () => NOOP_UNSUBSCRIBE,
    onUpdateNotAvailable: () => NOOP_UNSUBSCRIBE,
    onUpdateProgress: () => NOOP_UNSUBSCRIBE,
    onUpdateDownloaded: () => NOOP_UNSUBSCRIBE,
    onUpdateError: () => NOOP_UNSUBSCRIBE,
    minimize: async () => {},
    maximize: async () => {},
    close: async () => {},
    showWindow: async () => {},
    hideWindow: async () => {},
    openExternal: async (url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  },

  config: {
    get: async () => getConfig(),
    update: async (updates: Partial<AppConfig>) => updateConfig(updates as any),
    onConfigChanged: () => NOOP_UNSUBSCRIBE,
  },

  prompts: {
    getAll: async () => [],
    getBuiltin: async () => [],
    getCustom: async () => [],
    getById: async () => undefined,
    add: async () => {
      throw new Error('Prompts API is not available in Web mode yet')
    },
    update: async () => null,
    delete: async () => false,
    getByType: async () => [],
  },

  session: {
    getConfig: async () => {
      const config = await getConfig()
      return config.sessionConfig
    },
    updateConfig: async (sessionConfig: any) => {
      await updateConfig({ sessionConfig } as any)
    },
    getAll: async () => request('/v0/management/sessions'),
    getActive: async () => request('/v0/management/sessions'),
    getById: async (id: string) => request(`/v0/management/sessions/${id}`),
    getByAccount: async (accountId: string) => {
      const sessions = await request<any[]>('/v0/management/sessions')
      return sessions.filter((s) => s.accountId === accountId)
    },
    getByProvider: async (providerId: string) => {
      const sessions = await request<any[]>('/v0/management/sessions')
      return sessions.filter((s) => s.providerId === providerId)
    },
    delete: async (id: string) => {
      await request(`/v0/management/sessions/${id}`, { method: 'DELETE' })
      return true
    },
    clearAll: async () => {
      await request('/v0/management/sessions', { method: 'DELETE', body: { confirm: true } })
    },
    cleanExpired: async () => 0,
  },

  managementApi: {
    getConfig: async () => {
      const config = await getConfig()
      return {
        ...((config as any).managementApi || {}),
        managementApiSecret: getManagementSecret() || ((config as any).managementApi?.managementApiSecret ?? ''),
      }
    },
    updateConfig: async (updates: any) => {
      const config = await getConfig()
      const current = (config as any).managementApi || {}
      const next = { ...current, ...updates }
      const nextSecret = normalizeSecret(next.managementApiSecret)
      if (nextSecret) {
        setManagementSecret(next.managementApiSecret)
      }
      if (!nextSecret) {
        delete next.managementApiSecret
      }
      await updateConfig({ managementApi: next } as any)
      return true
    },
    generateSecret: async () => {
      const random = Math.random().toString(36).slice(2)
      const secret = `mgmt_${Date.now().toString(36)}_${random}`
      setManagementSecret(secret)
      return secret
    },
  },

  contextManagement: {
    getConfig: async () => {
      const config = await getConfig()
      return (config as any).contextManagement || {
        enabled: false,
        strategies: {
          slidingWindow: { enabled: true, maxMessages: 20 },
          tokenLimit: { enabled: false, maxTokens: 4000 },
          summary: { enabled: false, keepRecentMessages: 20 },
        },
        executionOrder: ['slidingWindow', 'tokenLimit', 'summary'],
      }
    },
    updateConfig: async (updates: any) => {
      const config = await getConfig()
      const current = (config as any).contextManagement || {}
      const next = {
        ...current,
        ...updates,
        strategies: {
          ...(current.strategies || {}),
          ...(updates.strategies || {}),
        },
      }
      await updateConfig({ contextManagement: next } as any)
      return next
    },
  },

  tray: {
    openDashboard: () => {},
    setHeight: () => {},
    quitApp: () => {},
  },

  on: () => NOOP_UNSUBSCRIBE,
  send: () => {},
  invoke: async (channel: string, ...args: any[]) => {
    switch (channel) {
      case 'proxy:getStatistics': {
        return request('/v0/management/statistics')
      }
      case 'managementApi:getConfig': {
        return webElectronAPI.managementApi.getConfig()
      }
      case 'managementApi:updateConfig': {
        return webElectronAPI.managementApi.updateConfig(args[0] || {})
      }
      case 'managementApi:generateSecret': {
        return webElectronAPI.managementApi.generateSecret()
      }
      case 'app:openExternal': {
        const url = args[0]
        if (typeof url === 'string') {
          window.open(url, '_blank', 'noopener,noreferrer')
        }
        return
      }
      case 'oauth:loginWithToken': {
        const payload = args[0] || {}
        return webElectronAPI.oauth.loginWithToken(payload.providerId, payload.providerType, payload.token)
      }
      default:
        throw new Error(`Unsupported invoke channel in Web mode: ${channel}`)
    }
  },
}

export function ensureWebElectronApi(): void {
  if (typeof window === 'undefined') {
    return
  }

  if ((window as any).electronAPI) {
    return
  }

  ;(window as any).electronAPI = webElectronAPI
}
