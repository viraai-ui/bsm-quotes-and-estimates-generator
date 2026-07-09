import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import './App.css'
import './ai-polish.css'
import './settings-saas.css'
import './quote-flow.css'
import './quote-refine.css'
import './mobile-audit.css'

type FieldType = 'Text' | 'Number' | 'Date' | 'Dropdown' | 'Textarea' | 'Email' | 'Phone' | 'Image/File' | 'Checkbox'
type Status = 'Draft' | 'Generated' | 'Final' | 'Archived'

type FieldConfig = {
  id: string
  label: string
  key: string
  type: FieldType
  placeholder?: string
  defaultValue?: string
  mandatory: boolean
  visible: boolean
  showPdf: boolean
  showExcel: boolean
  sortOrder: number
  options?: string[]
}

type TemplateConfig = {
  headerText: string
  bodyText: string
  terms: string
  bankDetails: string
  footerText: string
  signatureText: string
}

type TaxSettings = {
  gstEnabled: boolean
  defaultGst: number
  rowLevelGst: boolean
  roundOff: boolean
  amountInWords: boolean
  discountEnabled: boolean
  extraChargesEnabled: boolean
}

type Settings = {
  company: Record<string, string>
  quotationFields: FieldConfig[]
  quotationLineFields: FieldConfig[]
  estimateFields: FieldConfig[]
  estimateCategories: EstimateCategory[]
  quotationTemplate: TemplateConfig
  estimateTemplate: TemplateConfig
  tax: TaxSettings
  numbering: { quotation: string; estimate: string; financialYear: string; nextQuotation: number; nextEstimate: number; padding: number; resetYearly: boolean }
}

type QuoteItem = {
  id: string
  image?: string
  imageName?: string
  productName: string
  description: string
  quantity: number
  price: number
  gst: number
}

type SavedDocument = {
  id: string
  type: 'quotation' | 'estimate'
  number: string
  date: string
  customer: string
  company?: string
  location?: string
  headerData: Record<string, string>
  items: QuoteItem[]
  totals: Totals
  status: Status
  createdBy: string
  createdAt: string
  updatedAt: string
  pdfGeneratedAt?: string
}

type Totals = { taxable: number; gst: number; grand: number; roundOff: number; final: number; words: string }
type EstimateCategory = { id: string; name: string; visible: boolean; gst: number; fields: string[]; formula: string }

const STORAGE_SETTINGS = 'bsm_quote_settings_v1'
const STORAGE_DOCS = 'bsm_quote_docs_v1'

const quotationFields: FieldConfig[] = [
  field('quotation_number', 'Quotation Number', 'Text', true, 'BSM/QTN/2026-27/0001'),
  field('quotation_date', 'Quotation Date', 'Date', true),
  field('valid_till', 'Valid Till', 'Date'),
  field('customer_name', 'Customer Name', 'Text', true),
  field('company_name', 'Company Name', 'Text'),
  field('phone', 'Phone Number', 'Phone', true),
  field('email', 'Email', 'Email'),
  field('address', 'Address', 'Textarea'),
  field('gstin', 'GSTIN', 'Text'),
  field('salesperson_name', 'Salesperson Name', 'Dropdown', false, 'Ainesh Sikdar', ['Ainesh Sikdar', 'Sales Team', 'Admin']),
  field('notes', 'Notes', 'Textarea'),
].map((f, index) => ({ ...f, sortOrder: index + 1 }))

const lineFields: FieldConfig[] = [
  field('serial', 'S.No.', 'Number', true),
  field('image', 'Product Picture', 'Image/File'),
  field('productName', 'Product Name', 'Text', true),
  field('description', 'Product Description', 'Textarea'),
  field('quantity', 'Quantity', 'Number', true, '1'),
  field('price', 'Price', 'Number', true, '0'),
  field('gst', 'GST %', 'Number', true, '18'),
  field('taxable', 'Taxable Amount', 'Number', false),
  field('gstAmount', 'GST Amount', 'Number', false),
  field('total', 'Total Amount', 'Number', false),
].map((f, index) => ({ ...f, sortOrder: index + 1 }))

const estimateFields: FieldConfig[] = [
  field('estimate_number', 'Estimate Number', 'Text', true, 'BSM/EST/2026-27/0001'),
  field('estimate_date', 'Estimate Date', 'Date', true),
  field('prepared_for', 'Prepared For / Customer / Project Name', 'Text', true),
  field('location', 'Location', 'Text'),
  field('prepared_by', 'Prepared By', 'Text', true, 'BSM India'),
  field('notes', 'Notes', 'Textarea'),
].map((f, index) => ({ ...f, sortOrder: index + 1 }))

function field(key: string, label: string, type: FieldType, mandatory = false, defaultValue = '', options?: string[]): FieldConfig {
  return { id: key, key, label, type, defaultValue, options, placeholder: label, mandatory, visible: true, showPdf: true, showExcel: true, sortOrder: 1 }
}

