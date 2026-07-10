import { useEffect, useMemo, useRef, useState } from 'react'
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
import './estimate-flow.css'
import './documents-saas.css'
import './documents-compact.css'
import './settings-auth.css'
import './logo-upload.css'
import './mobile-app-polish.css'
import './mobile-summary-fix.css'
import './mobile-compact-app.css'
import './edit-modal.css'
import { DEFAULT_BSM_LOGO } from './assets/bsmLogoData'

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
  security: { settingsPassword: string }
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
  field('customer_name', 'Customer Name', 'Text', true),
  field('company_name', 'Company Name', 'Text'),
  field('phone', 'Phone Number', 'Phone'),
  field('email', 'Email', 'Email'),
  field('address', 'Address', 'Textarea'),
  field('location', 'Location', 'Text'),
  field('duration_days', 'Duration (Days)', 'Number'),
].map((f, index) => ({ ...f, sortOrder: index + 1 }))

function field(key: string, label: string, type: FieldType, mandatory = false, defaultValue = '', options?: string[]): FieldConfig {
  return { id: key, key, label, type, defaultValue, options, placeholder: label, mandatory, visible: true, showPdf: true, showExcel: true, sortOrder: 1 }
}

const defaultSettings: Settings = {
  company: {
    logoText: 'BSM', logoImage: DEFAULT_BSM_LOGO, companyName: 'BSM India', address: 'Delhi, India', phone: '+91 XXXXX XXXXX', email: 'info@bsmindia.com', website: 'www.bsmindia.com', gstin: 'GSTIN to be updated', cin: '',
  },
  security: { settingsPassword: '1231' },
  quotationFields,
  quotationLineFields: lineFields,
  estimateFields,
  estimateCategories: [],
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
  tax: { gstEnabled: true, defaultGst: 18, rowLevelGst: true, roundOff: false, amountInWords: true, discountEnabled: false, extraChargesEnabled: false },
  numbering: { quotation: 'BSM/QTN/{{financial_year}}/{{number}}', estimate: 'BSM/EST/{{financial_year}}/{{number}}', financialYear: '2026-27', nextQuotation: 1, nextEstimate: 1, padding: 4, resetYearly: true },
}

