// SSE con reconexión automática del propio EventSource. La URL depende
// del modo: /api/app/events (público, bomberos sin sesión) o
// /api/units/me/events (sesión de chofer, filtrada a su unidad). El
// "connected" alimenta el indicador de conexión; si cae, el AppContext
// activa la consulta periódica de respaldo.

import { useEffect, useRef, useState } from "react";
import type { UnitLiveEvent } from "../lib/types";

export function useSSE(onEvent: (ev: UnitLiveEvent) => void, enabled: boolean, url: string) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    const source = new EventSource(url);

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false); // EventSource reintenta solo
    source.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data) as UnitLiveEvent;
        handlerRef.current(ev);
      } catch {
        /* mensaje corrupto: ignorar */
      }
    };

    return () => {
      source.close();
      setConnected(false);
    };
  }, [enabled, url]);

  return { connected };
}
