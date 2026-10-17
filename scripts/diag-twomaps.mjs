// diag-twomaps.mjs — EN /mapa con misión (caso exacto del usuario):
// ¿el canvas táctico está gris mientras un SEGUNDO MapLibre en un div
// plano nuevo SÍ pinta? Discrimina estructura/instancia vs entorno.
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

await page.goto(`${pwa}/mapa`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(13000);
await page.screenshot({ path: "D:/35/unidades/screenshots/twomaps-baseline.png" });

const made = await page.evaluate(async () => {
  const urls = performance.getEntriesByType("resource").map((e) => e.name);
  const url = urls.find((n) => n.includes("maplibre-gl.js"));
  let ml;
  try {
    ml = await import(url);
  } catch (e) {
    return "no import: " + e.message + " url=" + url;
  }
  const host = document.createElement("div");
  host.id = "segundo-map";
  host.style.cssText = "position:fixed;top:36px;left:36px;width:640px;height:320px;z-index:99999;border:3px solid #c8291a;background:#fff;";
  document.body.appendChild(host);
  window.__fmSecond = new ml.Map({
    container: host,
    style: "https://tiles.openfreemap.org/styles/positron",
    center: [-72.7106, -16.6236],
    zoom: 13,
  });
  return "ok con " + url.slice(0, 90);
});
console.log("segundo mapa:", made);

await page.waitForTimeout(9000);
await page.screenshot({ path: "D:/35/unidades/screenshots/twomaps-segundo.png" });

const st = await page.evaluate(() => {
  const m = window.__fmSecond;
  const canvas = m.getCanvas();
  return {
    styleLoaded: m.isStyleLoaded(),
    size: canvas.width + "x" + canvas.height,
  };
});
console.log("segundo mapa estado:", JSON.stringify(st));

await browser.close();
console.log("DIAG-TWOMAPS-DONE");
