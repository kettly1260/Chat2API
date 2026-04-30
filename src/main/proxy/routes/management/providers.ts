/**
 * Management API - Provider Routes
 * Provides CRUD operations for provider management
 */

import Router from '@koa/router'
import type { Context } from 'koa'
import { managementAuthMiddleware } from '../../middleware/managementAuth'
import ProviderManager from '../../../store/providers'
import AccountManager from '../../../store/accounts'
import { ProviderChecker } from '../../../providers/checker'
import { getBuiltinProviders } from '../../../providers/builtin'
import { CustomProviderManager } from '../../../providers/custom'
import { syncProviderModels } from '../../../providers/modelSync'
import { storeManager } from '../../../store/store'
import type {
  Provider,
  CreateProviderRequest,
  UpdateProviderRequest,
  ProviderStatusRequest,
  ManagementApiResponse,
} from '../../../../../shared/types'

const router = new Router({ prefix: '/v0/management/providers' })

router.use(managementAuthMiddleware)

function createErrorResponse(code: string, message: string): ManagementApiResponse {
  return {
    success: false,
    error: {
      code,
      message,
    },
  }
}

function createSuccessResponse<T>(data: T): ManagementApiResponse<T> {
  return {
    success: true,
    data,
  }
}

function hasActiveAccount(providerId: string): boolean {
  const accounts = AccountManager.getByProviderId(providerId, false)
  return accounts.some(account => account.status === 'active')
}

router.get('/builtin', async (ctx: Context) => {
  try {
    const providers = getBuiltinProviders()
    ctx.set('Content-Type', 'application/json')
    ctx.body = createSuccessResponse(providers)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get builtin providers'
    ctx.status = 500
    ctx.body = createErrorResponse('internal_error', errorMessage)
  }
})

router.post('/check-all-status', async (ctx: Context) => {
  try {
    const providers = ProviderManager.getAll()
    const results = await Promise.all(
      providers.map(async (provider) => {
        if (!hasActiveAccount(provider.id)) {
          return [
            provider.id,
            {
              providerId: provider.id,
              status: 'offline' as const,
              latency: 0,
              error: 'No active accounts',
            },
          ] as const
        }

        const result = await ProviderChecker.checkProviderStatus(provider)
        return [provider.id, result] as const
      })
    )

    const statusMap = Object.fromEntries(results)
    ctx.set('Content-Type', 'application/json')
    ctx.body = createSuccessResponse(statusMap)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to check provider statuses'
    ctx.status = 500
    ctx.body = createErrorResponse('internal_error', errorMessage)
  }
})

router.get('/', async (ctx: Context) => {
  try {
    const providers = ProviderManager.getAll()

    ctx.set('Content-Type', 'application/json')
    ctx.body = createSuccessResponse(providers)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get providers'
    ctx.status = 500
    ctx.body = createErrorResponse('internal_error', errorMessage)
  }
})

router.get('/:id', async (ctx: Context) => {
  try {
    const id = ctx.params.id
    const provider = ProviderManager.getById(id)

    if (!provider) {
      ctx.status = 404
      ctx.body = createErrorResponse('not_found', 'Provider not found')
      return
    }

    ctx.set('Content-Type', 'application/json')
    ctx.body = createSuccessResponse(provider)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get provider'
    ctx.status = 500
    ctx.body = createErrorResponse('internal_error', errorMessage)
  }
})

router.post('/:id/duplicate', async (ctx: Context) => {
  try {
    const id = ctx.params.id
    const provider = CustomProviderManager.duplicate(id)

    ctx.status = 201
    ctx.set('Content-Type', 'application/json')
    ctx.body = createSuccessResponse(provider)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to duplicate provider'
    ctx.status = 500
    ctx.body = createErrorResponse('internal_error', errorMessage)
  }
})

