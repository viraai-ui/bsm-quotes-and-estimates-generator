import test from 'node:test'
import assert from 'node:assert/strict'
import { isFallbackDataOnly, shouldIgnoreBuild } from '../scripts/vercel-ignore-build.mjs'

test('ignores only non-empty fallback state and backup changes', () => {
  assert.equal(isFallbackDataOnly(['data/bsm-state.json']), true)
  assert.equal(isFallbackDataOnly(['data/backups/bsm-state-old.json', 'data/bsm-state.json']), true)
  assert.equal(isFallbackDataOnly([]), false)
  assert.equal(isFallbackDataOnly(['src/App.tsx']), false)
  assert.equal(isFallbackDataOnly(['data/bsm-state.json', 'api/state.js']), false)
})

test('build check is fail-open when git context is absent or git fails', () => {
  assert.equal(shouldIgnoreBuild({ previousSha: '' }), false)
  assert.equal(shouldIgnoreBuild({ previousSha: 'old', run: () => ({ status: 128, stdout: '', error: null }) }), false)
  assert.equal(shouldIgnoreBuild({ previousSha: 'old', run: () => ({ status: null, stdout: '', error: new Error('git unavailable') }) }), false)
})

test('build check skips data-only diff and builds mixed diff', () => {
  assert.equal(shouldIgnoreBuild({ previousSha: 'old', run: () => ({ status: 0, stdout: 'data/bsm-state.json\n', error: null }) }), true)
  assert.equal(shouldIgnoreBuild({ previousSha: 'old', run: () => ({ status: 0, stdout: 'data/bsm-state.json\nsrc/App.tsx\n', error: null }) }), false)
})
