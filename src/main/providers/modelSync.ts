import axios from 'axios'
import crypto from 'crypto'
import type { Account, Provider } from '../../shared/types'
import AccountManager from '../store/accounts'
import ProviderManager from '../store/providers'
import { getBuiltinProvider } from './builtin'

const MODEL_SYNC_TIMEOUT_MS = 15000
const DEFAULT_MIN_INTERVAL_MS = 5 * 60 * 1000

const lastSyncedAt = new Map<string, number>()
const inFlightSync = new Map<string, Promise<ModelSyncResult>>()

export interface ModelSyncResult {
  providerId: string
  synced: boolean
  modelsCount: number
  reason?: string
}

interface SyncOptions {
  force?: boolean
  minIntervalMs?: number
}

interface ModelSourceRequest {
  url: string
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  params?: Record<string, string>
  data?: Record<string, unknown>
  timeout?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function firstString(values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) {
        return trimmed
      }
    }
  }
  return undefined
}

function extractModelList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload
  }

  if (!isRecord(payload)) {
    return []
  }

  const directListCandidates = [
    payload.data,
    payload.models,
    payload.items,
    payload.results,
    payload.model_list,
    payload.modelList,
    payload.model_configs,
    payload.choices,
    payload.list,
  ]
  for (const candidate of directListCandidates) {
    if (Array.isArray(candidate)) {
      return candidate
    }
  }

  const nestedCandidates = [payload.data, payload.result, payload.payload]
  for (const candidate of nestedCandidates) {
    if (!isRecord(candidate)) {
      continue
    }
    const nestedList = [
      candidate.models,
      candidate.items,
      candidate.data,
      candidate.model_list,
      candidate.modelList,
      candidate.model_configs,
      candidate.list,
      candidate.choices,
    ]
    for (const item of nestedList) {
      if (Array.isArray(item)) {
        return item
      }
    }
  }

  return []
}

function parseModels(payload: unknown): {
  supportedModels: string[]
  modelMappings: Record<string, string>
} {
  const rawModels = extractModelList(payload)
  if (rawModels.length === 0) {
    throw new Error('No models found in upstream response')
  }

  const supportedModels: string[] = []
  const modelMappings: Record<string, string> = {}
  const dedupe = new Set<string>()

  for (const model of rawModels) {
    if (typeof model === 'string') {
      const name = model.trim()
      if (!name || dedupe.has(name)) {
        continue
      }
      dedupe.add(name)
      supportedModels.push(name)
      modelMappings[name] = name
      continue
    }

    if (!isRecord(model)) {
      continue
    }

    const modelId = firstString([
      model.id,
      model.model_id,
      model.model,
      model.name,
      model.model_name,
      model.code,
      model.key,
      model.identifier,
      model.slug,
      model.type,
    ])
    const displayName = firstString([
      model.display_name,
      model.name,
      model.model_name,
      model.title,
      model.label,
      modelId,
    ])

    if (!modelId || !displayName || dedupe.has(displayName)) {
      continue
    }

    dedupe.add(displayName)
    supportedModels.push(displayName)
    modelMappings[displayName] = modelId
  }

  if (supportedModels.length === 0) {
    throw new Error('Failed to parse models from upstream response')
  }

  return { supportedModels, modelMappings }
}

function buildCookieHeader(credentials: Record<string, string>): string | undefined {
  if (credentials.cookies) {
    return credentials.cookies
  }
  if (credentials.cookie) {
    return credentials.cookie
  }

  const cookieParts: string[] = []
  if (credentials.sessionToken) {
    cookieParts.push(`__Secure-next-auth.session-token=${credentials.sessionToken}`)
  }
  if (credentials['__Secure-next-auth.session-token']) {
    cookieParts.push(`__Secure-next-auth.session-token=${credentials['__Secure-next-auth.session-token']}`)
  }
  if (credentials['next-auth.session-token']) {
    cookieParts.push(`next-auth.session-token=${credentials['next-auth.session-token']}`)
  }
  if (credentials.ticket) {
    cookieParts.push(`tongyi_sso_ticket=${credentials.ticket}`)
  }
  if (credentials.service_token) {
    cookieParts.push(`serviceToken=${credentials.service_token}`)
  }
  if (credentials.user_id) {
    cookieParts.push(`userId=${credentials.user_id}`)
  }
  if (credentials.ph_token) {
    cookieParts.push(`xiaomichatbot_ph=${credentials.ph_token}`)
  }

  return cookieParts.length > 0 ? cookieParts.join('; ') : undefined
}

