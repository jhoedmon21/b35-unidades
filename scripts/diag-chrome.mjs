// diag-chrome.mjs — diagnostico en Chrome REAL via CDP:
// consola + errores de pagina + peticiones fallidas + texto en pantalla.
// Uso: node scripts/diag-chrome.mjs [headless=true]
import { chromium } from "playwright-core";

const headless = (process.argv[2] ?? "true") !== "false";
const browser = await chromium.launchPersistentContext(
  "C:/Users/Usuario/AppData/Local/Temp/opencode/pwprofile",
  {
    channel: "chrome",
    headless,
  },
);
const page = browser.pages()[0] ?? (await browser.newPage());

page.on("console", (m) => console.log(`[console.${m.type()}]`, m.text().slice(0, 220)));
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("requestfailed", (r) =>
  console.log("[requestfailed]", r.url().slice(-60), r.failure()?.errorText),
);
page.on("response", (r) => {
  if (r.url().includes("/api/")) console.log("[response]", r.status(), r.url().split("3100")[1]);
});

void page.goto("http://localhost:3100/inicio", { waitUntil: "domcontentloaded" });

for (const [t, waits] of [[2, 2000], [6, 4000], [18, 12000]]) {
  await new Promise((r) => setTimeout(r, waits));
  const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 400));
  console.log(`>>> t=${t}s pantalla:`, text);
}

await browser.close();
console.log("DLG-DONE");
