const owner = 'viraai-ui'
const repo = 'bsm-quotes-and-estimates-generator'
const path = 'data/bsm-state.json'
const backupDir = 'data/backups'

const protectedCompany = {
  companyName: 'BSM India',
  address: 'Plot No. 1 At Khasra No. 64/10/3 And 64/11/1, Mundka Industrial Area, Near Prashant Dharam Kanta, Opposite Metro Pillar No. 583, West Delhi, Delhi - 110041',
  phone: '+91 9310423242',
  email: 'info@bsmindia.com',
  website: 'www.bsmindia.com',
  gstin: '07AACCB4067D1Z0',
}

const protectedBankDetails = 'A/c Name:  Build Scale Manufacture Pvt. Ltd.\nAccount No.: 015505006648\nIFSC: ICIC0000155\nBank Name: ICICI Bank\nBranch: Punjabi Bagh, Delhi\nType: Current Account'

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
  let decoded = ''
  if (data.content && data.encoding === 'base64') {
    decoded = Buffer.from(data.content, 'base64').toString('utf8')
  } else if (data.download_url) {
    const raw = await fetch(data.download_url, { headers: headers(token), cache: 'no-store' })
    if (!raw.ok) throw new Error(`GitHub raw read failed: ${raw.status}`)
    decoded = await raw.text()
  }
  if (!decoded) throw new Error('Cloud state file is empty or unreadable')
  return { state: JSON.parse(decoded), sha: data.sha }
}

function assertSafeState(state) {
  if (!state || typeof state !== 'object') throw new Error('Invalid state payload')
  const company = state.settings?.company || {}
  const bankDetails = state.settings?.quotationTemplate?.bankDetails || ''
  const logoImage = company.logoImage || ''
  const problems = []

  if (company.gstin !== protectedCompany.gstin) problems.push('protected GSTIN missing')
  if (company.address === 'Delhi, India' || !String(company.address || '').includes('Mundka Industrial Area')) problems.push('protected address missing')
  if (String(bankDetails).includes('Update in Settings') || !String(bankDetails).includes('ICICI Bank')) problems.push('protected bank details missing')
  if (!String(logoImage).startsWith('data:image/') || String(logoImage).length < 100000) problems.push('protected BSM logo missing')
  if (problems.length) throw new Error(`Unsafe state blocked: ${problems.join(', ')}`)
}

function protectState(nextState, current) {
  const currentSettings = current.state?.settings || {}
  const currentDocs = Array.isArray(current.state?.documents) ? current.state.documents : []
  const incomingDocs = Array.isArray(nextState.documents) ? nextState.documents : []
  const incomingSettings = nextState.settings || currentSettings
  const currentLogo = currentSettings.company?.logoImage

  const safeState = {
    settings: {
      ...incomingSettings,
      company: {
        ...(incomingSettings.company || {}),
        ...protectedCompany,
        logoText: 'BSM',
        logoImage: currentLogo || incomingSettings.company?.logoImage,
      },
      quotationTemplate: {
        ...(incomingSettings.quotationTemplate || {}),
        bankDetails: protectedBankDetails,
      },
    },
    documents: incomingDocs.length >= currentDocs.length ? incomingDocs : currentDocs,
  }

  assertSafeState(safeState)
  return safeState
}

async function writeGithubFile(token, targetPath, contentJson, sha, message) {
  const content = Buffer.from(JSON.stringify(contentJson, null, 2)).toString('base64')
  const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${targetPath}`, {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content, sha: sha || undefined }),
  })
  if (!r.ok) throw new Error(`GitHub write failed for ${targetPath}: ${r.status}`)
  return r.json()
}

async function writeBackup(token, state) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 23)
  const suffix = Math.random().toString(36).slice(2, 8)
  const backupPath = `${backupDir}/bsm-state-${stamp}-${suffix}.json`
  await writeGithubFile(token, backupPath, state, null, `Backup BSM dashboard cloud state ${stamp}`)
}

async function writeState(token, state) {
  const current = await readState(token)
  assertSafeState(current.state)
  await writeBackup(token, current.state)
  const safeState = protectState(state, current)
  await writeGithubFile(token, path, { ...safeState, updatedAt: new Date().toISOString() }, current.sha, 'Update BSM dashboard cloud state')
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
