import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// ============================================================
//  FuegoMap Unidades — PWA de la tablet del vehículo
//  - Dev: proxy /api → FuegoMap Admin (http://localhost:3000)
//    así las cookies httpOnly funcionan sin CORS ni HTTPS extra.
//  - PWA: registro "prompt" (la actualización se aplica solo
//    cuando NO hay misión activa) + caché de teselas del mapa.
// ============================================================

export default defineConfig({
  // base relativa: la PWA se sirve tal cual en su propio dominio Y bajo el
  // prefijo /app/ de la central (mismo origen: cookies y SSE sin CORS).
  base: "./",
  server: {
    port: 3100,
    host: true, // accesible desde la tablet por IP de la red
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        // A prueba de caída de la central: si Next dev se cae, http-proxy
        // se queda MUDO ante el navegador (ECONNREFUSED sin responder) y la
        // tablet se congela en «Conectando…». El handler de error responde
        // 502 inmediato para que la app reaccione. El timeout largo evita
        // cercenar los SSE del canal público (heartbeat cada 25 s).
        timeout: 300_000,
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            const out = res as unknown as {
              headersSent?: boolean;
              writeHead?: (status: number, headers?: Record<string, string>) => void;
              end?: (body?: string) => void;
            };
            try {
              if (out?.end == null) return;
              if (!out.headersSent) out.writeHead?.(502, { "Content-Type": "application/json" });
              out.end(JSON.stringify({ error: "Central no disponible (502)" }));
            } catch {
              /* el socket ya estaba muerto */
            }
          });
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt", // aviso controlado de nueva versión
      // SW propio (injectManifest): necesario para Web Push y clic en notificación
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      includeAssets: ["icons/pwa-192.png", "icons/pwa-512.png"],
      manifest: {
        name: "B-35 Unidades",
        short_name: "B-35",
        description: "Emergencias, hidrantes y equipo del vehículo — Compañía de Bomberos B-35 Camaná",
        lang: "es",
        dir: "ltr",
        // Rutas relativas: la app vive en su dominio o bajo /app/ de la central
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "any",
        theme_color: "#edf1f5",
        background_color: "#edf1f5",
        categories: ["productivity", "utilities"],
        icons: [
          { src: "icons/pwa-64.png", sizes: "64x64", type: "image/png" },
          { src: "icons/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      // Con SW también en desarrollo PERO sin precache: sw.ts no registra
      // NavigationRoute cuando __WB_MANIFEST está vacío (dev), así las
      // notificaciones push de emergencias funcionan en dev y Vite sigue
      // sirviendo los módulos frescos (sin secuestro del precache viejo).
      devOptions: {
        enabled: true,
      },
    }),
  ],
});
