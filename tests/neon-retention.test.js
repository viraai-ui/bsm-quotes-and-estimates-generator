import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AUDIT_LOG_LIMIT,
  STATE_BACKUP_LIMIT,
  documentAuditMetadata,
  pruneAuditLog,
  pruneStateBackups,
  writeDocumentAudit,
} from '../api/neon.js'

function queryCapture() {
  const calls = []
  return { calls, client: { query: async (...args) => { calls.push(args) } } }
}

test('state backup retention deletes everything except the latest three rows', async () => {
  const { calls, client } = queryCapture()
  await pruneStateBackups(client)
  assert.equal(STATE_BACKUP_LIMIT, 3)
  assert.match(calls[0][0], /delete from state_backups/i)
  assert.match(calls[0][0], /order by created_at desc, id desc limit \$1/i)
  assert.deepEqual(calls[0][1], [3])
})

test('document audits persist only compact metadata, never full docs or image data', async () => {
  const image = 'data:image/png;base64,RAW_IMAGE_PAYLOAD'
  const document = {
    id: 'doc-1', number: 'Q-001', type: 'quotation', status: 'draft',
    customer: 'Private customer', headerData: { logo: image }, items: [{ image, description: 'full item' }],
  }
  assert.deepEqual(documentAuditMetadata(document, 'api'), {
    number: 'Q-001', type: 'quotation', status: 'draft', source: 'api',
  })

  const { calls, client } = queryCapture()
  await writeDocumentAudit(client, 'upsert', document.id, document, { ...document, status: 'sent' }, 'api')
  const persistedValues = calls[0][1]
  assert.deepEqual(persistedValues.slice(0, 2), ['upsert', 'doc-1'])
  assert.deepEqual(JSON.parse(persistedValues[2]), { number: 'Q-001', type: 'quotation', status: 'draft', source: 'api' })
  assert.deepEqual(JSON.parse(persistedValues[3]), { number: 'Q-001', type: 'quotation', status: 'sent', source: 'api' })
  assert.doesNotMatch(JSON.stringify(persistedValues), /RAW_IMAGE_PAYLOAD|Private customer|full item/)
})

test('audit retention deletes oldest rows beyond the fixed 500-row bound', async () => {
  const { calls, client } = queryCapture()
  await pruneAuditLog(client)
  assert.equal(AUDIT_LOG_LIMIT, 500)
  assert.match(calls[0][0], /delete from audit_log/i)
  assert.match(calls[0][0], /order by created_at desc, id desc limit \$1/i)
  assert.deepEqual(calls[0][1], [500])
})