router.post('/:id/check-status', async (ctx: Context) => {
  try {
    const id = ctx.params.id
    const provider = ProviderManager.getById(id)

    if (!provider) {
      ctx.status = 404
      ctx.body = createErrorResponse('not_found', 'Provider not found')
      return
    }

    if (!hasActiveAccount(provider.id)) {
      ctx.set('Content-Type', 'application/json')
      ctx.body = createSuccessResponse({
        providerId: provider.id,
        status: 'offline',
        latency: 0,
        error: 'No active accounts',
      })
      return
    }

    const result = await ProviderChecker.checkProviderStatus(provider)
    ctx.set('Content-Type', 'application/json')
    ctx.body = createSuccessResponse(result)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to check provider status'
    ctx.status = 500
    ctx.body = createErrorResponse('internal_error', errorMessage)
  }
})

router.post('/:id/update-models', async (ctx: Context) => {
  try {
    const providerId = ctx.params.id
    const provider = ProviderManager.getById(providerId)

    if (!provider) {
      ctx.status = 404
      ctx.body = createErrorResponse('not_found', 'Provider not found')
      return
    }

    const result = await syncProviderModels(providerId, { force: true })

    ctx.set('Content-Type', 'application/json')
    ctx.body = createSuccessResponse({
      success: true,
      modelsCount: result.modelsCount,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update models'
    if (
      errorMessage.includes('No active account') ||
      errorMessage.includes('does not support dynamic model updates') ||
      errorMessage.includes('No models found')
    ) {
      ctx.status = 400
      ctx.body = createErrorResponse('invalid_request', errorMessage)
      return
    }
    if (errorMessage.includes('Failed to fetch models: HTTP')) {
      ctx.status = 502
      ctx.body = createErrorResponse('upstream_error', errorMessage)
      return
    }
    ctx.status = 500
    ctx.body = createErrorResponse('internal_error', errorMessage)
  }
})

router.get('/:id/effective-models', async (ctx: Context) => {
  try {
    const providerId = ctx.params.id
    try {
      await syncProviderModels(providerId)
    } catch (error) {
      console.warn(
        `[ProvidersRoute] Failed to auto-sync models for provider ${providerId}:`,
        error instanceof Error ? error.message : error
      )
    }
    const models = storeManager.getEffectiveModels(providerId)
    ctx.set('Content-Type', 'application/json')
    ctx.body = createSuccessResponse(models)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get effective models'
    ctx.status = 500
    ctx.body = createErrorResponse('internal_error', errorMessage)
  }
})

router.post('/:id/custom-models', async (ctx: Context) => {
  try {
    const providerId = ctx.params.id
    const model = ctx.request.body as { displayName: string; actualModelId: string }

    if (!model?.displayName || !model?.actualModelId) {
      ctx.status = 400
      ctx.body = createErrorResponse('invalid_request', 'displayName and actualModelId are required')
      return
    }

    const models = storeManager.addCustomModel(providerId, model)
    ctx.set('Content-Type', 'application/json')
    ctx.body = createSuccessResponse({ success: true, models })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to add custom model'
    ctx.status = 500
    ctx.body = createErrorResponse('internal_error', errorMessage)
  }
})

router.delete('/:id/models/:modelName', async (ctx: Context) => {
  try {
    const providerId = ctx.params.id
    const modelName = decodeURIComponent(ctx.params.modelName)
    const models = storeManager.removeModel(providerId, modelName)

    ctx.set('Content-Type', 'application/json')
    ctx.body = createSuccessResponse({ success: true, models })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to remove model'
    ctx.status = 500
    ctx.body = createErrorResponse('internal_error', errorMessage)
  }
})

router.post('/:id/reset-models', async (ctx: Context) => {
  try {
    const providerId = ctx.params.id
    const models = storeManager.resetModels(providerId)

    ctx.set('Content-Type', 'application/json')
    ctx.body = createSuccessResponse({ success: true, models })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to reset models'
    ctx.status = 500
    ctx.body = createErrorResponse('internal_error', errorMessage)
  }
})

router.post('/', async (ctx: Context) => {
  try {
    const request = ctx.request.body as CreateProviderRequest

    if (!request.name || typeof request.name !== 'string') {
      ctx.status = 400
      ctx.body = createErrorResponse('invalid_request', 'Missing required field: name')
      return
    }

    if (!request.authType) {
      ctx.status = 400
      ctx.body = createErrorResponse('invalid_request', 'Missing required field: authType')
      return
    }

    if (!request.apiEndpoint || typeof request.apiEndpoint !== 'string') {
      ctx.status = 400
      ctx.body = createErrorResponse('invalid_request', 'Missing required field: apiEndpoint')
      return
    }

    const provider = ProviderManager.create({
      name: request.name,
      type: request.type || 'custom',
      authType: request.authType,
      apiEndpoint: request.apiEndpoint,
      chatPath: request.chatPath,
      headers: request.headers || {},
      description: request.description,
      icon: request.icon,
      supportedModels: request.supportedModels,
    })

    ctx.status = 201
    ctx.set('Content-Type', 'application/json')
    ctx.body = createSuccessResponse(provider)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create provider'
    ctx.status = 500
    ctx.body = createErrorResponse('internal_error', errorMessage)
  }
})

router.put('/:id', async (ctx: Context) => {
  try {
    const id = ctx.params.id
    const request = ctx.request.body as UpdateProviderRequest

    const existingProvider = ProviderManager.getById(id)
    if (!existingProvider) {
      ctx.status = 404
      ctx.body = createErrorResponse('not_found', 'Provider not found')
      return
    }

    const updates: Partial<Omit<Provider, 'id' | 'type' | 'createdAt'>> = {}

    if (request.name !== undefined) {
      updates.name = request.name
    }

    if (request.apiEndpoint !== undefined) {
      updates.apiEndpoint = request.apiEndpoint
    }

    if (request.chatPath !== undefined) {
      updates.chatPath = request.chatPath
    }

    if (request.headers !== undefined) {
      updates.headers = request.headers
    }

    if (request.enabled !== undefined) {
      updates.enabled = request.enabled
    }

    if (request.description !== undefined) {
      updates.description = request.description
    }

    if (request.icon !== undefined) {
      updates.icon = request.icon
    }

    if (request.supportedModels !== undefined) {
      updates.supportedModels = request.supportedModels
    }

    if (request.modelMappings !== undefined) {
      updates.modelMappings = request.modelMappings
    }

    const updatedProvider = ProviderManager.update(id, updates)

    if (!updatedProvider) {
      ctx.status = 500
      ctx.body = createErrorResponse('update_failed', 'Failed to update provider')
      return
    }

    ctx.set('Content-Type', 'application/json')
    ctx.body = createSuccessResponse(updatedProvider)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update provider'

    if (errorMessage.includes('Built-in providers cannot modify')) {
      ctx.status = 403
      ctx.body = createErrorResponse('forbidden', errorMessage)
      return
    }

    ctx.status = 500
    ctx.body = createErrorResponse('internal_error', errorMessage)
  }
})

router.delete('/:id', async (ctx: Context) => {
  try {
    const id = ctx.params.id

    const deleted = ProviderManager.delete(id)

    if (!deleted) {
      ctx.status = 404
      ctx.body = createErrorResponse('not_found', 'Provider not found')
      return
    }

    ctx.set('Content-Type', 'application/json')
    ctx.body = createSuccessResponse({ id, deleted: true })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete provider'
    ctx.status = 500
    ctx.body = createErrorResponse('internal_error', errorMessage)
  }
})

router.patch('/:id/status', async (ctx: Context) => {
  try {
    const id = ctx.params.id
    const request = ctx.request.body as ProviderStatusRequest

    if (request.enabled === undefined || typeof request.enabled !== 'boolean') {
      ctx.status = 400
      ctx.body = createErrorResponse('invalid_request', 'Missing or invalid required field: enabled (must be boolean)')
      return
    }

    const existingProvider = ProviderManager.getById(id)
    if (!existingProvider) {
      ctx.status = 404
      ctx.body = createErrorResponse('not_found', 'Provider not found')
      return
    }

    const updatedProvider = ProviderManager.update(id, { enabled: request.enabled })

    if (!updatedProvider) {
      ctx.status = 500
      ctx.body = createErrorResponse('update_failed', 'Failed to update provider status')
      return
    }

    ctx.set('Content-Type', 'application/json')
    ctx.body = createSuccessResponse(updatedProvider)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update provider status'
    ctx.status = 500
    ctx.body = createErrorResponse('internal_error', errorMessage)
  }
})

export default router
