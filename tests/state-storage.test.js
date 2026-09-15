import test from 'node:test'
import assert from 'node:assert/strict'
import { createStateHandler } from '../api/state.js'

const logo = `data:image/png;base64,${'a'.repeat(100001)}`
const current = {
  settings: {
    company: { logoImage: logo, gstin: '07AACCB4067D1Z0', address: 'Mundka Industrial Area' },
    quotationTemplate: { bankDetails: 'ICICI Bank' },
  },
  documents: [{ id: 'old' }],
}

function request(method, body) {
  return { method, async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)) } }
}

function response() {
  return {
    headers: {}, statusCode: 0, body: '',
    setHeader(name, value) { this.headers[name] = value },
    end(value) { this.body = value },
  }
}

async function invoke(deps, method, body) {
  const res = response()
  await createStateHandler(deps)(request(method, body), res)
  return { status: res.statusCode, body: JSON.parse(res.body) }
}

test('Neon-configured PUT writes only protected Neon state without GitHub token or writes', async () => {
  let neonWrite
  let githubCalls = 0
  const result = await invoke({
    hasNeon: () => true,
    readNeonState: async () => current,
    writeNeonState: async (state, source) => { neonWrite = { state, source } },
    writeGithubState: async () => { githubCalls++ },
    getGithubToken: () => undefined,
  }, 'PUT', { settings: current.settings, documents: [{ id: 'old' }, { id: 'new' }] })

  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { ok: true })
  assert.equal(githubCalls, 0)
  assert.equal(neonWrite.source, 'api')
  assert.equal(neonWrite.state.documents.length, 2)
})

test('Neon-configured PUT fails without writing GitHub when Neon read or write fails', async () => {
  for (const failure of ['read', 'write']) {
    let githubCalls = 0
    const result = await invoke({
      hasNeon: () => true,
      readNeonState: async () => { if (failure === 'read') throw new Error('Neon unavailable'); return current },
      writeNeonState: async () => { throw new Error('Neon unavailable') },
      writeGithubState: async () => { githubCalls++ },
      getGithubToken: () => 'token',
    }, 'PUT', current)
    assert.equal(result.status, 500)
    assert.match(result.body.error, /Neon unavailable/)
    assert.equal(githubCalls, 0)
  }
})

test('unconfigured Neon PUT preserves ordered GitHub fallback', async () => {
  let written
  const result = await invoke({
    hasNeon: () => false,
    writeGithubState: async (token, state) => { written = { token, state } },
    getGithubToken: () => 'fallback-token',
  }, 'PUT', current)
  assert.equal(result.status, 200)
  assert.equal(written.token, 'fallback-token')
})

test('GET prefers Neon and safely falls back to GitHub after a Neon read failure', async () => {
  let githubReads = 0
  const oldError = console.error
  console.error = () => {}
  try {
    const result = await invoke({
      hasNeon: () => true,
      readNeonState: async () => { throw new Error('temporary outage') },
      readState: async () => { githubReads++; return { state: current } },
      getGithubToken: () => 'token',
    }, 'GET')
    assert.equal(result.status, 200)
    assert.equal(githubReads, 1)
    assert.deepEqual(result.body, current)
  } finally {
    console.error = oldError
  }
})
