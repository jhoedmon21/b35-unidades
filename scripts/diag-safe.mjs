// diag-safe.mjs — el control que falta: TacticalMap SIN service worker
// (window.__fmMap debe estar) y con GPU real. Si pinta → el SW dev rompe
// a TacticalMap; si queda gris → TacticalMap está roto por sí mismo.
import { chromium } from "playwright-core";

const pwa = "http://localhost:3100";
const perfil = "C:/Users/Usuario/AppData/Local/Temp/opencode/pwprofile";

const browser = await chromium.launchPersistentContext(perfil, { channel: "chrome", headless: false });
const page = browser.pages()[0] ?? (await browser.newPage());

await page.goto(`${pwa}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const sinSw = await page.evaluate(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const r of regs) await r.unregister();
  return regs.length;
});
console.log("SW desregistrados:", sinSw);
await page.evaluate(() => fetch("/api/units/auth/logout", { method: "POST" }));

// login ANOTHER: la sesión manda — sin ella /hidrantes es pantalla de login
const login = await page.evaluate(async () => {
  const r = await fetch("/api/units/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "conductor@fuegomap.pe", password: "bombero123", unitCode: "B-1" }),
  });
  return r.status;
});
console.log("login tras logout:", login);

await page.goto(`${pwa}/hidrantes`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(14000);
const st = await page.evaluate(() => {
  const m = window.__fmMap;
  if (!m) return "sin __fmMap";
  return {
    styleLoaded: m.isStyleLoaded(),
    tilesLoaded: m.areTilesLoaded(),
    zoom: m.getZoom().toFixed(2),
    layers: m.getStyle().layers.length,
  };
});
console.log("TacticalMap SIN SW:", JSON.stringify(st));
await page.screenshot({ path: "D:/35/unidades/screenshots/diag-hidrantes-sinsw.png" });

await browser.close();
console.log("DIAG-SAFE-DONE");