function applyCredentialHeaders(
  headers: Record<string, string>,
  account: Account
): Record<string, string> {
  const nextHeaders = { ...headers }
  const credentials = account.credentials || {}

  const token = firstString([
    credentials.token,
    credentials.access_token,
    credentials.jwt,
    credentials.authorization,
  ])

  if (token && !nextHeaders.Authorization) {
    nextHeaders.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`
  }

  const cookie = buildCookieHeader(credentials)
  if (cookie && !nextHeaders.Cookie) {
    nextHeaders.Cookie = cookie
  }

  return nextHeaders
}

function md5(input: string): string {
  return crypto.createHash('md5').update(input).digest('hex')
}

function unixTimestamp(): number {
  return Math.floor(Date.now() / 1000)
}

function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0
    const value = char === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

function generateGlmSign(): { timestamp: string; nonce: string; sign: string } {
  const raw = Date.now().toString()
  const len = raw.length
  const digits = raw.split('').map((c) => Number(c))
  const checksum = (digits.reduce((sum, digit) => sum + digit, 0) - digits[len - 2]) % 10
  const timestamp = raw.substring(0, len - 2) + checksum + raw.substring(len - 1, len)
  const nonce = generateUuid().replace(/-/g, '')
  const sign = md5(`${timestamp}-${nonce}-8a1317a7468aa3ad86e997d08f3f31cb`)
  return { timestamp, nonce, sign }
}

function parseMiniMaxToken(rawToken: string): { jwtToken: string; realUserID: string } {
  if (rawToken.includes('+')) {
    const [realUserID, jwtToken] = rawToken.split('+')
    return { jwtToken, realUserID }
  }
  return { jwtToken: rawToken, realUserID: '' }
}

async function getGlmAccessToken(credentials: Record<string, string>): Promise<string | null> {
  const refreshToken =
    credentials.chatglm_refresh_token ||
    credentials.refreshToken ||
    credentials.refresh_token ||
    credentials.token

  if (!refreshToken) {
    return null
  }

  const sign = generateGlmSign()
  const headers = {
    Authorization: `Bearer ${refreshToken}`,
    'X-Device-Id': generateUuid().replace(/-/g, ''),
    'X-Nonce': sign.nonce,
    'X-Request-Id': generateUuid().replace(/-/g, ''),
    'X-Sign': sign.sign,
    'X-Timestamp': sign.timestamp,
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    Origin: 'https://chatglm.cn',
    Referer: 'https://chatglm.cn/',
  }

  const response = await axios.post('https://chatglm.cn/chatglm/user-api/user/refresh', {}, {
    headers,
    timeout: MODEL_SYNC_TIMEOUT_MS,
    validateStatus: () => true,
  })

  if (response.status !== 200 || !isRecord(response.data)) {
    return null
  }

  const result = isRecord(response.data.result) ? response.data.result : response.data
  const accessToken = result.access_token
  if (typeof accessToken !== 'string' || !accessToken) {
    return null
  }
  return accessToken
}

function buildProviderSpecificSources(
  provider: Provider,
  account: Account,
  defaultHeaders: Record<string, string>
): ModelSourceRequest[] {
  const credentials = account.credentials || {}
  const sources: ModelSourceRequest[] = []

  if (provider.id === 'qwen-ai') {
    sources.push({
      url: 'https://chat.qwen.ai/api/models',
      method: 'GET',
      headers: {
        ...defaultHeaders,
        source: 'web',
        Referer: 'https://chat.qwen.ai/',
      },
    })
    return sources
  }

  if (provider.id === 'qwen') {
    const ticket = credentials.ticket || credentials.tongyi_sso_ticket
    const cookie = ticket ? `tongyi_sso_ticket=${ticket}` : undefined
    const qwenHeaders = {
      ...defaultHeaders,
      ...(cookie ? { Cookie: cookie } : {}),
      'X-Platform': 'pc_tongyi',
      'X-DeviceId': generateUuid(),
      Origin: 'https://www.qianwen.com',
      Referer: 'https://www.qianwen.com/',
    }
    const qwenParams = {
      biz_id: 'ai_qwen',
      chat_client: 'h5',
      device: 'pc',
      fr: 'pc',
      pr: 'qwen',
      ut: generateUuid(),
    }
    sources.push(
      {
        url: 'https://chat2-api.qianwen.com/api/v2/chat/model/list',
        method: 'POST',
        headers: qwenHeaders,
        params: qwenParams,
        data: {},
      },
      {
        url: 'https://chat2-api.qianwen.com/api/v2/models',
        method: 'GET',
        headers: qwenHeaders,
        params: qwenParams,
      }
    )
    return sources
  }

  if (provider.id === 'deepseek') {
    sources.push(
      { url: 'https://chat.deepseek.com/api/v0/models', method: 'GET', headers: defaultHeaders },
      { url: 'https://chat.deepseek.com/api/v0/chat/models', method: 'GET', headers: defaultHeaders },
      { url: 'https://chat.deepseek.com/api/v0/model/list', method: 'GET', headers: defaultHeaders }
    )
    return sources
  }

  if (provider.id === 'glm') {
    sources.push(
      {
        url: 'https://chatglm.cn/chatglm/backend-api/assistant/model_list',
        method: 'GET',
        headers: defaultHeaders,
      },
      {
        url: 'https://chatglm.cn/chatglm/backend-api/assistant/list',
        method: 'GET',
        headers: defaultHeaders,
      }
    )
    return sources
  }

  if (provider.id === 'kimi') {
    sources.push(
      {
        url: 'https://www.kimi.com/api/chat/models',
        method: 'GET',
        headers: {
          ...defaultHeaders,
          'Connect-Protocol-Version': '1',
          'X-Msh-Platform': 'web',
          'R-Timezone': 'Asia/Shanghai',
        },
      },
      {
        url: 'https://www.kimi.com/apiv2/kimi.gateway.chat.v1.ModelService/ListModels',
        method: 'POST',
        headers: {
          ...defaultHeaders,
          'Connect-Protocol-Version': '1',
          'X-Msh-Platform': 'web',
          'R-Timezone': 'Asia/Shanghai',
        },
        data: {},
      }
    )
    return sources
  }

  if (provider.id === 'minimax') {
    const token = firstString([credentials.token, credentials.authorization, credentials.access_token])
    if (token) {
      const { jwtToken } = parseMiniMaxToken(token)
      sources.push(
        {
          url: 'https://agent.minimaxi.com/matrix/api/v1/chat/model/list',
          method: 'GET',
          headers: {
            ...defaultHeaders,
            token: jwtToken,
            Referer: 'https://agent.minimaxi.com/',
          },
        },
        {
          url: 'https://agent.minimaxi.com/v1/api/model/list',
          method: 'GET',
          headers: {
            ...defaultHeaders,
            token: jwtToken,
            Referer: 'https://agent.minimaxi.com/',
          },
        }
      )
    }
    return sources
  }

  if (provider.id === 'mimo') {
    const phToken = credentials.ph_token || credentials.xiaomichatbot_ph
    const serviceToken = credentials.service_token || credentials.serviceToken
    const userId = credentials.user_id || credentials.userId
    const cookie = buildCookieHeader({
      ...credentials,
      ...(serviceToken ? { service_token: serviceToken } : {}),
      ...(userId ? { user_id: userId } : {}),
      ...(phToken ? { ph_token: phToken } : {}),
    })
    sources.push(
      {
        url: 'https://aistudio.xiaomimimo.com/open-apis/bot/model/list',
        method: 'GET',
        headers: {
          ...defaultHeaders,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        params: phToken ? { xiaomichatbot_ph: phToken } : undefined,
      },
      {
        url: 'https://aistudio.xiaomimimo.com/open-apis/model/list',
        method: 'GET',
        headers: {
          ...defaultHeaders,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        params: phToken ? { xiaomichatbot_ph: phToken } : undefined,
      }
    )
    return sources
  }

  if (provider.id === 'perplexity') {
    sources.push(
      { url: 'https://www.perplexity.ai/rest/model_preferences', method: 'GET', headers: defaultHeaders },
      { url: 'https://www.perplexity.ai/rest/models', method: 'GET', headers: defaultHeaders }
    )
    return sources
  }

  if (provider.id === 'zai') {
    sources.push(
      { url: 'https://chat.z.ai/api/v1/models', method: 'GET', headers: defaultHeaders },
      { url: 'https://chat.z.ai/api/v2/models', method: 'GET', headers: defaultHeaders }
    )
    return sources
  }

  return sources
}

async function buildModelSourceRequests(provider: Provider, account: Account): Promise<ModelSourceRequest[]> {
  const builtin = getBuiltinProvider(provider.id)
  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(provider.headers || {}),
    ...(builtin?.modelsApiHeaders || {}),
  }

  if (builtin?.modelsApiEndpoint) {
    const builtinHeaders = applyCredentialHeaders(baseHeaders, account)
    const requests: ModelSourceRequest[] = [
      {
        url: builtin.modelsApiEndpoint,
        method: 'GET',
        headers: builtinHeaders,
      },
    ]
    return requests
  }

  let providerHeaders = applyCredentialHeaders(baseHeaders, account)
  if (provider.id === 'glm') {
    const accessToken = await getGlmAccessToken(account.credentials || {})
    if (accessToken) {
      providerHeaders = {
        ...providerHeaders,
        Authorization: `Bearer ${accessToken}`,
      }
    }
  }

  const specificSources = buildProviderSpecificSources(provider, account, providerHeaders)
  if (specificSources.length > 0) {
    return specificSources
  }

  const baseEndpoint = provider.apiEndpoint?.trim()
  if (!baseEndpoint) {
    throw new Error('This provider does not support dynamic model updates')
  }

  return [
    {
      url: `${baseEndpoint.replace(/\/+$/, '')}/models`,
      method: 'GET',
      headers: providerHeaders,
    },
  ]
}

async function fetchModelsFromSources(
  sources: ModelSourceRequest[]
): Promise<{ supportedModels: string[]; modelMappings: Record<string, string> }> {
  const errors: string[] = []

  for (const source of sources) {
    try {
      const response = await axios.request({
        url: source.url,
        method: source.method || 'GET',
        headers: source.headers,
        params: source.params,
        data: source.data,
        timeout: source.timeout || MODEL_SYNC_TIMEOUT_MS,
        validateStatus: () => true,
      })

      if (response.status !== 200) {
        errors.push(`${source.method || 'GET'} ${source.url} -> HTTP ${response.status}`)
        continue
      }

      const parsed = parseModels(response.data)
      return parsed
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${source.method || 'GET'} ${source.url} -> ${message}`)
    }
  }

  throw new Error(`Failed to fetch models from provider endpoints: ${errors.join(' | ')}`)
}

