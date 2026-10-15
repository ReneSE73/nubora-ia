# Nubora IA

SPA en español con análisis histórico (CU-01) y pronóstico demostrativo por SKU (CU-02). React, TypeScript, Vite, Tailwind CSS y Vitest; npm como gestor de paquetes.

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
- **CU-02 Pronóstico:** 60 pronósticos demostrativos por SKU para enero, febrero y marzo de 2026, selección de método y validación temporal MAE/WAPE.
- **CU-03 Plan de compra:** pendiente, sin planes ni importes calculados.
- **CU-04 Comparación:** pendiente, sin escenarios ni resultados.

Los datos son de demostración, claramente identificados en pantalla. No hay backend, servicios de pago, llamadas a APIs ni integraciones externas. Los importes usan pesos mexicanos (MXN); `src/currency.ts` centraliza su formato. Los estados sin datos no representan importes de cero. La selección del módulo se conserva únicamente mientras está abierta la página; recargar vuelve a Historial.

## Estructura

- `src/App.tsx`: navegación accesible y módulos pendientes; reutiliza el módulo Historial.
- `src/history/data.ts`: tipos y generador determinista del dataset.
- `src/history/analysis.ts`: funciones puras de filtros, agregación, indicadores, calidad y comparación.
- `src/history/History.tsx`, `MonthlyChart.tsx`: filtros, gráfico SVG accesible y tablas responsive.
- `src/history/*.test.ts*`: pruebas de datos, cálculos y presentación.
- `src/forecast/engine.ts`: funciones puras de pronóstico, backtesting, selección y filtros sobre el dataset de CU-01.
- `src/forecast/Forecast.tsx`, `ForecastChart.tsx`: pantalla y gráfica que separa histórico de pronóstico.
- `src/forecast/*.test.ts*`: cálculos, fuga temporal, ceros, insuficiencia de datos y consistencia de filtros/tabla/gráfico.
- `src/styles.css`: Tailwind CSS y diseño responsive para móvil y escritorio.
- `src/currency.ts`: formato monetario en español de México.
- `src/App.test.tsx`, `src/test-setup.ts`: pruebas de navegación, estados pendientes y moneda con Testing Library y Vitest.
- `vite.config.ts`, `tsconfig.json`, `eslint.config.js`: configuración de desarrollo, compilación, pruebas y lint.
- `index.html`: entrada HTML en español.

No se requieren variables de entorno. `.gitignore` excluye `node_modules`, `dist`, cobertura y archivos `.env`. No guardar secretos en variables VITE_: son visibles en el navegador.

## Revisión

CU-01 y la SPA inicial ya están integrados en `main`. CU-02 se prepara en `feat/cu02-pronostico`, creada desde `main`, con PR hacia `main` y sin integración automática. Antes de integrar, ejecutar instalación, compilación, pruebas y lint. Revisar en navegador a 375 px y escritorio, navegación por teclado y los cuatro casos de uso.


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

Son resultados orientativos sobre datos sintéticos, no predicciones comerciales garantizadas. Dos años no prueban estacionalidad confiable. Las ventas observadas pueden subestimar la demanda por faltantes: se identifican los meses afectados por SKU y no se inventan ventas perdidas. Las promociones se advierten como factor no modelado; no se anticipan promociones, cambios de precio ni restricciones futuras. El backtesting evalúa ventas observadas, también restringidas por inventario. La selección y las métricas usan la misma ventana de validación; no hay un test independiente posterior ni intervalos probabilísticos. No se implementan CU-03 ni CU-04, backend ni integraciones externas.

### Verificación de CU-02

`npm ci`, `npm run build`, `npm test` y `npm run lint` deben pasar antes de integrar. La suite cubre cálculos conocidos, recursión sin redondeo interno, límites cero/N/D, 60 pronósticos no negativos, backtesting trimestral, selección/desempate, ausencia de fuga temporal en cada origen, exclusión de datos posteriores a 2025, consistencia entre filtros/tabla/gráfico y navegación entre CU-01/CU-02; conserva las pruebas de Historial.

Última ejecución sobre CU-02: `npm ci` correcto (224 paquetes instalados, cero vulnerabilidades); `npm run build` correcto; `npm test` con **54 pruebas aprobadas en 5 archivos**; `npm run lint` correcto. La primera compilación detectó nombres ambiguos por mayúsculas y una opción de tipado en una prueba; ambos errores se corrigieron antes de la ejecución final. Sin cambios en `src/history` respecto de `main`.

Revisión del build en navegador: escritorio y 375 px de ancho, sin desbordamiento horizontal de página. Las tablas y la gráfica permiten desplazamiento interno. Filtros categoría Despensa + SKU-001: 3 filas, pronósticos 31, 28 y 32 unidades. Capturas: [escritorio](docs/screenshots/cu02-escritorio.png) y [móvil](docs/screenshots/cu02-movil.png).