function App() {
  const [active, setActive] = useState('quotation')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [settings, setSettings] = usePersistentState<Settings>(STORAGE_SETTINGS, defaultSettings)
  const [documents, setDocuments] = usePersistentState<SavedDocument[]>(STORAGE_DOCS, [])
  const [cloudLoaded, setCloudLoaded] = useState(false)
  const cloudSaveTimer = useRef<number | null>(null)
  const [quoteData, setQuoteData] = useState<Record<string, string>>(() => makeDefaults(defaultSettings.quotationFields))
  const [estimateData, setEstimateData] = useState<Record<string, string>>(() => ({ ...makeDefaults(defaultSettings.estimateFields), estimate_number: nextNumber(defaultSettings.numbering.estimate, defaultSettings.numbering.financialYear, defaultSettings.numbering.nextEstimate, defaultSettings.numbering.padding), estimate_date: today() }))
  const [items, setItems] = useState<QuoteItem[]>([newItem(defaultSettings.tax.defaultGst)])
  const [docTab, setDocTab] = useState<'quotation' | 'estimate'>('quotation')
  const totals = useMemo(() => computeTotals(items, settings.tax), [items, settings.tax])
  const visibleQuoteFields = settings.quotationFields.filter((f) => f.visible && f.key !== 'notes' && f.key !== 'salesperson_name').sort((a, b) => a.sortOrder - b.sortOrder)

  useEffect(() => {
    let cancelled = false
    fetch('/api/state', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('Cloud state unavailable')))
      .then((cloud) => {
        if (cancelled) return
        if (cloud?.settings) setSettings({ ...defaultSettings, ...cloud.settings, company: { ...defaultSettings.company, ...cloud.settings.company, logoImage: cloud.settings.company?.logoImage || DEFAULT_BSM_LOGO } })
        if (Array.isArray(cloud?.documents) && cloud.documents.length > 0) setDocuments(cloud.documents)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCloudLoaded(true) })
    return () => { cancelled = true }
  }, [setSettings, setDocuments])

  useEffect(() => {
    if (!cloudLoaded) return
    if (cloudSaveTimer.current) window.clearTimeout(cloudSaveTimer.current)
    cloudSaveTimer.current = window.setTimeout(() => {
      fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings, documents }) }).catch(() => {})
    }, 700)
    return () => { if (cloudSaveTimer.current) window.clearTimeout(cloudSaveTimer.current) }
  }, [settings, documents, cloudLoaded])

  useEffect(() => {
    setQuoteData((current) => ({
      ...makeDefaults(settings.quotationFields),
      ...current,
      quotation_number: nextNumber(settings.numbering.quotation, settings.numbering.financialYear, settings.numbering.nextQuotation, settings.numbering.padding),
    }))
  }, [settings.quotationFields, settings.numbering.quotation, settings.numbering.financialYear, settings.numbering.nextQuotation, settings.numbering.padding])

  useEffect(() => {
    setEstimateData((current) => ({
      ...makeDefaults(settings.estimateFields),
      ...current,
      estimate_number: nextNumber(settings.numbering.estimate, settings.numbering.financialYear, settings.numbering.nextEstimate, settings.numbering.padding),
      estimate_date: current.estimate_date || today(),
    }))
  }, [settings.estimateFields, settings.numbering.estimate, settings.numbering.financialYear, settings.numbering.nextEstimate, settings.numbering.padding])

  const nav = [['quotation', 'Create Quotation', '🧾'], ['estimate', 'Create Estimate', '🧮'], ['documents', 'Documents', '📄'], ['settings', 'Settings', '⚙️']]

  function saveQuotation(status: Status = 'Generated') {
    const number = nextNumber(settings.numbering.quotation, settings.numbering.financialYear, settings.numbering.nextQuotation, settings.numbering.padding)
    const now = new Date().toISOString()
    const doc: SavedDocument = {
      id: crypto.randomUUID(), type: 'quotation', number, date: quoteData.quotation_date || today(), customer: quoteData.customer_name || 'Customer', company: quoteData.company_name, headerData: { ...quoteData, quotation_number: number }, items, totals, status, createdBy: quoteData.salesperson_name || 'Admin', createdAt: now, updatedAt: now,
    }
    setDocuments((docs) => [doc, ...docs])
    setSettings((s) => ({ ...s, numbering: { ...s.numbering, nextQuotation: s.numbering.nextQuotation + 1 } }))
    setQuoteData((d) => ({ ...d, quotation_number: nextNumber(settings.numbering.quotation, settings.numbering.financialYear, settings.numbering.nextQuotation + 1, settings.numbering.padding) }))
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

  function saveEstimate(status: Status = 'Generated') {
    const number = nextNumber(settings.numbering.estimate, settings.numbering.financialYear, settings.numbering.nextEstimate, settings.numbering.padding)
    const now = new Date().toISOString()
    const doc: SavedDocument = {
      id: crypto.randomUUID(), type: 'estimate', number, date: estimateData.estimate_date || today(), customer: estimateData.customer_name || 'Customer', company: estimateData.company_name, location: estimateData.location, headerData: { ...estimateData, estimate_number: number }, items, totals, status, createdBy: 'Admin', createdAt: now, updatedAt: now,
    }
    setDocuments((docs) => [doc, ...docs])
    setSettings((s) => ({ ...s, numbering: { ...s.numbering, nextEstimate: s.numbering.nextEstimate + 1 } }))
    setEstimateData((d) => ({ ...d, estimate_number: nextNumber(settings.numbering.estimate, settings.numbering.financialYear, settings.numbering.nextEstimate + 1, settings.numbering.padding) }))
    return doc
  }

  function generateEstimatePdf() {
    const doc = saveEstimate('Generated')
    downloadQuotationPdf(doc, settings)
  }

  function duplicateDocument(doc: SavedDocument) {
    const isEstimate = doc.type === 'estimate'
    const number = isEstimate
      ? nextNumber(settings.numbering.estimate, settings.numbering.financialYear, settings.numbering.nextEstimate, settings.numbering.padding)
      : nextNumber(settings.numbering.quotation, settings.numbering.financialYear, settings.numbering.nextQuotation, settings.numbering.padding)
    const copy: SavedDocument = { ...doc, id: crypto.randomUUID(), number, headerData: { ...doc.headerData, [isEstimate ? 'estimate_number' : 'quotation_number']: number }, items: doc.items.map((i) => ({ ...i, id: crypto.randomUUID() })), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    setDocuments((docs) => [copy, ...docs])
    setSettings((s) => ({ ...s, numbering: isEstimate ? { ...s.numbering, nextEstimate: s.numbering.nextEstimate + 1 } : { ...s.numbering, nextQuotation: s.numbering.nextQuotation + 1 } }))
  }

  function updateDocument(doc: SavedDocument) {
    setDocuments((docs) => docs.map((d) => d.id === doc.id ? { ...doc, updatedAt: new Date().toISOString() } : d))
  }

  return (
    <main className={`dashboard-shell ${mobileMenuOpen ? 'menu-open' : ''}`}>
      <button className="mobile-menu-button" aria-label="Open menu" onClick={() => setMobileMenuOpen(true)}>☰</button>
      <button className="mobile-menu-backdrop" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)} />
      <aside className="sidebar">
        <div className="logo-block"><div className="logo">{(settings.company.logoImage || DEFAULT_BSM_LOGO) ? <img src={settings.company.logoImage || DEFAULT_BSM_LOGO} alt="BSM logo" /> : (settings.company.logoText || 'BSM')}</div><div><strong>{settings.company.companyName}</strong><span>Quote Studio</span></div></div>
        <nav>{nav.map(([key, label, icon]) => <button key={key} className={`${active === key ? 'active' : ''} ${key === 'settings' ? 'settings-nav' : ''}`} onClick={() => { setActive(key); setMobileMenuOpen(false) }}><span className="nav-icon" aria-hidden="true">{icon}</span><span>{label}</span></button>)}</nav>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div className="mobile-brand-bar">
            <span className="mobile-brand-logo">{(settings.company.logoImage || DEFAULT_BSM_LOGO) ? <img src={settings.company.logoImage || DEFAULT_BSM_LOGO} alt="BSM logo" /> : (settings.company.logoText || 'BSM')}</span>
            <strong>Quote Studio</strong>
          </div>
          <div className="desktop-page-title"><h1>{nav.find(([key]) => key === active)?.[1]}</h1></div>
        </header>
        <div className="mobile-page-title"><h1>{nav.find(([key]) => key === active)?.[1]}</h1></div>

        {active === 'quotation' && <div className="page-grid quote-flow">
          <section className="panel wide"><div className="section-title"><div><h2>Step 1. Quotation details</h2></div></div><DynamicForm fields={visibleQuoteFields} data={quoteData} setData={setQuoteData} /></section>
          <LineItemsPanel items={items} setItems={setItems} settings={settings} />
          <SummaryCard totals={totals} settings={settings} onPdf={generatePdf} onExcel={() => generateExcel()} />
        </div>}

        {active === 'estimate' && <EstimateView settings={settings} totals={totals} items={items} setItems={setItems} estimateData={estimateData} setEstimateData={setEstimateData} onPdf={generateEstimatePdf} onExcel={() => downloadExcel(saveEstimate('Generated'), settings)} />}
        {active === 'documents' && <DocumentsView documents={documents} tab={docTab} setTab={setDocTab} settings={settings} onSave={updateDocument} onDuplicate={duplicateDocument} onPdf={(d) => downloadQuotationPdf(d, settings)} onExcel={(d) => downloadExcel(d, settings)} onDelete={(id) => setDocuments((docs) => docs.filter((d) => d.id !== id))} />}
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
  const estimateLayout = fields.some((field) => field.key === 'estimate_number')
  if (estimateLayout) {
    const leftKeys = ['customer_name', 'company_name', 'phone', 'email', 'address']
    const rightKeys = ['estimate_number', 'estimate_date', 'location', 'duration_days']
    const renderField = (field: FieldConfig) => <FormField key={field.id} field={field} data={data} setData={setData} />
    return <div className="quotation-form-layout estimate-form-layout"><div className="quotation-form-stack">{leftKeys.map((key) => fields.find((field) => field.key === key)).filter(Boolean).map((field) => renderField(field as FieldConfig))}</div><div className="quotation-form-stack compact-side">{rightKeys.map((key) => fields.find((field) => field.key === key)).filter(Boolean).map((field) => renderField(field as FieldConfig))}</div></div>
  }
  return <div className="form-grid">{fields.map((field) => <FormField key={field.id} field={field} data={data} setData={setData} />)}</div>
}

