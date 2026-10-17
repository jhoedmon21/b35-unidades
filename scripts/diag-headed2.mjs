// diag-headed2.mjs — /mapa CON sesión de chofer y misión real:
// la emergencia «Incendio en mercado» despachada a B-1 ya existe en la BD.
// login (fetch) → /mapa → captura a 8 y 18 s + estado del registro SW.
import { chromium } from "playwright-core";

const pwa = "http://localhost:3100";
const perfil = "C:/Users/Usuario/AppData/Local/Temp/opencode/pwprofile";

const browser = await chromium.launchPersistentContext(perfil, { channel: "chrome", headless: false });
const page = browser.pages()[0] ?? (await browser.newPage());
page.on("console", (m) => {
  if (m.type() === "error") console.log("  [err]", m.text().slice(0, 160));
});
page.on("requestfailed", (r) => {
  console.log("  [req-fail]", r.failure()?.errorText ?? "", r.url().slice(0, 120));
});

await page.goto(`${pwa}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
const login = await page.evaluate(async () => {
  const r = await fetch("/api/units/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "conductor@fuegomap.pe", password: "bombero123", unitCode: "B-1" }),
  });
  return r.status;
});
console.log("login B-1:", login);
await page.goto(`${pwa}/mapa`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(8000);
await page.screenshot({ path: "D:/35/unidades/screenshots/diag-map-8s.png" });
await page.waitForTimeout(10000);
await page.screenshot({ path: "D:/35/unidades/screenshots/diag-map-18s.png" });
console.log("pantalla:", (await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 220))));

await browser.close();
console.log("DIAG-HEADED2-DONE");
