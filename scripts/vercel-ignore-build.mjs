#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const DATA_ONLY = /^(data\/bsm-state\.json|data\/backups\/[^/]+)$/

export function isFallbackDataOnly(paths) {
  return paths.length > 0 && paths.every((path) => DATA_ONLY.test(path))
}

export function shouldIgnoreBuild({ previousSha, currentSha = 'HEAD', run = spawnSync } = {}) {
  if (!previousSha) return false
  const result = run('git', ['diff', '--name-only', previousSha, currentSha], { encoding: 'utf8' })
  if (result.error || result.status !== 0) return false
  const paths = result.stdout.split(/\r?\n/).filter(Boolean)
  return isFallbackDataOnly(paths)
}

function main() {
  try {
    const ignore = shouldIgnoreBuild({
      previousSha: process.env.VERCEL_GIT_PREVIOUS_SHA || 'HEAD^',
      currentSha: process.env.VERCEL_GIT_COMMIT_SHA || 'HEAD',
    })
    if (ignore) console.log('Skipping build: only fallback state data changed.')
    else console.log('Building: source changed or change detection was unavailable.')
    process.exitCode = ignore ? 0 : 1
  } catch (error) {
    console.error('Building: ignore-build check failed open.', error)
    process.exitCode = 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
