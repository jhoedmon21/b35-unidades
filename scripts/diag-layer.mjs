// diag-layer.mjs — probar manipulaciones que fuerzan re-crear la capa de
// composición del canvas y ver cuál lo "revive" en pantalla.
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

// 1) will-change: transform en el canvas
await page.evaluate(() => { document.querySelector(".maplibregl-canvas").style.willChange = "transform"; });
await page.waitForTimeout(700);
await page.screenshot({ path: "D:/35/unidades/screenshots/layer-1-willchange.png" });

// 2) translateZ(0) explícito
await page.evaluate(() => { document.querySelector(".maplibregl-canvas").style.transform = "translateZ(0)"; });
await page.waitForTimeout(700);
await page.screenshot({ path: "D:/35/unidades/screenshots/layer-2-translatez.png" });

// 3) map.resize() (re-layout interno de MapLibre)
await page.evaluate(() => window.__fmMap.resize());
await page.waitForTimeout(1500);
await page.screenshot({ path: "D:/35/unidades/screenshots/layer-3-resize.png" });

// 4) apagar preserveDrawingBuffer por nueva instancia? — aquí solo ver si
// tras resize + repaint aparece
await page.evaluate(() => window.__fmMap.triggerRepaint());
await page.waitForTimeout(500);
await page.screenshot({ path: "D:/35/unidades/screenshots/layer-4-repaint.png" });

console.log("DIAG-LAYER-DONE");
await browser.close();
