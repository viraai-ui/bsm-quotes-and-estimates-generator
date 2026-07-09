const owner = 'viraai-ui'
const repo = 'bsm-quotes-and-estimates-generator'
const path = 'data/bsm-state.json'

const headers = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
})

function json(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

async function readState(token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`
  const r = await fetch(url, { headers: headers(token) })
  if (r.status === 404) return { state: { settings: null, documents: [] }, sha: null }
  if (!r.ok) throw new Error(`GitHub read failed: ${r.status}`)
  const data = await r.json()
  const decoded = Buffer.from(data.content || '', 'base64').toString('utf8')
  return { state: decoded ? JSON.parse(decoded) : { settings: null, documents: [] }, sha: data.sha }
}

async function writeState(token, state) {
  const current = await readState(token)
  const content = Buffer.from(JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2)).toString('base64')
  const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Update BSM dashboard cloud state',
      content,
      sha: current.sha || undefined,
    }),
  })
  if (!r.ok) throw new Error(`GitHub write failed: ${r.status}`)
  return { ok: true }
}

export default async function handler(req, res) {
  const token = process.env.BSM_STATE_GITHUB_TOKEN
  if (!token) return json(res, 500, { error: 'Cloud database is not configured' })

  try {
    if (req.method === 'GET') {
      const { state } = await readState(token)
      return json(res, 200, state)
    }

    if (req.method === 'PUT') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      if (!body || typeof body !== 'object') return json(res, 400, { error: 'Invalid state' })
      await writeState(token, { settings: body.settings || null, documents: Array.isArray(body.documents) ? body.documents : [] })
      return json(res, 200, { ok: true })
    }

    res.setHeader('Allow', 'GET, PUT')
    return json(res, 405, { error: 'Method not allowed' })
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : 'Unknown database error' })
  }
}
