import { build } from 'esbuild'
import { builtinModules } from 'node:module'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = fileURLToPath(new URL('../', import.meta.url))
export async function buildServer(output = resolve(root, '.vercel/output')) {
  const functionDir = resolve(output, 'functions/api/copilot.func')
  await rm(functionDir, { recursive: true, force: true })
  await mkdir(functionDir, { recursive: true })
  const result = await build({
    absWorkingDir: root, entryPoints: ['server/node-entry.ts'],
    outfile: resolve(functionDir, 'index.mjs'), bundle: true, platform: 'node',
    format: 'esm', target: 'node22', metafile: true, sourcemap: false,
    // ws (dependencia del SDK) utiliza su fallback JS/nativo Node, sin addons opcionales.
    define: { 'process.env.WS_NO_BUFFER_UTIL': '"1"', 'process.env.WS_NO_UTF_8_VALIDATE': '"1"' },
    // SDK/dependencias CJS pueden requerir módulos nativos desde un bundle ESM.
    banner: { js: "import { createRequire as __nodeCreateRequire } from 'node:module'; const require = __nodeCreateRequire(import.meta.url);" },
    // Sin packages:external ni sustitución/lectura de variables de claves o .env: incluye SDK y JSON, no secretos.
  })
  const native = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)])
  const unresolved = Object.values(result.metafile.outputs).flatMap(o => o.imports).filter(i => i.external && !native.has(i.path))
  if (unresolved.length) throw new Error(`Dependencias externas no empaquetadas: ${unresolved.map(i => i.path).join(', ')}`)
  await writeFile(resolve(functionDir, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', maxDuration: 20 }, null, 2))
  // Auditoría fuera de static y de la función: sólo nombres/rutas/tamaños, sin contenido.
  await writeFile(resolve(output, 'copilot-build-meta.json'), JSON.stringify(result.metafile, null, 2))
  await writeFile(resolve(output, 'config.json'), JSON.stringify({ version: 3, routes: [
    { src: '/api/copilot', dest: '/api/copilot' },
    { src: '/api/.*', status: 404 },
    { handle: 'filesystem' },
    { src: '/.*', dest: '/index.html' },
  ] }, null, 2))
  return { functionDir, metafile: result.metafile }
}
export async function buildDeployment() {
  const output = resolve(root, '.vercel/output')
  await buildServer(output)
  await rm(resolve(output, 'static'), { recursive: true, force: true })
  await cp(resolve(root, 'dist'), resolve(output, 'static'), { recursive: true })
  // Evita publicar por error código de servidor bajo static.
  await readFile(resolve(output, 'static/index.html'))
  console.log('Vercel Build Output API: SPA + api/copilot.func/index.mjs (Node 22, dependencias incluidas).')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildDeployment()
