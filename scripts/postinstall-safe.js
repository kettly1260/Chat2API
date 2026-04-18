#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

function tryRequire(moduleName) {
  try {
    return require(moduleName)
  } catch {
    return null
  }
}

async function main() {
  const electronBuilder = tryRequire('electron-builder')
  if (!electronBuilder) {
    console.warn('[postinstall] electron-builder is not available, skipping install-app-deps')
    process.exit(0)
  }

  const appBuilderBinPath = path.join(process.cwd(), 'node_modules', 'app-builder-bin')
  if (!fs.existsSync(appBuilderBinPath)) {
    console.warn('[postinstall] app-builder-bin is missing, skipping install-app-deps')
    process.exit(0)
  }

  const installAppDeps = tryRequire('electron-builder/out/cli/install-app-deps')
  if (installAppDeps && typeof installAppDeps.default === 'function') {
    await installAppDeps.default()
    return
  }

  if (typeof electronBuilder.installAppDeps === 'function') {
    await electronBuilder.installAppDeps()
    return
  }

  console.warn('[postinstall] Unable to invoke install-app-deps, skipping')
}

main().catch((error) => {
  console.warn('[postinstall] Non-fatal error while running install-app-deps:', error?.message || error)
  process.exit(0)
})
