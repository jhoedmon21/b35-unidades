// diag-matrix2.mjs — deltas restantes del constructor de TacticalMap:
//  M6 attributionControl:{compact:true}
//  M7 zoom:14 (como TacticalMap)
//  M8 clon EXACTO del ejemplo (container node React-managed + todas las opts)
// corren sobre una página FRESCA de /mapa (táctico gris incluido).
import { chromium } from "playwright-core";

const pwa = "http://localhost:3100";
const perfil = "C:/Users/Usuario/AppData/Local/Temp/opencode/pwprofile";
const STYLE = "https://tiles.openfreemap.org/styles/positron";

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
await page.goto(`${pwa}/mapa`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(12000);

async function mkMap(id, variant) {
  return page.evaluate(async ({ id, variant, style }) => {
    const urls = performance.getEntriesByType("resource").map((e) => e.name);
    const url = urls.find((n) => n.includes("maplibre-gl.js"));
    const ml = await import(url);
    let host;
    if (variant === "clon") {
      // el contenedor EXACTO de TacticalMap: tomar su propio containerRef
      const capa = document.querySelector(".maplibregl-map")?.parentElement; // div absolute inset-0 (root TacticalMap)
      const containerRef = capa?.querySelector("div:not(.maplibregl-map):not([class*='absolute inset-x'])") ?? null;
      host = document.createElement("div");
      host.style.cssText = "position:absolute;inset:0;outline:2px solid blue;";
      (containerRef ?? capa)?.appendChild(host);
    } else {
      host = document.createElement("div");
      host.id = id;
      host.style.cssText = "position:fixed;top:330px;left:700px;width:500px;height:250px;z-index:99999;border:2px solid #333;background:#fff;";
      document.body.appendChild(host);
    }
    const cfg = { container: host, style, center: [-72.7106, -16.6236], zoom: variant === "zoom14" ? 14 : 13 };
    if (variant === "attr" || variant === "clon") cfg.attributionControl = { compact: true };
    if (variant === "clon") cfg.preserveDrawingBuffer = false;
    const map = new ml.Map(cfg);
    window["_diag_" + id] = map;
    window["_diagHost_" + id] = host;
    return "creado " + id + " " + variant + (host.isConnected ? " (conectado)" : " (¡DESCONECTADO!)");
  }, { id, variant, style: STYLE });
}

async function ciclo(id, variant, shot) {
  const ok = await page.evaluate(() => !!document.body).catch(() => false);
  if (!ok) {
    await page.goto(`${pwa}/mapa`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(10000);
  }
  console.log(id, await mkMap(id, variant));
  await page.waitForTimeout(6500);
  await page.screenshot({ path: shot });
  await page.evaluate((id) => {
    try { window["_diag_" + id].remove(); } catch {}
    const h = window["_diagHost_" + id];
    if (h && h.parentElement) h.parentElement.removeChild(h);
  }, id);
  await page.waitForTimeout(300);
}

await ciclo("M6", "attr", "D:/35/unidades/screenshots/m2-M6-attrib.png");
await ciclo("M7", "zoom14", "D:/35/unidades/screenshots/m2-M7-zoom14.png");
await ciclo("M8", "clon", "D:/35/unidades/screenshots/m2-M8-clon.png");

await browser.close();
console.log("DIAG-MATRIX2-DONE");
