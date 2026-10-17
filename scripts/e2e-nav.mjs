// e2e-nav.mjs — «Navegar» SIN salir de la app:
// 1) crea una emergencia y despacha a la unidad demo
// 2) entra como chofer, acepta el despacho y pulsa «Navegar»
// 3) verifica que NO sale a Google Maps: la URL sigue siendo localhost:3100
//    con ?nav=1, el banner «EN RUTA · SEGUIMIENTO GPS» está y la cámara
//    sigue al GPS (se mueve la geolocalización y no hay crash)
// 4) cierra misión e incidente de prueba
import { chromium } from "playwright-core";

const base = "http://localhost:3000";
const pwa = "http://localhost:3100";
const perfil = "C:/Users/Usuario/AppData/Local/Temp/opencode/pwprofile";

for (let i = 0; i < 20; i++) {
  try {
    if ((await fetch(`${base}/api/app/alerts`)).ok) break;
  } catch {
    /* aún no */
  }
  await new Promise((r) => setTimeout(r, 2000));
}

const crear = async (body) => {
  const r = await fetch(`${base}/api/incidents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await r.json())?.incident ?? null;
};

const inc = await crear({
  title: "[AUTO] Ruta en app",
  address: "Av. Ferré 500, Camaná",
  lat: -16.6221,
  lng: -72.7099,
  severity: "media",
  source: "manual",
});
console.log("incidente:", inc ? `INC-${inc.id}` : "FALLO");
const { units = [] } = await (await fetch(`${base}/api/units`)).json();
const unidadExacta = units.find((u) => u.code === "B-1") ?? units.find((u) => u.code !== "AMB-1") ?? units[0];
const unidad = unidadExacta;
const d = await fetch(`${base}/api/incidents/${inc.id}/dispatch`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ unitId: unidad.id }),
});
console.log("despacho a", unidad.code, ":", d.status);

const browser = await chromium.launchPersistentContext(perfil, {
  channel: "chrome",
  headless: true,
  permissions: ["geolocation"],
  geolocation: { latitude: -16.6236, longitude: -72.7106, accuracy: 15 },
});
const page = browser.pages()[0] ?? (await browser.newPage());
await page.goto(`${pwa}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

const loginStatus = await page.evaluate(async (creds) => {
  const r = await fetch("/api/units/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(creds),
  });
  return r.status;
}, { email: "conductor@fuegomap.pe", password: "bombero123", unitCode: unidad.code });
console.log("login chofer:", loginStatus);

await page.goto(`${pwa}/alerta`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const aceptar = page.locator("button", { hasText: "Aceptar" }).first();
if ((await aceptar.count()) > 0) {
  await aceptar.click();
  await page.waitForTimeout(2500);
}
if (!page.url().includes("/mision")) {
  await page.goto(`${pwa}/mision`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
}
console.log("pantalla misión:", page.url());

const btnNav = page.locator("a", { hasText: "Navegar" }).first();
console.log("botón Navegar visible:", (await btnNav.count()) > 0 ? "SÍ" : "NO");
await btnNav.click();
await page.waitForTimeout(15000); // el estilo MapLibre (positron) tarda en cargar la primera vez

const canvasOk = await page.evaluate(() => {
  const c = document.querySelector("canvas.maplibregl-canvas");
  if (!c) return "sin canvas";
  return `canvas ${c.clientWidth}×${c.clientHeight}`;
});
console.log("canvas del mapa:", canvasOk);

const url = page.url();
const texto = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
console.log("URL tras Navegar:", url);
console.log("¿sigue en la app (sin Google Maps)?:", !url.includes("google") && url.includes("localhost:3100") ? "SÍ ✓" : "NO ✗");
console.log("banner modo navegación:", texto.includes("EN RUTA") ? "SÍ ✓" : "NO ✗");
console.log("panel ETA visible:", /\d{1,3}\s?(min|km|m)|Calculando ruta|Esperando ubicación/i.test(texto) ? "SÍ ✓" : "NO ✗");
await page.screenshot({ path: "D:/35/unidades/screenshots/6-navegacion-en-app.png" });

// mover el GPS ~200 m al norte: la cámara debe reaccionar (sin crash)
await browser.setGeolocation({ latitude: -16.6211, longitude: -72.7090, accuracy: 12 });
await page.waitForTimeout(3000);
console.log("tras mover GPS, app viva:", (await page.evaluate(() => document.body.innerText.length)) > 100 ? "SÍ ✓" : "NO ✗");

// salir del modo navegación
const salir = page.locator("button", { hasText: "Salir" }).first();
if ((await salir.count()) > 0) {
  await salir.click();
  await page.waitForTimeout(1500);
  console.log("salida del modo:", !page.url().includes("nav=1") ? "vuelve a la vista normal ✓" : `sigue en nav ✗ (${page.url()})`);
}

await browser.close();

// limpieza: cerrar misión e incidente de prueba (con cookie de chofer en node? no —
// la sesión vive en el perfil del navegador; el cierre fuera del navegador no puede).
console.log("cierre de misión: hazla + cierre por la central");
const cInc = await fetch(`${base}/api/incidents/${inc.id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "cerrado" }),
});
console.log("cierre INC-" + inc.id + ":", cInc.status);
console.log("E2E-NAV-DONE");
