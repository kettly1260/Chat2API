import axios from 'axios'
import type {
  Account,
  Provider,
  ProviderCustomNetworkConfig,
  ProviderCustomNetworkTestResult,
} from '../store/types'
import { AccountManager } from '../store/accounts'
import { ProviderManager } from '../store/providers'
import {
  applyActiveNetworkConfig,
  sanitizeCustomNetworkConfig,
  validateCustomNetworkConfig,
} from './networkConfig'

const TEST_TIMEOUT_MS = 15000

function buildUrl(baseEndpoint: string, path: string): string {
  const base = baseEndpoint.replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (base.includes('/v1') && normalizedPath.startsWith('/v1')) {
    return `${base}${normalizedPath.slice(3)}`
  }

  return `${base}${normalizedPath}`
}

function getToken(credentials: Record<string, string>): string | undefined {
  return credentials.apiKey || credentials.token || credentials.accessToken || credentials.authorization
}

function buildAuthHeaders(provider: Provider, account?: Account): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    ...(provider.headers || {}),
  }

  if (!account) return headers

  const token = getToken(account.credentials || {})
  if (token && !headers.Authorization && !headers.authorization) {
    headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`
  }

  const cookie = account.credentials.cookie || account.credentials.sessionToken
  if (cookie && !headers.Cookie && !headers.cookie) {
    headers.Cookie = cookie
  }

  return headers
}

function parseModelsCount(payload: unknown): number | undefined {
  if (Array.isArray(payload)) return payload.length
  if (!payload || typeof payload !== 'object') return undefined

  const record = payload as Record<string, unknown>
  const candidates = [record.data, record.models, record.items, record.result]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.length
  }

  return undefined
}

async function probeModelsEndpoint(
  provider: Provider,
  account?: Account,
  modelsApiEndpoint?: string,
  modelsApiHeaders?: Record<string, string>
): Promise<ProviderCustomNetworkTestResult | null> {
  if (!modelsApiEndpoint) return null

  const start = Date.now()
  try {
    const response = await axios.get(modelsApiEndpoint, {
      headers: {
        ...buildAuthHeaders(provider, account),
        ...(modelsApiHeaders || {}),
      },
      timeout: TEST_TIMEOUT_MS,
      validateStatus: () => true,
    })

    const success = response.status >= 200 && response.status < 400
    return {
      success,
      testedAt: Date.now(),
      statusCode: response.status,
      latency: Date.now() - start,
      modelsCount: parseModelsCount(response.data),
      error: success ? undefined : `Models endpoint returned HTTP ${response.status}`,
    }
  } catch (error) {
    return {
      success: false,
      testedAt: Date.now(),
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : 'Models endpoint connection failed',
    }
  }
}

async function probeChatEndpoint(
  provider: Provider,
  account?: Account
): Promise<ProviderCustomNetworkTestResult> {
  const start = Date.now()
  const url = buildUrl(provider.apiEndpoint, provider.chatPath || '/chat/completions')

  try {
    const response = await axios.options(url, {
      headers: buildAuthHeaders(provider, account),
      timeout: TEST_TIMEOUT_MS,
      validateStatus: () => true,
    })

    if (response.status === 404 || response.status >= 500) {
      return {
        success: false,
        testedAt: Date.now(),
        statusCode: response.status,
        latency: Date.now() - start,
        error: `Chat endpoint returned HTTP ${response.status}`,
      }
    }

    return {
      success: true,
      testedAt: Date.now(),
      statusCode: response.status,
      latency: Date.now() - start,
    }
  } catch (error) {
    return {
      success: false,
      testedAt: Date.now(),
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : 'Chat endpoint connection failed',
    }
  }
}

export async function testProviderCustomNetwork(
  providerId: string,
  config: ProviderCustomNetworkConfig
): Promise<ProviderCustomNetworkTestResult> {
  const provider = ProviderManager.getById(providerId)
  if (!provider) {
    return { success: false, testedAt: Date.now(), error: 'Provider not found' }
  }

  const sanitized = sanitizeCustomNetworkConfig(config)
  if (!sanitized) {
    return { success: false, testedAt: Date.now(), error: 'No custom network fields supplied' }
  }

  const validationErrors = validateCustomNetworkConfig(sanitized)
  if (validationErrors.length > 0) {
    return { success: false, testedAt: Date.now(), error: validationErrors.join(', ') }
  }

  const candidateProvider = applyActiveNetworkConfig({
    ...provider,
    customNetwork: { active: sanitized },
  })
  const account = AccountManager
    .getByProviderId(providerId, true)
    .find((item) => item.status === 'active')

  const modelsProbe = await probeModelsEndpoint(
    candidateProvider,
    account,
    sanitized.modelsApiEndpoint,
    sanitized.modelsApiHeaders
  )
  const shouldProbeChat = Boolean(
    sanitized.apiEndpoint || sanitized.chatPath || sanitized.headers || !sanitized.modelsApiEndpoint
  )
  const chatProbe = shouldProbeChat ? await probeChatEndpoint(candidateProvider, account) : null
  const failedProbe = [modelsProbe, chatProbe].find((probe) => probe && !probe.success)
  const result = failedProbe || chatProbe || modelsProbe || {
    success: false,
    testedAt: Date.now(),
    error: 'No testable network endpoint supplied',
  }

  ProviderManager.update(providerId, {
    customNetwork: {
      ...(provider.customNetwork || {}),
      pending: result.success ? undefined : sanitized,
      active: result.success ? sanitized : provider.customNetwork?.active,
      lastTest: result,
    },
  })

  return result
}