const defaultSettings: Settings = {
  company: {
    logoText: 'BSM', companyName: 'BSM India', address: 'Delhi, India', phone: '+91 XXXXX XXXXX', email: 'info@bsmindia.com', website: 'www.bsmindia.com', gstin: 'GSTIN to be updated', cin: '',
  },
  quotationFields,
  quotationLineFields: lineFields,
  estimateFields,
  estimateCategories: [
    { id: 'food', name: 'Food Expenses', visible: true, gst: 18, fields: ['Number of people', 'Number of days', 'Cost per person per day', 'GST %'], formula: 'People × Days × Cost per person' },
    { id: 'hotel', name: 'Hotel Expenses', visible: true, gst: 18, fields: ['Number of rooms', 'Number of nights', 'Cost per room per night', 'GST %'], formula: 'Rooms × Nights × Cost per room' },
    { id: 'transport', name: 'Transportation Expenses', visible: true, gst: 18, fields: ['Mode', 'From', 'To', 'Trips/Tickets', 'Rate', 'GST %'], formula: 'Trips × Rate' },
    { id: 'wage', name: 'Employee Per-Day Wage', visible: true, gst: 0, fields: ['Employees', 'Days', 'Per-day wage', 'GST %'], formula: 'Employees × Days × Wage' },
    { id: 'misc', name: 'Miscellaneous Expenses', visible: true, gst: 18, fields: ['Description', 'Quantity', 'Rate', 'GST %'], formula: 'Quantity × Rate' },
  ],
  quotationTemplate: {
    headerText: 'Quotation from {{company_name}}',
    bodyText: 'Dear {{customer_name}},\nPlease find below our quotation {{quotation_number}} dated {{quotation_date}}.\n\n{{quotation_items_table}}',
    terms: '1. Prices are valid till {{valid_till}}.\n2. GST will be charged as shown.\n3. Delivery and installation as mutually agreed.',
    bankDetails: 'Bank Name: Update in Settings\nAccount Name: BSM India\nAccount Number: Update\nIFSC: Update',
    footerText: 'Thank you for choosing BSM India.',
    signatureText: 'Authorized Signatory\nBSM India',
  },
  estimateTemplate: {
    headerText: 'Estimate from {{company_name}}', bodyText: '{{estimate_items_table}}\n{{category_wise_summary}}', terms: 'Internal/customer estimate. Values may change after final confirmation.', bankDetails: '', footerText: 'BSM India', signatureText: 'Prepared by BSM India',
  },
  tax: { gstEnabled: true, defaultGst: 18, rowLevelGst: true, roundOff: true, amountInWords: true, discountEnabled: false, extraChargesEnabled: false },
  numbering: { quotation: 'BSM/QTN/{{financial_year}}/{{number}}', estimate: 'BSM/EST/{{financial_year}}/{{number}}', financialYear: '2026-27', nextQuotation: 1, nextEstimate: 1, padding: 4, resetYearly: true },
}

