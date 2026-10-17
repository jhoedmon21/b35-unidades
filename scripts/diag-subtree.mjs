// diag-subtree.mjs — dump COMPLETO del subárbol de TacticalMap:
// cada nodo con rect/opacity/visibility/z/bg + testo si es visible.
// Y dos pruebas de frontera: (P1) caja rosa dentro del subárbol vs
// (P2) caja rosa en body. (P3) el canvas re-colocado en body.
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

const dump = await page.evaluate(() => {
  const root = window.__fmMap ? window.__fmMap.getContainer().parentElement : null;
  if (!root) return "sin root";
  const rows = [];
  const walk = (el, depth) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    let txt = "";
    if (el.children.length === 0) txt = (el.textContent ?? "").trim().slice(0, 40);
    rows.push({
      d: depth,
      tag: el.tagName,
      cls: String(el.className ?? "").slice(0, 70),
      rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
      bg: s.backgroundColor,
      op: s.opacity, vis: s.visibility, z: s.zIndex, pos: s.position,
      txt,
    });
    if (depth < 6) for (const c of el.children) walk(c, depth + 1);
  };
  walk(root, 0);
  return rows;
});
console.log(JSON.stringify(dump, null, 1));

// P1: caja rosa INSIDE subtree   P2: caja rosa en body
const pr = await page.evaluate(() => {
  const rose = (css) => {
    const d = document.createElement("div");
    d.style.cssText = css;
    return d;
  };
  const inSub = rose("position:absolute;inset:40px 40px 40px 40px;background:#ff69b4;z-index:5;");
  const cont = document.querySelector(".maplibregl-map");
  cont.appendChild(inSub);
  window.__pinkSub = inSub;
  const inBody = rose("position:fixed;top:5px;left:900px;width:300px;height:120px;background:#ff69b4;z-index:5;");
  document.body.appendChild(inBody);
  return "rose colocadas";
});
console.log(pr);
await page.waitForTimeout(600);
await page.screenshot({ path: "D:/35/unidades/screenshots/subtree-pink.png" });

await browser.close();
console.log("DIAG-SUBTREE-DONE");
