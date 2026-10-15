import type { PlanRow } from './model'

export default function PurchaseChart({ rows }: { rows: readonly PlanRow[] }) {
  const width = Math.max(600, rows.length * 44 + 80)
  const maximum = Math.max(1, ...rows.map(row => row.need ?? 0))
  return <div className="chart-scroll" role="region" aria-label="Gráfica de necesidad y compra desplazable" tabIndex={0}>
    <svg role="img" aria-labelledby="purchase-chart-title purchase-chart-desc" viewBox={`0 0 ${width} 250`} style={{ minWidth: width }}>
      <title id="purchase-chart-title">Necesidad frente a compra recomendada por SKU</title>
      <desc id="purchase-chart-desc">Necesidad en barra clara con borde discontinuo; compra recomendada en verde sólido. N/D indica SKU excluido. Los filtros sólo modifican esta visualización, no el plan global.</desc>
      {[0, 0.5, 1].map(factor => <g key={factor}><line x1="44" x2={width - 10} y1={190 - factor * 150} y2={190 - factor * 150} stroke="#dce5d5" /><text x="38" y={194 - factor * 150} fontSize="10" textAnchor="end">{Math.round(maximum * factor)}</text></g>)}
      {rows.map((row, i) => {
        const x = 54 + i * ((width - 80) / rows.length)
        return <g key={`${row.sku}-${i}`} data-sku={row.sku} data-need={row.need ?? 'missing'} data-quantity={row.quantity ?? 'missing'}>
          <title>{row.sku}: necesidad {row.need ?? 'N/D'}; compra {row.quantity ?? 'N/D'} unidades</title>
          {row.need !== null && <rect x={x} y={190 - row.need / maximum * 150} width="14" height={Math.max(1, row.need / maximum * 150)} fill="#e5eaca" stroke="#798c5c" strokeDasharray="3 2" />}
          {row.quantity !== null ? <rect x={x + 16} y={190 - row.quantity / maximum * 150} width="14" height={Math.max(1, row.quantity / maximum * 150)} fill="#37644a" /> : <text x={x + 15} y="178" fontSize="9" textAnchor="middle">N/D</text>}
          <text x={x + 14} y="210" fontSize="9" textAnchor="middle">SKU</text><text x={x + 14} y="226" fontSize="9" textAnchor="middle">{row.sku.replace('SKU-', '')}</text>
        </g>
      })}
    </svg>
  </div>
}