function FormField({ field, data, setData }: { field: FieldConfig; data: Record<string, string>; setData: (fn: (d: Record<string, string>) => Record<string, string>) => void }) {
  const autoNumberField = field.key === 'quotation_number' || field.key === 'estimate_number'
  return <label className={`${field.type === 'Textarea' ? 'span-2' : ''} ${autoNumberField ? 'auto-number-field' : ''}`}><span>{field.label}{field.mandatory ? ' *' : ''}</span>{field.type === 'Textarea' ? <textarea value={data[field.key] || ''} placeholder={field.placeholder} onChange={(e) => setData((d) => ({ ...d, [field.key]: e.target.value }))} /> : field.type === 'Dropdown' ? <select value={data[field.key] || ''} onChange={(e) => setData((d) => ({ ...d, [field.key]: e.target.value }))}>{(field.options || ['Option']).map((o) => <option key={o}>{o}</option>)}</select> : <input value={data[field.key] || ''} type={inputType(field.type)} placeholder={field.placeholder} readOnly={autoNumberField} aria-readonly={autoNumberField} title={autoNumberField ? 'Auto-numbered by the system' : undefined} onChange={(e) => { if (!autoNumberField) setData((d) => ({ ...d, [field.key]: e.target.value })) }} />}</label>
}

function SummaryCard({ totals, settings, onPdf, onExcel }: { totals: Totals; settings: Settings; onPdf: () => void; onExcel: () => void }) {
  return <section className="panel summary-card final-step"><div className="section-title"><div><h2>Step 3. Review & generate</h2></div></div><h2>{money(totals.final)}</h2><div className="summary-grid"><div className="total-row"><span>Taxable Amount</span><strong>{money(totals.taxable)}</strong></div><div className="total-row"><span>Total GST</span><strong>{settings.tax.gstEnabled ? money(totals.gst) : 'Disabled'}</strong></div><div className="total-row"><span>Grand Total</span><strong>{money(totals.grand)}</strong></div><div className="total-row grand"><span>Final Amount</span><strong>{money(totals.final)}</strong></div></div>{settings.tax.amountInWords && <p className="amount-words">{totals.words}</p>}<div className="stack-actions"><button className="ghost full" onClick={onExcel}>Download Excel</button><button className="primary full" onClick={onPdf}>Generate PDF</button></div></section>
}

function LineItemsPanel({ items, setItems, settings, mode = 'quotation' }: { items: QuoteItem[]; setItems: React.Dispatch<React.SetStateAction<QuoteItem[]>>; settings: Settings; mode?: 'quotation' | 'estimate' }) {
  const addItem = () => setItems((rows) => [...rows, newItem(settings.tax.defaultGst)])
  const update = (id: string, patch: Partial<QuoteItem>) => setItems((rows) => rows.map((r) => r.id === id ? { ...r, ...patch } : r))
  const remove = (id: string) => setItems((rows) => rows.filter((r) => r.id !== id))
  const isEstimate = mode === 'estimate'
  async function onImage(id: string, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const image = await compressImage(file)
    update(id, { image, imageName: file.name })
  }
  return <section className="panel line-panel wide">
    <div className="section-title"><div><h2>Step 2. {isEstimate ? 'Estimate line items' : 'Product line items'}</h2></div></div>
    <div className={`line-table ${isEstimate ? 'estimate-lines' : ''}`}>
      <div className="line-head">{!isEstimate && <span>Picture</span>}<span>{isEstimate ? 'Expense / Item' : 'Product'}</span><span>{isEstimate ? 'Days' : 'Qty'}</span><span>{isEstimate ? 'Cost' : 'Price'}</span><span>GST %</span><span>Total</span><span></span></div>
      {items.map((item) => { const taxable = item.quantity * item.price; const total = taxable + (settings.tax.gstEnabled ? taxable * ((settings.tax.rowLevelGst ? item.gst : settings.tax.defaultGst) / 100) : 0); return <div className="line-row" key={item.id}>
        {!isEstimate && <div className="image-cell">{item.image ? <img src={item.image} alt={item.productName || 'Product'} /> : <span>No image</span>}<label className="mini-upload">{item.image ? 'Replace' : 'Upload / Camera'}<input type="file" accept="image/*" capture="environment" onChange={(e) => onImage(item.id, e)} /></label>{item.image && <button className="text-danger" onClick={() => update(item.id, { image: undefined, imageName: undefined })}>Remove</button>}</div>}
        <div className="product-inputs stacked"><input value={item.productName} onChange={(e) => update(item.id, { productName: e.target.value })} placeholder={isEstimate ? 'Expense / item name' : 'Product name'} /><textarea value={item.description} onChange={(e) => update(item.id, { description: e.target.value })} placeholder="Description" /></div>
        <label className="mobile-line-field"><span>{isEstimate ? 'Days' : 'Quantity'}</span><input type="number" value={item.quantity} onChange={(e) => update(item.id, { quantity: Number(e.target.value) })} /></label>
        <label className="mobile-line-field"><span>{isEstimate ? 'Cost' : 'Price'}</span><input type="number" value={item.price} onChange={(e) => update(item.id, { price: Number(e.target.value) })} /></label>
        <label className="mobile-line-field"><span>GST %</span><input type="number" value={item.gst} disabled={!settings.tax.rowLevelGst} onChange={(e) => update(item.id, { gst: Number(e.target.value) })} /></label>
        <div className="mobile-total-chip"><span>Total</span><strong>{money(total)}</strong></div><button className="icon-button delete-row" aria-label="Delete row" title="Delete row" onClick={() => remove(item.id)}>🗑</button>
      </div>})}
    </div>
    <div className="line-footer-actions"><button className="ghost" onClick={addItem}>+ Add item</button></div>
  </section>
}

