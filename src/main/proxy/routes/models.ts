/**
 * Proxy Service Module - Models Route
 * Implements /v1/models route
 */

import Router from '@koa/router'
import type { Context } from 'koa'
import { ModelsResponse, ModelInfo } from '../types'
import { storeManager } from '../../store/store'
import { getBuiltinProvider } from '../../providers/builtin'

const router = new Router({ prefix: '/v1' })

function getProviderDisplayModels(providerId: string): string[] {
  const effectiveModels = storeManager.getEffectiveModels(providerId)
  if (effectiveModels.length > 0) {
    return effectiveModels.map(model => model.displayName)
  }

  const provider = storeManager.getProviderById(providerId)
  if (provider?.supportedModels && provider.supportedModels.length > 0) {
    return provider.supportedModels
  }

  const builtin = getBuiltinProvider(providerId)
  if (builtin?.supportedModels && builtin.supportedModels.length > 0) {
    return builtin.supportedModels
  }

  return []
}

function hasActiveAccount(providerId: string): boolean {
  const accounts = storeManager.getAccountsByProviderId(providerId)
  return accounts.some(account => account.status === 'active')
}

/**
 * Get all available models
 */
router.get('/models', async (ctx: Context) => {
  const providers = storeManager
    .getProviders()
    .filter(provider => provider.enabled && hasActiveAccount(provider.id))
  const models: ModelInfo[] = []
  const addedModels = new Set<string>()

  for (const provider of providers) {
    const displayModels = getProviderDisplayModels(provider.id)
    for (const modelName of displayModels) {
      if (!addedModels.has(modelName)) {
        addedModels.add(modelName)
        models.push({
          id: modelName,
          object: 'model',
          created: Math.floor(provider.createdAt / 1000),
          owned_by: provider.name,
        })
      }
    }
  }

  const config = storeManager.getConfig()
  const mappings = config.modelMappings || {}
  for (const [requestModel, mapping] of Object.entries(mappings)) {
    if (!addedModels.has(requestModel)) {
      addedModels.add(requestModel)
      models.push({
        id: requestModel,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'model-mapping',
      })
    }
  }

  const response: ModelsResponse = {
    object: 'list',
    data: models,
  }

  ctx.set('Content-Type', 'application/json')
  ctx.body = response
})

/**
 * Get specified model info
 */
router.get('/models/:model', async (ctx: Context) => {
  const modelId = ctx.params.model

  const config = storeManager.getConfig()
  const mappings = config.modelMappings || {}
  if (mappings[modelId]) {
    ctx.set('Content-Type', 'application/json')
    ctx.body = {
      id: modelId,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'model-mapping',
    }
    return
  }

  const providers = storeManager
    .getProviders()
    .filter(provider => provider.enabled && hasActiveAccount(provider.id))

  for (const provider of providers) {
    const displayModels = getProviderDisplayModels(provider.id)
    const normalizedModelId = modelId.toLowerCase()
    const found = displayModels.some(modelName => {
      const normalizedSupported = modelName.toLowerCase()
      if (normalizedSupported.endsWith('*')) {
        return normalizedModelId.startsWith(normalizedSupported.slice(0, -1))
      }
      return normalizedSupported === normalizedModelId
    })

    if (found) {
      ctx.set('Content-Type', 'application/json')
      ctx.body = {
        id: modelId,
        object: 'model',
        created: Math.floor(provider.createdAt / 1000),
        owned_by: provider.name,
      }
      return
    }
  }

  ctx.status = 404
  ctx.body = {
    error: {
      message: `Model '${modelId}' not found`,
      type: 'invalid_request_error',
      param: 'model',
      code: 'model_not_found',
    },
  }
})

export default router