function App() {
  const [active, setActive] = useState('quotation')
  const [settings, setSettings] = usePersistentState<Settings>(STORAGE_SETTINGS, defaultSettings)
  const [documents, setDocuments] = usePersistentState<SavedDocument[]>(STORAGE_DOCS, [])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [quoteData, setQuoteData] = useState<Record<string, string>>(() => makeDefaults(defaultSettings.quotationFields))
  const [items, setItems] = useState<QuoteItem[]>([newItem(defaultSettings.tax.defaultGst)])
  const [docTab, setDocTab] = useState<'quotation' | 'estimate'>('quotation')
  const totals = useMemo(() => computeTotals(items, settings.tax), [items, settings.tax])
  const visibleQuoteFields = settings.quotationFields.filter((f) => f.visible && f.key !== 'notes' && f.key !== 'salesperson_name').sort((a, b) => a.sortOrder - b.sortOrder)

  useEffect(() => {
    setQuoteData((current) => ({ ...makeDefaults(settings.quotationFields), ...current }))
  }, [settings.quotationFields])

  const nav = [['quotation', 'Create Quotation'], ['estimate', 'Create Estimate'], ['documents', 'Created Documents'], ['settings', 'Settings']]

  function saveQuotation(status: Status = 'Generated') {
    const number = quoteData.quotation_number || nextNumber(settings.numbering.quotation, settings.numbering.financialYear, settings.numbering.nextQuotation, settings.numbering.padding)
    const now = new Date().toISOString()
    const doc: SavedDocument = {
      id: editingId || crypto.randomUUID(), type: 'quotation', number, date: quoteData.quotation_date || today(), customer: quoteData.customer_name || 'Customer', company: quoteData.company_name, headerData: { ...quoteData, quotation_number: number }, items, totals, status, createdBy: quoteData.salesperson_name || 'Admin', createdAt: now, updatedAt: now,
    }
    setDocuments((docs) => editingId ? docs.map((d) => d.id === editingId ? { ...doc, createdAt: d.createdAt, updatedAt: now } : d) : [doc, ...docs])
    setQuoteData((d) => ({ ...d, quotation_number: number }))
    return doc
  }

  function generatePdf() {
    const doc = saveQuotation('Generated')
    downloadQuotationPdf(doc, settings)
    setDocuments((docs) => docs.map((d) => d.id === doc.id ? { ...d, pdfGeneratedAt: new Date().toISOString(), status: 'Generated' } : d))
  }

  function generateExcel(doc = saveQuotation('Generated')) {
    downloadExcel(doc, settings)
  }

  function editDocument(doc: SavedDocument) {
    setEditingId(doc.id)
    setQuoteData(doc.headerData)
    setItems(doc.items.length ? doc.items : [newItem(settings.tax.defaultGst)])
    setActive(doc.type === 'quotation' ? 'quotation' : 'estimate')
  }

  function duplicateDocument(doc: SavedDocument) {
    setEditingId(null)
    setQuoteData({ ...doc.headerData, quotation_number: nextNumber(settings.numbering.quotation, settings.numbering.financialYear, settings.numbering.nextQuotation + 1, settings.numbering.padding) })
    setItems(doc.items.map((i) => ({ ...i, id: crypto.randomUUID() })))
    setActive('quotation')
  }

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="logo-block"><div className="logo">{settings.company.logoText || 'BSM'}</div><div><strong>{settings.company.companyName}</strong><span>Quote Studio</span></div></div>
        <nav>{nav.map(([key, label]) => <button key={key} className={active === key ? 'active' : ''} onClick={() => setActive(key)}>{label}</button>)}</nav>
      </aside>
      <section className="workspace">
        <header className="topbar"><div><h1>{nav.find(([key]) => key === active)?.[1]}</h1></div>{active !== 'quotation' && <div className="header-actions"><button className="ghost" onClick={() => saveQuotation('Draft')}>Save Draft</button><button className="primary" onClick={generatePdf}>Generate PDF</button></div>}</header>

        {active === 'quotation' && <div className="page-grid quote-flow">
          <section className="panel wide"><div className="section-title"><div><h2>Step 1. Quotation details</h2></div></div><DynamicForm fields={visibleQuoteFields} data={quoteData} setData={setQuoteData} /></section>
          <LineItemsPanel items={items} setItems={setItems} settings={settings} />
          <SummaryCard totals={totals} settings={settings} onPdf={generatePdf} onExcel={() => generateExcel()} />
        </div>}

        {active === 'estimate' && <EstimateView settings={settings} totals={totals} items={items} setItems={setItems} />}
        {active === 'documents' && <DocumentsView documents={documents} tab={docTab} setTab={setDocTab} onEdit={editDocument} onDuplicate={duplicateDocument} onPdf={(d) => downloadQuotationPdf(d, settings)} onExcel={(d) => downloadExcel(d, settings)} onArchive={(id) => setDocuments((docs) => docs.map((d) => d.id === id ? { ...d, status: 'Archived' } : d))} />}
        {active === 'settings' && <SettingsView settings={settings} setSettings={setSettings} />}
      </section>
    </main>
  )
}

function DynamicForm({ fields, data, setData }: { fields: FieldConfig[]; data: Record<string, string>; setData: (fn: (d: Record<string, string>) => Record<string, string>) => void }) {
  const quoteLayout = fields.some((field) => field.key === 'quotation_number')
  if (quoteLayout) {
    const leftKeys = ['company_name', 'customer_name', 'phone', 'email', 'address', 'gstin']
    const rightKeys = ['quotation_number', 'quotation_date', 'valid_till']
    const renderField = (field: FieldConfig) => <FormField key={field.id} field={field} data={data} setData={setData} />
    return <div className="quotation-form-layout"><div className="quotation-form-stack">{leftKeys.map((key) => fields.find((field) => field.key === key)).filter(Boolean).map((field) => renderField(field as FieldConfig))}</div><div className="quotation-form-stack compact-side">{rightKeys.map((key) => fields.find((field) => field.key === key)).filter(Boolean).map((field) => renderField(field as FieldConfig))}</div></div>
  }
  return <div className="form-grid">{fields.map((field) => <FormField key={field.id} field={field} data={data} setData={setData} />)}</div>
}

function FormField({ field, data, setData }: { field: FieldConfig; data: Record<string, string>; setData: (fn: (d: Record<string, string>) => Record<string, string>) => void }) {
  return <label className={field.type === 'Textarea' ? 'span-2' : ''}><span>{field.label}{field.mandatory ? ' *' : ''}</span>{field.type === 'Textarea' ? <textarea value={data[field.key] || ''} placeholder={field.placeholder} onChange={(e) => setData((d) => ({ ...d, [field.key]: e.target.value }))} /> : field.type === 'Dropdown' ? <select value={data[field.key] || ''} onChange={(e) => setData((d) => ({ ...d, [field.key]: e.target.value }))}>{(field.options || ['Option']).map((o) => <option key={o}>{o}</option>)}</select> : <input value={data[field.key] || ''} type={inputType(field.type)} placeholder={field.placeholder} onChange={(e) => setData((d) => ({ ...d, [field.key]: e.target.value }))} />}</label>
}

