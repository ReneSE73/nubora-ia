# CU-05 · NUBORA AI Copilot

Chat de explicación, con llamadas **reales** a Google Gemini API mediante el SDK oficial `@google/genai` desde `server/web-entry.ts` (entrada Web, empaquetada como función Node de Vercel). No hay respuestas IA locales pregrabadas ni fallback simulado. El frontend sólo conoce `/api/copilot`; la clave nunca se importa desde `src` ni usa prefijo `VITE_`.

## Configurar en Vercel

1. Importar el repositorio, seleccionar la rama del PR como Preview. `vercel.json` usa `framework: null` (Other) y `npm run build`: Vite sigue compilando la SPA y un paso explícito genera `.vercel/output` con Build Output API v3. No activar un override de Output Directory a `dist` en el proyecto: debe consumirse `.vercel/output/config.json`, que publica la SPA y `/api/copilot`. La función declara Node 22 y duración máxima de 20 segundos. No modificar Production para esta revisión. Instalar con `npm ci`.
2. En Settings → Environment Variables, verificar **sólo para el servidor**:
   - `GEMINI_API_KEY`: única clave del proveedor, leída explícitamente desde `process.env.GEMINI_API_KEY` en el servidor. Ya está configurada por el propietario en Preview y Production; no copiar ni mostrar su valor. No escribirla en el repositorio, chat ni capturas.
   - `GEMINI_MODEL`: opcional; predeterminado `gemini-3.1-flash-lite` tras diagnosticar HTTP 404 del proveedor. Modelo de texto con salida JSON estructurada y presupuesto de pensamiento configurable; usar un modelo disponible en el proyecto que soporte salida JSON. Gemini 3.1 Flash-Lite figura con nivel gratuito en la documentación consultada; la disponibilidad, cuotas y facturación dependen del proyecto/región y pueden cambiar. No existe fallback a un modelo de pago. El modo de facturación de la cuenta no se decide desde el código.
   - `COPILOT_ENABLED=true`: interruptor explícito. Cualquier otro valor deshabilita llamadas.
   - `COPILOT_ORIGIN`: origen exacto del despliegue, sin barra final, por ejemplo `https://tu-preview.vercel.app`. Actualizarlo cuando cambie el dominio Preview y volver a desplegar. No admite comodines ni orígenes de terceros.
3. Desplegar Preview y consultar CU-05. Comprobar en Network que la respuesta es 200, contiene `answer`, `sources` y el modelo configurado; confirmar que la clave nunca aparece en peticiones del navegador. No incluir secretos en evidencias.
4. Configurar límites de gasto/cuota en el proyecto Gemini del proveedor y reglas de rate limiting/WAF en Vercel antes de abrirlo a tráfico público. El limitador en memoria es básico y NO es una cuota monetaria global.
5. Para deshabilitar, establecer `COPILOT_ENABLED=false` y redesplegar.

Para verificar empaquetado local ejecutar `npm run build` y `npm run test:runtime`, sin credenciales. El artefacto de despliegue es `.vercel/output`; usar la CLI oficial `vercel build`/`vercel deploy --prebuilt` sólo con un proyecto Preview autorizado (nunca `--prod` en esta revisión). `npm run dev` y `npm run preview` de Vite sirven sólo la SPA: sin función mostrarán indisponibilidad, nunca una respuesta falsa. No se requiere desplegar para ejecutar las pruebas con proveedor simulado.

## Contexto y funcionamiento

`src/copilot/context.ts` llama a `createDataset()`, `analyzeHistory()`, `analyzeForecast()`, `preparePurchaseData()` y `buildComparison()`. El servidor reconstruye todo desde el fixture; rechaza contextos/cifras enviados por el navegador. Reutiliza el JSON ML sólo si coincide su firma.

