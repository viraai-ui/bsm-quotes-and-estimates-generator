import { useMemo, useState } from 'react'
import './App.css'

type Field = {
  id: string
  label: string
  type: string
  required: boolean
  form: boolean
  pdf: boolean
  excel: boolean
  defaultValue?: string
}

type LineField = Field & { calculated?: boolean }

type Item = {
  name: string
  description: string
  quantity: number
  price: number
  gst: number
  image?: string
}

const quotationFields: Field[] = [
  { id: 'quoteNo', label: 'Quotation Number', type: 'Text', required: true, form: true, pdf: true, excel: true, defaultValue: 'BSM-Q-2026-001' },
  { id: 'quoteDate', label: 'Quotation Date', type: 'Date', required: true, form: true, pdf: true, excel: true },
  { id: 'validTill', label: 'Valid Till', type: 'Date', required: false, form: true, pdf: true, excel: false },
  { id: 'customer', label: 'Customer Name', type: 'Text', required: true, form: true, pdf: true, excel: true },
  { id: 'company', label: 'Company Name', type: 'Text', required: false, form: true, pdf: true, excel: true },
  { id: 'phone', label: 'Phone Number', type: 'Phone', required: true, form: true, pdf: true, excel: true },
  { id: 'email', label: 'Email', type: 'Email', required: false, form: true, pdf: false, excel: true },
  { id: 'address', label: 'Address', type: 'Textarea', required: false, form: true, pdf: true, excel: false },
  { id: 'gstin', label: 'GSTIN', type: 'Text', required: false, form: true, pdf: true, excel: true },
  { id: 'salesperson', label: 'Salesperson Name', type: 'Dropdown', required: false, form: true, pdf: true, excel: true },
  { id: 'notes', label: 'Notes', type: 'Textarea', required: false, form: true, pdf: true, excel: false },
]

const lineFields: LineField[] = [
  { id: 'serial', label: 'S.No.', type: 'Number', required: true, form: true, pdf: true, excel: true, calculated: true },
  { id: 'picture', label: 'Product Picture', type: 'Image', required: false, form: true, pdf: true, excel: false },
  { id: 'name', label: 'Product Name', type: 'Text', required: true, form: true, pdf: true, excel: true },
  { id: 'description', label: 'Product Description', type: 'Textarea', required: false, form: true, pdf: true, excel: true },
  { id: 'quantity', label: 'Quantity', type: 'Number', required: true, form: true, pdf: true, excel: true },
  { id: 'price', label: 'Price', type: 'Number', required: true, form: true, pdf: true, excel: true },
  { id: 'gst', label: 'GST %', type: 'Number', required: true, form: true, pdf: true, excel: true, defaultValue: '18' },
  { id: 'taxable', label: 'Taxable Amount', type: 'Number', required: true, form: false, pdf: true, excel: true, calculated: true },
  { id: 'gstAmount', label: 'GST Amount', type: 'Number', required: true, form: false, pdf: true, excel: true, calculated: true },
  { id: 'total', label: 'Total Amount', type: 'Number', required: true, form: false, pdf: true, excel: true, calculated: true },
]

const savedDocuments = [
  { id: 'BSM-Q-2026-001', type: 'Quotation', customer: 'Metro Packaging Pvt. Ltd.', value: '₹4,28,400', status: 'PDF ready', date: '08/07/2026' },
  { id: 'BSM-E-2026-014', type: 'Estimate', customer: 'Northline Foods', value: '₹1,86,000', status: 'Excel ready', date: '07/07/2026' },
  { id: 'BSM-Q-2026-002', type: 'Quotation', customer: 'Apex Industries', value: '₹7,54,300', status: 'Saved draft', date: '06/07/2026' },
]

const categories = ['Packaging Machinery', 'Conveyor Systems', 'Spare Parts', 'Installation & Service']

function money(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)
}

