// Posición de la unidad: GPS continuo con ritmo variable —
// cada 5 s en misión, cada 30 s en reposo — y envío directo o a la
// cola si no hay señal (la posición pendiente se reemplaza, no se apila).
// Además de lat/lng/precisión entrega la VELOCIDAD REAL del GPS
// (coords.speed en m/s, doppler del receptor; null si el aparato no la da).

import { useEffect, useRef } from "react";

interface Options {
  enabled: boolean;
  /** Hay misión activa → ritmo rápido (5 s); reposo → 30 s */
  inMission: boolean;
  onPosition: (lat: number, lng: number, accuracy: number, speed: number | null) => void;
}

export interface UnitPos {
  lat: number;
  lng: number;
  /** Error horizontal estimado en metros */
  accuracy: number;
  /** Velocidad doppler del GPS en m/s (null = el receptor no la entrega) */
  speed: number | null;
}

let lastPosition: UnitPos | null = null;

/** Posición fresca conocida (para "usar mi ubicación" en hidrantes nuevos) */
export function readLastPosition(): UnitPos | null {
  return lastPosition;
}

function mpsOrNull(raw: number | null | undefined): number | null {
  // coords.speed puede ser null aun moviéndose: aquí no se INVENTA nada
  if (raw == null || !Number.isFinite(raw) || raw < 0) return null;
  return raw;
}

export function useUnitPosition({ enabled, inMission, onPosition }: Options) {
  const lastSent = useRef(0);
  const current = useRef<UnitPos | null>(null);
  const inMissionRef = useRef(inMission);
  inMissionRef.current = inMission;
  const cb = useRef(onPosition);
  cb.current = onPosition;

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        current.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed: mpsOrNull(pos.coords.speed),
          accuracy: pos.coords.accuracy ?? 0,
        };
        lastPosition = current.current;
        const interval = inMissionRef.current ? 5_000 : 30_000;
        if (Date.now() - lastSent.current >= interval) {
          const cur = current.current;
          lastSent.current = Date.now();
          cb.current(cur.lat, cur.lng, cur.accuracy, cur.speed);
        }
      },
      () => {
        /* sin permiso o sin GPS: la app sigue funcionando sin ubicación */
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  // Cambio de ritmo (misión ↔ reposo): enviar la posición fresca de inmediato
  useEffect(() => {
    const cur = current.current;
    if (!enabled || !cur) return;
    lastSent.current = Date.now();
    cb.current(cur.lat, cur.lng, cur.accuracy, cur.speed);
  }, [enabled, inMission]);
}
