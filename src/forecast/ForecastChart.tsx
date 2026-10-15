import { monthLabel } from '../history/analysis'
import type { Prediction } from './engine'

export default function ForecastChart({ history, forecast }: { history: readonly Prediction[]; forecast: readonly Prediction[] }) {
  const points = [...history.map(point => ({ ...point, kind: 'history' })), ...forecast.map(point => ({ ...point, kind: 'forecast' }))]
  const width = Math.max(760, points.length * 28 + 70)
  const maximum = Math.max(1, ...points.map(point => point.units ?? 0))
  const boundary = 54 + history.length * 28 - 5
  return <div className="chart-scroll" role="region" tabIndex={0} aria-label="Gráfica de histórico y pronóstico desplazable">
    <svg role="img" aria-labelledby="forecast-chart-title forecast-chart-desc" viewBox={`0 0 ${width} 260`} style={{ minWidth: width }}>
      <title id="forecast-chart-title">Histórico observado y pronóstico demostrativo de unidades</title>
      <desc id="forecast-chart-desc">Histórico: barras verdes sólidas. Pronóstico: barras naranjas con borde discontinuo, a la derecha del corte de diciembre de 2025. Los meses sin datos se muestran como N/D.</desc>
      <rect x={boundary} y="10" width={width - boundary} height="225" fill="#fff3dc" />
      {[0, 0.5, 1].map(factor => <g key={factor}><line x1="46" x2={width - 10} y1={195 - factor * 155} y2={195 - factor * 155} stroke="#dce5d5" /><text x="40" y={199 - factor * 155} textAnchor="end" fontSize="10" fill="#4e6249">{Math.round(maximum * factor)}</text></g>)}
      <line x1={boundary} x2={boundary} y1="10" y2="235" stroke="#a87922" strokeDasharray="5 4" />
      {points.map((point, i) => {
        const x = 54 + i * 28
        const height = (point.units ?? 0) / maximum * 155
        return <g key={point.month} data-kind={point.kind} data-month={point.month} data-units={point.units ?? 'missing'}>
          <title>{monthLabel(point.month)} · {point.kind === 'forecast' ? 'Pronóstico DEMOSTRATIVO' : 'Ventas observadas'}: {point.units ?? 'N/D'} unidades</title>
          {point.units === null ? <text x={x + 9} y="178" textAnchor="middle" fontSize="10">N/D</text> : <rect x={x} y={195 - height} width="18" height={Math.max(1, height)} fill={point.kind === 'forecast' ? '#edc878' : '#446e50'} stroke={point.kind === 'forecast' ? '#946517' : '#446e50'} strokeDasharray={point.kind === 'forecast' ? '4 2' : undefined} rx="2" />}
          <text x={x + 9} y={point.units === null ? 158 : 187 - height} textAnchor="middle" fontSize="9" fill="#314d39">{point.units ?? ''}</text>
          <text x={x + 9} y="217" textAnchor="middle" fontSize="9">{monthLabel(point.month).slice(0, 3)}</text>
          <text x={x + 9} y="233" textAnchor="middle" fontSize="9">{point.month.slice(0, 4)}</text>
        </g>
      })}
    </svg>
  </div>
}
