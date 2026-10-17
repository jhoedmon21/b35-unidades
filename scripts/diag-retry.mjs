// diag-retry.mjs — ¿TacticalMap RECREADO post-carga sí pinta? Si sí →
// la causa es crear el mapa sincronamente en el mount inicial.
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
await page.screenshot({ path: "D:/35/unidades/screenshots/retry-1-original.png" });

await page.evaluate(() => window.__fmRetry());
await page.waitForTimeout(10000);
await page.screenshot({ path: "D:/35/unidades/screenshots/retry-2-recreado.png" });

await browser.close();
console.log("DIAG-RETRY-DONE");
