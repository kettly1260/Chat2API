import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Provider, ProviderCustomNetworkConfig, ProviderCustomNetworkTestResult } from '@/types/electron'

interface ProviderNetworkConfigDialogProps {
  open: boolean
  provider: Provider | null
  onOpenChange: (open: boolean) => void
  onTestAndActivate: (providerId: string, config: ProviderCustomNetworkConfig) => Promise<ProviderCustomNetworkTestResult>
}

function parseJsonObject(value: string, fieldName: string): Record<string, string> | undefined {
  if (!value.trim()) return undefined

  const parsed = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${fieldName} must be a JSON object`)
  }

  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).map(([key, item]) => [key, String(item)])
  )
}

export function ProviderNetworkConfigDialog({
  open,
  provider,
  onOpenChange,
  onTestAndActivate,
}: ProviderNetworkConfigDialogProps) {
  const [apiEndpoint, setApiEndpoint] = useState('')
  const [chatPath, setChatPath] = useState('')
  const [headers, setHeaders] = useState('')
  const [modelsApiEndpoint, setModelsApiEndpoint] = useState('')
  const [modelsApiHeaders, setModelsApiHeaders] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ProviderCustomNetworkTestResult | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  useEffect(() => {
    const source = provider?.customNetwork?.pending || provider?.customNetwork?.active || {}
    setApiEndpoint(source.apiEndpoint || '')
    setChatPath(source.chatPath || '')
    setHeaders(source.headers ? JSON.stringify(source.headers, null, 2) : '')
    setModelsApiEndpoint(source.modelsApiEndpoint || '')
    setModelsApiHeaders(source.modelsApiHeaders ? JSON.stringify(source.modelsApiHeaders, null, 2) : '')
    setError(null)
    setResult(provider?.customNetwork?.lastTest || null)
  }, [provider, open])

  const handleTest = async () => {
    if (!provider) return

    setIsTesting(true)
    setError(null)
    setResult(null)

    try {
      const config: ProviderCustomNetworkConfig = {
        apiEndpoint: apiEndpoint.trim() || undefined,
        chatPath: chatPath.trim() || undefined,
        headers: parseJsonObject(headers, 'Headers'),
        modelsApiEndpoint: modelsApiEndpoint.trim() || undefined,
        modelsApiHeaders: parseJsonObject(modelsApiHeaders, 'Model headers'),
      }

      const testResult = await onTestAndActivate(provider.id, config)
      setResult(testResult)
      if (!testResult.success) {
        setError(testResult.error || 'Connection test failed')
      }
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Invalid network configuration')
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Network configuration</DialogTitle>
          <DialogDescription>
            Custom endpoints are used only after this connection test succeeds. Failed configs remain pending and do not affect traffic.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[520px] space-y-4 overflow-y-auto pr-2">
          <div className="space-y-2">
            <Label htmlFor="network-api-endpoint">API endpoint</Label>
            <Input
              id="network-api-endpoint"
              value={apiEndpoint}
              onChange={(event) => setApiEndpoint(event.target.value)}
              placeholder={provider?.apiEndpoint || 'https://api.example.com'}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="network-chat-path">Chat path</Label>
            <Input
              id="network-chat-path"
              value={chatPath}
              onChange={(event) => setChatPath(event.target.value)}
              placeholder={provider?.chatPath || '/chat/completions'}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="network-models-endpoint">Models API endpoint</Label>
            <Input
              id="network-models-endpoint"
              value={modelsApiEndpoint}
              onChange={(event) => setModelsApiEndpoint(event.target.value)}
              placeholder="https://example.com/api/models"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="network-headers">Request headers JSON</Label>
            <Textarea
              id="network-headers"
              value={headers}
              onChange={(event) => setHeaders(event.target.value)}
              placeholder={'{\n  "X-Custom": "value"\n}'}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="network-model-headers">Model request headers JSON</Label>
            <Textarea
              id="network-model-headers"
              value={modelsApiHeaders}
              onChange={(event) => setModelsApiHeaders(event.target.value)}
              placeholder={'{\n  "Version": "latest"\n}'}
              rows={4}
            />
          </div>

          {result && (
            <div className={result.success ? 'rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm' : 'rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm'}>
              {result.success ? 'Connection test passed. Configuration is active.' : result.error || 'Connection test failed.'}
              {typeof result.modelsCount === 'number' && ` Models: ${result.modelsCount}`}
              {typeof result.latency === 'number' && ` Latency: ${result.latency}ms`}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleTest} disabled={isTesting}>
            {isTesting ? 'Testing...' : 'Test and activate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
