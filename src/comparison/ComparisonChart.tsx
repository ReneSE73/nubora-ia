import type { Strategy } from './model'

export default function ComparisonChart({ baseline, optimized }: { baseline: Strategy; optimized: Strategy }) {
  const strategies = [{ id: 'baseline', title: 'Proporcional', plan: baseline, color: '#a4ae8b' }, { id: 'optimized', title: 'Optimizado', plan: optimized, color: '#37644a' }]
  const maximum = Math.max(1, baseline.recommendedUnits, optimized.recommendedUnits)
  return <div className="chart-scroll" role="region" aria-label="Gráfica comparativa desplazable" tabIndex={0}>
    <svg viewBox="0 0 680 275" style={{ minWidth: 600 }} role="img" aria-labelledby="comparison-chart-title comparison-chart-description">
      <title id="comparison-chart-title">Unidades compradas y cobertura por estrategia</title><desc id="comparison-chart-description">Dos paneles con escalas separadas: unidades compradas y porcentaje de demanda cubierta. Baseline en gris claro; optimizado en verde. Los totales son globales, independientemente de los filtros.</desc>
      <text x="175" y="23" textAnchor="middle" fontSize="13">Unidades compradas</text><text x="505" y="23" textAnchor="middle" fontSize="13">Cobertura estimada (%)</text>
      {[0, 0.5, 1].map(factor => <g key={factor}><line x1="45" x2="315" y1={210 - factor * 150} y2={210 - factor * 150} stroke="#e1e7d8" /><text x="39" y={214 - factor * 150} textAnchor="end" fontSize="10">{Math.round(maximum * factor)}</text><line x1="375" x2="645" y1={210 - factor * 150} y2={210 - factor * 150} stroke="#e1e7d8" /><text x="369" y={214 - factor * 150} textAnchor="end" fontSize="10">{factor * 100}</text></g>)}
      {strategies.map(({ id, title, plan, color }, i) => <g key={id} data-strategy={id} data-units={plan.recommendedUnits} data-coverage={plan.coveragePercent ?? 'missing'}>
        <title>{title}: {plan.recommendedUnits} unidades; cobertura {plan.coveragePercent === null ? 'N/D' : plan.coveragePercent.toFixed(2) + '%'}</title>
        <rect x={85 + i * 130} y={210 - plan.recommendedUnits / maximum * 150} width="55" height={Math.max(1, plan.recommendedUnits / maximum * 150)} fill={color} stroke="#37644a" strokeDasharray={i === 0 ? '4 2' : undefined} />
        <text x={112 + i * 130} y={200 - plan.recommendedUnits / maximum * 150} textAnchor="middle" fontSize="12">{plan.recommendedUnits}</text><text x={112 + i * 130} y="233" textAnchor="middle" fontSize="11">{title}</text>
        {plan.coveragePercent === null ? <text x={442 + i * 130} y="190" textAnchor="middle" fontSize="12">N/D</text> : <><rect x={415 + i * 130} y={210 - plan.coveragePercent * 1.5} width="55" height={Math.max(1, plan.coveragePercent * 1.5)} fill={color} stroke="#37644a" strokeDasharray={i === 0 ? '4 2' : undefined} /><text x={442 + i * 130} y={200 - plan.coveragePercent * 1.5} textAnchor="middle" fontSize="12">{plan.coveragePercent.toFixed(2)} %</text></>}
        <text x={442 + i * 130} y="233" textAnchor="middle" fontSize="11">{title}</text>
      </g>)}
    </svg>
  </div>
}
