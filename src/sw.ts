/// <reference lib="webworker" />
// ============================================================
//  Service worker de FuegoMap Unidades (injectManifest)
//  - Precache de la app (instalable, arranca sin red)
//  - Caché de teselas CartoDB Dark Matter (mapa sin conexión)
//  - Web Push: notifica despachos con prioridad alta aunque la
//    app esté cerrada; el toque abre la app en la alerta.
// ============================================================

import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";
import { createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";

// __WB_MANIFEST debe aparecer UNA sola vez (el build lo reemplaza por el
// precache real; en desarrollo queda vacío: sin precache ni NavigationRoute).
declare let self: ServiceWorkerGlobalScope;

const manifest = self.__WB_MANIFEST;
precacheAndRoute(manifest);
// (string | PrecaceEntry)[] según los tipos: se normaliza antes de leer .url
const hasIndexHtml = manifest.some((e) =>
  typeof e === "string" ? e === "index.html" : e.url === "index.html",
);
if (hasIndexHtml) {
  registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));
}

// Teselas vectoriales de OpenFreeMap (las mismas, sin API key, que usa
// la central) + sus fuentes/glyphs — CacheFirst: la zona queda disponible
// sin señal.
registerRoute(
  ({ url }) => url.hostname === "tiles.openfreemap.org",
  new CacheFirst({
    cacheName: "fuegomap-tiles-v1",
    plugins: [
      new ExpirationPlugin({ maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// Rutas OSRM — NetworkFirst con respaldo en caché (la ruta de la misión sobrevive sin señal)
registerRoute(
  ({ url }) => url.hostname === "router.project-osrm.org",
  new NetworkFirst({
    cacheName: "fuegomap-routes-v1",
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 12 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// ---------- Web Push ----------

interface PushPayload {
  kind?: "dispatch" | "incident" | "mission_unaccepted" | "status_forced" | "test";
  title?: string;
  body?: string;
  incidentId?: number;
}

self.addEventListener("push", (event: PushEvent) => {
  let data: PushPayload = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: "FuegoMap", body: event.data?.text() };
  }
  const isDispatch = data.kind === "dispatch";
  const isIncident = data.kind === "incident";
  // Cada emergencia es una notificación separada (no colapsa con la siguiente)
  const tag = isIncident && data.incidentId != null ? `incident-${data.incidentId}` : (data.kind ?? "fuegomap");
  const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
    body: data.body ?? (isIncident ? "Emergencia sin detalles" : "Novedad de la central"),
    // Relativos al SW: valen en el dominio propio y bajo /app/ de la central
    icon: "icons/pwa-192.png",
    badge: "icons/pwa-192.png",
    tag,
    renotify: true,
    // El despacho y una emergencia nueva no se descartan solos
    requireInteraction: isDispatch || isIncident,
    vibrate: [400, 200, 400, 200, 400],
    silent: false,
    data,
  };
  event.waitUntil(self.registration.showNotification(data.title ?? "🚨 FuegoMap", options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const payload = event.notification.data as PushPayload | undefined;
  // Ruta relativa al scope del SW: «/» en su dominio, «/app/» bajo la central
  const base = new URL(self.registration.scope).pathname.replace(/\/$/, "");
  const target = payload?.kind === "dispatch" ? `${base}/alerta` : base || "/";
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