function App() {
  const [active, setActive] = useState('quotation')
  const [items, setItems] = useState<Item[]>([
    { name: 'Industrial Conveyor System', description: 'Premium belt conveyor with BSM standard fitting', quantity: 1, price: 185000, gst: 18 },
    { name: 'Control Panel', description: 'Electrical panel with safety relay and wiring', quantity: 1, price: 42000, gst: 18 },
  ])

  const totals = useMemo(() => {
    const taxable = items.reduce((sum, item) => sum + item.quantity * item.price, 0)
    const gst = items.reduce((sum, item) => sum + item.quantity * item.price * (item.gst / 100), 0)
    return { taxable, gst, total: taxable + gst }
  }, [items])

  const nav = [
    ['quotation', 'Create Quotation'],
    ['estimate', 'Create Estimate'],
    ['documents', 'Created Documents'],
    ['settings', 'Settings'],
  ]

  const updateItem = (index: number, key: keyof Item, value: string | number) => {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, [key]: value } : item)))
  }

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="logo-block">
          <div className="logo">BSM</div>
          <div>
            <strong>BSM India</strong>
            <span>Quote Studio</span>
          </div>
        </div>
        <nav>
          {nav.map(([key, label]) => (
            <button key={key} className={active === key ? 'active' : ''} onClick={() => setActive(key)}>
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Fast document generator</p>
            <h1>{nav.find(([key]) => key === active)?.[1]}</h1>
          </div>
          <div className="header-actions">
            <button className="ghost">Preview</button>
            <button className="primary">Generate PDF</button>
          </div>
        </header>

        {active === 'quotation' && (
          <div className="page-grid">
            <section className="panel wide">
              <div className="section-title">
                <div>
                  <p className="kicker">Step 1</p>
                  <h2>Quotation details</h2>
                </div>
                <span className="pill">Configurable fields</span>
              </div>
              <div className="form-grid">
                {quotationFields.filter((field) => field.form).map((field) => (
                  <label key={field.id} className={field.type === 'Textarea' ? 'span-2' : ''}>
                    <span>{field.label}{field.required ? ' *' : ''}</span>
                    {field.type === 'Textarea' ? <textarea placeholder={field.defaultValue || field.label} /> : <input type={field.type === 'Date' ? 'date' : field.type === 'Email' ? 'email' : 'text'} placeholder={field.defaultValue || field.label} />}
                  </label>
                ))}
              </div>
            </section>

            <section className="panel summary-card">
              <p className="kicker">Live total</p>
              <h2>{money(totals.total)}</h2>
              <div className="total-row"><span>Taxable</span><strong>{money(totals.taxable)}</strong></div>
              <div className="total-row"><span>GST</span><strong>{money(totals.gst)}</strong></div>
              <div className="total-row grand"><span>Grand Total</span><strong>{money(totals.total)}</strong></div>
              <button className="primary full">Download PDF / Excel</button>
            </section>

            <LineItemsPanel items={items} updateItem={updateItem} addItem={() => setItems([...items, { name: '', description: '', quantity: 1, price: 0, gst: 18 }])} />
          </div>
        )}

        {active === 'estimate' && (
          <section className="panel">
            <div className="section-title">
              <div>
                <p className="kicker">Simple estimate builder</p>
                <h2>Create Estimate</h2>
              </div>
              <span className="pill">Categories editable in Settings</span>
            </div>
            <div className="estimate-layout">
              {categories.map((category) => <button key={category} className="category-card">{category}<small>Open estimate template</small></button>)}
            </div>
            <LineItemsPanel items={items} updateItem={updateItem} addItem={() => setItems([...items, { name: '', description: '', quantity: 1, price: 0, gst: 18 }])} compact />
          </section>
        )}

        {active === 'documents' && (
          <section className="panel">
            <div className="section-title">
              <div>
                <p className="kicker">Saved records</p>
                <h2>Created Documents</h2>
              </div>
              <input className="search" placeholder="Search customer, quote, estimate..." />
            </div>
            <div className="records">
              {savedDocuments.map((doc) => (
                <article key={doc.id} className="record-card">
                  <div><strong>{doc.id}</strong><span>{doc.type} • {doc.customer}</span></div>
                  <div><strong>{doc.value}</strong><span>{doc.date}</span></div>
                  <span className="status">{doc.status}</span>
                  <div className="mini-actions"><button>PDF</button><button>Excel</button></div>
                </article>
              ))}
            </div>
          </section>
        )}

        {active === 'settings' && (
          <div className="settings-grid">
            <SettingsPanel title="Quotation Header Fields" description="Add, hide, rename, reorder, require, default values, field type, PDF/Excel visibility." fields={quotationFields} />
            <SettingsPanel title="Line Item Fields" description="Control table columns, calculated/manual fields, GST defaults, PDF/Excel visibility." fields={lineFields} />
            <section className="panel settings-card">
              <p className="kicker">Backend configuration</p>
              <h2>Templates, Categories & Terms</h2>
              <div className="config-list">
                <button>Quotation Templates <span>3 active</span></button>
                <button>Estimate Categories <span>{categories.length} categories</span></button>
                <button>Terms & Conditions <span>PDF footer</span></button>
                <button>GST Defaults <span>Simple GST only</span></button>
                <button>Export Rules <span>PDF + Excel</span></button>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  )
}

function LineItemsPanel({ items, updateItem, addItem, compact = false }: { items: Item[]; updateItem: (index: number, key: keyof Item, value: string | number) => void; addItem: () => void; compact?: boolean }) {
  return (
    <section className={`panel line-panel ${compact ? 'compact' : 'wide'}`}>
      <div className="section-title">
        <div>
          <p className="kicker">Step 2</p>
          <h2>Product line items</h2>
        </div>
        <button className="ghost" onClick={addItem}>+ Add item</button>
      </div>
      <div className="line-table">
        <div className="line-head"><span>Image</span><span>Product</span><span>Qty</span><span>Price</span><span>GST %</span><span>Total</span></div>
        {items.map((item, index) => {
          const taxable = item.quantity * item.price
          const total = taxable + taxable * (item.gst / 100)
          return (
            <div className="line-row" key={index}>
              <label className="upload-box">Upload<input type="file" accept="image/*" /></label>
              <div className="product-inputs">
                <input value={item.name} onChange={(e) => updateItem(index, 'name', e.target.value)} placeholder="Product name" />
                <input value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} placeholder="Description" />
              </div>
              <input type="number" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))} />
              <input type="number" value={item.price} onChange={(e) => updateItem(index, 'price', Number(e.target.value))} />
              <input type="number" value={item.gst} onChange={(e) => updateItem(index, 'gst', Number(e.target.value))} />
              <strong>{money(total)}</strong>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function SettingsPanel({ title, description, fields }: { title: string; description: string; fields: Field[] }) {
  return (
    <section className="panel settings-card">
      <div className="section-title">
        <div>
          <p className="kicker">Configurable</p>
          <h2>{title}</h2>
        </div>
        <button className="ghost">+ Add field</button>
      </div>
      <p className="muted">{description}</p>
      <div className="field-list">
        {fields.slice(0, 8).map((field, index) => (
          <article key={field.id}>
            <div><strong>{index + 1}. {field.label}</strong><span>{field.type} • {field.required ? 'Mandatory' : 'Optional'}</span></div>
            <div className="toggles"><span>{field.form ? 'Form' : 'Hidden'}</span><span>{field.pdf ? 'PDF' : 'No PDF'}</span><span>{field.excel ? 'Excel' : 'No Excel'}</span></div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default App
