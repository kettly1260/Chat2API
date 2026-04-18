#!/usr/bin/env node

const fs = require('fs')
const { execSync } = require('child_process')

function run(command) {
  return execSync(command, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}

function getStagedFiles() {
  const output = run('git diff --cached --name-only --diff-filter=ACMR')
  if (!output) return []
  return output
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean)
}

function getStagedAddedLines(filePath) {
  let diff = ''
  try {
    diff = run(`git diff --cached --unified=0 -- "${filePath}"`)
  } catch {
    return []
  }

  if (!diff) return []

  const added = []
  const lines = diff.split(/\r?\n/)
  let lineNumber = 0

  for (const raw of lines) {
    if (raw.startsWith('@@')) {
      const match = raw.match(/\+(\d+)(?:,(\d+))?/)
      lineNumber = match ? Number(match[1]) : 0
      continue
    }

    if (raw.startsWith('+++') || raw.startsWith('---')) {
      continue
    }

    if (raw.startsWith('+')) {
      const content = raw.slice(1)
      added.push({ lineNumber, content })
      lineNumber += 1
      continue
    }

    if (!raw.startsWith('-')) {
      lineNumber += 1
    }
  }

  return added
}

function isTextLike(filePath) {
  const binaryLike = [
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.7z',
    '.woff', '.woff2', '.ttf', '.eot', '.jar', '.wasm', '.exe', '.dll', '.so', '.dylib'
  ]
  const lower = filePath.toLowerCase()
  return !binaryLike.some((ext) => lower.endsWith(ext))
}

function loadIgnorePatterns() {
  const path = '.privacyignore'
  if (!fs.existsSync(path)) return []
  return fs
    .readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

function isIgnored(line, ignorePatterns) {
  return ignorePatterns.some((p) => line.includes(p))
}

function isPlaceholder(line) {
  return /(your[-_ ]?api[-_ ]?key|your[-_ ]?token|your[-_ ]?secret|example[-_ ]?key|dummy[-_ ]?key|test[-_ ]?key|placeholder)/i.test(
    line
  )
}

const checks = [
  { name: 'Private key block', regex: /-----BEGIN (RSA|OPENSSH|EC|DSA|PRIVATE) KEY-----/ },
  { name: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', regex: /\bghp_[A-Za-z0-9]{36}\b/ },
  { name: 'GitHub fine-grained token', regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { name: 'OpenAI key', regex: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: 'Bearer token assignment', regex: /(bearer|token|api[_-]?key|secret)\s*[:=]\s*["'][A-Za-z0-9_\-.]{12,}["']/i },
  { name: 'Password assignment', regex: /password\s*[:=]\s*["'][^"']{8,}["']/i }
]

function main() {
  const files = getStagedFiles().filter(isTextLike)
  const ignorePatterns = loadIgnorePatterns()

  if (files.length === 0) {
    process.exit(0)
  }

  const findings = []

  for (const file of files) {
    if (!fs.existsSync(file)) continue

    const addedLines = getStagedAddedLines(file)

    addedLines.forEach(({ lineNumber, content }) => {
      if (isIgnored(content, ignorePatterns) || isPlaceholder(content)) return
      for (const check of checks) {
        if (check.regex.test(content)) {
          findings.push({
            file,
            line: lineNumber || 1,
            check: check.name,
            content: content.slice(0, 220)
          })
          break
        }
      }
    })
  }

  if (findings.length > 0) {
    console.error('\n[privacy-check] Potential sensitive content detected in staged files:\n')
    findings.forEach((f) => {
      console.error(`- ${f.file}:${f.line} [${f.check}] ${f.content}`)
    })
    console.error('\nCommit blocked. Remove/redact sensitive values, or add safe false-positive patterns to .privacyignore.\n')
    process.exit(1)
  }

  process.exit(0)
}

main()
