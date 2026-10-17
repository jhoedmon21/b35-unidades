// diag-ancestors.mjs — estilos computados de TODA la cadena de ancestros
// del canvas de TacticalMap: transform, filter, contain, will-change, zoom,
// blend, opacity, content-visibility, clip… cazar el que suprime el canvas.
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

const chain = await page.evaluate(() => {
  const props = [
    "transform", "filter", "backdropFilter", "contain", "willChange",
    "zoom", "mixBlendMode", "isolation", "opacity", "position",
    "overflow", "clipPath", "maskImage", "contentVisibility", "scale",
    "rotate", "translate", "perspective", "containerType", "display",
  ];
  const out = [];
  let el = document.querySelector(".maplibregl-canvas");
  let level = 0;
  while (el && el !== document.documentElement && level < 14) {
    const s = getComputedStyle(el);
    const row = { lvl: level++, tag: el.tagName, cls: String(el.className ?? "").slice(0, 90) };
    for (const p of props) {
      const v = s[p];
      if (v && v !== "none" && v !== "normal" && v !== "visible" && v !== "auto" && v !== "1" && v !== "block" && v !== "static" && v !== "0px" && v !== "normal none") {
        row[p] = v;
      }
    }
    if (s.overflow !== "visible") row.overflow = s.overflow;
    if (s.overflowX !== "visible") row.overflowX = s.overflowX;
    out.push(row);
    el = el.parentElement;
  }
  return out;
});
console.log(JSON.stringify(chain, null, 1));

await browser.close();
console.log("DIAG-ANCESTORS-DONE");
