// diag-admin-ui.mjs — verificación visual de la central:
//  (1) diálogo Nuevo reporte con la sección «Despachar ahora»
//  (2) detalle del incidente de prueba con las unidades asignadas (chips)
import { chromium } from "playwright-core";

const central = "http://localhost:3000";
const perfil = "C:/Users/Usuario/AppData/Local/Temp/opencode/pwprofile";

const browser = await chromium.launch({ channel: "chrome", headless: false });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

await page.goto(central, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);

// (1) abrir Nuevo reporte
await page.getByRole("button", { name: "Registrar un reporte manual" }).first().click({ timeout: 15000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: "D:/35/unidades/screenshots/ui-nuevo-despacho.png" });
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

// (2) abrir el incidente de prueba cerrado (detalle con asignadas)
await page.getByRole("button", { name: /historial/i }).first().click();
const row = page.getByText("PRUEBA MULTIDESPACHO").first();
await row.click({ timeout: 9000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: "D:/35/unidades/screenshots/ui-detalle-unidades.png" });

await browser.close();
console.log("DIAG-ADMIN-UI-DONE");