function DocumentsView({ documents, tab, setTab, settings, onSave, onDuplicate, onPdf, onExcel, onDelete }: { documents: SavedDocument[]; tab: 'quotation' | 'estimate'; setTab: (t: 'quotation' | 'estimate') => void; settings: Settings; onSave: (d: SavedDocument) => void; onDuplicate: (d: SavedDocument) => void; onPdf: (d: SavedDocument) => void; onExcel: (d: SavedDocument) => void; onDelete: (id: string) => void }) {
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [editing, setEditing] = useState<SavedDocument | null>(null)
  const [editData, setEditData] = useState<Record<string, string>>({})
  const [editItems, setEditItems] = useState<QuoteItem[]>([])
  const docs = documents.filter((d) => d.type === tab && d.status !== 'Draft' && JSON.stringify(d).toLowerCase().includes(search.toLowerCase()))
  const confirmAction = (label: string, action: () => void) => { if (window.confirm(`Are you sure you want to ${label}?`)) action() }
  const openEdit = (doc: SavedDocument) => { setEditing(doc); setEditData({ ...doc.headerData }); setEditItems(doc.items.map((i) => ({ ...i }))) }
  const editTotals = useMemo(() => computeTotals(editItems, settings.tax), [editItems, settings.tax])
  const saveEdit = (download = false) => {
    if (!editing) return
    const isEstimate = editing.type === 'estimate'
    const numberKey = isEstimate ? 'estimate_number' : 'quotation_number'
    const saved: SavedDocument = {
      ...editing,
      number: editData[numberKey] || editing.number,
      date: editData[isEstimate ? 'estimate_date' : 'quotation_date'] || editing.date,
      customer: editData.customer_name || editing.customer,
      company: editData.company_name || editing.company,
      location: editData.location || editing.location,
      headerData: { ...editData, [numberKey]: editData[numberKey] || editing.number },
      items: editItems,
      totals: editTotals,
      updatedAt: new Date().toISOString(),
      status: 'Generated',
    }
    onSave(saved)
    if (download) onPdf(saved)
    setEditing(null)
  }

  return <section className="panel documents-module">
    <div className="documents-hero">
      <div><h2>Documents</h2><span>{docs.length} {tab === 'quotation' ? 'quotations' : 'estimates'} generated</span></div>
      <input className="search" placeholder="Search number, customer, project, status..." value={search} onChange={(e) => setSearch(e.target.value)} />
    </div>
    <div className="documents-toolbar">
      <div className="tabbar"><button className={tab === 'quotation' ? 'active' : ''} onClick={() => setTab('quotation')}>Quotations</button><button className={tab === 'estimate' ? 'active' : ''} onClick={() => setTab('estimate')}>Estimates</button></div>
      <div className="view-toggle"><button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>List</button><button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')}>Grid</button></div>
    </div>
    <div className={`records ${view === 'grid' ? 'records-grid' : 'records-list'}`}>{docs.length === 0 && <div className="empty">No generated {tab}s yet. Complete the form and click Generate PDF.</div>}{docs.map((doc) => <article key={doc.id} className="record-card document-card"><div className="doc-main"><strong>{doc.number}</strong><span>{doc.customer} {doc.company ? `• ${doc.company}` : ''}</span></div><div className="doc-amount"><strong>{money(doc.totals.final)}</strong><span>{doc.date}</span></div><span className="status compact-status">{doc.status}</span><div className="mini-actions compact-doc-actions"><button title="Edit" aria-label="Edit" onClick={() => openEdit(doc)}>✎</button><button title="Duplicate" aria-label="Duplicate" onClick={() => confirmAction('duplicate this document', () => onDuplicate(doc))}>⧉</button><button title="PDF" aria-label="PDF" onClick={() => onPdf(doc)}>PDF</button><button title="Excel" aria-label="Excel" onClick={() => onExcel(doc)}>XLS</button><button title="Delete" aria-label="Delete" className="danger-action" onClick={() => confirmAction('delete this document', () => onDelete(doc.id))}>🗑</button></div><small>Generated {formatDate(doc.updatedAt)}</small></article>)}</div>
    {editing && <DocumentEditModal doc={editing} data={editData} setData={setEditData} items={editItems} setItems={setEditItems} settings={settings} totals={editTotals} onClose={() => setEditing(null)} onSave={() => saveEdit(false)} onPdf={() => saveEdit(true)} />}
  </section>
}

function DocumentEditModal({ doc, data, setData, items, setItems, settings, totals, onClose, onSave, onPdf }: { doc: SavedDocument; data: Record<string, string>; setData: React.Dispatch<React.SetStateAction<Record<string, string>>>; items: QuoteItem[]; setItems: React.Dispatch<React.SetStateAction<QuoteItem[]>>; settings: Settings; totals: Totals; onClose: () => void; onSave: () => void; onPdf: () => void }) {
  const isEstimate = doc.type === 'estimate'
  const fields = (isEstimate ? settings.estimateFields : settings.quotationFields).filter((f) => f.visible && f.key !== 'notes' && f.key !== 'salesperson_name').sort((a, b) => a.sortOrder - b.sortOrder)
  return <div className="edit-modal-backdrop" role="dialog" aria-modal="true">
    <div className="edit-modal-card">
      <div className="edit-modal-head"><div><h2>Edit {isEstimate ? 'Estimate' : 'Quotation'}</h2><span>{doc.number}</span></div><button className="ghost" onClick={onClose}>Close</button></div>
      <div className="edit-modal-scroll">
        <section className="panel"><h2>Details</h2><DynamicForm fields={fields} data={data} setData={setData} /></section>
        <LineItemsPanel items={items} setItems={setItems} settings={settings} mode={isEstimate ? 'estimate' : 'quotation'} />
        <section className="panel summary-card final-step"><h2>{money(totals.final)}</h2><div className="summary-grid"><div className="total-row"><span>Taxable Amount</span><strong>{money(totals.taxable)}</strong></div><div className="total-row"><span>Total GST</span><strong>{settings.tax.gstEnabled ? money(totals.gst) : 'Disabled'}</strong></div><div className="total-row grand"><span>Final Amount</span><strong>{money(totals.final)}</strong></div></div></section>
      </div>
      <div className="edit-modal-actions"><button className="ghost" onClick={onSave}>Save Changes</button><button className="primary" onClick={onPdf}>Save & Generate PDF</button></div>
    </div>
  </div>
}