function SummaryCard({ totals, settings, onPdf, onExcel }: { totals: Totals; settings: Settings; onPdf: () => void; onExcel: () => void }) {
  return <section className="panel summary-card final-step"><div className="section-title"><div><h2>Step 3. Review & generate</h2></div></div><h2>{money(totals.final)}</h2><div className="summary-grid"><div className="total-row"><span>Taxable Amount</span><strong>{money(totals.taxable)}</strong></div><div className="total-row"><span>Total GST</span><strong>{settings.tax.gstEnabled ? money(totals.gst) : 'Disabled'}</strong></div><div className="total-row"><span>Grand Total</span><strong>{money(totals.grand)}</strong></div><div className="total-row"><span>Round Off</span><strong>{settings.tax.roundOff ? money(totals.roundOff) : 'Disabled'}</strong></div><div className="total-row grand"><span>Final Amount</span><strong>{money(totals.final)}</strong></div></div>{settings.tax.amountInWords && <p className="amount-words">{totals.words}</p>}<div className="stack-actions"><button className="ghost full" onClick={onExcel}>Download Excel</button><button className="primary full" onClick={onPdf}>Generate PDF</button></div></section>
}

function LineItemsPanel({ items, setItems, settings }: { items: QuoteItem[]; setItems: React.Dispatch<React.SetStateAction<QuoteItem[]>>; settings: Settings }) {
  const addItem = () => setItems((rows) => [...rows, newItem(settings.tax.defaultGst)])
  const update = (id: string, patch: Partial<QuoteItem>) => setItems((rows) => rows.map((r) => r.id === id ? { ...r, ...patch } : r))
  const remove = (id: string) => setItems((rows) => rows.filter((r) => r.id !== id))
  async function onImage(id: string, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const image = await compressImage(file)
    update(id, { image, imageName: file.name })
  }
  return <section className="panel line-panel wide"><div className="section-title"><div><h2>Step 2. Product line items</h2></div></div><div className="line-table"><div className="line-head"><span>Picture</span><span>Product</span><span>Qty</span><span>Price</span><span>GST %</span><span>Total</span><span></span></div>{items.map((item) => { const taxable = item.quantity * item.price; const total = taxable + (settings.tax.gstEnabled ? taxable * ((settings.tax.rowLevelGst ? item.gst : settings.tax.defaultGst) / 100) : 0); return <div className="line-row" key={item.id}><div className="image-cell">{item.image ? <img src={item.image} alt={item.productName || 'Product'} /> : <span>No image</span>}<label className="mini-upload">{item.image ? 'Replace' : 'Upload / Camera'}<input type="file" accept="image/*" capture="environment" onChange={(e) => onImage(item.id, e)} /></label>{item.image && <button className="text-danger" onClick={() => update(item.id, { image: undefined, imageName: undefined })}>Remove</button>}</div><div className="product-inputs stacked"><input value={item.productName} onChange={(e) => update(item.id, { productName: e.target.value })} placeholder="Product name" /><textarea value={item.description} onChange={(e) => update(item.id, { description: e.target.value })} placeholder="Description" /></div><input type="number" value={item.quantity} onChange={(e) => update(item.id, { quantity: Number(e.target.value) })} /><input type="number" value={item.price} onChange={(e) => update(item.id, { price: Number(e.target.value) })} /><input type="number" value={item.gst} disabled={!settings.tax.rowLevelGst} onChange={(e) => update(item.id, { gst: Number(e.target.value) })} /><strong>{money(total)}</strong><button className="icon-button delete-row" aria-label="Delete row" title="Delete row" onClick={() => remove(item.id)}>🗑</button></div>})}</div><div className="line-footer-actions"><button className="ghost" onClick={addItem}>+ Add item</button></div></section>
}

function DocumentsView({ documents, tab, setTab, onEdit, onDuplicate, onPdf, onExcel, onArchive }: { documents: SavedDocument[]; tab: 'quotation' | 'estimate'; setTab: (t: 'quotation' | 'estimate') => void; onEdit: (d: SavedDocument) => void; onDuplicate: (d: SavedDocument) => void; onPdf: (d: SavedDocument) => void; onExcel: (d: SavedDocument) => void; onArchive: (id: string) => void }) {
  const [search, setSearch] = useState('')
  const docs = documents.filter((d) => d.type === tab && JSON.stringify(d).toLowerCase().includes(search.toLowerCase()))
  return <section className="panel"><div className="section-title"><div><p className="kicker">Saved database records</p><h2>Created Documents</h2></div><input className="search" placeholder="Search number, customer, project, status..." value={search} onChange={(e) => setSearch(e.target.value)} /></div><div className="tabbar"><button className={tab === 'quotation' ? 'active' : ''} onClick={() => setTab('quotation')}>Created Quotations</button><button className={tab === 'estimate' ? 'active' : ''} onClick={() => setTab('estimate')}>Created Estimates</button></div><div className="records">{docs.length === 0 && <div className="empty">No saved {tab}s yet. Generate one from Create Quotation.</div>}{docs.map((doc) => <article key={doc.id} className="record-card"><div><strong>{doc.number}</strong><span>{doc.customer} {doc.company ? `• ${doc.company}` : ''}</span></div><div><strong>{money(doc.totals.final)}</strong><span>{doc.date}</span></div><span className="status">{doc.status}</span><div className="mini-actions"><button onClick={() => onEdit(doc)}>Edit</button><button onClick={() => onDuplicate(doc)}>Duplicate</button><button onClick={() => onPdf(doc)}>PDF</button><button onClick={() => onExcel(doc)}>Excel</button><button onClick={() => onArchive(doc.id)}>Archive</button></div><small>Created by {doc.createdBy} • Created {formatDate(doc.createdAt)} • Edited {formatDate(doc.updatedAt)}</small></article>)}</div></section>
}

