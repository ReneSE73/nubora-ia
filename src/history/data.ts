export interface Product {
  sku: string
  name: string
  category: string
  currentInventory: number
}

export interface Sale {
  sku: string
  month: string // YYYY-MM, registro mensual explícito; cero no significa ausencia.
  units: number
  acquisitionCostCents: number // Costo unitario, MXN.
  salePriceCents: number // Precio unitario efectivo, MXN.
  promotion: boolean
  stockouts: { start: string; end: string }[] // Fechas inclusivas.
}

export interface Dataset {
  products: Product[]
  sales: Sale[]
  inventoryAsOf: string
}

export const FIRST_MONTH = '2024-01'
export const LAST_MONTH = '2025-12'

const catalog = [
  ['Café de altura 500 g', 'Despensa'], ['Arroz integral 1 kg', 'Despensa'],
  ['Avena 500 g', 'Despensa'], ['Miel 350 g', 'Despensa'], ['Pasta 200 g', 'Despensa'],
  ['Agua mineral 1 L', 'Bebidas'], ['Té verde 20 sobres', 'Bebidas'],
  ['Jugo de naranja 1 L', 'Bebidas'], ['Chocolate en polvo 400 g', 'Bebidas'], ['Bebida de avena 1 L', 'Bebidas'],
  ['Jabón de manos 250 ml', 'Cuidado personal'], ['Champú 400 ml', 'Cuidado personal'],
  ['Pasta dental 100 ml', 'Cuidado personal'], ['Crema corporal 250 ml', 'Cuidado personal'], ['Protector solar 100 ml', 'Cuidado personal'],
  ['Detergente 1 L', 'Hogar'], ['Limpiador 1 L', 'Hogar'], ['Esponjas 3 piezas', 'Hogar'],
  ['Servilletas 100 piezas', 'Hogar'], ['Bolsas de basura 10 piezas', 'Hogar'],
] as const

/** Fixture v1: aritmética entera, sin Math.random, reloj, red ni almacenamiento. */
export function createDataset(): Dataset {
  const products = catalog.map(([name, category], i) => ({
    sku: `SKU-${String(i + 1).padStart(3, '0')}`,
    name, category, currentInventory: (i * 17 + 31) % 150,
  }))
  const seasonalFactors = [85, 82, 96, 100, 110, 118, 113, 105, 98, 106, 135, 148]
  const sales = products.flatMap((product, i) => Array.from({ length: 24 }, (_, t): Sale => {
    const year = 2024 + Math.floor(t / 12)
    const monthNumber = t % 12 + 1
    const month = `${year}-${String(monthNumber).padStart(2, '0')}`
    const promotion = (i + t) % 7 === 0
    const stockoutDays = (i * 3 + t) % 11 === 0 ? 6 : 0
    const base = Math.floor((22 + i * 4) * seasonalFactors[t % 12] / 100)
    const units = i === 19 && t === 1 ? 0 : Math.max(0, base + Math.floor(t / 12) * 5 + (promotion ? 13 : 0) - stockoutDays * 3)
    return {
      sku: product.sku, month, units,
      acquisitionCostCents: 1800 + i * 225 + Math.floor(t / 12) * 100,
      salePriceCents: 3200 + i * 350 + Math.floor(t / 12) * 150 - (promotion ? 300 : 0),
      promotion,
      stockouts: stockoutDays ? [{ start: `${month}-10`, end: `${month}-15` }] : [],
    }
  }))
  return { products, sales, inventoryAsOf: '2025-12-31' }
}

export const demoDataset = createDataset()