function EstimateView({ settings, totals, items, setItems, estimateData, setEstimateData, onPdf, onExcel }: { settings: Settings; totals: Totals; items: QuoteItem[]; setItems: React.Dispatch<React.SetStateAction<QuoteItem[]>>; estimateData: Record<string, string>; setEstimateData: (fn: (d: Record<string, string>) => Record<string, string>) => void; onPdf: () => void; onExcel: () => void }) {
  const visibleEstimateFields = estimateFields.filter((f) => f.visible).sort((a, b) => a.sortOrder - b.sortOrder)
  return <div className="page-grid quote-flow estimate-flow">
    <section className="panel wide"><div className="section-title"><div><h2>Step 1. Estimate details</h2></div></div><DynamicForm fields={visibleEstimateFields} data={estimateData} setData={setEstimateData} /></section>
    <LineItemsPanel items={items} setItems={setItems} settings={settings} mode="estimate" />
    <SummaryCard totals={totals} settings={settings} onPdf={onPdf} onExcel={onExcel} />
  </div>
}

function SettingsView({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) {
  const [section, setSection] = useState('company')
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('bsm_settings_unlocked') === 'yes')
  const [password, setPassword] = useState('')
  const settingsPassword = settings.security?.settingsPassword || '1231'
  const sections = [
    ['company', 'Company Profile', 'Logo, contact and GST details'],
    ['quote-fields', 'Quotation Fields', 'Header form configuration'],
    ['quote-items', 'Line Items', 'Product table columns'],
    ['quote-template', 'Quotation Template', 'PDF letter editor'],
    ['estimate-fields', 'Estimate Fields', 'Estimate form configuration'],
    ['estimate-template', 'Estimate Template', 'Estimate PDF editor'],
    ['tax', 'Tax & Calculation', 'GST and amount in words'],
    ['numbering', 'Numbering', 'Document formats'],
    ['bank', 'Bank & Signature', 'Payment and sign-off'],
    ['security', 'Security', 'Settings password'],
  ]
  const unlock = () => {
    if (password === settingsPassword) { sessionStorage.setItem('bsm_settings_unlocked', 'yes'); setUnlocked(true); setPassword('') }
    else window.alert('Incorrect settings password')
  }
  if (!unlocked) return <section className="panel settings-lock"><div className="lock-card"><p className="kicker">Protected area</p><h2>Settings locked</h2><p>Enter the settings password to continue.</p><input type="password" value={password} placeholder="Password" onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') unlock() }} /><button className="primary full" onClick={unlock}>Unlock Settings</button></div></section>
  return <div className="settings-saas">
    <aside className="settings-menu">
      <h2>Settings</h2>
      <div className="settings-menu-list">{sections.map(([key, label]) => <button key={key} className={section === key ? 'active' : ''} onClick={() => setSection(key)}><strong>{label}</strong></button>)}</div>
    </aside>
    <section className="settings-content">
      <div className="settings-content-head"><div><h2>{sections.find(([key]) => key === section)?.[1]}</h2></div></div>
      {section === 'company' && <CompanySettings settings={settings} setSettings={setSettings} />}
      {section === 'quote-fields' && <FieldSettings title="Quotation Field Settings" fields={settings.quotationFields} onChange={(quotationFields) => setSettings((s) => ({ ...s, quotationFields }))} />}
      {section === 'quote-items' && <FieldSettings title="Quotation Line Item Settings" fields={settings.quotationLineFields} onChange={(quotationLineFields) => setSettings((s) => ({ ...s, quotationLineFields }))} />}
      {section === 'quote-template' && <TemplateEditor title="Quotation Template Editor" template={settings.quotationTemplate} onChange={(quotationTemplate) => setSettings((s) => ({ ...s, quotationTemplate }))} />}
      {section === 'estimate-fields' && <FieldSettings title="Estimate Field Settings" fields={settings.estimateFields} onChange={(estimateFields) => setSettings((s) => ({ ...s, estimateFields }))} />}
      {section === 'estimate-template' && <TemplateEditor title="Estimate Template Editor" template={settings.estimateTemplate} onChange={(estimateTemplate) => setSettings((s) => ({ ...s, estimateTemplate }))} />}
      {section === 'tax' && <TaxSettingsPanel settings={settings} setSettings={setSettings} />}
      {section === 'numbering' && <NumberingSettings settings={settings} setSettings={setSettings} />}
      {section === 'bank' && <BankSignatureSettings settings={settings} setSettings={setSettings} />}
      {section === 'security' && <SecuritySettings settings={settings} setSettings={setSettings} />}
    </section>
  </div>
}

function CompanySettings({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) {
  const keys = ['logoText', 'companyName', 'address', 'phone', 'email', 'website', 'gstin', 'cin']
  const onLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const logoImage = await fileToDataUrl(file)
    setSettings((s) => ({ ...s, company: { ...s.company, logoImage } }))
  }
  return <section className="panel settings-card"><h2>Company Profile</h2><div className="logo-upload-row"><div className="logo-preview">{(settings.company.logoImage || DEFAULT_BSM_LOGO) ? <img src={settings.company.logoImage || DEFAULT_BSM_LOGO} alt="Company logo" /> : <span>{settings.company.logoText || 'BSM'}</span>}</div><label className="logo-upload-control"><span>Upload company logo</span><input type="file" accept="image/*" onChange={onLogo} /></label>{settings.company.logoImage && settings.company.logoImage !== DEFAULT_BSM_LOGO && <button className="ghost" onClick={() => setSettings((s) => ({ ...s, company: { ...s.company, logoImage: DEFAULT_BSM_LOGO } }))}>Reset Logo</button>}</div><div className="compact-form">{keys.map((k) => <label key={k}><span>{labelize(k)}</span><input value={settings.company[k] || ''} onChange={(e) => setSettings((s) => ({ ...s, company: { ...s.company, [k]: e.target.value } }))} /></label>)}</div><SaveSettingsButton /></section>
}

