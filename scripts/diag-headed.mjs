// diag-headed.mjs — reproducir «/mapa no carga» EN VENTANA REAL (con GPU):
// 1) abre /mapa tal como está (SW de desarrollo activo) y captura
// 2) desregistra el SW, recarga y captura de nuevo
// Si solo el 2) pinta → el SW dev está rompiendo el mapa.
import { chromium } from "playwright-core";

const pwa = "http://localhost:3100";
const perfil = "C:/Users/Usuario/AppData/Local/Temp/opencode/pwprofile";

const browser = await chromium.launchPersistentContext(perfil, { channel: "chrome", headless: false });
const page = browser.pages()[0] ?? (await browser.newPage());
page.on("console", (m) => {
  if (m.type() === "error") console.log("  [err]", m.text().slice(0, 150));
});
page.on("requestfailed", (r) => {
  if (r.url().includes("openfreemap") || r.url().includes("worker")) {
    console.log("  [req-fail]", r.failure()?.errorText ?? "", r.url().slice(0, 120));
  }
});

await page.goto(`${pwa}/mapa`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(14000);
await page.screenshot({ path: "D:/35/unidades/screenshots/diag-headed-1-consw.png" });

// desregistrar TODOS los service workers y recargar
await page.evaluate(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const r of regs) await r.unregister();
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(14000);
await page.screenshot({ path: "D:/35/unidades/screenshots/diag-headed-2-sinw.png" });

await browser.close();
console.log("DIAG-HEADED-DONE");
