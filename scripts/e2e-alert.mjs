// e2e-alert.mjs — verifica: en /inicio la alerta vive INLINE (tarjeta con
// mapa) y SIN modal a pantalla completa encima (frase exclusiva del modal).
import { chromium } from "playwright-core";

const browser = await chromium.launchPersistentContext(
  "C:/Users/Usuario/AppData/Local/Temp/opencode/pwprofile",
  { channel: "chrome", headless: true },
);
const page = browser.pages()[0] ?? (await browser.newPage());
await page.goto("http://localhost:3100/", { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 3000));

await page.getByRole("button", { name: /Bombero/ }).first().click();
await page.getByRole("button", { name: /VER EMERGENCIAS/ }).first().click();
await new Promise((r) => setTimeout(r, 4000));

const modalAbierto = await page.evaluate(() =>
  document.body.innerText.includes("toca una acción"),
);
const tarjetaInline = await page.evaluate(() =>
  document.body.innerText.includes("EMERGENCIA NUEVA") ||
  document.body.innerText.includes("EMERGENCIA ACTIVA"),
);
const choferVisible = await page.evaluate(() =>
  [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Chofer")),
);
const texto = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 220));
console.log("modal a pantalla completa:", modalAbierto ? "SÍ ✗" : "NO ✓ (no tapa nada)");
console.log("tarjeta de alerta inline en Inicio:", tarjetaInline ? "SÍ ✓" : "NO (sin alertas ahora)");
console.log("botón Chofer visible:", choferVisible ? "✓" : "✗");
console.log("pantalla:", texto);
await page.screenshot({ path: "D:/35/unidades/screenshots/3-alerta-inline-inicio.png" });
await browser.close();
console.log("E2E-DONE");
