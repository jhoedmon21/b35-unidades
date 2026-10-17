// diag-sw.mjs — por qué no llegan los push (v2: registro agresivo)
// 1) contenido de /dev-sw.js (¿ESM o clásico?)
// 2) intenta registrar el SW desde la página y reporta el error exacto
// 3) espera ready hasta 15 s y muestra el estado del registration
// 4) intenta la suscripción push real y la envía al backend
import { chromium } from "playwright-core";

const pwa = "http://localhost:3100";
const perfil = "C:/Users/Usuario/AppData/Local/Temp/opencode/pwprofile";

const browser = await chromium.launchPersistentContext(perfil, { channel: "chrome", headless: true });
await browser.grantPermissions(["notifications"], { origin: pwa });
const page = browser.pages()[0] ?? (await browser.newPage());
page.on("console", (m) => console.log("  [console]", m.type(), m.text().slice(0, 200)));

await page.goto(`${pwa}/`, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 3000));

const diag = await page.evaluate(async () => {
  const out = {};
  // 1) ¿cómo se ve el dev-sw?
  const swText = await fetch("/dev-sw.js?dev-sw").then((r) => r.text());
  out.esESM = /^\s*(import|export)[\s{]/m.test(swText.slice(0, 80)) || swText.includes("\nimport ");
  out.primerasLineas = swText.split("\n").slice(0, 2).join(" § ").slice(0, 140);

  // permiso
  out.permission = Notification.permission;

  // 2) registrar (clásico y module)
  try {
    const r = await navigator.serviceWorker.register("/dev-sw.js?dev-sw", { scope: "/", type: "classic" });
    out.registro = `ok scope=${r.scope} active=${r.active?.scriptURL ?? "—"}`;
  } catch (e) {
    out.registroError = `classic: ${String(e).slice(0, 200)}`;
    try {
      const r2 = await navigator.serviceWorker.register("/dev-sw.js?dev-sw", { scope: "/", type: "module" });
      out.registroModule = `ok scope=${r2.scope}`;
    } catch (e2) {
      out.registroError += ` | module: ${String(e2).slice(0, 200)}`;
    }
  }

  // 3) ready con espera acotada
  const ready = await Promise.race([
    navigator.serviceWorker.ready.then((r) => `ready: ${r.active?.scriptURL} (${r.active?.state})`),
    new Promise((res) => setTimeout(() => res("ready TIMEOUT 15s"), 15000)),
  ]);
  out.estadoSw = ready;
  const regs = await navigator.serviceWorker.getRegistrations();
  out.registrations = regs.map((r) => ({
    scope: r.scope,
    active: r.active?.scriptURL ?? "—",
    installing: r.installing ? "SÍ" : "—",
    waiting: r.waiting ? "SÍ" : "—",
  }));

  // 4) suscripción real → POST al backend público
  try {
    if (regs.length === 0 || typeof ready === "string") throw new Error("sin SW activo");
    const reg = regs[0];
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { publicKey } = await (await fetch("/api/push/key")).json();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
      out.sub = "CREADA";
    } else out.sub = "EXISTENTE";
    const json = sub.toJSON();
    const r = await fetch("/api/push/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: (json.keys).p256dh, auth: (json.keys).auth },
      }),
    });
    out.post = `status ${r.status}`;
  } catch (e) {
    out.subError = String(e).slice(0, 250);
  }
  return out;
});
console.log(JSON.stringify(diag, null, 2));
await browser.close();
console.log("DIAG-DONE");
