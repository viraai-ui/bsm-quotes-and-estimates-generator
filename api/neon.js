import pg from 'pg'

const { Pool } = pg

let pool

export function hasNeon() {
  return Boolean(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL)
}

export function getPool() {
  if (!pool) {
    const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 3 })
  }
  return pool
}

export async function ensureSchema(client) {
  await client.query(`
    create table if not exists app_settings (
      id text primary key default 'main',
      settings jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists documents (
      id text primary key,
      type text not null check (type in ('sales_quotation','quotation','estimate')),
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

    alter table documents drop constraint if exists documents_type_check;
    alter table documents add constraint documents_type_check check (type in ('sales_quotation','quotation','estimate'));

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
  `)
}

export async function readNeonState() {
  const db = getPool()
  const client = await db.connect()
  try {
    await ensureSchema(client)
    const settingsResult = await client.query(`select settings from app_settings where id='main'`)
    const docsResult = await client.query(`select document from documents where deleted_at is null order by updated_at desc, created_at desc`)
    return {
      settings: settingsResult.rows[0]?.settings || null,
      documents: docsResult.rows.map((row) => row.document),
    }
  } finally {
    client.release()
  }
}

function safeDoc(doc) {
  return {
    id: String(doc.id),
    type: doc.type === 'estimate' ? 'estimate' : doc.type === 'sales_quotation' ? 'sales_quotation' : 'quotation',
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

export async function writeNeonState(state, source = 'api') {
  const db = getPool()
  const client = await db.connect()
  try {
    await client.query('begin')
    await ensureSchema(client)
    const previous = await readNeonStateFromClient(client)
    await client.query(`insert into state_backups(state, source) values($1::jsonb, $2)`, [JSON.stringify(previous), source])
    await client.query(`
      insert into app_settings(id, settings, updated_at)
      values('main', $1::jsonb, now())
      on conflict(id) do update set settings=excluded.settings, updated_at=now()
    `, [JSON.stringify(state.settings || {})])

    const incomingIds = new Set()
    for (const raw of state.documents || []) {
      if (!raw?.id) continue
      const doc = safeDoc(raw)
      incomingIds.add(doc.id)
      const oldDoc = previous.documents.find((item) => item.id === doc.id) || null
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
      await client.query(`insert into audit_log(action, entity_type, entity_id, old_value, new_value) values($1, 'document', $2, $3::jsonb, $4::jsonb)`, [oldDoc ? 'upsert' : 'create', doc.id, oldDoc ? JSON.stringify(oldDoc) : null, JSON.stringify(raw)])
    }

    for (const oldDoc of previous.documents) {
      if (!incomingIds.has(oldDoc.id)) {
        await client.query(`update documents set deleted_at=coalesce(deleted_at, now()), updated_at=now() where id=$1`, [oldDoc.id])
        await client.query(`insert into audit_log(action, entity_type, entity_id, old_value) values('soft_delete', 'document', $1, $2::jsonb)`, [oldDoc.id, JSON.stringify(oldDoc)])
      }
    }

    await client.query(`insert into audit_log(action, entity_type, new_value) values('state_write', 'state', $1::jsonb)`, [JSON.stringify({ documents: state.documents?.length || 0, source })])
    await client.query('commit')
    return { ok: true }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

async function readNeonStateFromClient(client) {
  const settingsResult = await client.query(`select settings from app_settings where id='main'`)
  const docsResult = await client.query(`select document from documents where deleted_at is null order by updated_at desc, created_at desc`)
  return {
    settings: settingsResult.rows[0]?.settings || null,
    documents: docsResult.rows.map((row) => row.document),
  }
}
