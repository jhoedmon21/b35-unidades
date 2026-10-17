// diag-revive.mjs — confirmar el mecanismo: la capa compuesta del canvas
// quedó suprimida tras desmontar el overlay opaco. Técnicas de revival:
//  R1 display none→block   R2 re-attack del canvas   R3Scheduled repaint
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
await page.waitForTimeout(12000);
await page.screenshot({ path: "D:/35/unidades/screenshots/revive-baseline.png" });

// R1: display none -> block
await page.evaluate(() => {
  const c = document.querySelector(".maplibregl-canvas");
  c.style.display = "none";
});
await page.waitForTimeout(100);
await page.evaluate(() => {
  const c = document.querySelector(".maplibregl-canvas");
  c.style.display = "";
});
await page.waitForTimeout(600);
await page.screenshot({ path: "D:/35/unidades/screenshots/revive-R1-display.png" });

// R2: re-attach (sacar y meter el canvas)
await page.evaluate(() => {
  const c = document.querySelector(".maplibregl-canvas");
  const p = c.parentElement;
  const next = c.nextSibling;
  p.removeChild(c);
  window.requestAnimationFrame(() => p.insertBefore(c, next));
});
await page.waitForTimeout(900);
await page.screenshot({ path: "D:/35/unidades/screenshots/revive-R2-reattach.png" });

await browser.close();
console.log("DIAG-REVIVE-DONE");
