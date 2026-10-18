// Marcadores tácticos del mapa (HTML para los Marker de MapLibre).
// Formas por función — nunca depender solo del color:
//   escena    = círculo rojo pulsante con el ICONO del tipo de emergencia
//   unidad    = placa blanca con icono por tipo de vehículo + código,
//               borde e icono coloreados por estado
//   salida    = bandera del punto de partida
//   hidrante  = círculo celeste con número (operativo) · cuadrado ámbar
//               (en mantenimiento) · rombo rojo (sin agua); sin código
//               muestra una gota de agua

import type { HydrantSituation, UnitStatus, UnitType } from "./types";
import { dropSvg, flagSvg, incidentSvg, unitTypeSvg } from "./icons";
import { hydrantLabel } from "./format";

/** Color del borde/icono de la placa de unidad según su estado */
const UNIT_STATUS_COLOR: Record<UnitStatus, string> = {
  disponible: "var(--ok)",
  en_ruta: "var(--crash)",
  en_escena: "var(--hydrant)",
  regresando: "var(--crash)",
  fuera_servicio: "var(--mut)",
};

export function sceneHtml(pulsing = true, title?: string): string {
  return `<div class="fm-mk fm-mk-scene">${incidentSvg(title)}${
    pulsing ? '<span class="ring"></span>' : ""
  }</div>`;
}

export function unitHtml(
  code: string,
  opts?: { type?: UnitType; status?: UnitStatus },
): string {
  const color = opts?.status ? (UNIT_STATUS_COLOR[opts.status] ?? "var(--hydrant)") : "var(--hydrant)";
  const icon = unitTypeSvg(opts?.type, 12, color);
  return `<div class="fm-mk fm-mk-unit" style="border-color:${color}">${icon}<span>${code}</span></div>`;
}

/** Salida del vehículo (cuartel) — inicio del trayecto */
export function departHtml(): string {
  return `<div class="fm-mk fm-mk-depart">${flagSvg()}</div>`;
}

export function hydrantHtml(situation: HydrantSituation, label?: string): string {
  const inner = label ? `<span>${label}</span>` : dropSvg(13);
  return `<div class="fm-mk fm-mk-hyd ${situation}">${inner}</div>`;
}

/** Etiqueta accesible completa del hidrante: «Hidrante 01 — operativo» */
export function hydrantName(code: string | null, id: number, situation: HydrantSituation): string {
  return `${hydrantLabel(code) ?? `Hidrante #${id}`} — ${situation}`;
}
