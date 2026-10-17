// diag-final.mjs — verificación integral tras el fix:
//  (1) /mapa con misión: ¿tiles + ruta visibles?
//  (2) /inicio guest: ¿layout sin hidrantes + modal ok?
//  (3) huérfano /hidrantes: debe redirigir a /inicio
import { chromium } from "playwright-core";

const pwa = "http://localhost:3100";
const perfil = "C:/Users/Usuario/AppData/Local/Temp/opencode/pwprofile";

const browser = await chromium.launchPersistentContext(perfil, { channel: "chrome", headless: false });
const page = browser.pages()[0] ?? (await browser.newPage());

await page.goto(`${pwa}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await page.evaluate(async () => {
  await fetch("/api/units/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "conductor@fuegomap.pe", password: "bombero123", unitCode: "B-1" }),
  });
});

// (1) /mapa con misión
await page.goto(`${pwa}/mapa`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(12000);
const mapState = await page.evaluate(() => {
  const m = window.__fmMap;
  if (!m) return "sin __fmMap";
  const c = m.getContainer();
  return { containerH: Math.round(c.getBoundingClientRect().height), styleLoaded: m.isStyleLoaded() };
});
console.log("mapa:", JSON.stringify(mapState));
await page.screenshot({ path: "D:/35/unidades/screenshots/final-mapa.png" });

// (3) /hidrantes debe redirigir
await page.goto(`${pwa}/hidrantes`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
console.log("ruta tras /hidrantes:", await page.evaluate(() => location.pathname));

// (2) /inicio (chofer) — layout sin tarjeta de hidrantes
await page.goto(`${pwa}/inicio`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);
await page.screenshot({ path: "D:/35/unidades/screenshots/final-inicio-chofer.png" });

await browser.close();
console.log("DIAG-FINAL-DONE");