function FieldSettings({ title, fields, onChange }: { title: string; fields: FieldConfig[]; onChange: (f: FieldConfig[]) => void }) {
  const update = (id: string, patch: Partial<FieldConfig>) => onChange(fields.map((f) => f.id === id ? { ...f, ...patch } : f))
  const add = () => onChange([...fields, { ...field(`custom_${Date.now()}`, 'New Custom Field', 'Text'), id: crypto.randomUUID(), sortOrder: fields.length + 1 }])
  return <section className="panel settings-card field-settings-panel"><div className="section-title"><div><h2>{title}</h2></div><button className="ghost" onClick={add}>+ Add field</button></div><div className="field-settings-table"><div className="field-settings-head"><span>Field</span><span>Type</span><span>Order</span><span>Visibility</span></div>{fields.map((f) => <article key={f.id} className={`field-config-row ${!f.visible ? 'muted-row' : ''}`}><input className="field-label-input" value={f.label} onChange={(e) => update(f.id, { label: e.target.value })} /><select value={f.type} onChange={(e) => update(f.id, { type: e.target.value as FieldType })}>{['Text','Number','Date','Dropdown','Textarea','Email','Phone','Image/File','Checkbox'].map((t) => <option key={t}>{t}</option>)}</select><input className="order-input" type="number" value={f.sortOrder} onChange={(e) => update(f.id, { sortOrder: Number(e.target.value) })} /><div className="settings-switches"><Toggle label="Visible" value={f.visible} onChange={(visible) => update(f.id, { visible })} /><Toggle label="Required" value={f.mandatory} onChange={(mandatory) => update(f.id, { mandatory })} /><Toggle label="PDF" value={f.showPdf} onChange={(showPdf) => update(f.id, { showPdf })} /><Toggle label="Excel" value={f.showExcel} onChange={(showExcel) => update(f.id, { showExcel })} /></div></article>)}</div><SaveSettingsButton /></section>
}

function TemplateEditor({ title, template, onChange }: { title: string; template: TemplateConfig; onChange: (t: TemplateConfig) => void }) {
  const update = (key: keyof TemplateConfig, value: string) => onChange({ ...template, [key]: value })
  return <section className="panel settings-card template-editor"><h2>{title}</h2>{(['headerText','bodyText','terms','bankDetails','signatureText','footerText'] as (keyof TemplateConfig)[]).map((key) => <label key={key}><span>{labelize(key)}</span><textarea value={template[key]} onChange={(e) => update(key, e.target.value)} /></label>)}<SaveSettingsButton /></section>
}

