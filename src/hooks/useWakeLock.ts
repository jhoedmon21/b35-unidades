// Wake Lock: mantiene la pantalla encendida durante el servicio.
// El permiso se pierde al bloquear manualmente o al bajar de primer
// plano; se readquiere al volver. Expone estado para avisar al usuario.

import { useCallback, useEffect, useRef, useState } from "react";

type Sentinel = { release: () => Promise<void>; addEventListener?: (t: string, f: () => void) => void };

export function useWakeLock(active: boolean) {
  const [held, setHeld] = useState(false);
  const [supported, setSupported] = useState(true);
  const sentinel = useRef<Sentinel | null>(null);

  const acquire = useCallback(async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<Sentinel> } };
      if (!nav.wakeLock) {
        setSupported(false);
        return;
      }
      const s = await nav.wakeLock.request("screen");
      sentinel.current = s;
      setHeld(true);
      s.addEventListener?.("release", () => setHeld(false));
    } catch {
      setHeld(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void acquire();
    const onVisible = () => {
      if (document.visibilityState === "visible" && !sentinel.current) void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel.current?.release().catch(() => {});
      sentinel.current = null;
      setHeld(false);
    };
  }, [active, acquire]);

  return { held, supported, reacquire: acquire };
}
