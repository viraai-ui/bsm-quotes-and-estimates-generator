const ZOHO_API_BASE = process.env.ZOHO_API_BASE || 'https://www.zohoapis.in/inventory/v1'

function json(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

async function getAccessToken() {
  if (process.env.ZOHO_ACCESS_TOKEN) return process.env.ZOHO_ACCESS_TOKEN
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN
  const clientId = process.env.ZOHO_CLIENT_ID
  const clientSecret = process.env.ZOHO_CLIENT_SECRET
  if (!refreshToken || !clientId || !clientSecret) return null
  const params = new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' })
  const response = await fetch(`https://accounts.zoho.in/oauth/v2/token?${params.toString()}`, { method: 'POST' })
  const data = await response.json()
  return data.access_token || null
}

async function zohoFetch(pathname, searchParams) {
  const token = await getAccessToken()
  const organizationId = process.env.ZOHO_ORGANIZATION_ID || process.env.ZOHO_INVENTORY_ORG_ID
  if (!token || !organizationId) return { configured: false }
  const url = new URL(`${ZOHO_API_BASE}${pathname}`)
  url.searchParams.set('organization_id', organizationId)
  for (const [key, value] of Object.entries(searchParams || {})) {
    if (value) url.searchParams.set(key, value)
  }
  const response = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || `Zoho request failed: ${response.status}`)
  return { configured: true, data }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' })
  try {
    const url = new URL(req.url, 'https://local')
    const type = url.searchParams.get('type')
    const q = url.searchParams.get('q') || ''
    if (!q || q.length < 3) return json(res, 200, { configured: true, results: [] })

    if (type === 'customers') {
      const result = await zohoFetch('/contacts', { search_text: q, contact_type: 'customer', per_page: '10' })
      if (!result.configured) return json(res, 200, { configured: false, results: [] })
      const contacts = result.data.contacts || []
      return json(res, 200, { configured: true, results: contacts.map((c) => ({
        id: c.contact_id,
        name: c.contact_name || c.company_name || c.customer_name || '',
        company: c.company_name || c.contact_name || '',
        email: c.email || '',
        phone: c.phone || c.mobile || '',
        gstin: c.gst_no || c.gstin || '',
        address: [c.billing_address?.address, c.billing_address?.city, c.billing_address?.state].filter(Boolean).join(', '),
      })).filter((c) => c.name) })
    }

    if (type === 'items') {
      const result = await zohoFetch('/items', { search_text: q, per_page: '10' })
      if (!result.configured) return json(res, 200, { configured: false, results: [] })
      const items = result.data.items || []
      return json(res, 200, { configured: true, results: items.map((item) => ({
        id: item.item_id,
        name: item.name || item.item_name || '',
        description: item.description || '',
        price: Number(item.rate || item.sales_rate || 0),
        gst: Number(item.tax_percentage || item.gst_percentage || 18),
      })).filter((item) => item.name) })
    }

    return json(res, 400, { error: 'Invalid type' })
  } catch (error) {
    return json(res, 500, { error: error.message || 'Zoho Inventory lookup failed' })
  }
}
