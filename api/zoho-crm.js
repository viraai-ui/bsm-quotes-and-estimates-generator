const ZOHO_CRM_API_BASE = process.env.ZOHO_CRM_API_BASE || 'https://www.zohoapis.in/crm/v8'
const ZOHO_ACCOUNTS_URL = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in'

function json(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

async function getAccessToken() {
  if (process.env.ZOHO_CRM_ACCESS_TOKEN) return process.env.ZOHO_CRM_ACCESS_TOKEN
  const refreshToken = process.env.ZOHO_CRM_REFRESH_TOKEN
  const clientId = process.env.ZOHO_CRM_CLIENT_ID || process.env.ZOHO_CLIENT_ID
  const clientSecret = process.env.ZOHO_CRM_CLIENT_SECRET || process.env.ZOHO_CLIENT_SECRET
  if (!refreshToken || !clientId || !clientSecret) return null

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  })
  const response = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token?${params.toString()}`, { method: 'POST' })
  const data = await response.json()
  if (!response.ok || !data.access_token) throw new Error(data.error || 'Zoho OAuth token refresh failed')
  return data.access_token
}

function firstValue(record, keys) {
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim()
  }
  return ''
}

export function mapAccount(account) {
  const name = firstValue(account, ['Account_Name', 'Company', 'Name'])
  const street = firstValue(account, ['Billing_Street', 'Address'])
  const city = firstValue(account, ['Billing_City', 'City'])
  const state = firstValue(account, ['Billing_State', 'State'])
  const code = firstValue(account, ['Billing_Code', 'Zip_Code', 'Postal_Code'])
  const country = firstValue(account, ['Billing_Country', 'Country'])
  return {
    id: String(account.id || name),
    name,
    gstin: firstValue(account, ['GSTIN', 'GST_No', 'GST_Number', 'GSTIN_Number', 'GST_Identification_Number']),
    address: [street, city, state, code, country].filter(Boolean).join(', '),
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' })

  try {
    const url = new URL(req.url, 'https://local')
    const q = (url.searchParams.get('q') || '').trim()
    if (q.length < 3) return json(res, 200, { configured: true, results: [] })

    const token = await getAccessToken()
    if (!token) return json(res, 200, { configured: false, results: [] })

    const zohoUrl = new URL(`${ZOHO_CRM_API_BASE}/Accounts/search`)
    zohoUrl.searchParams.set('word', q)
    zohoUrl.searchParams.set('per_page', '10')
    const response = await fetch(zohoUrl, {
      method: 'GET',
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })
    // Zoho returns 204 when a search has no matches.
    if (response.status === 204) return json(res, 200, { configured: true, results: [] })
    const data = await response.json()
    if (!response.ok) throw new Error(data?.message || `Zoho CRM request failed: ${response.status}`)

    const results = (Array.isArray(data?.data) ? data.data : []).map(mapAccount).filter((account) => account.name)
    return json(res, 200, { configured: true, results })
  } catch (error) {
    return json(res, 500, { error: error.message || 'Zoho CRM lookup failed' })
  }
}
