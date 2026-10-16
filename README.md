# Nubora IA

SPA en español con análisis histórico (CU-01), pronóstico demostrativo (CU-02), optimización matemática de compras (CU-03) y comparación reproducible de estrategias (CU-04). React, TypeScript, Vite, Tailwind CSS y Vitest; npm como gestor de paquetes.

## Requisitos y ejecución

Node.js 22.12 o posterior (verificado con Node.js 24.19.0) y npm 10 o posterior.

```sh
npm install
npm run dev
```

Abre la URL local indicada por Vite (habitualmente http://localhost:5173).

```sh
npm run build # Comprueba TypeScript y genera dist/
npm test      # Ejecuta las pruebas una vez, sin modo observación
npm run lint  # Revisa TypeScript, React y hooks con ESLint
```

Para instalaciones reproducibles a partir de package-lock.json puede usarse `npm ci`. Publica únicamente `dist/` en un alojamiento estático. La navegación es interna en una sola página, sin rutas de servidor.

## Alcance

- **CU-01 Historial:** dataset ficticio fijo, filtros por SKU/categoría/periodo, gráfico y resumen mensual, indicadores, comparación anual y detalle paginado.
- **CU-02 Pronóstico:** conserva sus métodos operativos y agrega una sección Machine Learning informativa: Random Forest entrenado en Python, evaluación temporal y JSON reproducible, sin sustituir pronósticos de optimización.
- **CU-03 Plan de compra:** recomendación exacta y determinista de cantidades enteras bajo presupuesto global MXN, con exclusiones explícitas y filtros sólo de presentación.
- **CU-04 Comparación:** plan óptimo de CU-03 frente a baseline proporcional exacto, con presupuesto compartido, diferencias explicadas y filtros sólo de presentación.

Los datos son de demostración, claramente identificados en pantalla. No hay backend, servicios de pago, llamadas a APIs ni integraciones externas. Los importes usan pesos mexicanos (MXN); `src/currency.ts` centraliza su formato. Los estados sin datos no representan importes de cero. La selección del módulo se conserva únicamente mientras está abierta la página; recargar vuelve a Historial.

## Estructura

- `src/App.tsx`: navegación accesible entre los cuatro módulos; reutiliza sus componentes.
- `src/history/data.ts`: tipos y generador determinista del dataset.
- `src/history/analysis.ts`: funciones puras de filtros, agregación, indicadores, calidad y comparación.
- `src/history/History.tsx`, `MonthlyChart.tsx`: filtros, gráfico SVG accesible y tablas responsive.
- `src/history/*.test.ts*`: pruebas de datos, cálculos y presentación.
- `src/forecast/engine.ts`: funciones operativas puras de pronóstico, sin cambios por ML.
- `ml/train.py`, `ml/test_train.py`, `ml/requirements.txt`: entrenamiento batch real, pruebas y dependencias Python fijadas.
- `scripts/export-ml-data.mjs`: exporta el fixture llamando a createDataset().
- `src/forecast/MachineLearning.tsx`, `src/forecast/ml/results.json`: informe informativo y artefacto de entrenamiento.
- `src/forecast/Forecast.tsx`, `ForecastChart.tsx`: pantalla y gráfica que separa histórico de pronóstico.
- `src/forecast/*.test.ts*`: cálculos, fuga temporal, ceros, insuficiencia de datos y consistencia de filtros/tabla/gráfico.
- `src/purchases/model.ts`: presupuesto decimal exacto, preparación de datos de CU-01/CU-02, solver, resumen y filtros de presentación.
- `src/purchases/PurchasePlan.tsx`, `PurchaseChart.tsx`: presupuesto, indicadores, gráfica y tabla de CU-03.
- `src/purchases/*.test.ts*`: optimalidad, restricciones, datos inválidos, determinismo y preservación del plan global.
- `src/comparison/model.ts`: baseline racional BigInt, rangos seguros, validación cruzada, diferencias y filtros.
- `src/comparison/Comparison.tsx`, `ComparisonChart.tsx`: tarjetas, gráfica de escalas separadas, explicación y tabla por SKU.
- `src/comparison/*.test.ts*`: factibilidad, dominancia, exclusiones compartidas, aritmética, regresión y filtros sin recálculo.
- `src/styles.css`: Tailwind CSS y diseño responsive para móvil y escritorio.
- `src/currency.ts`: formato monetario en español de México.
- `src/App.test.tsx`, `src/test-setup.ts`: pruebas de navegación entre casos de uso y moneda con Testing Library y Vitest.
- `vite.config.ts`, `tsconfig.json`, `eslint.config.js`: configuración de desarrollo, compilación, pruebas y lint.
- `index.html`: entrada HTML en español.

No se requieren variables de entorno. `.gitignore` excluye `node_modules`, `dist`, cobertura y archivos `.env`. No guardar secretos en variables VITE_: son visibles en el navegador.

## Revisión

Los cuatro casos de uso están integrados en `main`. La sección ML informativa se prepara en `feat/cu02-ml-lite`, creada desde `main` actualizado (8b4994e), con PR en borrador hacia `main` y sin integración automática. Antes de integrar, ejecutar instalación, compilación, pruebas y lint. Revisar en navegador a 375 px y escritorio, navegación por teclado y los cuatro casos de uso.


## Dataset ficticio reproducible (v1)

`createDataset()` genera 20 SKU distribuidos en cuatro categorías y 480 registros: un registro por SKU y mes, de enero de 2024 a diciembre de 2025, ambos incluidos. No usa números aleatorios, fecha del sistema, red ni almacenamiento. La fórmula entera combina una base por SKU, un perfil mensual fijo, una diferencia entre años y reglas aritméticas para promociones y faltantes. Es un patrón sintético de prueba, no evidencia de estacionalidad del negocio.

Cada registro contiene unidades observadas, costo de adquisición unitario y precio de venta efectivo en centavos MXN, indicador de promoción y periodos de faltantes inclusivos. El catálogo contiene nombre, categoría y existencias al corte fijo del **31 de diciembre de 2025**. Este inventario es una instantánea de demostración, no existencias en tiempo real ni inventario histórico mensual. Los faltantes duran del día 10 al 15 en los meses marcados. SKU-020 tiene cero ventas explícitas en febrero de 2024, sin faltantes, para distinguir cero de datos ausentes.

## Reglas de CU-01

- Los filtros se combinan mediante AND; los límites mensuales son inclusivos. Un periodo invertido o una combinación sin registros muestra un estado vacío.
- Gráfico y tabla mensual consumen exactamente la misma serie de `analyzeHistory()`. El detalle lista los registros de esa selección; paginar no cambia indicadores.
- Total, promedio, máximo y mínimo usan los totales mensuales de los SKU seleccionados. El promedio divide entre meses completos, incluidos los meses explícitos de cero ventas. Los empates de extremos muestran todos los meses correspondientes.
- Si falta un SKU/mes o hay un duplicado, el total mensual, ingresos y costo aparecen como N/D. Ese mes se excluye de indicadores y comparaciones, con advertencia explícita. No se imputan ceros ni se suman subtotales incompletos como totales válidos.
- Ingresos = unidades × precio de venta efectivo; costo de unidades vendidas = unidades × costo de adquisición. No son margen neto ni costo del inventario actual. Los cálculos monetarios usan centavos enteros hasta presentar MXN.
- La comparación muestra los meses del último año filtrado frente al mismo mes del año anterior, únicamente si ambos están dentro del periodo y completos. Diferencia = actual − anterior; variación = diferencia / anterior × 100. Con base anterior cero, el porcentaje es N/D aunque la diferencia absoluta sí exista. No se comparan meses consecutivos como si fueran equivalentes entre años.
- Ventas observadas no equivalen a demanda real. Los faltantes pueden restringir ventas y las promociones pueden alterar el patrón. No se estima demanda perdida.
- Menos de 24 meses consecutivos y completos se considera historia insuficiente. Con dos ciclos completos sólo se ofrece comparación descriptiva: no se afirma estacionalidad confiable ni significación estadística. No hay pronósticos.

## Validación de CU-01

Se ejecutaron `npm run build`, `npm test` (29 pruebas en 3 archivos) y `npm run lint`, todos correctamente. Las pruebas cubren reproducibilidad, filtros combinados, agregaciones monetarias, promedios, empates, ceros explícitos, registros ausentes/duplicados, meses discontinuos, comparación anual y bases cero, alertas, paginación y consistencia tabla/gráfico antes y después de filtrar.

Revisión en navegador: pantalla general de escritorio y vista de 375 px; sin desbordamiento horizontal de página. Los paneles de tablas y gráfico tienen desplazamiento interno. Se comprobó el filtro SKU-020 de enero a febrero de 2024: 83 y 0 unidades, promedio 41.5 y mínimo 0.


## CU-02: pronóstico DEMOSTRATIVO

Se reutilizan `demoDataset`, `Dataset`, `Sale` y el filtrado de productos de CU-01, sin copiar ni agregar registros históricos. Se generan 3 meses por cada uno de los 20 SKU; filtrar SKU/categoría no cambia el método ni el entrenamiento de cada producto. Se suman los pronósticos individuales para la gráfica de selección, en lugar de volver a ajustar un modelo agregado. El histórico se muestra en verde sólido y el pronóstico en naranja con borde discontinuo, separado por un corte temporal. Tabla y gráfica usan la misma salida del análisis.

### Métodos y redondeo

- Promedio móvil de 3 meses: para el primer horizonte usa los tres meses observados previos al corte. Los siguientes incorporan estimaciones recursivas internas sin redondear, nunca ventas futuras.
- Estacional ingenuo: usa el mismo mes del año anterior. Enero–marzo de 2026 usa enero–marzo de 2025.
- Los valores publicados son enteros no negativos: entero más cercano, .5 hacia arriba y mínimo cero (`Math.max(0, Math.round(valor))`). Backtesting aplica la misma regla de publicación. Sólo se conservan decimales internamente para la recursión.

### Validación temporal y selección

Cuatro orígenes fijos: diciembre de 2024, marzo, junio y septiembre de 2025. Cada uno pronostica los siguientes tres meses desde su propio corte. Los 12 objetivos de enero a diciembre de 2025 no se solapan y ambos métodos se comparan sobre esos mismos objetivos. La selección se hace al cierre de 2025; no se consultan ventas de 2026 ni se permite que observaciones posteriores a un origen alimenten sus predicciones.

MAE = suma de errores absolutos / número de objetivos, en unidades. WAPE = suma de errores absolutos / suma de ventas observadas × 100. Sin objetivos, MAE y WAPE son N/D; con ventas observadas totales cero, WAPE es N/D y MAE sigue definido si hay objetivos. Se muestran ambas métricas de ambos métodos. Las métricas repetidas en las tres filas de pronóstico son de validación de 2025 por SKU/método, no errores futuros ni intervalos de confianza.

Se elige el menor MAE por SKU entre métodos que cubran 12/12 objetivos. En empate exacto se elige siempre estacional ingenuo (regla fija, sin buscar otra muestra favorable). WAPE es informativo; para un mismo SKU y objetivos, comparte el denominador entre métodos y no aporta un desempate independiente. También se exige historia completa: 24 registros válidos y únicos por SKU. Huecos, duplicados o valores inválidos dejan método/pronóstico en N/D, con alerta; no se imputan ceros. Una selección agregada con algún SKU sin pronóstico se muestra N/D para evitar totales parciales.

### Alcance y limitaciones

Son resultados orientativos sobre datos sintéticos, no predicciones comerciales garantizadas. Dos años no prueban estacionalidad confiable. Las ventas observadas pueden subestimar la demanda por faltantes: se identifican los meses afectados por SKU y no se inventan ventas perdidas. Las promociones se advierten como factor no modelado; no se anticipan promociones, cambios de precio ni restricciones futuras. El backtesting evalúa ventas observadas, también restringidas por inventario. La selección y las métricas usan la misma ventana de validación; no hay un test independiente posterior ni intervalos probabilísticos. CU-02 no implementa compras ni comparación de escenarios; CU-03 y CU-04 se documentan en las secciones siguientes. No hay backend ni integraciones externas.

### Verificación de CU-02

`npm ci`, `npm run build`, `npm test` y `npm run lint` deben pasar antes de integrar. La suite cubre cálculos conocidos, recursión sin redondeo interno, límites cero/N/D, 60 pronósticos no negativos, backtesting trimestral, selección/desempate, ausencia de fuga temporal en cada origen, exclusión de datos posteriores a 2025, consistencia entre filtros/tabla/gráfico y navegación entre CU-01/CU-02; conserva las pruebas de Historial.

Última ejecución sobre CU-02: `npm ci` correcto (224 paquetes instalados, cero vulnerabilidades); `npm run build` correcto; `npm test` con **54 pruebas aprobadas en 5 archivos**; `npm run lint` correcto. La primera compilación detectó nombres ambiguos por mayúsculas y una opción de tipado en una prueba; ambos errores se corrigieron antes de la ejecución final. Sin cambios en `src/history` respecto de `main`.

Revisión del build en navegador: escritorio y 375 px de ancho, sin desbordamiento horizontal de página. Las tablas y la gráfica permiten desplazamiento interno. Filtros categoría Despensa + SKU-001: 3 filas, pronósticos 31, 28 y 32 unidades. Capturas: [escritorio](docs/screenshots/cu02-escritorio.png) y [móvil](docs/screenshots/cu02-movil.png).


## CU-03: optimización matemática de compras

Recomendación DEMOSTRATIVA, sin compras reales, backend, Tiendanube ni IA generativa. Se usa el mismo `demoDataset` generado por `createDataset()` y `forecastProduct()` de CU-02; no se duplica el historial ni se genera otro pronóstico. Los archivos de `src/history` y `src/forecast` permanecen sin modificaciones.

### Datos y variables

Para cada SKU elegible:

- Demanda = suma de los tres pronósticos enteros de enero–marzo de 2026 que devuelve CU-02.
- Inventario = existencias del corte fijo **2025-12-31**; no es inventario en tiempo real.
- Necesidad = `max(0, demanda - inventario)`; no se transfieren excedentes entre SKU.
- Costo unitario = `acquisitionCostCents` del único registro válido de diciembre de 2025. Debe ser entero positivo y seguro. Es un costo histórico de referencia, **no una cotización futura**.
- Cantidad de compra `x_i` entera entre cero y la necesidad del SKU.

Se excluyen con causa los SKU con catálogo duplicado/vacío, pronóstico N/D o incompleto, inventario inválido o de otro corte, o costo de diciembre ausente/duplicado/no positivo/no entero. Las filas excluidas conservan N/D en cantidad y gasto: nunca se sustituyen por cero. Totales y optimalidad se refieren al subconjunto elegible, con recuento de exclusiones visible.

### Modelo y solución exacta

Restricción: `sum(x_i * costo_i_centavos) <= presupuesto_centavos`.

Objetivo primario: maximizar `sum(x_i)`, unidades adicionales de demanda pronosticada cubiertas. Objetivo secundario: minimizar el gasto entre todas las soluciones con esa cobertura. **No se ponderan margen, ingreso, rentabilidad ni prioridades comerciales.**

Todas las unidades tienen el mismo valor objetivo (=1), cada SKU tiene costo unitario constante y sólo hay cotas superiores por SKU. Por ello se puede ordenar por costo ascendente y comprar por bloques hasta agotar la necesidad o el presupuesto. Con costos iguales se usa SKU ascendente por código de caracteres (sin dependencia de configuración regional ni orden de objetos). Se asigna `min(necesidad, saldo / costo con división entera)`; no se crean objetos por unidad y no se usa DP por presupuesto.

Prueba: para cualquier cantidad K, las K unidades más baratas disponibles minimizan el gasto para cubrir K unidades. Si una solución usara una unidad más cara y dejara una más barata disponible, intercambiarlas preservaría la cobertura y reduciría su gasto. El algoritmo compra ese prefijo de unidades hasta que el siguiente costo supera el saldo; entonces ni la selección más barata de K+1 unidades cabe en el presupuesto. Por tanto K es cobertura máxima y el gasto para K es mínimo. Las únicas decisiones intercambiables en la frontera son costos iguales, resueltas por SKU. Tiempo **O(n log n)** y memoria **O(n)**, sin dependencia de la magnitud del presupuesto o la cantidad de unidades. Es un algoritmo greedy **exacto para este modelo particular**, no una heurística para una mochila general con beneficios distintos.

`nextUnitCostCents` identifica la unidad pendiente más barata: si queda necesidad, el saldo debe ser menor que ese costo. Si no queda necesidad, se compra exactamente la necesidad y no más. Con presupuesto cero, toda cantidad elegible es cero.

### Centavos, presupuesto y límites

La entrada admite punto o coma decimal, hasta dos decimales y sin separadores de miles. Por ejemplo, `0.29` se convierte exactamente en 29 centavos mediante conversión textual y BigInt, sin `parseFloat`, multiplicaciones decimales ni redondeo de costos. Montos negativos, vacíos, científicos, con más decimales o mal formados no producen plan ni conservan uno anterior.

Presupuesto permitido: de cero a **1,000,000,000,000 centavos** (MXN 10,000,000,000.00). La división presupuestaria y los productos se realizan con BigInt. Los importes publicados son números enteros seguros, acotados por el presupuesto; la división entre 100 ocurre únicamente al presentar moneda. No se redondean costos durante la optimización. Cantidades, costos e inventarios deben ser enteros seguros; si los totales exceden el rango entero seguro, se rechaza el cálculo y no se presenta como solución óptima. El fixture de 20 SKU está muy por debajo de esos límites.

### Cobertura, filtros y simplificaciones

La cobertura estimada es `sum(min(inventario_i, demanda_i) + x_i) / sum(demanda_i) * 100`, sólo sobre SKU elegibles. Un excedente de inventario de un producto no cubre demanda de otro. Demanda cero implica cobertura porcentual N/D.

El presupuesto se aplica globalmente a los 20 SKU. Los filtros de SKU/categoría sólo seleccionan filas ya resueltas para tabla y gráfica; no son dependencias del cálculo memoizado del plan. Las tarjetas siempre muestran totales globales. Cambiar el presupuesto sí recalcula el plan completo. La gráfica compara necesidad con compra recomendada usando las mismas filas que la tabla.

Se supone que toda la compra estará disponible al inicio de un horizonte trimestral acumulado. No se modelan fechas de llegada, plazos, rotación mensual, impuestos adicionales, fletes, mínimos de compra, capacidad, caducidad ni prioridades. No se ejecutan compras. Datos sintéticos y faltantes históricos limitan los pronósticos y, por tanto, la utilidad comercial del plan; se señalan los meses afectados sin inventar ventas perdidas. La optimalidad es del modelo matemático, no una garantía de óptimo comercial ni de demanda verdadera. Cambiar objetivos a margen o añadir otras restricciones requeriría revisar algoritmo y prueba.

### Pruebas de CU-03

Suite ejecutada: **103 pruebas aprobadas en 7 archivos**. Incluye comparación exhaustiva con fuerza bruta en **2,784 casos pequeños** (tres SKU con necesidad 0–3, como máximo 64 combinaciones por caso) para ambos objetivos; restricciones, cero, presupuesto insuficiente/suficiente, centavos, empate ordinal, presupuesto grande sin expandir unidades, costos inválidos, registros ausentes/duplicados, inventario mayor que demanda, cobertura, no mutación, determinismo y reordenamiento. Una prueba de interfaz verifica que los filtros no vuelven a llamar al cálculo global. Se conservan las suites de CU-01/CU-02; la navegación ampliada se valida también en CU-04.

Validación ejecutada: `npm ci` correcto (224 paquetes instalados, 225 auditados, cero vulnerabilidades); `npm run build` correcto; `npm test` correcto; `npm run lint` sin errores. npm conserva avisos de obsolescencia de ESLint 9 y whatwg-encoding. Revisión visual de escritorio y móvil 375 px sin desbordamiento horizontal de página. La selección de categoría Hogar mostró 5 filas sin cambiar el resumen global. Presupuesto cero mostró compras cero; MXN 1,000,000.00 compró exactamente las 2,274 unidades necesarias, por MXN 106,278.00, con cobertura 100%.

Ejemplo reproducible con MXN 25,000.00: 20 SKU elegibles, demanda 3,574 unidades, inventario 1,300, necesidad 2,274, compra recomendada 764, gasto MXN 24,960.50 y saldo MXN 39.50. Cobertura estimada: 2,064 / 3,574 = 57.8% en pantalla. Capturas: [escritorio](docs/screenshots/cu03-escritorio.png) y [móvil](docs/screenshots/cu03-movil.png).


## CU-04: comparación y explicación de recomendaciones

Ambas estrategias usan la misma salida de `preparePurchaseData()` de CU-03, calculada una sola vez por dataset, y el mismo presupuesto validado con `parseBudget()`. El optimizado se obtiene llamando a `buildPlan(prepared, presupuesto)`. No se reconstruyen pronósticos, costos ni inventarios. Los archivos de `src/history`, `src/forecast` y `src/purchases` permanecen sin cambios respecto de `main`; no se corrigió ni modificó el optimizador.

### Baseline proporcional reproducible

Sólo sobre SKU elegibles de CU-03, con las mismas causas de exclusión:

```text
C = sum(necesidad_i * costoUnitarioCentavos_i)
T = min(presupuestoCentavos, C)
cantidadBase_i = floor(necesidad_i * T / C), si C > 0
cantidadBase_i = 0, si C = 0
```

`C`, `T`, productos, división, gastos y saldos internos usan **BigInt**. Nunca se calcula un factor decimal en punto flotante ni se redondean costos. Las cantidades se convierten a Number únicamente tras comprobar el rango entero seguro; también se validan los totales antes de convertirlos. El costo total de la necesidad puede superar MAX_SAFE_INTEGER: se conserva en BigInt y se formatea directamente como moneda sin perder centavos. Se conserva el límite presupuestario de CU-03: MXN 10,000,000,000.00. Si un total que debe publicarse como Number excede el rango seguro, se rechaza el cálculo en vez de mostrar resultados inválidos.

**No se redistribuye el saldo tras el redondeo hacia abajo**, aunque alcance para comprar alguna unidad. Ésta es la definición del baseline, no un segundo algoritmo de optimización. Es determinista y su cálculo es lineal en la cantidad de SKU. Factibilidad: `0 <= floor(necesidad_i*T/C) <= necesidad_i` y `sum(cantidadBase_i*costo_i) <= (T/C)*C = T <= presupuesto`. Si C es cero, no hay necesidad elegible con costo positivo y se compra cero.

### Entradas, cobertura y comprobaciones

Las filas excluidas conservan exactamente las causas producidas por CU-03, con cantidad/gasto/diferencia N/D, nunca cero. No se recalculan elegibilidades con reglas diferentes para cada estrategia. Antes de presentar conclusiones se comprueban identidad de SKU y datos, exclusiones, cantidades enteras acotadas, costos de fila, presupuesto y totales de ambas estrategias.

La cobertura usa la fórmula de CU-03:

```text
unidadesCubiertas = sum(min(inventario_i, demanda_i) + cantidad_i)
coberturaPorcentaje = unidadesCubiertas / sum(demanda_i) * 100
```

El inventario útil es el mismo en ambas estrategias; por eso la diferencia de unidades cubiertas coincide con la diferencia de unidades compradas. Con demanda elegible total cero, el porcentaje de cobertura y su diferencia son **N/D**. No se transfieren excedentes entre SKU.

Las diferencias siempre son **optimizado menos baseline**: unidades, gasto en centavos y cobertura en **puntos porcentuales**. La diferencia de cobertura se calcula sobre los totales sin redondear para presentación, no restando porcentajes ya formateados. Los puntos porcentuales no son variación porcentual relativa. El gasto puede subir al cubrir más unidades; no se infieren márgenes ni ingresos. Las diferencias por SKU pueden ser negativas aunque el total optimizado no sea menor.

Se verifica explícitamente que el optimizado no compre/cubra menos unidades que el baseline válido. También se comprueba su objetivo secundario en caso de empate. Si falla algún chequeo, se muestra error y se ocultan tarjetas, gráfica y explicación de superioridad. Si hay empate de unidades/gasto, se explica sin afirmar una mejora inexistente. Si las unidades empatan y el gasto es menor, se señala que no mejoró la cobertura.

### Interfaz y límites

Un único presupuesto global alimenta ambas estrategias. Los filtros SKU/categoría sólo afectan la tabla; tarjetas, diferencias y gráfica son globales y no cambian. Los filtros no son dependencias del cálculo memoizado. La gráfica usa paneles separados para unidades y porcentaje de cobertura, evitando mezclar escalas. La tabla muestra necesidad, demanda, inventario, costo unitario, compras, gastos y diferencia por SKU.

Datos sintéticos, faltantes históricos, costos de referencia de diciembre de 2025 y horizonte trimestral acumulado limitan las conclusiones. Se supone compra disponible al inicio; no se modelan plazos, fletes ni restricciones de proveedores. No se estiman ventas perdidas. No hay compras reales, servicios externos ni cambios en el optimizador. Los resultados describen exclusivamente el modelo.

### Registro dinámico del fixture: presupuesto MXN 25,000.00

Costo total de necesidad: **MXN 106,278.00** (10,627,800 centavos). Fracción racional del baseline: `2500000/10627800`. Inventario útil compartido: 1,300 unidades; demanda elegible: 3,574; 20 SKU elegibles sin exclusiones.

| Métrica | Baseline proporcional | Optimizado CU-03 |
| --- | ---: | ---: |
| Unidades compradas | 526 | 764 |
| Gasto MXN | 24,639.25 | 24,960.50 |
| Saldo MXN | 360.75 | 39.50 |
| Unidades de demanda cubiertas | 1,826 | 2,064 |
| Cobertura mostrada | 51.09% | 57.75% |

Diferencias: **+238 unidades, +MXN 321.25 de gasto y +6.66 puntos porcentuales** (porcentajes redondeados sólo para presentar). Las cifras se calculan en ejecución, no se usan como entradas del componente. Una prueba de regresión confirma las 764 unidades/gasto/saldo aprobados de CU-03 y contrasta el baseline con una evaluación independiente de la fórmula BigInt.

### Validación de CU-04

`npm ci`, `npm run build`, `npm test` y `npm run lint` ejecutados correctamente. Suite: **135 pruebas aprobadas en 9 archivos**. Incluye 2,784 casos pequeños comparando factibilidad y unidades optimizadas >= baseline; cero, insuficiente, suficiente, necesidad cero, exclusiones y costos inválidos, redondeo, centavos, BigInt mayor que MAX_SAFE_INTEGER, límites de conversión, signos de diferencias, empates, identidad de entradas, consistencia, determinismo, no mutación y filtros sin recálculo. Se conservan las suites anteriores y se prueba navegación entre los cuatro casos de uso.

La instalación final auditó 225 paquetes (224 instalados), con cero vulnerabilidades. Se mantienen avisos de obsolescencia de ESLint 9 y whatwg-encoding. Revisión del build en escritorio y móvil 375 px sin desbordamiento horizontal de página; filtrar Hogar muestra cinco filas con ambas tarjetas globales intactas. Capturas: [escritorio](docs/screenshots/cu04-escritorio.png) y [móvil](docs/screenshots/cu04-movil.png).


## CU-02 · Machine Learning mínimo real

Sección **Machine Learning** con un RandomForestRegressor global, semilla 42, mes/SKU/rezagos 1–3 y entrenamiento real en Python. Reutiliza createDataset() mediante exportación automática; no cambia `src/forecast/engine.ts`, `src/history`, `src/purchases` ni `src/comparison`. El ML sólo informa: los pronósticos usados por la optimización permanecen iguales.

Reproducción, cortes, tamaños de muestra y limitaciones: [ml/README.md](ml/README.md). Artefacto versionado y descargable desde CU-02: [results.json](src/forecast/ml/results.json). No requiere Python para ejecutar la SPA, sólo para regenerar el informe.

Validación temporal julio–septiembre 2025 (n=60 por modelo), prueba posterior octubre–diciembre (n=60). MAE de prueba ejecutado: Random Forest **9.90**, promedio móvil **17.883333333333333**, estacional ingenuo **9.416666666666666**. **Random Forest no supera al mejor baseline en esta prueba**. Ajuste final de 420 muestras con rezagos hasta diciembre 2025 y 60 pronósticos enero–marzo 2026. No se usan ventas futuras en las características ni se sustituyen los métodos operativos.

Verificación: **141 pruebas Vitest en 10 archivos**, **11 pruebas Python**, build y lint correctos. Se prueba ausencia de fuga temporal, reproducción, JSON, datos incompletos y paridad de los baselines Python con las funciones TypeScript existentes. Muestra sintética pequeña: no se demuestra una mejora generalizable ni una garantía comercial.

## CU-05 · NUBORA AI Copilot

Chat de explicación con API serverless real de OpenAI, deshabilitado hasta configurar el servidor. No altera los motores ni los pronósticos operativos. Incluye controles propios de contexto, referencias verificadas y aviso de datos sintéticos. [Configuración Vercel, variables, límites y pruebas](docs/copilot.md). Nunca usar `VITE_OPENAI_API_KEY` ni guardar claves en Git. No se ha probado inferencia real sin credenciales; los tests utilizan un proveedor simulado.
