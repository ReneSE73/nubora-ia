import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createDataset } from '../src/history/data.ts'
import { datasetSignature } from '../src/forecast/ml/dataSignature.ts'

const args = process.argv.slice(2)
if (args.length && (args[0] !== '--output' || args.length !== 2)) throw new Error('Uso: npm run ml:export -- [--output ruta.json]')
const output = args[1] ?? 'work/ml-dataset.json'
const dataset = createDataset()
await mkdir(dirname(output), { recursive: true })
await writeFile(output, JSON.stringify({ schema_version: 1, signature: datasetSignature(dataset), dataset }, null, 2) + '\n')
console.log(`Dataset exportado desde createDataset(): ${dataset.products.length} SKU, ${dataset.sales.length} registros → ${output}`)
