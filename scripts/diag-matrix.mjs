// diag-matrix.mjs — 3 mapas adicionales SECUENCIALES en el mismo slot,
// cada uno se captura y se elimina antes del siguiente:
//  M3 div plano + preserveDrawingBuffer   (¿preserve mata el canvas?)
//  M4 estructura absolute-inset-0 de TacticalMap sin preserve
//  M5 estructura absolute-inset-0 + preserve
import { chromium } from "playwright-core";

const pwa = "http://localhost:3100";
const perfil = "C:/Users/Usuario/AppData/Local/Temp/opencode/pwprofile";
const STYLE = "https://tiles.openfreemap.org/styles/positron";

const browser = await chromium.launchPersistentContext(perfil, { channel: "chrome", headless: false });
const page = browser.pages()[0] ?? (await browser.newPage());

await page.goto(`${pwa}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await page.evaluate(async () => {
  await fetch("/api/units/auth/logout", { method: "POST" }).catch(() => {});
  await fetch("/api/units/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "conductor@fuegomap.pe", password: "bombero123", unitCode: "B-1" }),
  });
});

await page.goto(`${pwa}/mapa`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(13000);

async function mkMap(id, estructura, preserve) {
  return page.evaluate(async ({ id, estructura, preserve, style }) => {
    const urls = performance.getEntriesByType("resource").map((e) => e.name);
    const url = urls.find((n) => n.includes("maplibre-gl.js"));
    const ml = await import(url);
    let host;
    if (estructura === "plano") {
      host = document.createElement("div");
      host.style.cssText = "position:fixed;top:380px;left:680px;width:520px;height:260px;z-index:99999;border:2px solid #333;background:#fff;";
      document.body.appendChild(host);
    } else {
      const wrap = document.createElement("div");
      wrap.style.cssText = "position:fixed;top:380px;left:680px;width:520px;height:260px;z-index:99999;border:2px solid #333;overflow:hidden;";
      host = document.createElement("div");
      host.style.cssText = "position:absolute;inset:0;";
      wrap.appendChild(host);
      document.body.appendChild(wrap);
    }
    const cfg = { container: host, style, center: [-72.7106, -16.6236], zoom: 13 };
    if (preserve) cfg.preserveDrawingBuffer = true;
    const map = new ml.Map(cfg);
    window["_diag_" + id] = map;
    window["_diagHost_" + id] = host.parentElement ?? host;
    return "creado " + id;
  }, { id, estructura, preserve, style: STYLE });
}

async function limpiar(id) {
  return page.evaluate((id) => {
    try { window["_diag_" + id].remove(); } catch (e) {}
    const n = window["_diagHost_" + id];
    if (n && n.parentElement) n.parentElement.removeChild(n);
    return "limpio " + id;
  }, id);
}

// asegurar que la página sigue viva antes de crear más mapas
async function ensure() {
  const ok = await page.evaluate(() => !!document.body && !document.body.dataset.dead).catch(() => false);
  if (!ok) {
    await page.goto(`${pwa}/mapa`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
  }
}

await ensure();
console.log("M3:", await mkMap("M3", "plano", true));
await page.waitForTimeout(7000);
await page.screenshot({ path: "D:/35/unidades/screenshots/matrix-M3-plano-preserve.png" });
console.log(await limpiar("M3"));

await ensure();
console.log("M4:", await mkMap("M4", "absolute", false));
await page.waitForTimeout(7000);
await page.screenshot({ path: "D:/35/unidades/screenshots/matrix-M4-absolute-nopreserve.png" });
console.log(await limpiar("M4"));

await ensure();
console.log("M5:", await mkMap("M5", "absolute", true));
await page.waitForTimeout(7000);
await page.screenshot({ path: "D:/35/unidades/screenshots/matrix-M5-absolute-preserve.png" });
console.log(await limpiar("M5"));

await browser.close();
console.log("DIAG-MATRIX-DONE");
