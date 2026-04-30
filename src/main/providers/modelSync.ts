import axios from 'axios'
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

  const directListCandidates = [payload.data, payload.models, payload.items, payload.results]
  for (const candidate of directListCandidates) {
    if (Array.isArray(candidate)) {
      return candidate
    }
  }

  const nestedCandidates = [payload.data, payload.result]
  for (const candidate of nestedCandidates) {
    if (!isRecord(candidate)) {
      continue
    }
    const nestedList = [candidate.models, candidate.items, candidate.data]
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
      model.slug,
    ])
    const displayName = firstString([
      model.display_name,
      model.name,
      model.model_name,
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

function resolveModelApi(provider: Provider): {
  endpoint: string
  baseHeaders: Record<string, string>
} | null {
  const builtin = getBuiltinProvider(provider.id)

  if (builtin?.modelsApiEndpoint) {
    return {
      endpoint: builtin.modelsApiEndpoint,
      baseHeaders: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(builtin.modelsApiHeaders || {}),
      },
    }
  }

  const baseEndpoint = provider.apiEndpoint?.trim()
  if (!baseEndpoint) {
    return null
  }

  return {
    endpoint: `${baseEndpoint.replace(/\/+$/, '')}/models`,
    baseHeaders: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(provider.headers || {}),
    },
  }
}

async function doSync(provider: Provider): Promise<ModelSyncResult> {
  const providerId = provider.id
  const apiConfig = resolveModelApi(provider)
  if (!apiConfig) {
    throw new Error('This provider does not support dynamic model updates')
  }

  const accounts = AccountManager.getByProviderId(providerId, true)
  const activeAccount = accounts.find((account) => account.status === 'active')

  if (!activeAccount) {
    throw new Error('No active account for model synchronization')
  }

  const headers = applyCredentialHeaders(apiConfig.baseHeaders, activeAccount)
  const response = await axios.get(apiConfig.endpoint, {
    headers,
    timeout: MODEL_SYNC_TIMEOUT_MS,
    validateStatus: () => true,
  })

  if (response.status !== 200) {
    throw new Error(`Failed to fetch models: HTTP ${response.status}`)
  }

  const { supportedModels, modelMappings } = parseModels(response.data)
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