CU-05 tiene controles propios y visibles; no lee ni cambia estados privados de CU-01–CU-04. El periodo afecta sólo historial. SKU/categoría filtran historial/pronósticos y filas de compras. Presupuesto/indicadores de optimización y comparación siguen siendo globales para todos los SKU elegibles; métricas ML son globales. Cada mensaje guarda una copia de filtros/presupuesto para evitar confundir respuestas al cambiar controles. Las consultas son independientes: no se envía la conversación anterior; para seguimientos indicar explícitamente la pregunta.

El proveedor recibe pregunta y contexto, con instrucciones de explicar y reconocer información ausente. No recibe herramientas, claves dentro del prompt ni permisos de acción. Se solicitan dos a cuatro textos breves; el servidor añade siempre la advertencia de datos sintéticos (objetivo: tres a cinco oraciones). Cada texto debe citar hojas con `{{ruta}}`; el servidor rechaza referencias desconocidas, cifras literales, HTML/enlaces y respuestas excesivas. Las cifras se sustituyen por valores exactos del motor y se muestran fuentes desplegables. Importes `spentMXN`/`remainingMXN` ya están formateados; los campos `*Cents` están en centavos.

**Límite de fundamentación:** la sustitución garantiza procedencia de valores referenciados, no veracidad semántica absoluta de la prosa. Un LLM puede interpretar mal una relación o escribir cantidades con palabras pese al prompt. Deben revisarse las fuentes y no usar la explicación como autorización de compra. El modelo nunca actualiza decisiones ni recalcula cantidades. Se conserva el motor operativo y el ML informativo.

## Límites y privacidad

- POST JSON, mismo origen configurado, cuerpo máximo 4096 bytes (también se cuentan chunks), pregunta 600 caracteres; validación estricta de SKU, categoría, periodo y presupuesto.
- Diez consultas por minuto y dos concurrentes **por instancia**, contador global sin guardar IP/preguntas; puede reiniciarse en cold starts y multiplicarse al escalar. Origin mitiga llamadas desde otros sitios, no autentica clientes ni bloquea scripts externos que falsifiquen cabeceras. Para uso público aplicar WAF/cuotas del proveedor; no se añade autenticación ni almacenamiento.
- SDK con `maxOutputTokens:700`, `thinkingLevel:MINIMAL` para Gemini 3 (no garantiza razonamiento cero) o `thinkingBudget:0` para modelos anteriores, una candidata y sin reintentos (`httpOptions.retryOptions.attempts:1`); salida JSON por `responseMimeType`/`responseJsonSchema`. Se rechaza bloqueo de seguridad, final distinto de STOP, JSON vacío/inválido o excesivo. Salida máxima 700 tokens, contexto acotado al fixture de veinte SKU, sin historial de conversación ni reintentos automáticos. Tiempo proveedor 15 s, navegador 18 s; Cancelar aborta la espera del navegador, no garantiza anular tokens ya procesados por el proveedor.
- Deshabilitado por defecto; falta de configuración → 503. Entrada → 400/413/415, origen → 403, límite → 429, proveedor/respuesta no verificable → 502, timeout → 504. Sin propagar mensajes internos o secretos del proveedor.
- No hay logs de preguntas, claves, respuestas ni datos sensibles en nuestro código; no se habilitan caché, herramientas, sesiones ni almacenamiento de conversaciones del SDK. Esto no elimina la retención del proveedor: en el nivel gratuito Google indica que los datos pueden usarse para mejorar sus productos. Revisar sus condiciones y las de Vercel. No ingresar datos personales/secretos: pregunta y contexto sintético salen al proveedor cuando se envía.
- La conversación vive sólo en memoria del componente, máximo diez consultas; no usa localStorage ni base de datos. React renderiza texto, sin HTML del modelo.

## Verificación

`npm run build`, `npm test`, `npm run lint`. Tests del contexto comparan resultados con los motores, filtros, presupuesto global, N/D, stockouts y ML. Proveedor simulado verifica éxito, configuración del SDK Gemini/clave sólo en constructor del servidor, JSON estructurado y sin herramientas, métodos, origen, entradas, límites de bytes, cuota, concurrencia, timeout, errores, rechazo y referencias inválidas. Tests del chat cubren navegación, preguntas sugeridas, controles, fuentes, indisponibilidad, errores, cancelación y limpieza.

