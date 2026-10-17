// Metadatos de dominio para la tablet (labels cortos + colores del tema)

import type { HydrantSituation, UnitStatus } from "./types";

export const UNIT_STATUS: Record<UnitStatus, { label: string; short: string; varName: string }> = {
  disponible: { label: "Libre", short: "Libre", varName: "--ok" },
  en_ruta: { label: "En camino", short: "Camino", varName: "--crash" },
  en_escena: { label: "En el lugar", short: "Lugar", varName: "--fire" },
  regresando: { label: "Regresando", short: "Regresa", varName: "--hydrant" },
  fuera_servicio: { label: "Fuera de servicio", short: "Fuera", varName: "--mut" },
};

/** La PWA habla en 3 estados de hidrante; el servidor usa sus valores propios */
export const HYDRANT_LABEL: Record<HydrantSituation, { label: string; varName: string }> = {
  operativo: { label: "Operativo", varName: "--ok" },
  mantenimiento: { label: "Dañado", varName: "--crash" },
  fuera_servicio: { label: "Sin agua", varName: "--danger" },
};

export const SEVERITY_LABEL: Record<string, { label: string; varName: string }> = {
  critica: { label: "Crítica", varName: "--fire" },
  alta: { label: "Alta", varName: "--crash" },
  media: { label: "Media", varName: "--hydrant" },
  baja: { label: "Baja", varName: "--mut" },
};

/** Estado del incidente en palabras cortas para la vista básica */
export const INCIDENT_STATUS_LABEL: Record<string, string> = {
  reportado: "Reportado",
  despachado: "Despachada",
  en_escena: "En el lugar",
  controlado: "Controlado",
  cerrado: "Cerrado",
};

/** Tipo de emergencia por icono + color (no depender solo del color) */
export function incidentKind(title: string): { icon: string; label: string; varName: string } {
  const t = title.toLowerCase();
  if (/incendio|fuego|humo|quema/.test(t)) return { icon: "🔥", label: "Incendio", varName: "--fire" };
  if (/rescate|choque|colisi|accidente|vehícul|vehicul/.test(t)) return { icon: "🛠️", label: "Rescate", varName: "--rescue" };
  if (/gas/.test(t)) return { icon: "⚠️", label: "Fuga de gas", varName: "--crash" };
  if (/médic|medic|herid|salud|desmay/.test(t)) return { icon: "🚑", label: "Emergencia médica", varName: "--rescue" };
  return { icon: "🚨", label: "Emergencia", varName: "--crash" };
}
