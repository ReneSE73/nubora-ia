export function formatMXN(value: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', currencyDisplay: 'code' }).format(value)
}