function TaxSettingsPanel({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) {
  const tax = settings.tax
  const update = (patch: Partial<TaxSettings>) => setSettings((s) => ({ ...s, tax: { ...s.tax, ...patch } }))
  return <section className="panel settings-card"><h2>Simple GST only</h2><div className="config-list"><Toggle label="Enable GST" value={tax.gstEnabled} onChange={(v) => update({ gstEnabled: v })} /><label><span>Default GST %</span><input type="number" value={tax.defaultGst} onChange={(e) => update({ defaultGst: Number(e.target.value) })} /></label><Toggle label="Allow row-level GST" value={tax.rowLevelGst} onChange={(v) => update({ rowLevelGst: v })} /><Toggle label="Show amount in words" value={tax.amountInWords} onChange={(v) => update({ amountInWords: v })} /><Toggle label="Enable discount" value={tax.discountEnabled} onChange={(v) => update({ discountEnabled: v })} /><Toggle label="Enable extra charges" value={tax.extraChargesEnabled} onChange={(v) => update({ extraChargesEnabled: v })} /></div><SaveSettingsButton /></section>
}

function NumberingSettings({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) {
  const n = settings.numbering
  const update = (patch: Partial<typeof n>) => setSettings((s) => ({ ...s, numbering: { ...s.numbering, ...patch } }))
  return <section className="panel settings-card"><h2>Document numbering</h2><div className="compact-form"><label><span>Quotation format</span><input value={n.quotation} onChange={(e) => update({ quotation: e.target.value })} /></label><label><span>Estimate format</span><input value={n.estimate} onChange={(e) => update({ estimate: e.target.value })} /></label><label><span>Financial year</span><input value={n.financialYear} onChange={(e) => update({ financialYear: e.target.value })} /></label><label><span>Number padding</span><input type="number" value={n.padding} onChange={(e) => update({ padding: Number(e.target.value) })} /></label><Toggle label="Reset yearly" value={n.resetYearly} onChange={(v) => update({ resetYearly: v })} /></div><SaveSettingsButton /></section>
}

function BankSignatureSettings({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) {
  return <section className="panel settings-card"><h2>PDF placeholders</h2><label><span>Bank details</span><textarea value={settings.quotationTemplate.bankDetails} onChange={(e) => setSettings((s) => ({ ...s, quotationTemplate: { ...s.quotationTemplate, bankDetails: e.target.value } }))} /></label><label><span>Signature / Stamp text</span><textarea value={settings.quotationTemplate.signatureText} onChange={(e) => setSettings((s) => ({ ...s, quotationTemplate: { ...s.quotationTemplate, signatureText: e.target.value } }))} /></label><SaveSettingsButton /></section>
}


function SecuritySettings({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) {
  const [newPassword, setNewPassword] = useState(settings.security?.settingsPassword || '1231')
  const save = () => { setSettings((s) => ({ ...s, security: { settingsPassword: newPassword || '1231' } })); window.alert('Settings password saved') }
  return <section className="panel settings-card"><h2>Security</h2><label><span>Settings password</span><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label><div className="settings-save-row"><button className="primary" onClick={save}>Save Security Settings</button></div></section>
}

function SaveSettingsButton() {
  const [saved, setSaved] = useState(false)
  return <div className="settings-save-row"><button className="primary" onClick={() => { setSaved(true); window.setTimeout(() => setSaved(false), 1800) }}>{saved ? 'Saved ✓' : 'Save Settings'}</button></div>
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <label className="toggle"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>
}

function downloadQuotationPdf(doc: SavedDocument, settings: Settings) {
  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageWidth = pdf.internal.pageSize.getWidth()
  const red: [number, number, number] = [215, 25, 32]
  const dark: [number, number, number] = [17, 24, 39]
  const muted: [number, number, number] = [107, 114, 128]
  const isEstimate = doc.type === 'estimate'
  const title = isEstimate ? 'Estimate' : 'Quotation'
  const numberLabel = isEstimate ? 'Estimate No.' : 'Quotation No.'
  const numberKey = isEstimate ? 'estimate_number' : 'quotation_number'

  pdf.setFillColor(255, 255, 255); pdf.rect(0, 0, pageWidth, 297, 'F')
  const logoImage = settings.company.logoImage || DEFAULT_BSM_LOGO
  if (logoImage) {
    try {
      const props = pdf.getImageProperties(logoImage)
      const maxW = 54, maxH = 18
      const ratio = Math.min(maxW / props.width, maxH / props.height)
      const logoW = props.width * ratio
      const logoH = props.height * ratio
      const logoFormat = logoImage.startsWith('data:image/jpeg') || logoImage.startsWith('data:image/jpg') ? 'JPEG' : 'PNG'
      pdf.addImage(logoImage, logoFormat, 14, 10, logoW, logoH)
    } catch { pdf.setTextColor(...red); pdf.setFontSize(24); pdf.setFont('helvetica', 'bold'); pdf.text(settings.company.logoText || 'BSM', 14, 22) }
  } else {
    pdf.setTextColor(...red); pdf.setFontSize(24); pdf.setFont('helvetica', 'bold'); pdf.text(settings.company.logoText || 'BSM', 14, 22)
  }
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(...dark); pdf.text(settings.company.companyName || 'Build Scale Manufacture Pvt. Ltd.', pageWidth - 14, 12, { align: 'right' })
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...muted)
  pdf.text(settings.company.address || 'Delhi, India', pageWidth - 14, 17, { align: 'right', maxWidth: 82 })
  pdf.text(`GSTIN: ${settings.company.gstin || '-'}`, pageWidth - 14, 27, { align: 'right' })
  pdf.text(`Email: ${settings.company.email || '-'}`, pageWidth - 14, 32, { align: 'right' })
  pdf.setDrawColor(230, 232, 236); pdf.line(14, 38, pageWidth - 14, 38)

  pdf.setTextColor(...red); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(28); pdf.text(title, 14, 52)
  pdf.setTextColor(...dark); pdf.setFontSize(9); pdf.text(`${numberLabel}: ${doc.number || doc.headerData[numberKey] || '-'}`, 14, 60)
  pdf.setFont('helvetica', 'normal'); pdf.text(`${title} Date: ${doc.date || today()}`, 14, 66)

  const bankX = 14, bankY = 74, bankW = 84, bankH = 48
  const billX = 106, billY = bankY, billW = pageWidth - billX - 14, billH = bankH
  pdf.setFillColor(248, 249, 251); pdf.roundedRect(bankX, bankY, bankW, bankH, 3, 3, 'F')
  pdf.setTextColor(...red); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.text('Account Details', bankX + 4, bankY + 8)
  pdf.setTextColor(...dark); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8)
  const bankLines = (settings.quotationTemplate.bankDetails || 'A/c Name: BSM India\nAccount No.: Update\nIFSC: Update\nBank Name: Update\nBranch: Update\nType: Current').split('\n')
  bankLines.slice(0, 6).forEach((line, i) => pdf.text(line, bankX + 4, bankY + 15 + i * 5))

  pdf.setFillColor(248, 249, 251); pdf.roundedRect(billX, billY, billW, billH, 3, 3, 'F')
  pdf.setTextColor(...red); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.text('Customer Details', billX + 4, billY + 8)
  pdf.setTextColor(...dark); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8)
  const customerDetails = [
    doc.company || doc.headerData.company_name || '-',
    doc.headerData.address || doc.location || '-',
    doc.customer || doc.headerData.customer_name || '-',
    `Phone: ${doc.headerData.phone || '-'}`,
    `Email: ${doc.headerData.email || '-'}`,
  ]
  let customerY = billY + 15
  customerDetails.forEach((line) => {
    const wrapped = pdf.splitTextToSize(String(line), billW - 8).slice(0, 2)
    wrapped.forEach((textLine: string) => {
      pdf.text(textLine, billX + 4, customerY)
      customerY += 4.6
    })
    customerY += 1.2
  })

  const headers = isEstimate ? [['#', 'Expense / Item', 'Days', 'Cost', 'GST %', 'GST Amt.', 'Total Amount']] : [['#', 'Product', 'Picture', 'Qty', 'List Price', 'Tax %', 'Tax Amt.', 'Total Amount']]
  const body = doc.items.map((item, i) => {
    const taxable = item.quantity * item.price
    const gstAmt = settings.tax.gstEnabled ? taxable * ((settings.tax.rowLevelGst ? item.gst : settings.tax.defaultGst) / 100) : 0
    return isEstimate
      ? [String(i + 1), `${item.productName || 'Expense'}${item.description ? `\n${item.description}` : ''}`, item.quantity, moneyPlain(item.price), item.gst, moneyPlain(gstAmt), moneyPlain(taxable + gstAmt)]
      : [String(i + 1), `${item.productName || 'Product'}${item.description ? `\n${item.description}` : ''}`, item.image ? 'Image' : '-', item.quantity, moneyPlain(item.price), item.gst, moneyPlain(gstAmt), moneyPlain(taxable + gstAmt)]
  })
  autoTable(pdf, {
    startY: 132,
    head: headers,
    body,
    styles: { fontSize: 8, cellPadding: 2.3, valign: 'middle', lineColor: [229, 231, 235], lineWidth: 0.1 },
    headStyles: { fillColor: red, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [252, 252, 253] },
    columnStyles: isEstimate ? { 1: { cellWidth: 72, fontStyle: 'bold' } } : { 1: { cellWidth: 48, fontStyle: 'bold' }, 2: { cellWidth: 24, halign: 'center' } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 1) data.cell.styles.fontStyle = 'bold'
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 1) {
        const raw = String(data.cell.raw || '')
        const [main, ...descParts] = raw.split('\n')
        const desc = descParts.join(' ')
        if (desc) {
          const fill = data.row.index % 2 === 0 ? [255, 255, 255] : [252, 252, 253]
          pdf.setFillColor(fill[0], fill[1], fill[2])
          pdf.rect(data.cell.x + 0.6, data.cell.y + 0.6, data.cell.width - 1.2, data.cell.height - 1.2, 'F')
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(8)
          pdf.setTextColor(...dark)
          pdf.text(main, data.cell.x + 2.4, data.cell.y + 5.2, { maxWidth: data.cell.width - 4.8 })
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(7)
          pdf.setTextColor(145, 151, 161)
          pdf.text(desc, data.cell.x + 2.4, data.cell.y + 9.5, { maxWidth: data.cell.width - 4.8 })
        }
      }
      if (!isEstimate && data.section === 'body' && data.column.index === 2) {
        const item = doc.items[data.row.index]
        if (item?.image) { try { pdf.addImage(item.image, 'JPEG', data.cell.x + 3, data.cell.y + 2, 16, 12) } catch { /* ignore */ } }
      }
    }
  })

  const y = Math.min((pdf as any).lastAutoTable.finalY + 10, 228)
  pdf.setTextColor(...dark); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.text('Terms & Conditions', 14, y)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.4)
  const terms = (isEstimate ? settings.estimateTemplate.terms : settings.quotationTemplate.terms).split('\n').filter(Boolean)
  let termsY = y + 7
  terms.forEach((line) => {
    const bullet = `• ${line.replace(/^\d+\.\s*/, '')}`
    const wrapped = pdf.splitTextToSize(bullet, 105)
    wrapped.forEach((textLine: string) => {
      if (termsY <= 266) {
        pdf.text(textLine, 14, termsY)
        termsY += 4.4
      }
    })
    termsY += 1.2
  })

  const tx = pageWidth - 78
  pdf.setFillColor(248, 249, 251); pdf.roundedRect(tx, y - 4, 64, 42, 3, 3, 'F')
  const totalLines = [['Sub Total', doc.totals.taxable], ['Total GST', doc.totals.gst], ['Total Amount', doc.totals.grand]]
  pdf.setFontSize(8); pdf.setTextColor(...dark); totalLines.forEach(([label, value], i) => { pdf.text(String(label), tx + 5, y + 4 + i * 8); pdf.text(moneyPlain(Number(value)), tx + 58, y + 4 + i * 8, { align: 'right' }) })
  pdf.setFillColor(...red); pdf.roundedRect(tx, y + 24, 64, 12, 2, 2, 'F')
  pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.text('Grand Total', tx + 5, y + 32); pdf.text(moneyPlain(doc.totals.final), tx + 58, y + 32, { align: 'right' })

  pdf.setTextColor(...dark); pdf.setFontSize(8); pdf.text(settings.company.companyName || 'BSM India', pageWidth - 14, 270, { align: 'right' })
  pdf.setFont('helvetica', 'bold'); pdf.text('Authorized Signatory', pageWidth - 14, 280, { align: 'right' })
  const pages = pdf.getNumberOfPages(); for (let i = 1; i <= pages; i++) { pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(...muted); pdf.text(`${title} • Page ${i} of ${pages}`, pageWidth / 2, 292, { align: 'center' }) }
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

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file) })
}

