// Mini-mapa ligero (MapLibre + OpenFreeMap positron, el mismo estilo que
// toda la app): marcador de la emergencia + hidrantes cercanos. Se usa en
// el modal de alerta y en la vista básica del mapa — sin lógica de ruta.

import { useEffect, useRef, useState } from "react";
import { LngLatBounds, Map as MlMap, Marker as MlMarker, getWorkerUrl, setWorkerUrl } from "maplibre-gl";
import { MAP_STYLE, type TacMarker } from "./TacticalMap";
import { sceneHtml } from "../lib/markers";

interface Props {
  center: { lat: number; lng: number };
  /** Título de la emergencia: elige el icono del pin de escena */
  title?: string;
  /** Otros marcadores (hidrantes cercanos, etc.) */
  markers?: TacMarker[];
  /** Zoom fijo si no hay más puntos para encuadrar */
  zoom?: number;
  /** El mapa expuesto para «centrar en la emergencia» */
  onReady?: (map: MlMap) => void;
}

export default function SceneMap({ center, title, markers = [], zoom = 15, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<Map<string, MlMarker> | null>(null);
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
      attributionControl: false,
    });
    mapRef.current = map;
    markersRef.current = null;
    map.on("load", () => {
      setReady(true);
      onReady?.(map);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marcadores: escena (icono por tipo) + los que llegan. Se REUSAN por id —
  // solo se mueven o cambian de contenido; no se recrea el DOM en cada fix
  // de GPS (sin parpadeo en la tablet).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const store = markersRef.current ?? (markersRef.current = new Map());

    // Escena (pin central): crear si falta; si ya está, actualizar icono/posición
    const sceneMarker = store.get("__scene");
    const sceneHtmlStr = sceneHtml(true, title);
    if (!sceneMarker) {
      const el = document.createElement("div");
      el.innerHTML = sceneHtmlStr;
      el.dataset.mkhtml = sceneHtmlStr;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", title ?? "Emergencia");
      const marker = new MlMarker({ element: el }).setLngLat([center.lng, center.lat]).addTo(map);
      store.set("__scene", marker);
    } else {
      const el = sceneMarker.getElement();
      if (el.dataset.mkhtml !== sceneHtmlStr) {
        el.innerHTML = sceneHtmlStr;
        el.dataset.mkhtml = sceneHtmlStr;
        el.setAttribute("aria-label", title ?? "Emergencia");
      }
      const cur = sceneMarker.getLngLat();
      if (cur.lat !== center.lat || cur.lng !== center.lng) sceneMarker.setLngLat([center.lng, center.lat]);
    }

    // Bajas
    const nextIds = new Set(markers.map((m) => m.id));
    for (const [id, marker] of [...store]) {
      if (id !== "__scene" && !nextIds.has(id)) {
        marker.remove();
        store.delete(id);
      }
    }

    // Altas y actualizaciones
    for (const m of markers) {
      const existing = store.get(m.id);
      if (existing) {
        const el = existing.getElement();
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

    // Encuadre: emergencia + hidrantes (solo cuando cambia el conjunto)
    const pts: [number, number][] = [
      [center.lng, center.lat],
      ...markers.map((m) => [m.lng, m.lat] as [number, number]),
    ];
    if (pts.length > 1) {
      const b = new LngLatBounds(pts[0], pts[0]);
      for (const p of pts) b.extend(p);
      map.fitBounds(b, { padding: 56, maxZoom: 16.5, duration: 700 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, markers, center.lat, center.lng]);

  return <div ref={containerRef} className="h-full w-full" />;
}
