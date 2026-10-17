// shots.mjs — captura la vista de bomberos real (guest) para el usuario
import { chromium } from "playwright-core";

const browser = await chromium.launchPersistentContext(
  "C:/Users/Usuario/AppData/Local/Temp/opencode/pwprofile",
  { channel: "chrome", headless: true },
);
const page = browser.pages()[0] ?? (await browser.newPage());
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await page.goto("http://localhost:3100/inicio", { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 5000));
await page.screenshot({ path: "D:/35/unidades/screenshots/vista-bomberos.png", fullPage: false });
const btn = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Chofer"));
  return b ? `botón «${b.textContent.trim()}» visible ✓` : "SIN BOTÓN ✗";
});
console.log("estado del botón:", btn);
await browser.close();
console.log("SHOT-DONE");
