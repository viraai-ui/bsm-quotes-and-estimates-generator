import './App.css'

const features = [
  'Fast quote creation for BSM sales teams',
  'Clean estimate summaries for customers',
  'Ready for pricing logic, approvals, and PDF exports',
]

function App() {
  return (
    <main className="app-shell">
      <nav className="nav">
        <div className="brand-mark">BSM</div>
        <span>Quotes & Estimates Generator</span>
      </nav>

      <section className="hero-card">
        <p className="eyebrow">New BSM project</p>
        <h1>BSM Quotes and Estimates Generator</h1>
        <p className="lead">
          A premium internal tool foundation for creating professional quotes,
          estimates, and customer-ready pricing documents.
        </p>

        <div className="actions">
          <button type="button">Create Quote</button>
          <a href="mailto:info@bsmindia.com">Contact BSM</a>
        </div>
      </section>

      <section className="feature-grid" aria-label="Project features">
        {features.map((feature) => (
          <article key={feature}>
            <span className="dot" />
            <p>{feature}</p>
          </article>
        ))}
      </section>
    </main>
  )
}

export default App