El propietario confirmó que `GEMINI_API_KEY` existe en Vercel para Preview y Production. No se consultó, solicitó ni mostró su valor. **Esta migración no ejecutó llamadas reales a Gemini ni certifica un despliegue Vercel**: las pruebas simulan el SDK explícitamente. Las capturas existentes conservan la interfaz sin cambios y muestran indisponibilidad, no una respuesta de IA inventada. Tras redesplegar, comprobar Preview según el paso 3 para validar modelo/cuotas/cuenta.

Referencias consultadas: [SDK oficial Gemini](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html), [nivel gratuito y precios](https://ai.google.dev/gemini-api/docs/pricing) y [funciones Node de Vercel](https://vercel.com/docs/functions/runtimes/node-js).

Validación de la migración: `npm install @google/genai` y `npm ci` (260 paquetes instalados, 261 auditados, 0 vulnerabilidades), `npm run build` (35 módulos), `npm test` (**169 pruebas en 12 archivos**) y `npm run lint`, todos código 0. `package-lock.json` actualizado. Tests sin tráfico al proveedor. Búsqueda del bundle `dist` sin variables de clave ni SDK/endpoint Gemini. Se conserva la UI y las capturas de escritorio/móvil de la revisión inicial; no se alteraron los motores, contexto, validación de cifras ni componentes de CU-01–CU-04/ML.

![Escritorio, sin configuración](screenshots/copilot-escritorio.png)
![Móvil, sin configuración](screenshots/copilot-movil.png)


## Corrección de arranque Node ESM en Vercel

**Causa reproducida:** el proyecto es ESM (`type: module`), pero `api/copilot.ts` importaba `../server/copilot` sin extensión. `moduleResolution: Bundler` acepta ese import para Vite/Vitest y `tsc --noEmit` no genera un artefacto serverless. La transpilación por archivo conserva el especificador en `api/copilot.js`; Node ESM busca literalmente `server/copilot`, sin añadir `.js`. La prueba reproduce `ERR_MODULE_NOT_FOUND` incluso cuando `server/copilot.js` sí existe. El log recibido no permite afirmar si ese archivo estaba además ausente en el despliegue original: la resolución sin extensión ya es un defecto confirmado. Añadir sólo `.js` en el primer import no resolvería todo el grafo (motores, contexto y JSON también dependen de resolución de bundler).

**Solución:** `scripts/build-server.mjs` empaqueta `server/node-entry.ts` → `server/web-entry.ts` → handler/contexto/motores/JSON/SDK y dependencias en un único `index.mjs`, usando esbuild para Node 22 ESM. No cambia la lógica de CU-01–CU-04 ni ML. `server/node-entry.ts` adapta HTTP de Node al handler Web existente, conserva streaming de entrada, cabeceras, estados y controles; el body sigue limitado por el handler. El shim `createRequire` permite imports nativos de dependencias CJS. Los addons opcionales de `ws` se desactivan en compilación mediante sus flags documentados en el paquete; usa fallback JS/Node, sin depender de binarios externos. Ninguna clave se lee o sustituye durante build.

El script rechaza imports externos que no sean módulos nativos de Node, registra un metafile privado para auditar entradas e incluye el SDK Node `@google/genai`, sus dependencias y `results.json`. La salida es:

```text
.vercel/output/
  config.json                          # rutas v3; API antes de fallback SPA
  static/                              # copia exacta de dist, sin código servidor
  functions/api/copilot.func/
    .vc-config.json                    # nodejs22.x, index.mjs, launcher Nodejs, 20s
    index.mjs                          # bundle autocontenido, no require de src ni node_modules
  copilot-build-meta.json               # entradas/tamaños, fuera de static
```

Se reemplaza la detección/transpilación implícita del preset Vite por Build Output API explícita. La antigua entrada `api/copilot.ts` se mueve a `server/web-entry.ts`, sin cambiar su lógica: no queda un directorio `api/` de fuentes que pueda disparar una segunda función automática para el mismo URL y sobrescribir/ocultar el bundle. La prueba comprueba esta condición. Vercel monta sólo el contenido de `.func`, de modo que incluir archivos sueltos fuera no bastaría. `dist` se conserva para el preview habitual de la SPA. Los artefactos `.vercel/` están ignorados; sólo se versionan código/configuración del build. No se usa `includeFiles` como parche para imports inválidos.

**Regresión:** `npm test` ejecuta las suites Vitest y luego dos tests Node (`npm run test:runtime`). Uno reproduce el error original tras transpilación TS a ESM. El otro construye con la misma función del build, comprueba inputs/manifest y copia únicamente `.func` a un directorio temporal fuera del repositorio. Un proceso Node nuevo carga el módulo sin loaders TS y sirve HTTP real local: GET 405, POST sin configuración 503, JSON inválido 400 y consulta válida con SDK real/transport simulado 502 controlado. Se usa una clave ficticia, entorno limpio y fetch simulado para el proveedor: no hay tráfico a Gemini. Se verifican dependencias durante carga, construcción de contexto, inicialización del SDK y transporte; esto es más amplio que importar fuentes con Vitest.

Referencias: [resolución ESM de Node](https://nodejs.org/download/release/latest-v24.x/docs/api/esm.html), [Build Output API](https://vercel.com/docs/build-output-api), [configuración de funciones Node](https://vercel.com/docs/build-output-api/primitives).

**Verificación remota ejecutada:** Vercel marcó Ready el despliegue de `bee5546` ([detalle](https://vercel.com/renese73/nubora-ia/2iSVFqtbmh4NRQXtfGopCbMLVHuh)). En el [Preview de la rama](https://nubora-ia-git-feat-cu05-ai-copilot-renese73.vercel.app) se ejecutó GET `/api/copilot` → **405** con `{"error":"Sólo se permite POST."}`, POST `/api/copilot` con Origin del Preview, Content-Type JSON y cuerpo `{}` → **400** con error de pregunta/filtros inválidos; GET `/` → **200**. Ambas rutas API ejecutan el handler sin fallo de carga ESM. El primer despliegue con `api/` fuente todavía presente devolvió 500 pese a estar Ready; al quitar la entrada autodetectada, el bundle explícito arranca correctamente.

No se envió una pregunta válida a Gemini, no se leyó su clave y no se modificó Production. La verificación remota acredita arranque y validación, no inferencia real. El panel de Vercel requiere iniciar sesión y no se consultaron logs privados; la evidencia procede del estado público del commit en GitHub y las respuestas HTTP directas del Preview.

Validación final de esta corrección: `npm ci` (262 instalados, 263 auditados, 0 vulnerabilidades), `npm run build`, `npm test` (**169 Vitest + 2 runtime = 171 pruebas aprobadas**) y `npm run lint`, todos código 0. Las dos pruebas runtime también pasaron con Node 22 real (`npm exec --yes --package=node@22 -- node --test scripts/server-runtime.test.mjs`), además del Node 24 local. Bundle: 135 entradas, 1,937,130 bytes; auditoría sin dependencias externas salvo módulos nativos. Static sin SDK ni variables de clave. Diff vacío en `src/history`, `src/forecast`, `src/purchases`, `src/comparison`, `src/copilot`, `server/copilot.ts` y `tsconfig.json`: se conserva su lógica. La entrada `api/copilot.ts` sólo se trasladó a `server/web-entry.ts`; se corrige el empaquetado/launcher por separado.

## Diagnóstico seguro de HTTP 502 (CU-05)

El 502 anterior ocultaba cuatro etapas distintas bajo el mismo mensaje. Ahora cada fallo genera un único evento JSON `copilot_failure` con `requestId`, `stage` (`context`, `provider`, `grounding`), `code` y únicamente metadatos permitidos. El navegador recibe el mismo identificador, código y metadatos sanitizados para correlación. No se registran mensajes/stack del SDK, URLs, claves, prompts, rutas desconocidas introducidas por el modelo, respuestas completas ni metadatos arbitrarios del proveedor. Sólo se extraen números HTTP entre 400–599 y enums conocidos; campos desconocidos se descartan. Los tests usan canarios de secretos/prompts para comprobar que no se filtran.

| Código | Punto del fallo | Qué revisar en Preview |
| --- | --- | --- |
| `GEMINI_HTTP` | SDK devuelve error HTTP | `httpStatus`, `providerStatus`, `providerReason` |
| `GEMINI_SDK` | Excepción SDK/transporte sin HTTP | Red/configuración del SDK; sin imprimir el error original |
| `GEMINI_BLOCKED` | Bloqueo de prompt/candidata | `finishReason` permitido si existe; no registrar contenido bloqueado |
| `GEMINI_INCOMPLETE` | Falta candidata o final distinto de STOP | `finishReason` (p. ej. MAX_TOKENS); no publicar texto parcial |
| `GEMINI_TEXT_INVALID` | Texto vacío o excesivo | Formato/tamaño, sin registrar texto |
| `GEMINI_JSON_INVALID` | JSON.parse falla | Formato del proveedor; no se quitan fences ni se reparan cifras |
| `GROUND_SHAPE` / `GROUND_LENGTH` | Forma o longitud de sentences inválida | Contrato de dos a cuatro textos y límite por texto |
| `GROUND_UNKNOWN_REFERENCE` | Ruta no pertenece al catálogo | Verificar uso del diccionario enviado; la ruta rechazada no se registra |
| `GROUND_MISSING_REFERENCE` | Texto sin referencia válida | Instrucciones; no se omite la validación |
| `GROUND_FORBIDDEN_CONTENT` | Dígitos fuera de referencias, HTML, enlaces o llaves inválidas | No aceptar la respuesta ni inventar cifras |
| `COPILOT_TIMEOUT` | Espera abortada | Tiempo de 15 s; no hay reintento automático |
| `COPILOT_INTERNAL` | Excepción no clasificada | Etapa indicada; no se expone mensaje ni stack |

`GEMINI_HTTP` permite distinguir 404/NOT_FOUND (modelo/ruta), 429/RESOURCE_EXHAUSTED (cuota/rate limit), 400/INVALID_ARGUMENT (solicitud, esquema o clave) y 401/403 (autorización). Razones permitidas como API_KEY_INVALID, API_KEY_EXPIRED, QUOTA_EXCEEDED o MODEL_NOT_FOUND afinan el diagnóstico si Gemini las envía. Un estado por sí solo no siempre determina la causa exacta; no se debe llamar inválida a la clave sólo por recibir un 400.

En Vercel → Deployment **Preview** → Logs, filtrar `/api/copilot` y buscar `copilot_failure` junto al `requestId` devuelto al navegador. Basta compartir `code`, `stage`, `httpStatus`, `providerStatus`, `providerReason` y `finishReason` y `model` cuando existan. `model` sólo contiene nombres permitidos o `configured-other`; no se imprime una variable arbitraria. Nunca copiar la clave ni el body completo del SDK. Si una razón no está en la lista permitida no se imprime automáticamente.

### Compatibilidad y corrección de referencias

La [documentación oficial de Structured Outputs](https://ai.google.dev/gemini-api/docs/generate-content/structured-output?hl=en) indica soporte en Gemini 2.5 Flash-Lite para objetos, arrays, strings, required, additionalProperties y cotas de arrays utilizadas aquí. `{{ruta}}` es una cadena JSON ordinaria, no una capacidad especial de Gemini ni una interpolación del SDK. El esquema asegura estructura, no la existencia/semántica de cada referencia; el servidor debe seguir validándolas.

Se identificó una debilidad del contrato anterior: sólo se enviaban los hechos anidados, obligando al modelo a deducir los nombres de hojas e índices que espera `groundAnswer`. Ahora se envía además `references` con el catálogo exacto del mismo contexto y se explicita el formato con puntos y un ejemplo sin cifras fijas. La descripción del schema refuerza este requisito. **No se ha demostrado que esa debilidad fuera la causa del 502 de Preview**; no se desactiva ni flexibiliza ninguna comprobación y no se fabrican respuestas al fallar.

### Evidencia de esta revisión

- `npm ci`: 262 paquetes instalados, 263 auditados, cero vulnerabilidades.
- `npm run build`, `npm test` (**189 Vitest + 2 runtime = 191 pruebas aprobadas**) y `npm run lint`: código 0. Las nuevas pruebas cubren cada categoría y éxito con referencias numéricas/monetarias verificadas. Pruebas automatizadas sin tráfico real.
- Una consulta sintética controlada en Preview del commit `d6819fe` devolvió `GEMINI_HTTP`, requestId `abd82e61-a38f-4540-8dae-8e38aa14ade8`. Esto localiza el fallo antes de recibir contenido/JSON/grounding, pero no prueba todavía si es modelo, clave, esquema o cuota. No se leyó la clave ni se consultaron logs privados de Vercel.
- Se añade metadata HTTP sanitizada para completar el diagnóstico. No se modifica Production, CU-01–CU-04 ni ML.


Segundo intento controlado (commit `8fa0f69`): HTTP 502 con `code=GEMINI_HTTP`, `stage=provider`, **httpStatus=404**, **providerStatus=NOT_FOUND**, requestId `1cb51ae2-e9c4-4fca-854e-2eec5fb14b8a`. Se confirma un rechazo HTTP de Gemini antes de cualquier JSON o grounding. No hay evidencia de fallo del esquema, de cuota ni de clave en este intento; 404 puede indicar modelo no disponible/no soportado para esa cuenta/versión. No se dispone del mensaje completo ni se intenta imprimirlo.

Se actualiza el valor predeterminado a `gemini-3.1-flash-lite`, que [Google documenta con nivel gratuito](https://ai.google.dev/gemini-api/docs/pricing). La configuración de pensamiento usa MINIMAL en Gemini 3 y conserva budget cero para selecciones previas; no se mezclan ambos parámetros. No hay reintento ni fallback automático después de errores. Si `GEMINI_MODEL` está definido en Vercel, tiene prioridad: revisar únicamente Preview si sigue seleccionando un modelo que responde 404, sin modificar Production. La documentación consultada sobre disponibilidad de 2.5 no es uniforme entre superficies; el diagnóstico no prueba por sí solo una retirada global. [Guía de Gemini 3](https://ai.google.dev/gemini-api/docs/gemini-3).

Tercer intento real, tras cambiar el predeterminado (despliegue Ready, código de función con modelo nuevo): `GEMINI_HTTP`, HTTP **503**, status **UNAVAILABLE**, modelo permitido **gemini-3.1-flash-lite**, requestId `fe59bcba-1f2a-4d34-9b6c-55c969be5bcc`. El 404 ya no se reprodujo en ese intento; el servicio ahora rechaza por indisponibilidad antes de entregar contenido. No se puede afirmar generación exitosa, exactitud de una respuesta real ni que el problema esté completamente resuelto de extremo a extremo. No se implementan reintentos automáticos, cambio a un modelo de pago ni relajación de grounding para ocultarlo. Revisar el estado/cuotas de Gemini y reintentar manualmente una consulta controlada cuando el proveedor esté disponible; correlacionar el requestId en los logs de Preview. No cambiar Production.

Se realizaron tres consultas sintéticas manuales de diagnóstico (todas rechazadas por el proveedor sin recibir contenido de respuesta), sin leer ni mostrar GEMINI_API_KEY. Los tests automatizados siguen usando simulación. Pendiente: una respuesta 200 de Gemini real que atraviese JSON y groundAnswer; la cobertura actual de esas etapas es mediante pruebas automatizadas, no mediante una inferencia exitosa.
