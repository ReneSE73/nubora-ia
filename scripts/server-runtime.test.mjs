import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'
import { buildServer, root } from './build-server.mjs'

function node(code, cwd, env = {}) {
  return spawnSync(process.execPath, ['--input-type=module', '--eval', code], {
    cwd, env: { COPILOT_ENABLED: 'false', ...env }, encoding: 'utf8', timeout: 20000,
  })
}

test('reproduce el fallo original: Node ESM no agrega .js a un import relativo', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'nubora-esm-original-'))
  try {
    await mkdir(resolve(dir, 'api')); await mkdir(resolve(dir, 'server'))
    await writeFile(resolve(dir, 'package.json'), '{"type":"module"}')
    const source = await readFile(resolve(root, 'api/copilot.ts'), 'utf8')
    const emitted = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    await writeFile(resolve(dir, 'api/copilot.js'), emitted)
    // El módulo existe con extensión .js; se falla antes de evaluar su contenido.
    await writeFile(resolve(dir, 'server/copilot.js'), 'export const createHandler = () => () => new Response();')
    const result = node("await import('./api/copilot.js')", dir)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /ERR_MODULE_NOT_FOUND/)
    assert.match(result.stderr, /server\/copilot/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('bundle desplegable carga aislado, incluye SDK/JSON y sirve HTTP sin acceder a Gemini', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'nubora-runtime-'))
  try {
    const deployment = JSON.parse(await readFile(resolve(root, 'vercel.json'), 'utf8'))
    assert.equal(deployment.framework, null)
    assert.equal(deployment.buildCommand, 'npm run build')
    const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
    assert.match(pkg.scripts.build, /node scripts\/build-server\.mjs/)
    const output = resolve(dir, 'output')
    const { functionDir, metafile } = await buildServer(output)
    const routing = JSON.parse(await readFile(resolve(output, 'config.json'), 'utf8'))
    assert.equal(routing.version, 3)
    assert.deepEqual(routing.routes.slice(0, 2), [{ src: '/api/copilot', dest: '/api/copilot' }, { src: '/api/.*', status: 404 }])
    assert.deepEqual(routing.routes.at(-1), { src: '/.*', dest: '/index.html' })
    const inputs = Object.keys(metafile.inputs)
    for (const path of ['api/copilot.ts', 'server/copilot.ts', 'src/copilot/context.ts', 'src/forecast/ml/results.json']) assert.ok(inputs.includes(path), `Falta ${path}`)
    assert.ok(inputs.some(p => p.includes('@google/genai/dist/node/index.mjs')), 'Falta SDK Node de Gemini')
    const config = JSON.parse(await readFile(resolve(functionDir, '.vc-config.json'), 'utf8'))
    assert.equal(config.runtime, 'nodejs22.x'); assert.equal(config.handler, 'index.mjs')
    assert.equal(config.launcherType, 'Nodejs'); assert.equal(config.maxDuration, 20)
    // Sólo copiar .func a otra raíz: no src, server, node_modules ni archivos del repo.
    const isolated = resolve(dir, 'isolated')
    await cp(functionDir, isolated, { recursive: true })
    const code = `
      import assert from 'node:assert/strict';
      import { createServer } from 'node:http';
      const nativeFetch = globalThis.fetch;
      let providerCalls = 0;
      globalThis.fetch = async () => {
        providerCalls++;
        return new Response(JSON.stringify({error:{code:429,message:'simulado',status:'RESOURCE_EXHAUSTED'}}),{status:429,headers:{'Content-Type':'application/json'}});
      };
      const { default: handler } = await import(${JSON.stringify(pathToFileURL(resolve(isolated, 'index.mjs')).href)});
      assert.equal(typeof handler, 'function');
      const server = createServer(handler); await new Promise(r => server.listen(0,'127.0.0.1',r));
      try {
        const url = 'http://127.0.0.1:'+server.address().port+'/api/copilot';
        let r = await nativeFetch(url); assert.equal(r.status,405);
        r = await nativeFetch(url,{method:'POST'});
        if (process.env.COPILOT_ENABLED !== 'true') {
          assert.equal(r.status,503); assert.match((await r.json()).error,/No se ha consultado IA/); assert.equal(providerCalls,0);
        } else {
          r = await nativeFetch(url,{method:'POST',headers:{origin:'https://runtime.test','content-type':'application/json'},body:'{'}); assert.equal(r.status,400);
          r = await nativeFetch(url,{method:'POST',headers:{origin:'https://runtime.test','content-type':'application/json'},body:JSON.stringify({question:'Explica la compra',settings:{sku:'',category:'',start:'2024-01',end:'2025-12',budget:'25000.00'}})});
          assert.equal(r.status,502); assert.equal(providerCalls,1); assert.doesNotMatch(await r.text(),/runtime-test-not-a-real-key|ERR_MODULE_NOT_FOUND/);
        }
        console.log('runtime-http-ok');
      } finally { server.closeAllConnections(); await new Promise(r=>server.close(r)); }
    `
    for (const env of [{}, { COPILOT_ENABLED: 'true', GEMINI_API_KEY: 'runtime-test-not-a-real-key', COPILOT_ORIGIN: 'https://runtime.test' }]) {
      const result = node(code, isolated, env)
      assert.equal(result.status, 0, result.stderr || result.stdout)
      assert.match(result.stdout, /runtime-http-ok/)
    }
    const bundle = await readFile(resolve(isolated, 'index.mjs'), 'utf8')
    assert.doesNotMatch(bundle, /runtime-test-not-a-real-key/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
