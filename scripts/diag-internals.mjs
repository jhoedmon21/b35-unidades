// diag-internals.mjs — leer las entrañas de los dos mapas (con GPU real)
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
await page.waitForTimeout(12000);
const t = await page.evaluate(() => {
  const m = window.__fmMap;
  if (!m) return "window.__fmMap NO expuesto";
  return {
    styleLoaded: m.isStyleLoaded(),
    tilesLoaded: m.areTilesLoaded(),
    loaded: m.loaded(),
    zoom: m.getZoom().toFixed(2),
    styleLayers: m.getStyle().layers.length,
    hasBackground: !!m.getLayer("background"),
    waterLayers: m.getStyle().layers.filter((l) => l.id.includes("water")).length,
  };
});
console.log("TacticalMap(/hidrantes):", JSON.stringify(t));

// SceneMap: vista /inicio del bombero con el modal de la emergencia fresca
await page.goto(`${pwa}/inicio`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(8000);
await page.evaluate(() => location.reload());
await page.waitForTimeout(9000);
const s = await page.evaluate(() => {
  const m = window.__fmScene;
  if (!m) return "window.__fmScene NO expuesto (¿no hay modal?)";
  return {
    styleLoaded: m.isStyleLoaded(),
    loaded: m.loaded(),
    zoom: m.getZoom().toFixed(2),
    styleLayers: m.getStyle().layers.length,
  };
});
console.log("SceneMap(/inicio):", JSON.stringify(s));

await browser.close();
console.log("DIAG-INTERNALS-DONE");
