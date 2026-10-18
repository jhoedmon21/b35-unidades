// Formato en español, números grandes para distancia y tiempo.

export function fmtDistance(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Nombre visible del hidrante: el código «H-01» se lee «Hidrante 01»
 * (mismo criterio que la central). Otros formatos quedan tal cual;
 * sin código devuelve null para que el llamador use su alternativa.
 */
export function hydrantLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const m = /^H[-\s]?(\S+)$/i.exec(code.trim());
  return m ? `Hidrante ${m[1]}` : code;
}

export function fmtMinutes(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const min = Math.round(seconds / 60);
  if (min < 1) return "< 1 min";
  return `${min} min`;
}

export function timeAgo(iso: string, nowMs = Date.now()): string {
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

export function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

/** Día local YYYY-MM-DD para el checklist */
export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
