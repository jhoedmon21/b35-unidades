// diag-pixels.mjs — ¿el canvas de TacticalMap TIENE píxeles pintados?
// Con preserveDrawingBuffer:true (dev) podemos leer toDataURL sin que salga
// vacío. Comparar longitud + histograma de colores + nº de canvases en DOM.
import { chromium } from "playwright-core";

const pwa = "http://localhost:3100";
const perfil = "C:/Users/Usuario/AppData/Local/Temp/opencode/pwprofile";

const browser = await chromium.launchPersistentContext(perfil, { channel: "chrome", headless: false });
const page = browser.pages()[0] ?? (await browser.newPage());

await page.goto(`${pwa}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const login = await page.evaluate(async () => {
  const r = await fetch("/api/units/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "conductor@fuegomap.pe", password: "bombero123", unitCode: "B-1" }),
  });
  return r.status;
});
console.log("login:", login);

await page.goto(`${pwa}/hidrantes`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(13000);

const info = await page.evaluate(() => {
  const m = window.__fmMap;
  if (!m) return "sin __fmMap";
  const canvas = m.getCanvas();
  const url = canvas.toDataURL("image/png");
  return {
    styleLoaded: m.isStyleLoaded(),
    canvasW: canvas.width,
    canvasH: canvas.height,
    cssW: canvas.clientWidth,
    cssH: canvas.clientHeight,
    dataLen: url.length,
    dataHead: url.slice(0, 48),
    canvasesEnDom: document.querySelectorAll(".maplibregl-canvas").length,
    canvasesEnContenedor: m.getContainer().querySelectorAll(".maplibregl-canvas").length,
  };
});
console.log("TacticalMap pixels:", JSON.stringify(info));

const hist = await page.evaluate(() => {
  const m = window.__fmMap;
  if (!m) return "sin __fmMap";
  const url = m.getCanvas().toDataURL("image/png");
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const colors = new Set();
      let nonWhite = 0;
      let total = 0;
      for (let i = 0; i < d.length; i += 32) {
        const key = d[i] + "," + d[i + 1] + "," + d[i + 2];
        colors.add(key);
        total++;
        if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) nonWhite++;
      }
      resolve({ uniqueColors: colors.size, total, nonWhite });
    };
    img.src = url;
  });
});
console.log("histograma:", JSON.stringify(hist));

await browser.close();
console.log("DIAG-PIXELS-DONE");
