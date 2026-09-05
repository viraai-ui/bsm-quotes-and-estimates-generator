import test from 'node:test'
import assert from 'node:assert/strict'
import handler, { mapAccount } from '../api/zoho-crm.js'
import { companySearchQuery, mergeSelectedCompany } from '../src/zohoCompany.ts'

function responseCapture() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name] = value },
    end(value) { this.body = value },
  }
}

async function invoke(url, method = 'GET') {
  const res = responseCapture()
  await handler({ method, url }, res)
  return { status: res.statusCode, body: JSON.parse(res.body) }
}

test('mapAccount maps CRM company, GSTIN and complete billing address', () => {
  assert.deepEqual(mapAccount({
    id: '42', Account_Name: 'Acme India', GSTIN: '07ABCDE1234F1Z5',
    Billing_Street: '1 Market Road', Billing_City: 'Delhi', Billing_State: 'Delhi',
    Billing_Code: '110001', Billing_Country: 'India',
  }), {
    id: '42', name: 'Acme India', gstin: '07ABCDE1234F1Z5',
    address: '1 Market Road, Delhi, Delhi, 110001, India',
  })
})

test('frontend starts searching at three trimmed characters', () => {
  assert.equal(companySearchQuery(' ab '), '')
  assert.equal(companySearchQuery(' acm '), 'acm')
})

test('frontend selection fills company, GSTIN and address while retaining unrelated manual fields', () => {
  const current = { company_name: 'Acm', customer_name: 'Manual Contact', phone: '123', gstin: '', address: '' }
  assert.deepEqual(mergeSelectedCompany(current, { id: '1', name: 'Acme Ltd', gstin: 'GST-1', address: 'Delhi' }), {
    company_name: 'Acme Ltd', customer_name: 'Manual Contact', phone: '123', gstin: 'GST-1', address: 'Delhi',
  })
  assert.deepEqual(mergeSelectedCompany({ ...current, gstin: 'Manual GST', address: 'Manual address' }, { id: '2', name: 'No CRM details' }), {
    company_name: 'No CRM details', customer_name: 'Manual Contact', phone: '123', gstin: 'Manual GST', address: 'Manual address',
  })
})

test('does not contact Zoho before three trimmed characters', async () => {
  const originalFetch = global.fetch
  global.fetch = () => { throw new Error('fetch must not be called') }
  try {
    assert.deepEqual(await invoke('/api/zoho-crm?q=%20ab%20'), {
      status: 200, body: { configured: true, results: [] },
    })
  } finally { global.fetch = originalFetch }
})

test('searches Accounts read-only and returns normalized suggestions', async () => {
  const originalFetch = global.fetch
  const originalToken = process.env.ZOHO_CRM_ACCESS_TOKEN
  process.env.ZOHO_CRM_ACCESS_TOKEN = 'test-token'
  let request
  global.fetch = async (url, options) => {
    request = { url: String(url), options }
    return { ok: true, status: 200, json: async () => ({ data: [{ id: '7', Account_Name: 'BSM Customer', GST_No: 'GST-7', Billing_Street: 'Park Street' }] }) }
  }
  try {
    const result = await invoke('/api/zoho-crm?q=BSM')
    assert.equal(result.status, 200)
    assert.deepEqual(result.body.results, [{ id: '7', name: 'BSM Customer', gstin: 'GST-7', address: 'Park Street' }])
    assert.equal(request.options.method, 'GET')
    assert.equal(request.options.headers.Authorization, 'Zoho-oauthtoken test-token')
    const zohoUrl = new URL(request.url)
    assert.equal(zohoUrl.pathname, '/crm/v8/Accounts/search')
    assert.equal(zohoUrl.searchParams.get('word'), 'BSM')
  } finally {
    global.fetch = originalFetch
    if (originalToken === undefined) delete process.env.ZOHO_CRM_ACCESS_TOKEN
    else process.env.ZOHO_CRM_ACCESS_TOKEN = originalToken
  }
})

test('rejects all write methods', async () => {
  const result = await invoke('/api/zoho-crm?q=Acme', 'POST')
  assert.deepEqual(result, { status: 405, body: { error: 'Method not allowed' } })
})