function EstimateView({ settings, totals, items, setItems }: { settings: Settings; totals: Totals; items: QuoteItem[]; setItems: React.Dispatch<React.SetStateAction<QuoteItem[]>> }) {
  return <div className="page-grid"><section className="panel wide"><div className="section-title"><div><p className="kicker">Phase 1 foundation</p><h2>Estimate header + categories</h2></div><span className="pill">Same PDF/Excel structure</span></div><DynamicForm fields={settings.estimateFields.filter((f) => f.visible)} data={{}} setData={() => {}} /><div className="estimate-layout">{settings.estimateCategories.filter((c) => c.visible).map((category) => <article className="category-card" key={category.id}><strong>{category.name}</strong><small>{category.formula}</small><small>Fields: {category.fields.join(', ')}</small></article>)}</div></section><SummaryCard totals={totals} settings={settings} onPdf={() => alert('Estimate PDF engine is structured for Phase 1 next step.')} onExcel={() => alert('Estimate Excel engine is structured for Phase 1 next step.')} /><LineItemsPanel items={items} setItems={setItems} settings={settings} /></div>
}

function SettingsView({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) {
  const [section, setSection] = useState('company')
  const sections = [
    ['company', 'Company Profile', 'Logo, contact and GST details'],
    ['quote-fields', 'Quotation Fields', 'Header form configuration'],
    ['quote-items', 'Line Items', 'Product table columns'],
    ['quote-template', 'Quotation Template', 'PDF letter editor'],
    ['estimate-fields', 'Estimate Fields', 'Estimate form configuration'],
    ['estimate-categories', 'Estimate Categories', 'Expense category builder'],
    ['estimate-template', 'Estimate Template', 'Estimate PDF editor'],
    ['tax', 'Tax & Calculation', 'GST, round off and words'],
    ['numbering', 'Numbering', 'Document formats'],
    ['bank', 'Bank & Signature', 'Payment and sign-off'],
  ]
  return <div className="settings-saas">
    <aside className="settings-menu">
      <p className="kicker">Admin console</p>
      <h2>Settings</h2>
      <div className="settings-menu-list">{sections.map(([key, label, desc]) => <button key={key} className={section === key ? 'active' : ''} onClick={() => setSection(key)}><strong>{label}</strong><span>{desc}</span></button>)}</div>
    </aside>
    <section className="settings-content">
      <div className="settings-content-head"><div><p className="kicker">Backend configuration</p><h2>{sections.find(([key]) => key === section)?.[1]}</h2></div><span className="pill">Auto-saved locally</span></div>
      {section === 'company' && <CompanySettings settings={settings} setSettings={setSettings} />}
      {section === 'quote-fields' && <FieldSettings title="Quotation Field Settings" fields={settings.quotationFields} onChange={(quotationFields) => setSettings((s) => ({ ...s, quotationFields }))} />}
      {section === 'quote-items' && <FieldSettings title="Quotation Line Item Settings" fields={settings.quotationLineFields} onChange={(quotationLineFields) => setSettings((s) => ({ ...s, quotationLineFields }))} />}
      {section === 'quote-template' && <TemplateEditor title="Quotation Template Editor" template={settings.quotationTemplate} onChange={(quotationTemplate) => setSettings((s) => ({ ...s, quotationTemplate }))} />}
      {section === 'estimate-fields' && <FieldSettings title="Estimate Field Settings" fields={settings.estimateFields} onChange={(estimateFields) => setSettings((s) => ({ ...s, estimateFields }))} />}
      {section === 'estimate-categories' && <EstimateCategorySettings settings={settings} setSettings={setSettings} />}
      {section === 'estimate-template' && <TemplateEditor title="Estimate Template Editor" template={settings.estimateTemplate} onChange={(estimateTemplate) => setSettings((s) => ({ ...s, estimateTemplate }))} />}
      {section === 'tax' && <TaxSettingsPanel settings={settings} setSettings={setSettings} />}
      {section === 'numbering' && <NumberingSettings settings={settings} setSettings={setSettings} />}
      {section === 'bank' && <BankSignatureSettings settings={settings} setSettings={setSettings} />}
    </section>
  </div>
}

function CompanySettings({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) {
  const keys = ['logoText', 'companyName', 'address', 'phone', 'email', 'website', 'gstin', 'cin']
  return <section className="panel settings-card"><p className="kicker">Company Profile Settings</p><h2>Company Profile</h2><div className="compact-form">{keys.map((k) => <label key={k}><span>{labelize(k)}</span><input value={settings.company[k] || ''} onChange={(e) => setSettings((s) => ({ ...s, company: { ...s.company, [k]: e.target.value } }))} /></label>)}</div></section>
}

function FieldSettings({ title, fields, onChange }: { title: string; fields: FieldConfig[]; onChange: (f: FieldConfig[]) => void }) {
  const update = (id: string, patch: Partial<FieldConfig>) => onChange(fields.map((f) => f.id === id ? { ...f, ...patch } : f))
  const add = () => onChange([...fields, { ...field(`custom_${Date.now()}`, 'New Custom Field', 'Text'), id: crypto.randomUUID(), sortOrder: fields.length + 1 }])
  return <section className="panel settings-card field-settings-panel"><div className="section-title"><div><p className="kicker">Admin configurable</p><h2>{title}</h2></div><button className="ghost" onClick={add}>+ Add field</button></div><div className="field-settings-table"><div className="field-settings-head"><span>Field</span><span>Type</span><span>Order</span><span>Visibility</span></div>{fields.map((f) => <article key={f.id} className={`field-config-row ${!f.visible ? 'muted-row' : ''}`}><input className="field-label-input" value={f.label} onChange={(e) => update(f.id, { label: e.target.value })} /><select value={f.type} onChange={(e) => update(f.id, { type: e.target.value as FieldType })}>{['Text','Number','Date','Dropdown','Textarea','Email','Phone','Image/File','Checkbox'].map((t) => <option key={t}>{t}</option>)}</select><input className="order-input" type="number" value={f.sortOrder} onChange={(e) => update(f.id, { sortOrder: Number(e.target.value) })} /><div className="settings-switches"><Toggle label="Visible" value={f.visible} onChange={(visible) => update(f.id, { visible })} /><Toggle label="Required" value={f.mandatory} onChange={(mandatory) => update(f.id, { mandatory })} /><Toggle label="PDF" value={f.showPdf} onChange={(showPdf) => update(f.id, { showPdf })} /><Toggle label="Excel" value={f.showExcel} onChange={(showExcel) => update(f.id, { showExcel })} /></div></article>)}</div></section>
}

function TemplateEditor({ title, template, onChange }: { title: string; template: TemplateConfig; onChange: (t: TemplateConfig) => void }) {
  const placeholders = ['{{quotation_number}}','{{quotation_date}}','{{valid_till}}','{{customer_name}}','{{company_name}}','{{quotation_items_table}}','{{taxable_amount}}','{{total_gst}}','{{grand_total}}','{{amount_in_words}}','{{terms_and_conditions}}','{{bank_details}}','{{signature}}','{{company_logo}}']
  const update = (key: keyof TemplateConfig, value: string) => onChange({ ...template, [key]: value })
  return <section className="panel settings-card template-editor"><p className="kicker">Editable PDF letter format</p><h2>{title}</h2><div className="placeholder-strip">{placeholders.map((p) => <code key={p}>{p}</code>)}</div>{(['headerText','bodyText','terms','bankDetails','signatureText','footerText'] as (keyof TemplateConfig)[]).map((key) => <label key={key}><span>{labelize(key)}</span><textarea value={template[key]} onChange={(e) => update(key, e.target.value)} /></label>)}</section>
}

function TaxSettingsPanel({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) {
  const tax = settings.tax
  const update = (patch: Partial<TaxSettings>) => setSettings((s) => ({ ...s, tax: { ...s.tax, ...patch } }))
  return <section className="panel settings-card"><p className="kicker">Tax & Calculation Settings</p><h2>Simple GST only</h2><div className="config-list"><Toggle label="Enable GST" value={tax.gstEnabled} onChange={(v) => update({ gstEnabled: v })} /><label><span>Default GST %</span><input type="number" value={tax.defaultGst} onChange={(e) => update({ defaultGst: Number(e.target.value) })} /></label><Toggle label="Allow row-level GST" value={tax.rowLevelGst} onChange={(v) => update({ rowLevelGst: v })} /><Toggle label="Enable round off" value={tax.roundOff} onChange={(v) => update({ roundOff: v })} /><Toggle label="Show amount in words" value={tax.amountInWords} onChange={(v) => update({ amountInWords: v })} /><Toggle label="Enable discount" value={tax.discountEnabled} onChange={(v) => update({ discountEnabled: v })} /><Toggle label="Enable extra charges" value={tax.extraChargesEnabled} onChange={(v) => update({ extraChargesEnabled: v })} /></div><p className="helper">CGST, SGST and IGST are intentionally not added in Phase 1.</p></section>
}

function NumberingSettings({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) {
  const n = settings.numbering
  const update = (patch: Partial<typeof n>) => setSettings((s) => ({ ...s, numbering: { ...s.numbering, ...patch } }))
  return <section className="panel settings-card"><p className="kicker">Numbering Settings</p><h2>Document numbering</h2><div className="compact-form"><label><span>Quotation format</span><input value={n.quotation} onChange={(e) => update({ quotation: e.target.value })} /></label><label><span>Estimate format</span><input value={n.estimate} onChange={(e) => update({ estimate: e.target.value })} /></label><label><span>Financial year</span><input value={n.financialYear} onChange={(e) => update({ financialYear: e.target.value })} /></label><label><span>Number padding</span><input type="number" value={n.padding} onChange={(e) => update({ padding: Number(e.target.value) })} /></label><Toggle label="Reset yearly" value={n.resetYearly} onChange={(v) => update({ resetYearly: v })} /></div></section>
}

function BankSignatureSettings({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) {
  return <section className="panel settings-card"><p className="kicker">Bank + Signature / Stamp Upload</p><h2>PDF placeholders</h2><label><span>Bank details</span><textarea value={settings.quotationTemplate.bankDetails} onChange={(e) => setSettings((s) => ({ ...s, quotationTemplate: { ...s.quotationTemplate, bankDetails: e.target.value } }))} /></label><label><span>Signature / Stamp text</span><textarea value={settings.quotationTemplate.signatureText} onChange={(e) => setSettings((s) => ({ ...s, quotationTemplate: { ...s.quotationTemplate, signatureText: e.target.value } }))} /></label><p className="helper">Image upload for signature/stamp is reserved in structure; PDF currently uses editable signature text placeholder.</p></section>
}

function EstimateCategorySettings({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) {
  const update = (id: string, patch: Partial<EstimateCategory>) => setSettings((s) => ({ ...s, estimateCategories: s.estimateCategories.map((c) => c.id === id ? { ...c, ...patch } : c) }))
  return <section className="panel settings-card"><div className="section-title"><div><p className="kicker">Estimate Category Settings</p><h2>Categories</h2></div><button className="ghost" onClick={() => setSettings((s) => ({ ...s, estimateCategories: [...s.estimateCategories, { id: crypto.randomUUID(), name: 'New Category', visible: true, gst: s.tax.defaultGst, fields: ['Quantity', 'Rate'], formula: 'Quantity × Rate' }] }))}>+ Add category</button></div><div className="field-list">{settings.estimateCategories.map((c) => <article key={c.id}><div className="settings-row-main"><input value={c.name} onChange={(e) => update(c.id, { name: e.target.value })} /><input value={c.formula} onChange={(e) => update(c.id, { formula: e.target.value })} /><input type="number" value={c.gst} onChange={(e) => update(c.id, { gst: Number(e.target.value) })} /></div><Toggle label="Visible" value={c.visible} onChange={(visible) => update(c.id, { visible })} /></article>)}</div></section>
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <label className="toggle"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>
}

function downloadQuotationPdf(doc: SavedDocument, settings: Settings) {
  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageWidth = pdf.internal.pageSize.getWidth()
  pdf.setFillColor(215, 25, 32); pdf.rect(0, 0, pageWidth, 18, 'F')
  pdf.setTextColor(255, 255, 255); pdf.setFontSize(18); pdf.setFont('helvetica', 'bold'); pdf.text(settings.company.logoText || 'BSM', 14, 12)
  pdf.setFontSize(10); pdf.text(settings.company.companyName, pageWidth - 14, 8, { align: 'right' }); pdf.text(settings.company.phone || '', pageWidth - 14, 13, { align: 'right' })
  pdf.setTextColor(17, 24, 39); pdf.setFontSize(20); pdf.text('QUOTATION', 14, 30)
  pdf.setFontSize(10); pdf.text(`Quotation No: ${doc.number}`, 14, 38); pdf.text(`Date: ${doc.date}`, pageWidth - 14, 38, { align: 'right' })
  const customerLines = [`Customer: ${doc.headerData.customer_name || ''}`, `Company: ${doc.headerData.company_name || ''}`, `Phone: ${doc.headerData.phone || ''}`, `Email: ${doc.headerData.email || ''}`, `GSTIN: ${doc.headerData.gstin || ''}`]
  pdf.setFillColor(248, 249, 251); pdf.roundedRect(14, 44, pageWidth - 28, 32, 3, 3, 'F')
  customerLines.forEach((line, i) => pdf.text(line, 18, 52 + i * 5))
  autoTable(pdf, { startY: 84, head: [['#', 'Picture', 'Product', 'Qty', 'Price', 'GST %', 'Total']], body: doc.items.map((item, i) => [String(i + 1), item.image ? 'Image attached' : '-', `${item.productName}${item.description ? `\n${item.description}` : ''}`, item.quantity, moneyPlain(item.price), item.gst, moneyPlain(item.quantity * item.price * (1 + item.gst / 100))]), styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [17, 24, 39] }, columnStyles: { 2: { cellWidth: 68 } }, didDrawCell: (data) => { if (data.section === 'body' && data.column.index === 1) { const item = doc.items[data.row.index]; if (item?.image) { try { pdf.addImage(item.image, 'JPEG', data.cell.x + 2, data.cell.y + 2, 12, 12) } catch { /* ignore invalid image */ } } } } })
  const y = (pdf as any).lastAutoTable.finalY + 8
  pdf.setFontSize(10); pdf.text(`Taxable Amount: ${moneyPlain(doc.totals.taxable)}`, pageWidth - 14, y, { align: 'right' }); pdf.text(`Total GST: ${moneyPlain(doc.totals.gst)}`, pageWidth - 14, y + 6, { align: 'right' }); pdf.setFont('helvetica', 'bold'); pdf.text(`Final Amount: ${moneyPlain(doc.totals.final)}`, pageWidth - 14, y + 12, { align: 'right' }); pdf.setFont('helvetica', 'normal')
  if (settings.tax.amountInWords) pdf.text(`Amount in Words: ${doc.totals.words}`, 14, y + 22, { maxWidth: pageWidth - 28 })
  pdf.setFontSize(9); pdf.text('Terms & Conditions', 14, y + 34); pdf.text(renderTemplate(settings.quotationTemplate.terms, doc, settings), 14, y + 40, { maxWidth: pageWidth - 28 })
  pdf.text('Bank Details', 14, y + 62); pdf.text(settings.quotationTemplate.bankDetails, 14, y + 68, { maxWidth: 90 })
  pdf.text(settings.quotationTemplate.signatureText, pageWidth - 14, y + 68, { align: 'right', maxWidth: 70 })
  const pages = pdf.getNumberOfPages(); for (let i = 1; i <= pages; i++) { pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(107, 114, 128); pdf.text(settings.quotationTemplate.footerText, pageWidth / 2, 292, { align: 'center' }); pdf.text(`Page ${i} of ${pages}`, pageWidth - 14, 292, { align: 'right' }) }
  pdf.save(`${doc.number.replaceAll('/', '-')}.pdf`)
}

function downloadExcel(doc: SavedDocument, settings: Settings) {
  const rows = doc.items.map((item, i) => ({ 'S.No.': i + 1, 'Quotation Number': doc.number, Date: doc.date, Customer: doc.customer, Company: doc.company, 'Product Name': item.productName, Description: item.description, Quantity: item.quantity, Price: item.price, 'GST %': item.gst, 'GST Amount': item.quantity * item.price * item.gst / 100, Total: item.quantity * item.price * (1 + item.gst / 100), 'Image Link': item.imageName || '' }))
  rows.push({ 'S.No.': '', 'Quotation Number': '', Date: '', Customer: '', Company: '', 'Product Name': 'Grand Total', Description: doc.headerData.notes || '', Quantity: '', Price: '', 'GST %': '', 'GST Amount': doc.totals.gst, Total: doc.totals.final, 'Image Link': '' } as any)
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, doc.type === 'quotation' ? 'Quotation' : 'Estimate')
  XLSX.writeFile(wb, `${doc.number.replaceAll('/', '-')}.xlsx`)
  void settings
}

async function compressImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file) })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = dataUrl })
  const max = 900, ratio = Math.min(1, max / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * ratio); canvas.height = Math.round(img.height * ratio)
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.78)
}

