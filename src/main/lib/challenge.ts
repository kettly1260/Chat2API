import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export class DeepSeekHash {
  private wasmInstance: any
  private offset: number = 0
  private cachedUint8Memory: Uint8Array | null = null
  private cachedTextEncoder: TextEncoder = new TextEncoder()

  private encodeString(
    text: string,
    allocate: (size: number, align: number) => number,
    reallocate?: (ptr: number, oldSize: number, newSize: number, align: number) => number
  ): number {
    if (!reallocate) {
      const encoded = this.cachedTextEncoder.encode(text)
      const ptr = allocate(encoded.length, 1) >>> 0
      const memory = this.getCachedUint8Memory()
      memory.subarray(ptr, ptr + encoded.length).set(encoded)
      this.offset = encoded.length
      return ptr
    }

    const strLength = text.length
    let ptr = allocate(strLength, 1) >>> 0
    const memory = this.getCachedUint8Memory()
    let asciiLength = 0

    for (; asciiLength < strLength; asciiLength++) {
      const charCode = text.charCodeAt(asciiLength)
      if (charCode > 127) break
      memory[ptr + asciiLength] = charCode
    }

    if (asciiLength !== strLength) {
      if (asciiLength > 0) {
        text = text.slice(asciiLength)
      }
      
      ptr = reallocate(ptr, strLength, asciiLength + text.length * 3, 1) >>> 0
      
      const result = this.cachedTextEncoder.encodeInto(
        text,
        this.getCachedUint8Memory().subarray(ptr + asciiLength, ptr + asciiLength + text.length * 3)
      )
      asciiLength += result.written
      
      ptr = reallocate(ptr, asciiLength + text.length * 3, asciiLength, 1) >>> 0
    }

    this.offset = asciiLength
    return ptr
  }

  private getCachedUint8Memory(): Uint8Array {
    if (this.cachedUint8Memory === null || this.cachedUint8Memory.byteLength === 0) {
      this.cachedUint8Memory = new Uint8Array(this.wasmInstance.memory.buffer)
    }
    return this.cachedUint8Memory
  }

  public calculateHash(
    algorithm: string,
    challenge: string,
    salt: string,
    difficulty: number,
    expireAt: number
  ): number | undefined {
    if (algorithm !== 'DeepSeekHashV1') {
      throw new Error('Unsupported algorithm: ' + algorithm)
    }

    const prefix = `${salt}_${expireAt}_`

    const wasm = this.wasmInstance as any
    const stackPointerFn = wasm?.__wbindgen_add_to_stack_pointer
    if (!wasm || typeof stackPointerFn !== 'function') {
      throw new Error('DeepSeek WASM is not initialized correctly (__wbindgen_add_to_stack_pointer missing)')
    }

    let retptr = 0

    try {
      retptr = stackPointerFn(-16)

      const ptr0 = this.encodeString(
        challenge,
        wasm.__wbindgen_export_0,
        wasm.__wbindgen_export_1
      )
      const len0 = this.offset

      const ptr1 = this.encodeString(
        prefix,
        wasm.__wbindgen_export_0,
        wasm.__wbindgen_export_1
      )
      const len1 = this.offset

      wasm.wasm_solve(retptr, ptr0, len0, ptr1, len1, difficulty)

      const dataView = new DataView(wasm.memory.buffer)
      const status = dataView.getInt32(retptr + 0, true)
      const value = dataView.getFloat64(retptr + 8, true)

      if (status === 0)
        return undefined

      return value

    } finally {
      if (typeof stackPointerFn === 'function' && retptr !== 0) {
        stackPointerFn(16)
      }
    }
  }

  public async init(wasmPath: string): Promise<any> {
    const imports = { wbg: {} }
    const wasmBuffer = await fs.promises.readFile(wasmPath)
    const { instance } = await WebAssembly.instantiate(wasmBuffer, imports)
    this.wasmInstance = instance.exports
    return this.wasmInstance
  }
}

let deepSeekHashInstance: DeepSeekHash | null = null

function resolveWasmPath(): string {
  const candidates: string[] = []
  const electronApp = app as any
  const hasElectronApp = !!electronApp && typeof electronApp === 'object'
  const appPath = hasElectronApp && typeof electronApp.getAppPath === 'function'
    ? electronApp.getAppPath()
    : undefined

  if (hasElectronApp && electronApp.isPackaged && process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'sha3_wasm_bg.7b9ca65ddd.wasm'))
  }

  if (appPath) {
    candidates.push(path.join(appPath, 'sha3_wasm_bg.7b9ca65ddd.wasm'))
    candidates.push(path.join(appPath, '..', 'sha3_wasm_bg.7b9ca65ddd.wasm'))
  }

  candidates.push(path.join(process.cwd(), 'sha3_wasm_bg.7b9ca65ddd.wasm'))
  candidates.push(path.join(__dirname, '..', '..', '..', 'sha3_wasm_bg.7b9ca65ddd.wasm'))

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return candidates[candidates.length - 1]
}

export async function getDeepSeekHash(): Promise<DeepSeekHash> {
  if (!deepSeekHashInstance) {
    const instance = new DeepSeekHash()
    const wasmPath = resolveWasmPath()
    console.log('[DeepSeekHash] WASM path:', wasmPath)
    console.log('[DeepSeekHash] File exists:', fs.existsSync(wasmPath))
    try {
      await instance.init(wasmPath)
      deepSeekHashInstance = instance
      console.log('[DeepSeekHash] WASM initialized successfully')
    } catch (error) {
      deepSeekHashInstance = null
      console.error('[DeepSeekHash] WASM initialization failed:', error)
      throw error
    }
  }
  return deepSeekHashInstance
}

export default DeepSeekHash
