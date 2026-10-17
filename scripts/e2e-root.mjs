// e2e-root.mjs — http://localhost:3100 directo:
// con una emergencia NUEVA sin reconocer, la app NO pide credenciales:
// entra sola a la vista de bomberos con la alerta en pantalla (y la sirena
// armada, que suena al primer toque por política de autoplay del navegador).
import { chromium } from "playwright-core";

const base = "http://localhost:3000";
// 1) crear emergencia fresca con fecha de ahora
const created = await fetch(`${base}/api/incidents`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: "[AUTO] Apertura directa",
    address: "Plaza de Armas, Camaná",
    lat: -16.6215,
    lng: -72.711,
    severity: "alta",
    source: "manual",
    notes: "prueba automática e2e-root",
  }),
});
const inc = (await created.json())?.incident;
console.log("emergencia creada:", created.status, `INC-${inc?.id}`);

const browser = await chromium.launchPersistentContext(
  "C:/Users/Usuario/AppData/Local/Temp/opencode/pwprofile",
  { channel: "chrome", headless: true },
);
const page = browser.pages()[0] ?? (await browser.newPage());
await page.goto("http://localhost:3100/", { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 5000));

const texto = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ""));
const pideLogin = texto.includes("CORREO");
const alertaDirecta = texto.includes("EMERGENCIANUEVA") || texto.includes("EMERGENCIAACTIVA");
console.log("¿pide login al abrir la raíz?:", pideLogin ? "SÍ ✗" : "NO ✓ (entra directo)");
console.log("alerta visible de una vez:", alertaDirecta ? "SÍ ✓" : "NO ✗");
console.log("pantalla:", (await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 200))));
await page.screenshot({ path: "D:/35/unidades/screenshots/4-apertura-directa.png" });

await browser.close();

// 2) cerrar la emergencia de prueba (HTTP 200 esperado)
const r = await fetch(`${base}/api/incidents/${inc.id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "cerrado" }),
});
console.log("cierre de INC-" + inc.id + ":", r.status);
console.log("E2E-DONE");
