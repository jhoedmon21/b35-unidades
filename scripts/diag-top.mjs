// diag-top.mjs — ¿QUÉ está encima del canvas de TacticalMap?
// elementsFromPoint en el centro del canvas + estilos computados + prueba
// "matar overlays": ocultar todos los hermanos no-canvas y recapturar.
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

await page.goto(`${pwa}/hidrantes`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(12000);

const probe = await page.evaluate(() => {
  const canvas = document.querySelector(".maplibregl-canvas");
  if (!canvas) return "sin canvas";
  const r = canvas.getBoundingClientRect();
  const cs = getComputedStyle(canvas);
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const stack = document.elementsFromPoint(cx, cy).slice(0, 8).map((el) => {
    const s = getComputedStyle(el);
    return {
      tag: el.tagName,
      cls: String(el.className ?? "").slice(0, 70),
      pos: s.position,
      z: s.zIndex,
      bg: s.backgroundColor,
      op: s.opacity,
      vis: s.visibility,
    };
  });
  return {
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: r.width, h: r.height },
    canvasStyle: {
      pos: cs.position, z: cs.zIndex, op: cs.opacity,
      vis: cs.visibility, disp: cs.display, transform: cs.transform,
    },
    stack,
  };
});
console.log(JSON.stringify(probe, null, 1));

// Si hay algo tapando, lo derogamos y recapturamos: ocultar TODO excepto
// la cadena ancestro del canvas
await page.evaluate(() => {
  const canvas = document.querySelector(".maplibregl-canvas");
  const chain = new Set();
  let el = canvas;
  while (el) { chain.add(el); el = el.parentElement; }
  for (const node of document.body.querySelectorAll("*")) {
    if (!chain.has(node)) {
      const s = getComputedStyle(node);
      if (s.position === "fixed" || s.position === "absolute") {
        node.style.setProperty("display", "none", "important");
      }
    }
  }
});
await page.waitForTimeout(1200);
await page.screenshot({ path: "D:/35/unidades/screenshots/diag-top-killed.png" });

await browser.close();
console.log("DIAG-TOP-DONE");
