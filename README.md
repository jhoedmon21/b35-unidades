# FuegoMap Unidades — PWA de la tablet del vehículo

PWA instalable para la tablet de cada unidad del cuerpo de bomberos (Perú).
Recibe los despachos de **FuegoMap Admin** (el panel de la central), funciona
con señal inestable y mantiene todo el estado local en IndexedDB.

| | |
|---|---|
| **App** | React 18 + Vite + TypeScript · React Router · TanStack Query · Tailwind 4 |
| **Offline** | IndexedDB (Dexie) + cola outbox idempotente · service worker Workbox |
| **Mapa** | MapLibre GL + teselas OpenFreeMap «positron» con caché de teselas (etapa 3) |
| **Tiempo real** | SSE con reconexión + consulta de respaldo cada 20 s si el stream cae |
| **Notificaciones** | Web Push con VAPID (despachos con prioridad alta) |
| **3D** | Three.js + @react-three/fiber (visor del vehículo, etapa 3) |

## Arranque

```bash
# 1. La central debe estar corriendo (FuegoMap Admin en :3000)
cd ../firewaze && npm run dev

# 2. La PWA (en :3100, con proxy /api → :3000)
npm install
npm run dev            # http://localhost:3100
```

Credenciales de demo (seed): `conductor@fuegomap.pe` / `jefe@fuegomap.pe`,
clave **bombero123**. La unidad se confirma en el propio login (p. ej. B-1).

## Estructura

```
src/
  lib/        api (fetch tipado) · alarm (sirena WebAudio) · push (VAPID)
              queue helpers · status (etiquetas/colores) · theme · format
  db/         db.ts (Dexie) · queue-core.ts (lógica PURA) · queue.ts (motor)
  state/      AppContext — sesión, unidad, misión, conexión, cola, alertas
  hooks/      useSSE · useWakeLock · useUnitPosition (5 s en misión / 30 s reposo)
  pages/      Login · Home · Alert · Mission · Settings · Stub (etapas 2-3)
  sw.ts       Service worker: precache + caché de teselas + Web Push
tests/        queue.test.ts — cola + idempotencia (vitest, sin navegador)
scripts/      gen-icons.mjs — iconos PWA generados (PNG puro)
```

## Claves VAPID

El backend (FuegoMap Admin) necesita su par de claves en `.env`:

```bash
cd ../firewaze
npx web-push generate-vapid-keys
# → copiar a .env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT=mailto:...
```

Ya hay un par generado en `firewaze/.env` para desarrollo. La clave pública
se expone en `GET /api/push/key`; la tablet se suscribe tras el login
(`POST /api/units/me/push-subscription`) y el servidor envía los despachos
con `sendPushToUnit()` (`src/lib/push.ts` de la central).

## Probar en una tablet real

> **Interfaz blanca de la central se mantiene desde `fddcf785` en adelante:**
> la PWA conserva el tema claro original (paneles blancos, rojo solo para
> urgencia) y el mapa OpenFreeMap «positron». ENCIMA del mapa de Mapa viven
> dos extras de cabina: el **chrome VIPER** (marca con código de unidad,
> píldoras de capas Hidrantes/Zonas, raíl Destino/Puesto/Norte/Vista,
> panel «Estado operativo», retícula de hidrantes cercanos, panel Vehículos
> y etiqueta blanca de la ficha) y el **velocímetro** del modo conducción.
> El chrome está en `src/components/CockpitChrome.tsx` + las clases
> `.viper-*` de `src/index.css`; quita de ahí si algún día molesta — el
> resto de la app no depende de él.
>
> La ficha del edificio se prueba con un despacho a ≤300 m de un preplan
> activo: la misión muestra la tarjeta «Ficha del edificio» con su
> contacto y sus fotos.

