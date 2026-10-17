// Mini-mapa ligero (MapLibre + OpenFreeMap positron, el mismo estilo que
// toda la app): marcador de la emergencia + hidrantes cercanos. Se usa en
// el modal de alerta y en la vista básica del mapa — sin lógica de ruta.

import { useEffect, useRef, useState } from "react";
import { LngLatBounds, Map as MlMap, Marker as MlMarker, getWorkerUrl, setWorkerUrl } from "maplibre-gl";
import { MAP_STYLE, type TacMarker } from "./TacticalMap";
import { sceneHtml } from "../lib/markers";

interface Props {
  center: { lat: number; lng: number };
  /** Otros marcadores (hidrantes cercanos, etc.) */
  markers?: TacMarker[];
  /** Zoom fijo si no hay más puntos para encuadrar */
  zoom?: number;
  /** El mapa expuesto para «centrar en la emergencia» */
  onReady?: (map: MlMap) => void;
}

export default function SceneMap({ center, markers = [], zoom = 15, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<MlMarker[]>([]);
  const [ready, setReady] = useState(false);

  // Init del mapa (una sola vez)
  useEffect(() => {
    if (!containerRef.current) return;
    if (typeof window !== "undefined" && !getWorkerUrl()) {
      setWorkerUrl("/maplibre-gl-worker.mjs");
    }
    const map = new MlMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [center.lng, center.lat],
      zoom,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.on("load", () => {
      setReady(true);
      onReady?.(map);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marcadores: escena (fuego) + los que llegan (hidrantes cercanos…)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    const add = (html: string, lat: number, lng: number, onClick?: () => void) => {
      const el = document.createElement("div");
      el.innerHTML = html;
      const marker = new MlMarker({ element: el });
      marker.setLngLat([lng, lat]).addTo(map);
      if (onClick) el.addEventListener("click", onClick);
      markersRef.current.push(marker);
    };

    add(sceneHtml(), center.lat, center.lng);
    for (const m of markers) add(m.html, m.lat, m.lng, m.onClick);

    // Encuadre: emergencia + hidrantes
    const pts: [number, number][] = [
      [center.lng, center.lat],
      ...markers.map((m) => [m.lng, m.lat] as [number, number]),
    ];
    if (pts.length > 1) {
      const b = new LngLatBounds(pts[0], pts[0]);
      for (const p of pts) b.extend(p);
      map.fitBounds(b, { padding: 56, maxZoom: 16.5, duration: 700 });
    }
  }, [ready, markers, center.lat, center.lng]);

  return <div ref={containerRef} className="h-full w-full" />;
}
