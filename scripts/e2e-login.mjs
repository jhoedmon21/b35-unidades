// e2e-login.mjs — recorre el flujo NUEVO en Chrome real:
// 1) arranque → pantalla de INGRESO con toggle Chofer/Bombero
// 2) clic en «🧑‍🚒 Bombero» → «VER EMERGENCIAS»
// 3) vista pública de bomberos con botón «🚒 Chofer»
import { chromium } from "playwright-core";

const browser = await chromium.launchPersistentContext(
  "C:/Users/Usuario/AppData/Local/Temp/opencode/pwprofile",
  { channel: "chrome", headless: true },
);
const page = browser.pages()[0] ?? (await browser.newPage());
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));

await page.goto("http://localhost:3100/", { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 3500));

const t1 = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 200));
console.log("ARRANQUE:", t1);
await page.screenshot({ path: "D:/35/unidades/screenshots/1-ingreso.png" });

const btnBombero = page.getByRole("button", { name: /Bombero/ }).first();
await btnBombero.click();
const submit = page.getByRole("button", { name: /VER EMERGENCIAS/ }).first();
await submit.click();
await new Promise((r) => setTimeout(r, 4000));

const t2 = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 250));
console.log("VISTA BOMBERO:", t2);
const chofer = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Chofer"));
  return b ? `«🚒 Chofer» VISIBLE ✓` : "SIN BOTÓN Chofer ✗";
});
console.log("BOTÓN CHOFER EN CABECERA:", chofer);
await page.screenshot({ path: "D:/35/unidades/screenshots/2-vista-bombero.png" });

await browser.close();
console.log("E2E-DONE");
