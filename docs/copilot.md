# CU-05 · NUBORA AI Copilot

Chat de explicación, con llamadas **reales** a OpenAI Responses desde `api/copilot.ts` (función Node de Vercel). No hay respuestas IA locales pregrabadas ni fallback simulado. El frontend sólo conoce `/api/copilot`; la clave nunca se importa desde `src` ni usa prefijo `VITE_`.

## Configurar en Vercel

1. Importar el repositorio, seleccionar la rama del PR como Preview y preset Vite. `vercel.json` establece `npm run build`, salida `dist` y duración máxima de la función de 20 segundos. Node 22 o 24, npm y lockfile existente. Instalar con `npm ci`.
2. En Settings → Environment Variables, agregar **sólo para el servidor**:
   - `OPENAI_API_KEY`: clave de un proyecto OpenAI con acceso y facturación habilitados. No escribirla en el repositorio, chat ni capturas.
   - `OPENAI_MODEL`: identificador de un modelo de texto con soporte de Responses y Structured Outputs; por ejemplo `gpt-4.1-mini` si está habilitado en tu cuenta. El código no elige modelos por el usuario.
   - `COPILOT_ENABLED=true`: interruptor explícito. Cualquier otro valor deshabilita llamadas.
   - `COPILOT_ORIGIN`: origen exacto del despliegue, sin barra final, por ejemplo `https://tu-preview.vercel.app`. Actualizarlo cuando cambie el dominio Preview y volver a desplegar. No admite comodines ni orígenes de terceros.
3. Desplegar Preview y consultar CU-05. Comprobar en Network que la respuesta es 200, contiene `answer`, `sources` y el modelo configurado; confirmar que la clave nunca aparece en peticiones del navegador. No incluir secretos en evidencias.
4. Configurar límites de gasto/cuota en el proyecto del proveedor y reglas de rate limiting/WAF en Vercel antes de abrirlo a tráfico público. El limitador en memoria es básico y NO es una cuota monetaria global.
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
- Salida máxima 700 tokens, contexto acotado al fixture de veinte SKU, sin historial de conversación ni reintentos automáticos. Tiempo proveedor 15 s, navegador 18 s; Cancelar aborta la espera del navegador, no garantiza anular tokens ya procesados por el proveedor.
- Deshabilitado por defecto; falta de configuración → 503. Entrada → 400/413/415, origen → 403, límite → 429, proveedor/respuesta no verificable → 502, timeout → 504. Sin propagar mensajes internos o secretos del proveedor.
- No hay logs de preguntas, claves, respuestas ni datos sensibles en nuestro código; `store:false` en OpenAI no equivale a ausencia de todos los logs/retención del proveedor. Revisar sus políticas y las de Vercel. No ingresar datos personales/secretos: pregunta y contexto sintético salen al proveedor cuando se envía.
- La conversación vive sólo en memoria del componente, máximo diez consultas; no usa localStorage ni base de datos. React renderiza texto, sin HTML del modelo.

## Verificación

`npm run build`, `npm test`, `npm run lint`. Tests del contexto comparan resultados con los motores, filtros, presupuesto global, N/D, stockouts y ML. Proveedor simulado verifica éxito, transporte Responses/clave sólo en header, no almacenamiento, métodos, origen, entradas, límites de bytes, cuota, concurrencia, timeout, errores, rechazo y referencias inválidas. Tests del chat cubren navegación, preguntas sugeridas, controles, fuentes, indisponibilidad, errores, cancelación y limpieza.

No se proporcionó una clave ni un despliegue Vercel en esta ejecución: **no se certifica una inferencia real ni un despliegue real**. La integración HTTP real está implementada, pero los resultados de tests usan un proveedor simulado explícitamente. Las capturas muestran el estado real sin configuración, no una respuesta de IA inventada. Se requiere la prueba manual de Preview del paso 3 para validar credenciales/modelo/cuenta.

Referencias consultadas: [Structured Outputs de OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) y [funciones Node de Vercel](https://vercel.com/docs/functions/runtimes/node-js).

Validación ejecutada: `npm ci` (224 paquetes, 0 vulnerabilidades), `npm run build` (35 módulos), `npm test` (**168 pruebas en 12 archivos**) y `npm run lint`, todos código 0. También se compiló el módulo de servidor con Vite SSR y se probó la SPA construida junto al handler real sin credenciales: 503 visible, sin respuesta simulada. Inspección desktop y móvil 375×812 sin desbordamiento horizontal de página. Búsqueda del bundle `dist` sin clave, `Authorization` ni endpoint OpenAI. Diff vacío en los directorios CU-01–CU-04 y ML respecto a main.

![Escritorio, sin configuración](screenshots/copilot-escritorio.png)
![Móvil, sin configuración](screenshots/copilot-movil.png)