async function compressImage(file: File): Promise<string> {
  const dataUrl = await fileToDataUrl(file)
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
function computeTotals(items: QuoteItem[], tax: TaxSettings): Totals { const taxable = items.reduce((s, i) => s + i.quantity * i.price, 0); const gst = tax.gstEnabled ? items.reduce((s, i) => s + i.quantity * i.price * ((tax.rowLevelGst ? i.gst : tax.defaultGst) / 100), 0) : 0; const grand = taxable + gst; const final = grand; return { taxable, gst, grand, roundOff: 0, final, words: `${numberToWords(Math.round(final))} rupees only` } }
function today() { return new Date().toISOString().slice(0, 10) }
function inputType(t: FieldType) { return t === 'Date' ? 'date' : t === 'Email' ? 'email' : t === 'Number' ? 'number' : t === 'Phone' ? 'tel' : 'text' }
function money(v: number) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0) }
function moneyPlain(v: number) { return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v || 0) }
function nextNumber(format: string, fy: string, next: number, pad: number) { return format.replace('{{financial_year}}', fy).replace('{{number}}', String(next).padStart(pad, '0')) }
function formatDate(v: string) { return new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) }
function labelize(s: string) { return s.replace(/([A-Z])/g, ' $1').replace(/^./, (m) => m.toUpperCase()) }
function numberToWords(n: number): string { if (n === 0) return 'Zero'; const ones = ['', 'One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']; const tens = ['', '', 'Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']; const under100 = (x: number): string => x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]} ${ones[x % 10]}`.trim(); const under1000 = (x: number): string => x < 100 ? under100(x) : `${ones[Math.floor(x / 100)]} Hundred ${under100(x % 100)}`.trim(); let out = ''; const crore = Math.floor(n / 10000000); n %= 10000000; const lakh = Math.floor(n / 100000); n %= 100000; const thousand = Math.floor(n / 1000); n %= 1000; if (crore) out += `${under1000(crore)} Crore `; if (lakh) out += `${under1000(lakh)} Lakh `; if (thousand) out += `${under1000(thousand)} Thousand `; if (n) out += under1000(n); return out.trim() }

export default App
