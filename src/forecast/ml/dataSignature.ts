import type { Dataset } from '../../history/data'

/** Firma de igualdad no criptográfica para detectar artefactos ajenos o desactualizados. */
export function datasetSignature(dataset: Dataset): string {
  const order = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
  const canonical = JSON.stringify({
    inventoryAsOf: dataset.inventoryAsOf,
    products: [...dataset.products].sort((a, b) => order(a.sku, b.sku)).map(p => [p.sku, p.name, p.category, p.currentInventory]),
    sales: [...dataset.sales].sort((a, b) => order(`${a.sku}/${a.month}`, `${b.sku}/${b.month}`)).map(r => [r.sku, r.month, r.units, r.acquisitionCostCents, r.salePriceCents, r.promotion, r.stockouts]),
  })
  let hash = 2166136261
  for (let i = 0; i < canonical.length; i++) hash = Math.imul(hash ^ canonical.charCodeAt(i), 16777619) >>> 0
  return `fnv1a32-${hash.toString(16).padStart(8, '0')}`
}
