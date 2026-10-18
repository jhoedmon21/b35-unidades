// Mapa táctico compartido (MapLibre GL + teselas OpenFreeMap «positron»,
// las mismas sin API key que usa FuegoMap Admin). Gestiona marcadores,
// la ruta Uber-style (recorrido en gris + restante en rojo), las zonas
// peligrosas de la vía y el encuadre.
//
// Diagnóstico visible: si el estilo no carga o MapLibre lanza un error,
// se muestra EN PANTALLA (con el mensaje exacto) en lugar de fallar en
// silencio — clave para depurar en la tablet del vehículo.

import { useEffect, useRef, useState } from "react";
import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";
import { LngLatBounds, Map as MlMap, Marker as MlMarker, getWorkerUrl, setWorkerUrl } from "maplibre-gl";

export const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

export interface TacMarker {
  id: string;
  lat: number;
  lng: number;
  /** HTML interno (clases .fm-mk del sistema de diseño) */
  html: string;
  label: string;
  onClick?: () => void;
}

export interface TacHazard {
  id: string;
  coords: [number, number][];
  color: string;
}

interface Props {
  /** Marcadores a mostrar (se difunden por id; solo se mueve/recicla lo que cambia) */
  markers: TacMarker[];
  /** Tramo RESTANTE de la ruta (rojo con casing) */
  route?: [number, number][] | null;
  /** Tramo ya recorrido (gris tenue, estilo Uber) */
  traveled?: [number, number][] | null;
  /** Ruta en línea discontinua (respaldo sin OSRM) */
  dashed?: boolean;
  /** Zonas peligrosas de la vía (curvas, derrumbes…) */
  hazards?: TacHazard[];
  /** Puntos para encuadrar todo */
  bounds: [number, number][];
  /** Cambia solo cuando se debe volver a encuadrar */
  fitKey: string;
  /** El mapa expuesto para «centrar en mi unidad» */
  onReady?: (map: MlMap) => void;
}

function toGeoJSON(coords: [number, number][]) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: coords.map(([lat, lng]) => [lng, lat]) },
  };
}

