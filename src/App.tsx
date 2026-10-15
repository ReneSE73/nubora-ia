import { useState } from 'react'
import History from './history/History'
import Forecast from './forecast/Forecast'
import PurchasePlan from './purchases/PurchasePlan'
import Comparison from './comparison/Comparison'

const modules = [
  { id: 'CU-01', title: 'Historial', symbol: '◷', description: 'Consulta los movimientos que darán contexto a tus decisiones de inventario.' },
  { id: 'CU-02', title: 'Pronóstico', symbol: '↗', description: 'Pronósticos demostrativos por SKU para enero, febrero y marzo de 2026.' },
  { id: 'CU-03', title: 'Plan de compra', symbol: '▤', description: 'Optimización matemática de compra con presupuesto global en pesos mexicanos.' },
  { id: 'CU-04', title: 'Comparación', symbol: '⇄', description: 'Compara el plan optimizado con un baseline proporcional bajo el mismo presupuesto.' },
] as const

export default function App() {
  const [active, setActive] = useState(0)
  const current = modules[active]
  return (
    <div className="app-shell">
      <a href="#contenido" className="skip-link">Saltar al contenido</a>
      <aside className="sidebar">
        <a className="brand" href="#" onClick={() => setActive(0)} aria-label="Nubora, inicio"><span className="brand-mark">n</span> nubora<span className="brand-dot">®</span></a>
        <p className="nav-label">ESPACIO DE TRABAJO</p>
        <nav aria-label="Casos de uso">
          {modules.map((item, index) => <button key={item.id} onClick={() => setActive(index)} aria-current={active === index ? 'page' : undefined} className={`nav-item ${active === index ? 'selected' : ''}`}><span aria-hidden="true" className="nav-symbol">{item.symbol}</span><span><small>{item.id}</small>{item.title}</span></button>)}
        </nav>
        <div className="sidebar-note"><span className="status-dot" /> Versión inicial<p>Un espacio para decidir<br />con más perspectiva.</p></div>
      </aside>
      <div className="main-shell">
        <header className="topbar"><span>Gestión de inventario <span className="breadcrumb">/ {current.title}</span></span><span className="currency">MXN · Pesos mexicanos</span></header>
        <main id="contenido">
          <div className="flex flex-wrap items-center justify-between gap-4"><p className="eyebrow">TU INVENTARIO, CON PERSPECTIVA</p><span className="outline-badge">Aplicación en desarrollo</span></div>
          <div className="page-heading"><div><p className="case-id">{current.id}</p><h1>{current.title}</h1><p className="description">{current.description}</p></div><span className="heading-symbol" aria-hidden="true">{current.symbol}</span></div>
          {active === 0 ? <History /> : active === 1 ? <Forecast /> : active === 2 ? <PurchasePlan /> : <Comparison />}
          <section className="roadmap" aria-label="Ruta de trabajo"><p className="eyebrow">DE LOS DATOS A LA DECISIÓN</p><div className="roadmap-grid">{modules.map((item, index) => <button onClick={() => setActive(index)} className={`roadmap-item ${active === index ? 'active' : ''}`} key={item.id}><span className="roadmap-number">0{index + 1}</span><span><strong>{item.title}</strong><small>{index === 0 ? 'Ventas históricas' : index === 1 ? 'Demostrativo' : index === 2 ? 'Optimización' : 'Dos estrategias'}</small></span><span aria-hidden="true">↗</span></button>)}</div></section>
          <footer className="footer"><span>nubora · Planea con claridad.</span><span>SPA inicial · Sin integraciones externas</span></footer>
        </main>
      </div>
    </div>
  )
}
