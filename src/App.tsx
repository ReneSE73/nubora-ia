import { useState } from 'react'

const modules = [
  { id: 'CU-01', title: 'Historial', symbol: '◷', description: 'Consulta los movimientos que darán contexto a tus decisiones de inventario.' },
  { id: 'CU-02', title: 'Pronóstico', symbol: '↗', description: 'Estimación de demanda a partir del historial. Este módulo está pendiente de implementación.' },
  { id: 'CU-03', title: 'Plan de compra', symbol: '▤', description: 'Planificación de reposición con presupuesto en pesos mexicanos. Este módulo está pendiente de implementación.' },
  { id: 'CU-04', title: 'Comparación', symbol: '⇄', description: 'Comparación de escenarios de reposición. Este módulo está pendiente de implementación.' },
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
          {modules.map((item, index) => <button key={item.id} onClick={() => setActive(index)} aria-current={active === index ? 'page' : undefined} className={`nav-item ${active === index ? 'selected' : ''}`}><span aria-hidden="true" className="nav-symbol">{item.symbol}</span><span><small>{item.id}</small>{item.title}</span>{index > 0 && <span className="pending-dot" aria-label="Pendiente" />}</button>)}
        </nav>
        <div className="sidebar-note"><span className="status-dot" /> Versión inicial<p>Un espacio para decidir<br />con más perspectiva.</p></div>
      </aside>
      <div className="main-shell">
        <header className="topbar"><span>Gestión de inventario <span className="breadcrumb">/ {current.title}</span></span><span className="currency">MXN · Pesos mexicanos</span></header>
        <main id="contenido">
          <div className="flex flex-wrap items-center justify-between gap-4"><p className="eyebrow">TU INVENTARIO, CON PERSPECTIVA</p><span className="outline-badge">Aplicación en desarrollo</span></div>
          <div className="page-heading"><div><p className="case-id">{current.id}</p><h1>{current.title}</h1><p className="description">{current.description}</p></div><span className="heading-symbol" aria-hidden="true">{current.symbol}</span></div>
          {active === 0 ? <>
            <section className="intro-card" aria-label="Punto de partida"><div className="intro-icon" aria-hidden="true">↗</div><div><h2>Las buenas decisiones empiezan con tu historial.</h2><p>Aquí podrás consultar la información de tus movimientos y construir una base para planificar la reposición.</p></div><span className="step-label">01 / 04</span></section>
            <section className="data-panel" aria-labelledby="movimientos"><div className="panel-header"><h2 id="movimientos">Historial de movimientos</h2><span className="neutral-badge">Sin datos</span></div><div className="empty-state"><span className="empty-icon" aria-hidden="true">▤</span><h3>Tu historial comienza aquí</h3><p>Aún no hay movimientos disponibles.<br />La carga y consulta de datos se implementarán en una siguiente etapa.</p><span className="text-tag">Sin información conectada</span></div><div className="panel-footer"><span>Los importes se mostrarán en MXN.</span><span>Sin registros disponibles</span></div></section>
          </> : <section className="data-panel" aria-labelledby="pendiente"><div className="panel-header"><h2 id="pendiente">Módulo pendiente</h2><span className="neutral-badge">{current.id}</span></div><div className="empty-state"><span className="empty-icon" aria-hidden="true">{current.symbol}</span><h3>En preparación</h3><p>Esta funcionalidad aún no está disponible.<br />No hay cálculos ni resultados generados.</p><button className="return-button" onClick={() => setActive(0)}>Volver a Historial <span aria-hidden="true">→</span></button></div></section>}
          <section className="roadmap" aria-label="Ruta de trabajo"><p className="eyebrow">DE LOS DATOS A LA DECISIÓN</p><div className="roadmap-grid">{modules.map((item, index) => <button onClick={() => setActive(index)} className={`roadmap-item ${active === index ? 'active' : ''}`} key={item.id}><span className="roadmap-number">0{index + 1}</span><span><strong>{item.title}</strong><small>{index === 0 ? 'Interfaz inicial' : 'Pendiente'}</small></span><span aria-hidden="true">↗</span></button>)}</div></section>
          <footer className="footer"><span>nubora · Planea con claridad.</span><span>SPA inicial · Sin integraciones externas</span></footer>
        </main>
      </div>
    </div>
  )
}