async function doSync(provider: Provider): Promise<ModelSyncResult> {
  const providerId = provider.id
  const accounts = AccountManager.getByProviderId(providerId, true)
  const activeAccount = accounts.find((account) => account.status === 'active')

  if (!activeAccount) {
    throw new Error('No active account for model synchronization')
  }

  const sources = await buildModelSourceRequests(provider, activeAccount)
  const { supportedModels, modelMappings } = await fetchModelsFromSources(sources)
  ProviderManager.update(providerId, {
    supportedModels,
    modelMappings,
  })

  const now = Date.now()
  lastSyncedAt.set(providerId, now)

  return {
    providerId,
    synced: true,
    modelsCount: supportedModels.length,
  }
}

export async function syncProviderModels(
  providerId: string,
  options: SyncOptions = {}
): Promise<ModelSyncResult> {
  const provider = ProviderManager.getById(providerId)
  if (!provider) {
    throw new Error('Provider not found')
  }

  const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
  const previousSync = lastSyncedAt.get(providerId)
  if (!options.force && previousSync && Date.now() - previousSync < minIntervalMs) {
    return {
      providerId,
      synced: false,
      modelsCount: provider.supportedModels?.length || 0,
      reason: 'recently-synced',
    }
  }

  const running = inFlightSync.get(providerId)
  if (running) {
    return running
  }

  const task = doSync(provider).finally(() => {
    inFlightSync.delete(providerId)
  })
  inFlightSync.set(providerId, task)

  return task
}

