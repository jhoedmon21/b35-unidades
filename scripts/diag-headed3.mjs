// diag-headed3.mjs — TacticalMap vs SceneMap con GPU real:
// 1) /hidrantes (TacticalMap)   → captura + red
// 2) /mapa con misión (TacticalMap con ruta) → captura
// 3) cuerpo de cada respuesta del estilo/teselas/worker (status + bytes)
import { chromium } from "playwright-core";

const pwa = "http://localhost:3100";
const perfil = "C:/Users/Usuario/AppData/Local/Temp/opencode/pwprofile";

const browser = await chromium.launchPersistentContext(perfil, { channel: "chrome", headless: false });
const page = browser.pages()[0] ?? (await browser.newPage());
page.on("console", (m) => {
  if (m.type() === "error" || m.text().includes("worker")) console.log("  [console]", m.type(), m.text().slice(0, 200));
});
page.on("response", async (r) => {
  const u = r.url();
  if (u.includes("openfreemap") || u.includes("worker")) {
    if (!u.startsWith(pwa) || u.includes("worker")) {
      const len = await r.text().then((t) => t.length).catch(() => -1);
      console.log(`  [net] ${r.status()} len=${len} ${u.slice(0, 110)}`);
    }
  }
});

await page.goto(`${pwa}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await page.evaluate(async () => {
  await fetch("/api/units/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "conductor@fuegomap.pe", password: "bombero123", unitCode: "B-1" }),
  });
});

console.log("=== /hidrantes (TacticalMap) ===");
await page.goto(`${pwa}/hidrantes`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(12000);
await page.screenshot({ path: "D:/35/unidades/screenshots/diag-h2-hidrantes.png" });

console.log("=== /mapa con misión (TacticalMap+ruta) ===");
await page.goto(`${pwa}/mapa?incident=54`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(12000);
await page.screenshot({ path: "D:/35/unidades/screenshots/diag-h2-mapa.png" });
console.log("panel error:", (await page.evaluate(() => document.body.innerText.includes("Aviso del mapa")) ? "SÍ" : "no"));

await browser.close();
console.log("DIAG-HEADED3-DONE");
