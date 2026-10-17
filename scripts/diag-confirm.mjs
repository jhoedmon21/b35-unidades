// diag-confirm.mjs — CONFIRMAR la causa: contenedor colapsado (height 0)
// por `.maplibregl-map { position: relative }` pisando `absolute`+`inset-0`.
// Poniendo position:absolute inline → el contenedor se estira → ¿pinta?
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
await page.waitForTimeout(11000);
await page.screenshot({ path: "D:/35/unidades/screenshots/confirm-1-baseline.png" });

await page.evaluate(() => {
  const cont = document.querySelector(".maplibregl-map");
  const s = getComputedStyle(cont);
  window.__confirm = { position: s.position, height: s.height, cssRules: [] };
  cont.style.setProperty("position", "absolute", "important");
});
await page.waitForTimeout(700);
await page.screenshot({ path: "D:/35/unidades/screenshots/confirm-2-absolute.png" });
const info = await page.evaluate(() => {
  const cont = document.querySelector(".maplibregl-map");
  const r = cont.getBoundingClientRect();
  return { pos: getComputedStyle(cont).position, h: Math.round(r.height) };
});
console.log("container:", JSON.stringify(info));

await browser.close();
console.log("DIAG-CONFIRM-DONE");
