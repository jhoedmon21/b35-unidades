// Copia los web workers de MapLibre a /public — necesario para que el mapa
// funcione con Vite (el optimizador de dependencias no emite workers de
// paquetes). El worker carga "maplibre-gl-shared.mjs" en caliente: se copian
// los dos. Igual que hace FuegoMap Admin con Next.js.
// Se ejecuta automáticamente antes de `dev` y `build` (hooks predev/prebuild).

import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "node_modules", "maplibre-gl", "dist");
const destDir = join(root, "public");

const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

if (!existsSync(join(dist, files[0]))) {
  console.error("✗ No existe maplibre-gl/dist — ejecuta `npm install` primero.");
  process.exit(1);
}
mkdirSync(destDir, { recursive: true });
for (const f of files) {
  copyFileSync(join(dist, f), join(destDir, f));
  console.log(`✓ public/${f}`);
}