function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => { try { return JSON.parse(localStorage.getItem(key) || '') || initial } catch { return initial } })
  useEffect(() => localStorage.setItem(key, JSON.stringify(value)), [key, value])
  return [value, setValue] as const
}

function makeDefaults(fields: FieldConfig[]) { return Object.fromEntries(fields.map((f) => [f.key, f.key.includes('date') ? today() : f.defaultValue || ''])) }
function newItem(gst: number): QuoteItem { return { id: crypto.randomUUID(), productName: '', description: '', quantity: 1, price: 0, gst } }
function computeTotals(items: QuoteItem[], tax: TaxSettings): Totals { const taxable = items.reduce((s, i) => s + i.quantity * i.price, 0); const gst = tax.gstEnabled ? items.reduce((s, i) => s + i.quantity * i.price * ((tax.rowLevelGst ? i.gst : tax.defaultGst) / 100), 0) : 0; const grand = taxable + gst; const final = tax.roundOff ? Math.round(grand) : grand; return { taxable, gst, grand, roundOff: final - grand, final, words: `${numberToWords(Math.round(final))} rupees only` } }
function today() { return new Date().toISOString().slice(0, 10) }
function inputType(t: FieldType) { return t === 'Date' ? 'date' : t === 'Email' ? 'email' : t === 'Number' ? 'number' : t === 'Phone' ? 'tel' : 'text' }
function money(v: number) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0) }
function moneyPlain(v: number) { return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v || 0) }
function nextNumber(format: string, fy: string, next: number, pad: number) { return format.replace('{{financial_year}}', fy).replace('{{number}}', String(next).padStart(pad, '0')) }
function formatDate(v: string) { return new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) }
function labelize(s: string) { return s.replace(/([A-Z])/g, ' $1').replace(/^./, (m) => m.toUpperCase()) }
function renderTemplate(t: string, doc: SavedDocument, settings: Settings) { const data = { ...doc.headerData, quotation_number: doc.number, quotation_date: doc.date, taxable_amount: money(doc.totals.taxable), total_gst: money(doc.totals.gst), grand_total: money(doc.totals.final), amount_in_words: doc.totals.words, terms_and_conditions: settings.quotationTemplate.terms, bank_details: settings.quotationTemplate.bankDetails, signature: settings.quotationTemplate.signatureText, company_logo: settings.company.logoText, company_name: settings.company.companyName }; return Object.entries(data).reduce((text, [k, v]) => text.replaceAll(`{{${k}}}`, String(v || '')), t) }
function numberToWords(n: number): string { if (n === 0) return 'Zero'; const ones = ['', 'One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']; const tens = ['', '', 'Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']; const under100 = (x: number): string => x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]} ${ones[x % 10]}`.trim(); const under1000 = (x: number): string => x < 100 ? under100(x) : `${ones[Math.floor(x / 100)]} Hundred ${under100(x % 100)}`.trim(); let out = ''; const crore = Math.floor(n / 10000000); n %= 10000000; const lakh = Math.floor(n / 100000); n %= 100000; const thousand = Math.floor(n / 1000); n %= 1000; if (crore) out += `${under1000(crore)} Crore `; if (lakh) out += `${under1000(lakh)} Lakh `; if (thousand) out += `${under1000(thousand)} Thousand `; if (n) out += under1000(n); return out.trim() }

export default App
