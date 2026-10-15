# Nubora IA

SPA inicial en español para explorar la reposición de inventario. React, TypeScript, Vite, Tailwind CSS y Vitest; npm como gestor de paquetes.

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

- **CU-01 Historial:** interfaz inicial con estado vacío. La carga, persistencia y consulta de movimientos aún no están implementadas.
- **CU-02 Pronóstico:** pendiente, sin estimaciones generadas.
- **CU-03 Plan de compra:** pendiente, sin planes ni importes calculados.
- **CU-04 Comparación:** pendiente, sin escenarios ni resultados.

No hay datos de demostración, backend, servicios de pago, llamadas a APIs ni integraciones externas. Los importes futuros deben usar pesos mexicanos (MXN); `src/currency.ts` centraliza su formato. Los estados sin datos no representan importes de cero. La selección del módulo se conserva únicamente mientras está abierta la página; recargar vuelve a Historial.

## Estructura

- `src/App.tsx`: navegación accesible, historial vacío y módulos pendientes.
- `src/styles.css`: Tailwind CSS y diseño responsive para móvil y escritorio.
- `src/currency.ts`: formato monetario en español de México.
- `src/App.test.tsx`, `src/test-setup.ts`: pruebas de navegación, estados pendientes y moneda con Testing Library y Vitest.
- `vite.config.ts`, `tsconfig.json`, `eslint.config.js`: configuración de desarrollo, compilación, pruebas y lint.
- `index.html`: entrada HTML en español.

No se requieren variables de entorno. `.gitignore` excluye `node_modules`, `dist`, cobertura y archivos `.env`. No guardar secretos en variables VITE_: son visibles en el navegador.

## Revisión

El trabajo se prepara en `feat/spa-inicial`, sin modificar `main`. Antes de integrar, ejecutar instalación, compilación, pruebas y lint. Revisar en navegador a 375 px y escritorio, navegación por teclado y los cuatro casos de uso.
