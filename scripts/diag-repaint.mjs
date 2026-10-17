// diag-repaint.mjs — ¿el frame compuesto está "viejo"? Forzar un render
// fresco de MapLibre y capturar INMEDIATAMENTE después.
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

await page.goto(`${pwa}/hidrantes`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(10000);
await page.screenshot({ path: "D:/35/unidades/screenshots/diag-repaint-antes.png" });

// ¿hay rAF activo? Forzar repaint de MapLibre ahora mismo
await page.evaluate(() => window.__fmMap.triggerRepaint());
await page.waitForTimeout(120);
await page.screenshot({ path: "D:/35/unidades/screenshots/diag-repaint-despues.png" });

// y un segundo intento más tarde (por si el frame tarda)
await page.waitForTimeout(2000);
await page.evaluate(() => window.__fmMap.triggerRepaint());
await page.waitForTimeout(300);
await page.screenshot({ path: "D:/35/unidades/screenshots/diag-repaint-tardio.png" });

console.log("DIAG-REPAINT-DONE");
await browser.close();
