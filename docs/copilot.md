# CU-05 · NUBORA AI Copilot

Chat de explicación, con llamadas **reales** a Google Gemini API mediante el SDK oficial `@google/genai` desde `api/copilot.ts` (función Node de Vercel). No hay respuestas IA locales pregrabadas ni fallback simulado. El frontend sólo conoce `/api/copilot`; la clave nunca se importa desde `src` ni usa prefijo `VITE_`.

## Configurar en Vercel

1. Importar el repositorio, seleccionar la rama del PR como Preview y preset Vite. `vercel.json` establece `npm run build`, salida `dist` y duración máxima de la función de 20 segundos. Node 22 o 24, npm y lockfile existente. Instalar con `npm ci`.
2. En Settings → Environment Variables, verificar **sólo para el servidor**:
   - `GEMINI_API_KEY`: única clave del proveedor, leída explícitamente desde `process.env.GEMINI_API_KEY` en el servidor. Ya está configurada por el propietario en Preview y Production; no copiar ni mostrar su valor. No escribirla en el repositorio, chat ni capturas.
   - `GEMINI_MODEL`: opcional; predeterminado `gemini-2.5-flash-lite`. Modelo de texto con salida JSON estructurada y presupuesto de pensamiento configurable; también puede usarse `gemini-2.5-flash`. Ambos figuran con nivel gratuito en la documentación consultada; la disponibilidad, cuotas y facturación dependen del proyecto/región y pueden cambiar. No existe fallback a un modelo de pago. El modo de facturación de la cuenta no se decide desde el código.
   - `COPILOT_ENABLED=true`: interruptor explícito. Cualquier otro valor deshabilita llamadas.
   - `COPILOT_ORIGIN`: origen exacto del despliegue, sin barra final, por ejemplo `https://tu-preview.vercel.app`. Actualizarlo cuando cambie el dominio Preview y volver a desplegar. No admite comodines ni orígenes de terceros.
3. Desplegar Preview y consultar CU-05. Comprobar en Network que la respuesta es 200, contiene `answer`, `sources` y el modelo configurado; confirmar que la clave nunca aparece en peticiones del navegador. No incluir secretos en evidencias.
4. Configurar límites de gasto/cuota en el proyecto Gemini del proveedor y reglas de rate limiting/WAF en Vercel antes de abrirlo a tráfico público. El limitador en memoria es básico y NO es una cuota monetaria global.
5. Para deshabilitar, establecer `COPILOT_ENABLED=false` y redesplegar.

Para desarrollo de la función usar la CLI oficial `vercel dev`, con las mismas variables del servidor en `.env.local` (ignorado). `npm run dev` y `npm run preview` de Vite sirven sólo la SPA: sin función mostrarán indisponibilidad, nunca una respuesta falsa. No se requiere desplegar para ejecutar las pruebas con proveedor simulado.

## Contexto y funcionamiento

`src/copilot/context.ts` llama a `createDataset()`, `analyzeHistory()`, `analyzeForecast()`, `preparePurchaseData()` y `buildComparison()`. El servidor reconstruye todo desde el fixture; rechaza contextos/cifras enviados por el navegador. Reutiliza el JSON ML sólo si coincide su firma.

CU-05 tiene controles propios y visibles; no lee ni cambia estados privados de CU-01–CU-04. El periodo afecta sólo historial. SKU/categoría filtran historial/pronósticos y filas de compras. Presupuesto/indicadores de optimización y comparación siguen siendo globales para todos los SKU elegibles; métricas ML son globales. Cada mensaje guarda una copia de filtros/presupuesto para evitar confundir respuestas al cambiar controles. Las consultas son independientes: no se envía la conversación anterior; para seguimientos indicar explícitamente la pregunta.

El proveedor recibe pregunta y contexto, con instrucciones de explicar y reconocer información ausente. No recibe herramientas, claves dentro del prompt ni permisos de acción. Se solicitan dos a cuatro textos breves; el servidor añade siempre la advertencia de datos sintéticos (objetivo: tres a cinco oraciones). Cada texto debe citar hojas con `{{ruta}}`; el servidor rechaza referencias desconocidas, cifras literales, HTML/enlaces y respuestas excesivas. Las cifras se sustituyen por valores exactos del motor y se muestran fuentes desplegables. Importes `spentMXN`/`remainingMXN` ya están formateados; los campos `*Cents` están en centavos.

**Límite de fundamentación:** la sustitución garantiza procedencia de valores referenciados, no veracidad semántica absoluta de la prosa. Un LLM puede interpretar mal una relación o escribir cantidades con palabras pese al prompt. Deben revisarse las fuentes y no usar la explicación como autorización de compra. El modelo nunca actualiza decisiones ni recalcula cantidades. Se conserva el motor operativo y el ML informativo.

## Límites y privacidad

- POST JSON, mismo origen configurado, cuerpo máximo 4096 bytes (también se cuentan chunks), pregunta 600 caracteres; validación estricta de SKU, categoría, periodo y presupuesto.
- Diez consultas por minuto y dos concurrentes **por instancia**, contador global sin guardar IP/preguntas; puede reiniciarse en cold starts y multiplicarse al escalar. Origin mitiga llamadas desde otros sitios, no autentica clientes ni bloquea scripts externos que falsifiquen cabeceras. Para uso público aplicar WAF/cuotas del proveedor; no se añade autenticación ni almacenamiento.
- SDK con `maxOutputTokens:700`, `thinkingBudget:0` (sin consumir la salida en razonamiento), una candidata y sin reintentos (`httpOptions.retryOptions.attempts:1`); salida JSON por `responseMimeType`/`responseJsonSchema`. Se rechaza bloqueo de seguridad, final distinto de STOP, JSON vacío/inválido o excesivo. Salida máxima 700 tokens, contexto acotado al fixture de veinte SKU, sin historial de conversación ni reintentos automáticos. Tiempo proveedor 15 s, navegador 18 s; Cancelar aborta la espera del navegador, no garantiza anular tokens ya procesados por el proveedor.
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
