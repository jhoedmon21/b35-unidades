// diag-alpha.mjs — leer el CANAL ALFA del buffer de TacticalMap.
// ¿RGB con datos pero alfa 0? ¿o alfa 255 y el compositor lo ignora?
// Además: capas ocultas, tamaño de cache del SW y repintado con fondo naranja.
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
await page.waitForTimeout(11000);

const alpha = await page.evaluate(() => {
  const m = window.__fmMap;
  if (!m) return "sin __fmMap";
  const canvas = m.getCanvas();
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!gl) return "SIN CONTEXTO GL (perdido)";
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const px = new Uint8Array(4 * 400 * 100);
  gl.readPixels(0, Math.floor(h / 2) - 50, 400, 100, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let alphaLow = 0;
  let total = 0;
  let alphaSum = 0;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] < 250) alphaLow++;
    alphaSum += px[i];
    total++;
  }
  const hidden = m.getStyle().layers.filter((l) => m.getLayoutProperty(l.id, "visibility") === "none").map((l) => l.id);
  return {
    buffer: w + "x" + h,
    alphaLow, total,
    alphaMedia: (alphaSum / total).toFixed(1),
    capasOcultas: hidden,
  };
});
console.log("ALFA:", JSON.stringify(alpha));

const cachesInfo = await page.evaluate(async () => {
  const names = await caches.keys();
  const out = [];
  for (const name of names) {
    const c = await caches.open(name);
    const keys = await c.keys();
    for (const k of keys.slice(0, 6)) {
      const r = await c.match(k);
      const t = r ? await r.text().then((s) => s.length).catch(() => "?") : "?";
      out.push(`${name} :: ${k.url.slice(0, 80)} :: ${(r && r.status) || "?"} :: len=${t}`);
    }
    if (keys.length > 6) out.push(`${name} :: (+${keys.length - 6} más, total ${keys.length})`);
  }
  return out;
});
console.log("CACHES SW:\n" + cachesInfo.join("\n"));

// matar-prueba: pintar el fondo NARANJA y ver si el alfa sanea
const retest = await page.evaluate(() => {
  const m = window.__fmMap;
  m.setPaintProperty("background", "background-color", "#ffaa00");
  m.triggerRepaint();
  return true;
});
await page.waitForTimeout(900);
const alpha2 = await page.evaluate(() => {
  const m = window.__fmMap;
  const canvas = m.getCanvas();
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  const px = new Uint8Array(4);
  gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return Array.from(px).join(",");
});
console.log("ALFA tras fondo naranja (pixel central RGBA):", alpha2);
await page.screenshot({ path: "D:/35/unidades/screenshots/diag-alpha-naranja.png" });

await browser.close();
console.log("DIAG-ALPHA-DONE");
