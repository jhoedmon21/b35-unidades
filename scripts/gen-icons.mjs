// Generador de iconos PWA (PNG RGBA puro con node:zlib — sin dependencias).
// Dibuja la llama FuegoMap sobre azul oscuro. El maskable respeta la zona
// segura (80 %) porque Android recorta círculo/rombo.
// Uso:  node scripts/gen-icons.mjs

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- PNG mínimo ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function pngEncode(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtro None
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- Dibujo de la llama ----------

const BG = [0x0b, 0x12, 0x20];
const FLAME = [0xff, 0x5a, 0x36];
const CORE = [0xff, 0xc5, 0x3d];

function blend(data, size, x, y, [r, g, b], alpha) {
  if (alpha <= 0) return;
  const i = ((y | 0) * size + (x | 0)) * 4;
  const a = Math.min(1, alpha);
  data[i] = Math.round(data[i] * (1 - a) + r * a);
  data[i + 1] = Math.round(data[i + 1] * (1 - a) + g * a);
  data[i + 2] = Math.round(data[i + 2] * (1 - a) + b * a);
  data[i + 3] = Math.min(255, data[i + 3] + Math.round(a * 255));
}

/** Llama FuegoMap: cuerpo que se estrecha hacia la punta + base circular */
function flameInside(x, y, cx, tipY, baseY, maxHalf) {
  if (y < tipY || y > baseY + maxHalf) return false;
  if (y <= baseY) {
    const t = (y - tipY) / (baseY - tipY);
    const half = maxHalf * Math.pow(Math.min(1, t / 0.45), 0.65) * (1 - 0.12 * t);
    return Math.abs(x - cx) <= half;
  }
  const rBottom = maxHalf * 0.88;
  const dx = x - cx;
  const dy = y - baseY;
  return dx * dx + dy * dy <= rBottom * rBottom;
}

function makeIcon(size, { maskable = false } = {}) {
  const data = Buffer.alloc(size * size * 4);
  const contentScale = maskable ? 0.72 : 1; // zona segura del maskable
  const ss = 4; // submuestras por eje (antialiasing)

  // Fondo azul oscuro (esquinas redondeadas salvo maskable)
  const radius = maskable ? size : size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inside;
      if (maskable) {
        inside = true;
      } else {
        const rr = radius * 0.5;
        const dx = Math.max(Math.abs(x - (size - 1) / 2) - (size / 2 - rr), 0);
        const dy = Math.max(Math.abs(y - (size - 1) / 2) - (size / 2 - rr), 0);
        inside = dx * dx + dy * dy <= rr * rr;
      }
      if (inside) blend(data, size, x, y, BG, 1);
    }
  }

  // Llama (con núcleo claro) — tamaño relativo al área segura
  const cx = size / 2;
  const bodyH = size * 0.42 * contentScale;
  const tipY = size * 0.5 - bodyH * 0.62;
  const baseY = size * 0.5 + bodyH * 0.30;
  const maxHalf = size * 0.155 * contentScale;

  const coreTip = baseY - bodyH * 0.34;
  const coreMax = maxHalf * 0.42;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let outer = 0;
      let core = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss;
          const py = y + (sy + 0.5) / ss;
          if (flameInside(px, py, cx, tipY, baseY, maxHalf)) outer++;
          if (flameInside(px, py, cx, coreTip, baseY, coreMax)) core++;
        }
      }
      if (outer > 0) blend(data, size, x, y, FLAME, outer / (ss * ss));
      if (core > 0) blend(data, size, x, y, CORE, core / (ss * ss));
    }
  }
  return pngEncode(size, data);
}

// ---------- Generar todos ----------

mkdirSync(join(root, "public", "icons"), { recursive: true });
for (const size of [64, 192, 512]) {
  writeFileSync(join(root, "public", "icons", `pwa-${size}.png`), makeIcon(size));
  console.log(`✓ public/icons/pwa-${size}.png`);
}
writeFileSync(join(root, "public", "icons", "maskable-512.png"), makeIcon(512, { maskable: true }));
console.log("✓ public/icons/maskable-512.png");
console.log("Iconos generados.");