export default function TacticalMap({
  markers,
  route,
  traveled,
  dashed,
  hazards,
  bounds,
  fitKey,
  onReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<Map<string, MlMarker> | null>(null);
  const hazardIdsRef = useRef<string[]>([]);
  const [ready, setReady] = useState(false);
  // Diagnóstico visible
  const [attempt, setAttempt] = useState(0);
  const [fatal, setFatal] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [slowStyle, setSlowStyle] = useState(false);

  // Init (una sola vez por intento)
  useEffect(() => {
    if (!containerRef.current) return;
    setFatal(null);
    setMapError(null);
    setSlowStyle(false);

    let map: MlMap;
    try {
      // Worker de MapLibre servido estático desde /public: el optimizador de
      // Vite no emite los workers de dependencias (mismo arreglo que la central).
      if (typeof window !== "undefined" && !getWorkerUrl()) {
        setWorkerUrl("/maplibre-gl-worker.mjs");
      }
      map = new MlMap({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [-72.7106, -16.6236],
        zoom: 14,
        attributionControl: { compact: true },
      });
    } catch (e) {
      setFatal(e instanceof Error ? e.message : String(e));
      return;
    }

    mapRef.current = map;
    // Diagnóstico dev: la instancia expuesta para inspección externa
    if (import.meta.env.DEV) (window as unknown as { __fmMap?: MlMap }).__fmMap = map;
    map.on("error", (ev: unknown) => {
      const msg =
        (ev as { error?: { message?: string } })?.error?.message ??
        (ev as { message?: string })?.message ??
        "Error del mapa";
      setMapError((prev) => prev ?? msg);
    });
    map.on("load", () => {
      setReady(true);
      onReady?.(map);
    });

    // Vigilante: si el estilo no cargó en 15 s, decirlo en pantalla
    const watchdog = setTimeout(() => {
      if (!map.loaded()) setSlowStyle(true);
    }, 15_000);

    return () => {
      clearTimeout(watchdog);
      map.remove();
      mapRef.current = null;
      markersRef.current?.clear();
      hazardIdsRef.current = [];
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // Marcadores: se reusan (diff por id) y solo se mueven de lugar — no se
  // reconstruye el DOM en cada fix de GPS (evita parpadeo y jank en la tablet).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const store = markersRef.current ?? (markersRef.current = new Map());

    // Bajas: ids que ya no están en el array nuevo
    const nextIds = new Set(markers.map((m) => m.id));
    for (const [id, marker] of [...store]) {
      if (!nextIds.has(id)) {
        marker.remove();
        store.delete(id);
      }
    }

    // Altas y movimientos
    for (const m of markers) {
      const existing = store.get(m.id);
      if (existing) {
        const el = existing.getElement();
        // El contenido cambia (p. ej. aceptación de misión re-estila el pin)
        if (el.dataset.mkhtml !== m.html) {
          el.innerHTML = m.html;
          el.dataset.mkhtml = m.html;
        }
        el.setAttribute("aria-label", m.label);
        const cur = existing.getLngLat();
        if (cur.lat !== m.lat || cur.lng !== m.lng) existing.setLngLat([m.lng, m.lat]);
      } else {
        const el = document.createElement("div");
        el.innerHTML = m.html;
        el.dataset.mkhtml = m.html;
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", m.label);
        if (m.onClick) el.addEventListener("click", m.onClick);
        const marker = new MlMarker({ element: el }).setLngLat([m.lng, m.lat]).addTo(map);
        store.set(m.id, marker);
      }
    }
  }, [ready, markers]);

  const removeLine = (map: MlMap, source: string, layers: string[]) => {
    for (const layer of layers) if (map.getLayer(layer)) map.removeLayer(layer);
    if (map.getSource(source)) map.removeSource(source);
  };

  // Ruta restante (roja con casing) y tramo recorrido (gris)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    removeLine(map, "fm-traveled", ["fm-traveled-line"]);
    removeLine(map, "fm-route", ["fm-route-line", "fm-route-casing"]);

    if (traveled && traveled.length >= 2) {
      map.addSource("fm-traveled", { type: "geojson", data: toGeoJSON(traveled) });
      map.addLayer({
        id: "fm-traveled-line",
        type: "line",
        source: "fm-traveled",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#8d9db4", "line-width": 5, "line-opacity": 0.55 },
      });
    }

    if (route && route.length >= 2) {
      map.addSource("fm-route", { type: "geojson", data: toGeoJSON(route) });
      if (dashed) {
        map.addLayer({
          id: "fm-route-line",
          type: "line",
          source: "fm-route",
          paint: {
            "line-color": "#c8291a",
            "line-width": 4,
            "line-opacity": 0.95,
            "line-dasharray": [2, 1.6],
          },
        });
      } else {
        map.addLayer({
          id: "fm-route-casing",
          type: "line",
          source: "fm-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.9 },
        });
        map.addLayer({
          id: "fm-route-line",
          type: "line",
          source: "fm-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#c8291a", "line-width": 5, "line-opacity": 0.95 },
        });
      }
    }
  }, [ready, route, traveled, dashed]);

  // Zonas peligrosas de la vía: franjas discontinuas por nivel
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const id of hazardIdsRef.current) removeLine(map, `fm-hz-${id}`, [`fm-hz-${id}-line`, `fm-hz-${id}-dash`]);
    hazardIdsRef.current = [];
    if (!hazards) return;
    for (const hz of hazards) {
      if (hz.coords.length < 2) continue;
      const source = `fm-hz-${hz.id}`;
      map.addSource(source, { type: "geojson", data: toGeoJSON(hz.coords) });
      map.addLayer({
        id: `${source}-line`,
        type: "line",
        source,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": hz.color,
          "line-width": 12,
          "line-opacity": 0.35,
        },
      });
      map.addLayer({
        id: `${source}-dash`,
        type: "line",
        source,
        paint: {
          "line-color": hz.color,
          "line-width": 3,
          "line-opacity": 0.95,
          "line-dasharray": [1.2, 1.4],
        },
      });
      hazardIdsRef.current.push(hz.id);
    }
  }, [ready, hazards]);

  // Encuadre: solo cuando cambia fitKey (no en cada tick de GPS)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || bounds.length === 0) return;
    const b = new LngLatBounds();
    for (const [lat, lng] of bounds) b.extend([lng, lat]);
    map.fitBounds(b, { padding: 48, maxZoom: 17, animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey]);

  return (
    <div className="absolute inset-0">
      {/* El contenedor usa h-full w-full (como SceneMap): la regla
          `.maplibregl-map { position: relative }` de MapLibre pisa el
          `absolute` de Tailwind y con `absolute inset-0` el contenedor
          colapsa a 0 de alto (canvas recortado → «mapa que no carga»). */}
      <div ref={containerRef} className="h-full w-full" />

      {/* Cargando el estilo */}
      {!ready && !fatal && (
        <div className="absolute inset-0 grid place-items-center bg-bg2">
          <div className="text-center text-mut">
            <div className="display text-xl font-bold tracking-widest">CARGANDO MAPA…</div>
            <p className="mt-1 text-[12.5px]">{MAP_STYLE}</p>
          </div>
        </div>
      )}

      {/* Estilo que no responde */}
      {ready === false && slowStyle && !fatal && (
        <div className="absolute inset-x-3 top-3 z-10">
          <div className="float-panel spine-crash border-crash/50 p-3 text-[13px] text-tx">
            <strong className="flex items-center gap-1.5 text-crash">
              <WarningCircle size={16} aria-hidden="true" /> El mapa no cargó
            </strong>
            <p className="mt-1">
              El estilo <span className="font-mono text-[11px]">{MAP_STYLE}</span> no respondió en 15 s.
              Revisa la conexión y reintenta.
            </p>
            <button
              className="btn mt-2 min-h-11 text-[14px]"
              onClick={() => setAttempt((a) => a + 1)}
            >
              <ArrowClockwise size={16} aria-hidden="true" /> Reintentar
            </button>
          </div>
        </div>
      )}

      {/* Error fatal de MapLibre */}
      {fatal && (
        <div className="absolute inset-0 grid place-items-center bg-bg2 p-4">
          <div className="float-panel spine-danger border-danger/50 max-w-md p-4" role="alert">
            <strong className="flex items-center gap-1.5 text-danger">
              <WarningCircle size={18} aria-hidden="true" /> Error del mapa
            </strong>
            <p className="mt-2 font-mono text-[12.5px] break-words">{fatal}</p>
            <button
              className="btn mt-3 min-h-11 text-[14px]"
              onClick={() => setAttempt((a) => a + 1)}
            >
              <ArrowClockwise size={16} aria-hidden="true" /> Reintentar
            </button>
          </div>
        </div>
      )}

      {/* Primer error de ejecución del mapa (teselas, worker, estilo…) */}
      {mapError && ready && (
        <div className="float-panel spine-crash absolute top-3 left-3 z-10 max-w-72 p-2.5 text-[12px] text-tx">
          <strong className="flex items-center gap-1.5 text-crash">
            <WarningCircle size={14} aria-hidden="true" /> Aviso del mapa
          </strong>
          <p className="mt-0.5 font-mono text-[11px] break-words">{mapError}</p>
        </div>
      )}
    </div>
  );
}