> **En desarrollo el service worker está desactivado** (un precache viejo
> puede secuestrar la página entre reinicios del dev server). Para probar
> instalación, offline y notificaciones usa el build de producción:
> `npm run build && npm run preview` (→ http://localhost:4173).
> Si tu navegador quedó con un SW viejo de una sesión anterior:
> F12 → Application → Service Workers → **Unregister**, y Storage →
> **Clear site data**.

1. **Red local:** levanta la central con `npm run dev` (acepta conexiones
   externas) y la PWA con `npm run dev -- --host`.
2. **HTTPS obligatorio:** service workers y push solo corren en
   `localhost` o en HTTPS. Opciones:
   - Conectar la tablet por USB y usar `adb reverse tcp:3100 tcp:3100`
     → abre `http://localhost:3100` en la tablet (contexto seguro).
   - O publicar con HTTPS (Railway, Vercel, Cloudflare) para la prueba real.
3. **Instalar:** Chrome → menú ⋮ → **«Agregar a pantalla de inicio»**.
   Debe abrirse standalone (sin barra de direcciones).
4. **Notificaciones:** entra a la app (el login cuenta como gesto),
   acepta el permiso, y usa **Ajustes → Probar alarma** para sonido+vibración.
5. **Despacho de prueba:** en la central, simula un reporte y despáchalo a
   tu unidad → la tablet debe sonar con la alerta de pantalla completa; si
   la app está en segundo plano llega la notificación push.

## Simular caída de internet (DevTools)

1. Abre DevTools → **Network → Throttling → Offline** (o «No network»).
2. Cambia el estado de la unidad: verás el cambio aplicado localmente y el
   contador de **cambios pendientes** subir en la cabecera.
3. Añade un cierre de misión sin señal — queda en cola.
4. Desactiva Offline → la cola se envía sola en menos de 30 s
   (evento `online`, foco de ventana o el reintento periódico).
5. Verifica en la central que cada cambio llegó **una sola vez**
   (idempotencia por `opId` — véase `tests/queue.test.ts`).

## Limitaciones conocidas de la PWA

- **Segundo plano:** Android puede congelar la app tras minutos inactiva.
  El despacho en segundo plano depende de la **notificación push** (el SW
  la muestra siempre); la sirena a pantalla completa solo suena con la app
  abierta. Es la limitación inherente a toda PWA (sin foreground service).
- **Push sin Play Services** no funciona en algunos Android AOSP.
- **El timer de 60 s** vive en la central (un solo proceso); si el servidor
  se reinicia en esa ventana, el aviso de «no aceptada» se pierde.
- **Wake Lock** se pierde si el usuario bloquea manualmente la tablet;
  la app lo readquiere al volver a primer plano (estado visible en Ajustes).
- **Fotos de cierre** se suben sin comprimir (máx. 8 MB del backend);
  en producción conviene `canvas.toBlob` con calidad 0.7.
- **SQLite + bus en memoria** en la central: válido para una instancia;
  para multi-servidor se necesita PostgreSQL + Redis Pub/Sub (interfaz ya
  aislada en `src/lib/bus.ts`).

## Etapas

- **Etapa 1 (esta versión):** PWA instalable, sesión, estado de la unidad,
  cola sin internet + push + SSE, alerta de despacho, misión y cierre.
- **Etapa 2:** galería con zoom fino, historial, pulir alertas.
- **Etapa 3:** mapa MapLibre con ruta OSRM y teselas cacheadas, hidrantes
  en campo (alta + estado con foto), visor 3D del vehículo con checklist.

## Pruebas

```bash
npm test   # vitest: 8 pruebas de la cola (idempotencia, reintentos, purga)
```

## Despliegue

- Produccion: https://b35-unidades.vercel.app (proxy /api -> b35-central.vercel.app segun vercel.json)
- Tambien servida bajo el dominio central: https://b35-central.vercel.app/app (mismo origen: cookies y SSE sin CORS; assets/manifest/SW relativos, base ./)
- Repo: jhoedmon21/b35-unidades � Desplegar: vercel --prod (o push si GitHub esta conectado en Vercel)
