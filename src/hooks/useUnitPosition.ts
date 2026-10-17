// Posición de la unidad: GPS continuo con ritmo variable —
// cada 5 s en misión, cada 30 s en reposo — y envío directo o a la
// cola si no hay señal (la posición pendiente se reemplaza, no se apila).

import { useEffect, useRef } from "react";

interface Options {
  enabled: boolean;
  /** Hay misión activa → ritmo rápido (5 s); reposo → 30 s */
  inMission: boolean;
  onPosition: (lat: number, lng: number, accuracy: number) => void;
}

let lastPosition: { lat: number; lng: number; accuracy: number } | null = null;

/** Posición fresca conocida (para "usar mi ubicación" en hidrantes nuevos) */
export function readLastPosition(): { lat: number; lng: number; accuracy: number } | null {
  return lastPosition;
}

export function useUnitPosition({ enabled, inMission, onPosition }: Options) {
  const lastSent = useRef(0);
  const current = useRef<{ lat: number; lng: number; accuracy: number } | null>(null);
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
          accuracy: pos.coords.accuracy ?? 0,
        };
        lastPosition = current.current;
        const interval = inMissionRef.current ? 5_000 : 30_000;
        if (Date.now() - lastSent.current >= interval) {
          lastSent.current = Date.now();
          cb.current(current.current.lat, current.current.lng, current.current.accuracy);
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
    if (!enabled || !current.current) return;
    lastSent.current = Date.now();
    const { lat, lng, accuracy } = current.current;
    cb.current(lat, lng, accuracy);
  }, [enabled, inMission]);
}
