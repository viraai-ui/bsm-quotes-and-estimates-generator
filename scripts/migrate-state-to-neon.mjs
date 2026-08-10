import fs from 'node:fs'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const connectionString = process.env.NEON_DATABASE_URL || fs.readFileSync('/tmp/bsm_quotes_neon_url.txt', 'utf8').trim()
const statePath = process.argv[2] || 'data/bsm-state.json'
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

const schema = `
create table if not exists app_settings (
  id text primary key default 'main',
  settings jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists documents (
  id text primary key,
  type text not null check (type in ('quotation','estimate')),
  number text not null,
  date text,
  customer text,
  company text,
  status text,
  totals jsonb not null default '{}'::jsonb,
  header_data jsonb not null default '{}'::jsonb,
  document jsonb not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_items (
  document_id text not null references documents(id) on delete cascade,
  item_id text not null,
  position integer not null,
  item jsonb not null,
  primary key (document_id, item_id)
);

create table if not exists audit_log (
  id bigserial primary key,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table if not exists state_backups (
  id bigserial primary key,
  state jsonb not null,
  source text not null default 'api',
  created_at timestamptz not null default now()
);

create index if not exists documents_type_idx on documents(type);
create index if not exists documents_number_idx on documents(number);
create index if not exists documents_updated_at_idx on documents(updated_at desc);
`

function safeDoc(doc) {
  return {
    id: String(doc.id),
    type: doc.type === 'estimate' ? 'estimate' : 'quotation',
    number: String(doc.number || ''),
    date: doc.date || null,
    customer: doc.customer || null,
    company: doc.company || null,
    status: doc.status || null,
    totals: doc.totals || {},
    headerData: doc.headerData || {},
    document: doc,
    createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date(),
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : new Date(),
  }
}

await client.connect()
try {
  await client.query('begin')
  await client.query(schema)
  await client.query(`insert into state_backups(state, source) values($1::jsonb, 'migration')`, [JSON.stringify(state)])
  await client.query(`
    insert into app_settings(id, settings, updated_at)
    values('main', $1::jsonb, now())
    on conflict(id) do update set settings = excluded.settings, updated_at = now()
  `, [JSON.stringify(state.settings || {})])

  for (const raw of state.documents || []) {
    if (!raw?.id) continue
    const doc = safeDoc(raw)
    await client.query(`
      insert into documents(id, type, number, date, customer, company, status, totals, header_data, document, created_at, updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12)
      on conflict(id) do update set
        type=excluded.type, number=excluded.number, date=excluded.date, customer=excluded.customer,
        company=excluded.company, status=excluded.status, totals=excluded.totals,
        header_data=excluded.header_data, document=excluded.document, updated_at=excluded.updated_at,
        deleted_at=null
    `, [doc.id, doc.type, doc.number, doc.date, doc.customer, doc.company, doc.status, JSON.stringify(doc.totals), JSON.stringify(doc.headerData), JSON.stringify(doc.document), doc.createdAt, doc.updatedAt])
    await client.query('delete from document_items where document_id=$1', [doc.id])
    for (const [index, item] of (raw.items || []).entries()) {
      await client.query(`insert into document_items(document_id, item_id, position, item) values($1,$2,$3,$4::jsonb)`, [doc.id, String(item.id || `${doc.id}-${index}`), index, JSON.stringify(item)])
    }
  }
  await client.query(`insert into audit_log(action, entity_type, new_value) values('migration', 'state', $1::jsonb)`, [JSON.stringify({ documents: state.documents?.length || 0 })])
  await client.query('commit')
  const count = await client.query('select count(*)::int as count from documents where deleted_at is null')
  console.log(JSON.stringify({ ok: true, documents: count.rows[0].count, settings: Boolean(state.settings) }))
} catch (error) {
  await client.query('rollback')
  throw error
} finally {
  await client.end()
}
