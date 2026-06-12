import type { Provider, ProviderCustomNetworkConfig } from '../store/types'

function hasText(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function sanitizeCustomNetworkConfig(
  config?: ProviderCustomNetworkConfig
): ProviderCustomNetworkConfig | undefined {
  if (!config) return undefined

  const sanitized: ProviderCustomNetworkConfig = {}

  if (hasText(config.apiEndpoint)) {
    sanitized.apiEndpoint = config.apiEndpoint.trim().replace(/\/+$/, '')
  }

  if (hasText(config.chatPath)) {
    const path = config.chatPath.trim()
    sanitized.chatPath = path.startsWith('/') ? path : `/${path}`
  }

  const headers = Object.fromEntries(
    Object.entries(config.headers || {}).filter(([key, value]) =>
      hasText(key) && hasText(value)
    )
  )
  if (Object.keys(headers).length > 0) {
    sanitized.headers = headers
  }

  if (hasText(config.modelsApiEndpoint)) {
    sanitized.modelsApiEndpoint = config.modelsApiEndpoint.trim()
  }

  const modelsApiHeaders = Object.fromEntries(
    Object.entries(config.modelsApiHeaders || {}).filter(([key, value]) =>
      hasText(key) && hasText(value)
    )
  )
  if (Object.keys(modelsApiHeaders).length > 0) {
    sanitized.modelsApiHeaders = modelsApiHeaders
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}

export function validateCustomNetworkConfig(config: ProviderCustomNetworkConfig): string[] {
  const errors: string[] = []

  if (config.apiEndpoint) {
    try {
      const url = new URL(config.apiEndpoint)
      if (!['http:', 'https:'].includes(url.protocol)) {
        errors.push('API endpoint must use http or https')
      }
    } catch {
      errors.push('Invalid API endpoint URL')
    }
  }

  if (config.chatPath && !config.chatPath.startsWith('/')) {
    errors.push('Chat path must start with /')
  }

  if (config.modelsApiEndpoint) {
    try {
      const url = new URL(config.modelsApiEndpoint)
      if (!['http:', 'https:'].includes(url.protocol)) {
        errors.push('Models API endpoint must use http or https')
      }
    } catch {
      errors.push('Invalid models API endpoint URL')
    }
  }

  for (const [name] of Object.entries({ ...(config.headers || {}), ...(config.modelsApiHeaders || {}) })) {
    if (name.includes(':') || name.includes('\n') || name.includes('\r')) {
      errors.push(`Header name "${name}" contains invalid characters`)
    }
  }

  return errors
}

export function applyActiveNetworkConfig(provider: Provider): Provider {
  const active = sanitizeCustomNetworkConfig(provider.customNetwork?.active)
  if (!active) return provider

  return {
    ...provider,
    apiEndpoint: active.apiEndpoint || provider.apiEndpoint,
    chatPath: active.chatPath || provider.chatPath,
    headers: {
      ...(provider.headers || {}),
      ...(active.headers || {}),
    },
  }
}

export function getActiveModelsApiConfig(
  provider: Provider
): Pick<ProviderCustomNetworkConfig, 'modelsApiEndpoint' | 'modelsApiHeaders'> | undefined {
  const active = sanitizeCustomNetworkConfig(provider.customNetwork?.active)
  if (!active?.modelsApiEndpoint) return undefined

  return {
    modelsApiEndpoint: active.modelsApiEndpoint,
    modelsApiHeaders: active.modelsApiHeaders,
  }
}
