import type { MonthlySales } from './analysis'
import { monthLabel } from './analysis'

export default function MonthlyChart({ monthly }: { monthly: readonly MonthlySales[] }) {
  const max = Math.max(1, ...monthly.map(row => row.units ?? 0))
  const width = Math.max(720, monthly.length * 40 + 80)
  const plotHeight = 160
  return <div className="chart-scroll" tabIndex={0} role="region" aria-label="Gráfico mensual, desplaza horizontalmente para ver todos los meses">
    <svg viewBox={`0 0 ${width} 250`} style={{ minWidth: width }} role="img" aria-labelledby="chart-title chart-description">
      <title id="chart-title">Unidades vendidas por mes</title>
      <desc id="chart-description">Ventas observadas. Las barras muestran los mismos totales que la tabla mensual. Un guion indica datos incompletos. No se estima demanda real.</desc>
      {[0, 0.5, 1].map(factor => <g key={factor}><line x1="50" x2={width - 12} y1={190 - plotHeight * factor} y2={190 - plotHeight * factor} stroke="#e3e9dc" /><text x="42" y={194 - plotHeight * factor} textAnchor="end" fontSize="10" fill="#596952">{Math.round(max * factor)}</text></g>)}
      {monthly.map((row, i) => {
        const x = 58 + i * ((width - 80) / monthly.length)
        const height = row.units === null ? 0 : row.units / max * plotHeight
        return <g key={row.month} data-month={row.month} data-units={row.units ?? 'missing'}>
          <title>{monthLabel(row.month)}: {row.units ?? 'datos incompletos'}{row.stockoutRecords ? '; hubo faltantes de inventario' : ''}{row.promotionRecords ? '; hubo promociones' : ''}</title>
          {row.units !== null ? <rect x={x} y={190 - height} width="21" height={Math.max(height, 1)} rx="3" fill={row.stockoutRecords ? '#b18337' : '#446e50'} /> : <text x={x + 10} y="177" textAnchor="middle">—</text>}
          <text x={x + 10} y={row.units === null ? 157 : 182 - height} textAnchor="middle" fontSize="9" fill="#314d39">{row.units ?? 'N/D'}</text>
          <text x={x + 10} y="211" textAnchor="middle" fontSize="9" fill="#596952">{monthLabel(row.month).slice(0, 3)}</text>
          <text x={x + 10} y="227" textAnchor="middle" fontSize="9" fill="#596952">{row.month.slice(0, 4)}</text>
        </g>
      })}
    </svg>
  </div>
}
