// diag-canvas.mjs — ¿el lienzo gris es del modo nav o de headless sin WebGL?
// Captura dos mapas conocidos (/hidrantes y /mapa básico) en el mismo Chrome
// headless y con el perfil que ya tiene sesión de chofer (B-1).
import { chromium } from "playwright-core";

const pwa = "http://localhost:3100";
const perfil = "C:/Users/Usuario/AppData/Local/Temp/opencode/pwprofile";

const browser = await chromium.launchPersistentContext(perfil, { channel: "chrome", headless: true });
const page = browser.pages()[0] ?? (await browser.newPage());
page.on("console", (m) => {
  if (m.type() === "error") console.log("  [console-err]", m.text().slice(0, 160));
});

// 1) /hidrantes — mapa táctico clásico (funcionaba en producción)
await page.goto(`${pwa}/hidrantes`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(12000);
const s1 = await page.evaluate(() => {
  const c = document.querySelector("canvas.maplibregl-canvas");
  return c ? `${c.clientWidth}×${c.clientHeight}` : "sin canvas";
});
console.log("canvas /hidrantes:", s1);
await page.screenshot({ path: "D:/35/unidades/screenshots/diag-hidrantes.png" });

// 2) /mapa básico (sin misión)
await page.goto(`${pwa}/mapa`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(12000);
const s2 = await page.evaluate(() => {
  const c = document.querySelector("canvas.maplibregl-canvas");
  return c ? `${c.clientWidth}×${c.clientHeight}` : "sin canvas";
});
console.log("canvas /mapa:", s2);
await page.screenshot({ path: "D:/35/unidades/screenshots/diag-mapa.png" });

await browser.close();
console.log("DIAG-CANVAS-DONE");
