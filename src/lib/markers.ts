// Marcadores tácticos del mapa (HTML para los Marker de MapLibre).
// Formas por función — nunca depender solo del color:
//   escena    = círculo rojo pulsante con llama
//   unidad    = placa blanca con el código
//   hidrante  = círculo celeste numerado (operativo) · cuadrado ámbar
//               (dañado) · rombo rojo (sin agua)

import type { HydrantSituation } from "./types";

export function sceneHtml(pulsing = true): string {
  return `<div class="fm-mk fm-mk-scene"><span aria-hidden="true">🔥</span>${
    pulsing ? '<span class="ring"></span>' : ""
  }</div>`;
}

export function unitHtml(code: string): string {
  return `<div class="fm-mk fm-mk-unit">${code}</div>`;
}

/** Salida del vehículo (cuartel) — inicio del trayecto */
export function departHtml(): string {
  return `<div class="fm-mk fm-mk-depart"><span aria-hidden="true">🚩</span></div>`;
}

export function hydrantHtml(situation: HydrantSituation, label?: string): string {
  const inner = label ? `<span>${label}</span>` : "<span>&nbsp;</span>";
  return `<div class="fm-mk fm-mk-hyd ${situation}">${inner}</div>`;
}

/** Etiqueta accesible completa del hidrante */
export function hydrantName(code: string | null, id: number, situation: HydrantSituation): string {
  return `Hidrante ${code ?? `#${id}`} — ${situation}`;
}
