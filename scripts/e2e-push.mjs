// e2e-push.mjs — Web Push de emergencias para TODOS los bomberos:
// 1) crea una emergencia fresca y abre la PWA: entra como bombero
//    (sin sesión) y verifica que se registra la suscripción pública
//    (POST /api/push/subscription → 201).
// 2) genera una SEGUNDA emergencia y espera a que el service worker
//    MUESTRE la notificación (registration.getNotifications()).
// 3) cierra las emergencias de prueba.
import { chromium } from "playwright-core";

const base = "http://localhost:3000";
const pwa = "http://localhost:3100";
const perfil = "C:/Users/Usuario/AppData/Local/Temp/opencode/pwprofile";

// preflight: la central debe estar viva
for (let i = 0; i < 20; i++) {
  try {
    const r = await fetch(`${base}/api/app/alerts`);
    if (r.ok) break;
  } catch {
    /* aún no */
  }
  await new Promise((r) => setTimeout(r, 2000));
}

async function crearIncidente(title, address) {
  const r = await fetch(`${base}/api/incidents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      address,
      lat: -16.6215,
      lng: -72.711,
      severity: "alta",
      source: "manual",
      notes: "prueba automática e2e-push",
    }),
  });
  const d = await r.json();
  return d?.incident ?? null;
}

const incA = await crearIncidente("[AUTO] Push emergencia A", "Jr. Unión 300, Camaná");
console.log("emergencia A creada:", incA ? `INC-${incA.id}` : "FALLO la creación");

const browser = await chromium.launchPersistentContext(perfil, { channel: "chrome", headless: true });
await browser.grantPermissions(["notifications"], { origin: pwa });
const page = browser.pages()[0] ?? (await browser.newPage());
await page.goto(`${pwa}/`, { waitUntil: "domcontentloaded" });
// el perfil puede traer sesión de chofer de corridas anteriores: cerrarla
// para probar el flujo BOMBERO (sin sesión, suscripción pública)
await page.evaluate(() => fetch("/api/units/auth/logout", { method: "POST" }));
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);

const bodyText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
const esIngreso = /CORREO/i.test(bodyText);
console.log("pantalla de ingreso:", esIngreso ? "SÍ (toggle listo)" : "NO (entró directo como bombero)");

const respPromise = page.waitForResponse(
  (r) => r.url().includes("/api/push/subscription") && r.request().method() === "POST",
  { timeout: 30000 },
);
if (esIngreso) {
  const btn = page.locator("button", { hasText: "Bombero" }).first();
  console.log("botón bombero visible:", (await btn.count()) > 0 ? "SÍ" : "NO");
  await btn.click();
} else {
  await page.mouse.click(300, 400); // primer toque equivalente: gesto → suscripción
}
let suscripcion = "sin POST (no ocurrió ✗)";
try {
  const resp = await respPromise;
  suscripcion = resp.ok ? `status ${resp.status()} ✓` : `status ${resp.status()} ✗`;
} catch {
  suscripcion = "timeout esperando el POST ✗";
}
console.log("suscripción pública:", suscripcion);

// emergencia B: su push llega con la suscripción de este dispositivo ya registrada
const incB = await crearIncidente("[AUTO] Push emergencia B", "Av. Lima 203, Camaná");
console.log("emergencia B creada:", incB ? `INC-${incB.id}` : "FALLO la creación");

// esperar a que el SW muestre la notificación (el envío pasa por FCM: unos segundos)
let titles = [];
for (let i = 0; i < 14; i++) {
  await page.waitForTimeout(1500);
  titles = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    const out = [];
    for (const r of regs) {
      const ns = await r.getNotifications();
      for (const n of ns) out.push(`${n.title} || ${n.body} || tag=${n.tag}`);
    }
    return out;
  });
  if (titles.some((t) => t.includes("🚨"))) break;
}
const ok = titles.some((t) => t.includes("🚨"));
console.log("notificación push mostrada:", ok ? `SÍ ✓ → ${titles.join(" ·· ")}` : "NO ✗");
console.log(
  "pantalla de la app:",
  (await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 180))),
);
await page.screenshot({ path: "D:/35/unidades/screenshots/5-push-emergencia.png" });

await browser.close();

const cerrados = [];
for (const id of [incA?.id, incB?.id].filter((x) => x != null)) {
  const r = await fetch(`${base}/api/incidents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "cerrado" }),
  });
  cerrados.push(`INC-${id}: ${r.status}`);
}
console.log("cierre:", cerrados.join(" · "));
console.log("E2E-PUSH-DONE");
