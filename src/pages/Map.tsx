// Pantalla 5 — Mapa y ruta, estilo Uber:
//  · Ruta completa desde la SALIDA del vehículo (cuartel) hasta la emergencia
//  · Tramo recorrido en gris tenue; tramo restante en rojo
//  · La placa de la unidad avanza sobre la ruta con el GPS
//  · Tiempo y distancia RESTANTES recalculados al avanzar
//  · Zonas peligrosas de la vía (curvas de Quebrada del Toro, bajada de
//    Ocoña…) dibujadas en el mapa y avisadas cuando la ruta pasa por ellas
//  · Modo conducción (?nav=1): la cámara sigue a la unidad con su rumbo;
//    el botón «Navegar» de la misión entra aquí (ya no a Google Maps).

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Map as MlMap } from "maplibre-gl";
import { CalendarBlank, CaretDown, CaretRight, ChatCircle, Clock, Crosshair, NavigationArrow, Siren, X } from "@phosphor-icons/react";
import { db, getMeta, setMeta } from "../db/db";
import { api } from "../lib/api";
import { cx } from "../lib/cx";
import { fmtClock, fmtDistance, fmtMinutes, hydrantLabel, timeAgo } from "../lib/format";
import { departHtml, hydrantHtml, hydrantName, sceneHtml, unitHtml } from "../lib/markers";
import { fetchRoute, haversineM, nearestRouteIndex, type RouteInfo } from "../lib/osrm";
import TacticalMap, { type TacHazard, type TacMarker } from "../components/TacticalMap";
import SceneMap from "../components/SceneMap";
import CockpitChrome from "../components/CockpitChrome";
import { ChatSheet, CloseSheet, EquipoSheet, FichaSheet, MisionesSheet, ReportSheet, SettingsSheet } from "../components/MapOverlays";
import VoiceCallPanel from "../components/VoiceCallPanel";
import { INCIDENT_STATUS_LABEL, SEVERITY_LABEL, UNIT_STATUS, incidentKind } from "../lib/status";
import type { BasicIncidentDTO, DangerZoneDTO, HydrantDTO, MissionPayload, UnitStatus } from "../lib/types";
import { useApp } from "../state/AppContext";

const HAZARD_COLOR: Record<DangerZoneDTO["level"], string> = {
  alto: "#c01f1f",
  medio: "#8a5a06",
  bajo: "#64789a",
};

/** Velocidad REAL del vehículo (km/h) para el velocímetro del modo
 *  conducción (guiño VIPER). REGLA DE ORO: nunca se muestra un número
 *  inventado — parado es 0 SIEMPRE.
 *  · Fuente primaria: la velocidad doppler del GPS (coords.speed, m/s);
 *    se muestra en el acto cuando es clara (≥8 km/h).
 *  · La ESTIMACIÓN por distancia/tiempo solo se usa como complemento y
 *    después de que DOS arreglos consecutivos confirmen avance por
 *    encima del piso de ruido del propio GPS (accuracy): así la deriva
 *    de reposo (10–40 m) no pinta km/h fantasma cuando la unidad está
 *    detenida, ni el doppler «pegado en 0» de algún receptor. */
function useSpeedKmh(
  pos: { lat: number; lng: number; speed: number | null; accuracy?: number | null } | null,
): number {
  const [kmh, setKmh] = useState(0);
  const prev = useRef<{ lat: number; lng: number; t: number; acc: number } | null>(null);
  const streak = useRef(0);
  const lat = pos?.lat;
  const lng = pos?.lng;
  const gpsSpeed = pos?.speed ?? null;
  const acc = pos?.accuracy ?? null;
  useEffect(() => {
    if (lat == null || lng == null) return;
    const now = Date.now();
    const last = prev.current;
    prev.current = { lat, lng, t: now, acc: acc ?? 20 };
    // Piso de ruido (m): un desplazamiento menor es deriva del GPS, no viaje
    const floorM = Math.max(12, (acc ?? 20) * 0.9 + (last?.acc ?? 20) * 0.9);
    const dtMs = last ? now - last.t : 0;
    const metered =
      last != null && dtMs >= 2000
        ? haversineM({ lat: last.lat, lng: last.lng }, { lat, lng })
        : null;
    const instant = metered != null ? (metered / (dtMs / 1000)) * 3600 : null;
    streak.current = metered != null && metered > floorM ? streak.current + 1 : 0;
    const est = streak.current >= 2 && instant != null ? Math.min(instant, 160) : null;
    // 1) DOPPLER real del GPS (m/s → km/h)
    if (gpsSpeed != null && Number.isFinite(gpsSpeed) && gpsSpeed >= 0) {
      const dop = gpsSpeed * 3.6;
      if (dop >= 3) {
        setKmh(Math.round(dop)); // doppler real: mostrarlo de inmediato
      } else if (est != null) {
        setKmh((p) => Math.round(Math.max(dop, est) * 0.45 + p * 0.55));
      } else {
        setKmh(0); // parada de verdad (o avance aún sin confirmar)
      }
      return;
    }
    // 2) Sin doppler: SOLO con avance confirmado por 2 arreglos seguidos
    if (est == null) {
      setKmh(0);
      return;
    }
    setKmh((p) => Math.round(est * 0.45 + p * 0.55));
  }, [lat, lng, gpsSpeed, acc]);
  // Velocidades menores a 3 km/h se muestran como 0
  return kmh < 3 ? 0 : kmh;
}

/** Zonas cuya ruta restante pasa a menos de 350 m */
function hazardsAhead(route: RouteInfo, fromIdx: number, zones: DangerZoneDTO[]) {
  const ahead: Array<{ zone: DangerZoneDTO; metersAhead: number }> = [];
  for (const zone of zones) {
    let firstNode: number | null = null;
    for (let i = fromIdx; i < route.coords.length; i += 3) {
      for (const [zlat, zlng] of zone.path) {
        if (haversineM(route.coords[i], { lat: zlat, lng: zlng }) <= 350) {
          firstNode = i;
          break;
        }
      }
      if (firstNode != null) break;
    }
    if (firstNode != null) {
      const done = route.cumDistances[fromIdx] ?? 0;
      ahead.push({ zone, metersAhead: Math.max(0, (route.cumDistances[firstNode] ?? done) - done) });
    }
  }
  return ahead.sort((a, b) => a.metersAhead - b.metersAhead);
}

export default function MapPage() {
  const { mission, missionDetail, position, unit, alerts, alertHydrants, alertZones, user, setStatus, acceptMission, unreadChat, notify, voiceCall } = useApp();
  const [search, setSearch] = useSearchParams();
  const [cached, setCached] = useState<MissionPayload | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeFailed, setRouteFailed] = useState(false);
  const [zones, setZones] = useState<DangerZoneDTO[]>([]);
  const [map, setMap] = useState<MlMap | null>(null);
  const [sceneMap, setSceneMap] = useState<MlMap | null>(null);
  // Capas de la cabina (píldoras del topbar VIPER)
  const [showHydrants, setShowHydrants] = useState(true);
  const [showZones, setShowZones] = useState(true);
  // Paneles flotantes: el mapa es la ÚNICA ventana (chat, ajustes, reporte,
  // ficha y cierre de misión viven aquí, no en páginas separadas)
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [fichaOpen, setFichaOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [equipoOpen, setEquipoOpen] = useState(false);
  const [misionesOpen, setMisionesOpen] = useState(false);
  const [dispatchPhone, setDispatchPhone] = useState("");
  // Ficha del incidente al pie: PLEGADA en pantallas angostas — solo el
  // título con chevron; abrir un toque muestra el detalle completo.
  const [briefOpen, setBriefOpen] = useState((): boolean => {
    try {
      return !window.matchMedia("(max-width: 760px)").matches;
    } catch {
      return true;
    }
  });
  const chevBtn = (
    <button
      type="button"
      className="viper-fold shrink-0"
      onClick={() => setBriefOpen((v) => !v)}
      aria-expanded={briefOpen}
      aria-label="Plegar o desplegar la ficha del incidente"
    >
      <CaretDown size={14} aria-hidden="true" />
    </button>
  );
  useEffect(() => {
    void getMeta<{ dispatcherPhone?: string }>("syncConfig").then((config) => {
      setDispatchPhone(config?.dispatcherPhone ?? "");
    });
  }, []);

  // Posición de la unidad: GPS de la tablet (con velocidad doppler real); si no, la que conoce la central
  const unitPos = useMemo(() => {
    if (position)
      return { lat: position.lat, lng: position.lng, speed: position.speed, accuracy: position.accuracy };
    if (unit?.lat != null && unit?.lng != null)
      return { lat: unit.lat, lng: unit.lng, speed: null, accuracy: null };
    return null;
  }, [position, unit?.lat, unit?.lng]);

  useEffect(() => {
    if (!missionDetail) {
      void getMeta<MissionPayload>("missionCache").then((m) => setCached(m));
    } else {
      setCached(null);
    }
  }, [missionDetail]);

  // Catálogo completo de hidrantes: el sync de entrada lo deja en IndexedDB
  // (db.hydrants) — aquí se lee para la vista EN ESPERA, sin esperar a una
  // emergencia. Refresco por red cuando hay conexión (endpoint público).
  const [catalogAll, setCatalogAll] = useState<HydrantDTO[]>([]);
  useEffect(() => {
    void db.hydrants.toArray().then((rows) => {
      if (rows.length) setCatalogAll(rows);
    });
    void (async () => {
      try {
        const { hydrants } = await api.get<{ hydrants: HydrantDTO[] }>("/api/hydrants");
        setCatalogAll(hydrants);
        await db.transaction("rw", db.hydrants, async () => {
          await db.hydrants.clear();
          await db.hydrants.bulkPut(hydrants);
        });
      } catch {
        /* Sin conexión: vale el catálogo que bajó el sync */
      }
    })();
  }, []);

  // Zonas peligrosas descargadas en el sync (offline-first)
  useEffect(() => {
    void getMeta<DangerZoneDTO[]>("dangerZones").then(async (z) => {
      if (z && z.length) {
        setZones(z);
        return;
      }
      // Caché vacío (sync antiguo o nunca corrido): pedirlo una vez por red
      try {
        const { dangerZones } = await api.get<{ dangerZones: DangerZoneDTO[] }>("/api/danger-zones");
        if (Array.isArray(dangerZones) && dangerZones.length) {
          setZones(dangerZones);
          void setMeta("dangerZones", dangerZones);
        }
      } catch {
        /* Sin conexión: llegarán con el próximo sync */
      }
    });
  }, []);

  const active = missionDetail ?? (mission ? cached : null);
  const scene = active ? { lat: active.incident.lat, lng: active.incident.lng } : null;
  const departure = active?.departure ?? null;
  const tripStart = departure ?? unitPos; // sin punto de salida guardado: desde donde esté

  // Clave de posición con precisión ~100 m: recalcular «restante» solo al avanzar de verdad
  const unitKey = unitPos ? `${unitPos.lat.toFixed(3)};${unitPos.lng.toFixed(3)}` : "none";

  // MODO NAVEGACIÓN (?nav=1, botón «Navegar» de la misión): la cámara se
  // deja de reencuadrar por fitKey y SIGUE a la unidad con rumbo de avance.
  const navMode = search.get("nav") === "1" && Boolean(active);
  const navKey = unitPos ? `${unitPos.lat.toFixed(4)};${unitPos.lng.toFixed(4)}` : "none"; // ~11 m
  const speedKmh = useSpeedKmh(unitPos);

  // Volver al encuadre automático (botón «Vista» del raíl VIPER)
  function exitNav() {
    const next = new URLSearchParams(search);
    next.delete("nav");
    setSearch(next, { replace: true });
  }

  // Ruta completa: salida (cuartel) → emergencia. Se calcula una vez por misión.
  useEffect(() => {
    if (!active || !tripStart || !scene) return;
    let cancelled = false;
    const key = `route2:${active.incident.id}`;
    void (async () => {
      setRouteBusy(true);
      const saved = await getMeta<RouteInfo>(key);
      if (saved && Date.now() - saved.cachedAt < 30 * 60_000) {
        if (!cancelled) {
          setRoute(saved);
          setRouteFailed(false);
          setRouteBusy(false);
        }
        return;
      }
      const osrmBase = (await getMeta<{ osrmBaseUrl?: string }>("syncConfig"))?.osrmBaseUrl;
      const base = osrmBase || "https://router.project-osrm.org";
      let fresh: RouteInfo | null = null;
      for (let attempt = 0; attempt < 3 && !fresh; attempt++) {
        fresh = await fetchRoute(base, tripStart, scene);
        if (!fresh) await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      }
      if (cancelled) return;
      if (fresh) {
        setRoute(fresh);
        setRouteFailed(false);
        void setMeta(key, fresh);
      } else if (saved) {
        setRoute(saved);
        setRouteFailed(true);
      } else {
        setRoute(null);
        setRouteFailed(true);
      }
      setRouteBusy(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.incident.id, departure?.lat, departure?.lng, unitPos?.lat == null]);

  // Uber: ubicar la unidad sobre la ruta → recorrido / restante
  const progress = useMemo(() => {
    if (!route || !unitPos || route.coords.length < 2) return null;
    const idx = nearestRouteIndex(route, unitPos);
    const n = route.coords.length;
    const doneS = route.cumDurations[idx] ?? route.durationS * (idx / (n - 1));
    const doneM = route.cumDistances[idx] ?? route.distanceM * (idx / (n - 1));
    return {
      idx,
      traveled: route.coords.slice(0, idx + 1) as [number, number][],
      remaining: route.coords.slice(idx) as [number, number][],
      etaS: Math.max(0, route.durationS - doneS),
      distM: Math.max(0, route.distanceM - doneM),
    };
  }, [route, unitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cámara del modo navegación: centra la vista en la unidad y gira según
  // el rumbo del avance (norte-relativo). Con la unidad quieta no rota:
  // evita saltos de cámara con el GPS de precisión variable.
  const prevNavPosRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!navMode || !map || !unitPos) return;
    const prev = prevNavPosRef.current;
    let bearing: number | undefined;
    if (prev && haversineM(prev, unitPos) > 12) {
      const rad = Math.PI / 180;
      const x = Math.cos(unitPos.lat * rad) * (unitPos.lng - prev.lng);
      const y = unitPos.lat - prev.lat;
      bearing = (((Math.atan2(x, y) / rad) % 360) + 360) % 360;
    }
    prevNavPosRef.current = unitPos;
    map.easeTo({
      center: [unitPos.lng, unitPos.lat],
      zoom: 17,
      ...(bearing !== undefined ? { bearing } : {}),
      duration: 1400,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navMode, navKey, map]);

  // Avisos de zonas peligrosas en el tramo que falta por recorrer
  const warnings = useMemo(() => {
    if (!route || !progress) return [];
    return hazardsAhead(route, progress.idx, zones).slice(0, 2);
  }, [route, progress, zones]);

  const hydrants = useMemo<Array<HydrantDTO & { meters?: number }>>(() => {
    if (active) return active.hydrants;
    // En espera: hidrantes del catálogo a ≤2 km del GPS (los más cercanos primero)
    if (!unitPos || catalogAll.length === 0) return [];
    return catalogAll
      .map((h) => ({ ...h, meters: Math.round(haversineM(unitPos, h)) }))
      .filter((h) => h.meters <= 2000)
      .sort((a, b) => a.meters - b.meters);
  }, [active, catalogAll, unitPos]);

  // Toda la información cruda está en el mapa, también las ÓRDENES: aceptar
  // el despacho, avanzar el estado de la unidad y saltar al cierre de misión.
  const actions = active ? (
    <>
      {mission?.acceptedAt == null && (
        <button
          type="button"
          className="viper-act primary"
          onClick={() => {
            void acceptMission();
            notify("Despacho aceptado en el mapa", "success");
          }}
        >
          🚨 Aceptar despacho
        </button>
      )}
      {([ "en_ruta", "en_escena", "regresando" ] as UnitStatus[]).map((s) => (
        <button
          key={s}
          type="button"
          className={cx("viper-act", unit?.status === s && "primary")}
          disabled={unit?.status === s}
          onClick={() => {
            void setStatus(s);
            notify(`Estado marcado: ${UNIT_STATUS[s].label}`, "info");
          }}
        >
          {UNIT_STATUS[s].label}
        </button>
      ))}
      <button type="button" className="viper-act" onClick={() => setCloseOpen(true)}>
        Cerrar misión con formulario →
      </button>
      <button type="button" className="viper-act" onClick={() => setReportOpen(true)}>
        Reporte completo ▸
      </button>
      {active.preplan != null && (
        <button type="button" className="viper-act" onClick={() => setFichaOpen(true)}>
          Ficha del edificio ▣
        </button>
      )}
      <a
        className="viper-act as-link"
        href={dispatchPhone ? `tel:${dispatchPhone}` : "tel:116"}
        aria-label="Llamar al despachador"
      >
        📞 Llamar central
      </a>
    </>
  ) : null;

  // Los cinco paneles flotantes (antes eran ventanas separadas)
  const overlays = (
    <>
      {/* Mensaje sin leer de la central: franja superior ROJA Y PULSANTE
          que no se va sola — un toque abre el Chat (y al abrirse queda
          «visto»). Es el camino más corto para responder a la central.
          Se oculta si ya hay un llamado de voz a pantalla completa. */}
      {unreadChat > 0 && !chatOpen && !voiceCall && (
        <button
          type="button"
          className="chat-alert"
          onClick={() => setChatOpen(true)}
          aria-label={`${unreadChat} mensaje${unreadChat > 1 ? "s" : ""} de la central sin leer. Toca para responder.`}
        >
          <ChatCircle size={21} weight="fill" aria-hidden="true" />
          <span className="chat-alert-tx">
            <strong>Mensaje de la central</strong>
            <small>
              {unreadChat > 1 ? `${unreadChat} sin leer · ` : ""}Toca para responder
            </small>
          </span>
          <CaretRight size={16} weight="bold" aria-hidden="true" />
        </button>
      )}
      {chatOpen && <ChatSheet onClose={() => setChatOpen(false)} />}
      {equipoOpen && <EquipoSheet onClose={() => setEquipoOpen(false)} />}
      {misionesOpen && <MisionesSheet onClose={() => setMisionesOpen(false)} />}
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
      {reportOpen && <ReportSheet onClose={() => setReportOpen(false)} />}
      {fichaOpen && <FichaSheet onClose={() => setFichaOpen(false)} />}
      {closeOpen && <CloseSheet onClose={() => setCloseOpen(false)} />}
      {/* Llamado de VOZ de la central: campana + panel a pantalla completa */}
      {voiceCall && (
        <VoiceCallPanel
          onOpenChat={() => {
            setChatOpen(true);
          }}
        />
      )}
    </>
  );
  // ---------- VISTA BÁSICA (sin misión): emergencias activas para todos ----------

  /** Emergencia seleccionada: ?incident=… o la más reciente */
  const basicIncident = useMemo<BasicIncidentDTO | null>(() => {
    const wanted = Number(search.get("incident"));
    return alerts.find((i) => i.id === wanted) ?? alerts[0] ?? null;
  }, [search, alerts]);

  const basicHydrants = useMemo<Array<HydrantDTO & { meters: number }>>(() => {
    if (!basicIncident) return [];
    return alertHydrants
      .map((h) => ({ ...h, meters: Math.round(haversineM({ lat: basicIncident.lat, lng: basicIncident.lng }, h)) }))
      .filter((h) => h.meters <= 1500)
      .sort((a, b) => a.meters - b.meters)
      .slice(0, 8);
  }, [basicIncident, alertHydrants]);

  const basicMarkers = useMemo<TacMarker[]>(() => {
    const numbered = new Map<number, number>();
    basicHydrants
      .filter((h) => h.situation === "operativo")
      .slice(0, 3)
      .forEach((h, i) => numbered.set(h.id, i + 1));
    const list: TacMarker[] = basicHydrants.map((h) => ({
      id: `hyd-${h.id}`,
      lat: h.lat,
      lng: h.lng,
      html: hydrantHtml(h.situation, numbered.get(h.id) != null ? String(numbered.get(h.id)) : undefined),
      label: hydrantName(h.code, h.id, h.situation),
    }));
    // Pin de la emergencia: icono por tipo de incidente, pulsante (está activa)
    if (basicIncident) {
      list.unshift({
        id: "scene",
        lat: basicIncident.lat,
        lng: basicIncident.lng,
        html: sceneHtml(true, basicIncident.title),
        label: basicIncident.title,
      });
    }
    return list.filter((m) => (m.id.startsWith("hyd-") ? showHydrants : true));
  }, [basicHydrants, basicIncident, showHydrants]);

  function selectIncident(id: number) {
    setSearch({ incident: String(id) }, { replace: true });
  }


  const numbered = useMemo(() => {
    return new Map(
      hydrants
        .filter((h) => h.situation === "operativo")
        .slice(0, 3)
        .map((h, i) => [h.id, i + 1] as const),
    );
  }, [hydrants]);

  const bounds = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = [];
    if (departure) pts.push([departure.lat, departure.lng]);
    if (unitPos) pts.push([unitPos.lat, unitPos.lng]);
    if (scene) pts.push([scene.lat, scene.lng]);
    for (const h of hydrants) pts.push([h.lat, h.lng]);
    return pts;
  }, [departure, unitPos, scene, hydrants]);

  const markers = useMemo<TacMarker[]>(() => {
    const list: TacMarker[] = hydrants.map((h) => {
      const num = numbered.get(h.id);
      return {
        id: `hyd-${h.id}`,
        lat: h.lat,
        lng: h.lng,
        html: hydrantHtml(h.situation, num != null ? String(num) : undefined),
        label: hydrantName(h.code, h.id, h.situation),
      };
    });
    // Salida (cuartel): solo si la unidad ya se movió de él
    if (departure && (!unitPos || haversineM(departure, unitPos) > 60)) {
      list.push({
        id: "departure",
        lat: departure.lat,
        lng: departure.lng,
        html: departHtml(),
        label: `Salida: ${departure.station}`,
      });
    }
    if (scene) {
      list.push({
        id: "scene",
        lat: scene.lat,
        lng: scene.lng,
        html: sceneHtml(mission?.acceptedAt == null, active?.incident.title),
        label: active?.incident.title ?? "Emergencia",
      });
    }
    if (unitPos) {
      list.push({
        id: "unit",
        lat: unitPos.lat,
        lng: unitPos.lng,
        html: unitHtml(unit?.code ?? "UNIDAD", { type: unit?.type, status: unit?.status }),
        label: `Unidad ${unit?.code ?? ""}`,
      });
    }
    return list.filter((m) => (m.id.startsWith("hyd-") ? showHydrants : true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrants, numbered, scene, unitPos, departure, unit?.code, unit?.type, unit?.status, mission?.acceptedAt, active?.incident.title, showHydrants]);

  const hazards = useMemo<TacHazard[]>(
    () =>
      (showZones ? (zones.length ? zones : alertZones) : []).map((z) => ({
        id: `z${z.id}`,
        coords: z.path,
        color: HAZARD_COLOR[z.level],
      })),
    [zones, alertZones, showZones],
  );

  // Tramos del mapa: restante (rojo) + recorrido (gris). Sin OSRM: línea directa.
  const routeLine = useMemo<[number, number][] | null>(() => {
    if (route) return progress ? progress.remaining : route.coords;
    if (tripStart && scene && routeFailed) {
      return [
        [tripStart.lat, tripStart.lng],
        [scene.lat, scene.lng],
      ];
    }
    return null;
  }, [route, progress, tripStart, scene, routeFailed]);

  const traveledLine = useMemo(() => (progress ? progress.traveled : null), [progress]);

  const eta = progress ? fmtMinutes(progress.etaS) : route ? fmtMinutes(route.durationS) : null;
  const dist = progress ? fmtDistance(progress.distM) : route ? fmtDistance(route.distanceM) : null;

  // ---------- VISTA BÁSICA (sin misión asignada): emergencias para todos ----------
  if (!active) {
    if (!basicIncident) {
      return (
        <div className="relative h-full w-full overflow-hidden">
          <TacticalMap
            markers={markers}
            hazards={hazards}
            bounds={bounds}
            fitKey={`zona-${unitKey}`}
            onReady={setMap}
          />
          <div className="float-panel absolute inset-x-3 bottom-3 p-4" aria-live="polite">
            {/* Toda la información en el mapa: emergencias activas de la compañía */}
            {alerts.length > 0 && (
              <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
                {alerts.slice(0, 6).map((i) => (
                  <button
                    key={i.id}
                    className="pill shrink-0 text-fire"
                    onClick={() => selectIncident(i.id)}
                    title="Ver en el mapa"
                  >
                    {incidentKind(i.title).icon} {i.title.length > 24 ? `${i.title.slice(0, 24)}…` : i.title}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1 truncate text-[14px]">
                {unit
                  ? "Sin misión activa — hidrantes cercanos en el mapa. Al despachar, la ruta tipo Uber aparece aquí."
                  : "Cuando la central registre una emergencia, sonará la alerta y aquí verás el mapa del accidente."}
              </div>
              {unitPos && (
                <span
                  className="viper-speed"
                  role="status"
                  aria-label={`Velocidad actual ${speedKmh} kilómetros por hora`}
                >
                  <strong>{speedKmh}</strong>
                  <span>km/h</span>
                </span>
              )}
            </div>
            <p className="map-credit">© OpenStreetMap · OpenFreeMap</p>
          </div>
          <CockpitChrome
            unit={unit}
            map={map}
            scene={null}
            unitPos={unitPos}
            preplan={null}
            hydrants={hydrants.slice(0, 6)}
            otherUnits={[]}
            navMode={false}
            chatUnread={unreadChat}
            showHydrants={showHydrants}
            showZones={showZones}
            setShowHydrants={setShowHydrants}
            setShowZones={setShowZones}
            flyTo={(lat, lng, zoom) => map?.flyTo({ center: [lng, lat], zoom })}
            exitNav={exitNav}
            chatOpen={chatOpen}
            onChatToggle={() => setChatOpen((v) => !v)}
            onEquipoToggle={() => setEquipoOpen((v) => !v)}
            onMisionesToggle={() => setMisionesOpen((v) => !v)}
            onSettingsToggle={() => setSettingsOpen((v) => !v)}
          />
          {overlays}
        </div>
      );
    }

    const kind = incidentKind(basicIncident.title);
    const severity = SEVERITY_LABEL[basicIncident.severity] ?? SEVERITY_LABEL.alta;
    return (
      <div className="relative h-full w-full overflow-hidden">
        <SceneMap
          center={{ lat: basicIncident.lat, lng: basicIncident.lng }}
          title={basicIncident.title}
          markers={basicMarkers}
          zoom={15}
          onReady={setSceneMap}
        />
        <CockpitChrome
          unit={unit}
          map={sceneMap}
          scene={{ lat: basicIncident.lat, lng: basicIncident.lng }}
          unitPos={unitPos}
          preplan={null}
          hydrants={basicHydrants}
          otherUnits={[]}
          navMode={false}
          chatUnread={unreadChat}
          showHydrants={showHydrants}
          showZones={showZones}
          setShowHydrants={setShowHydrants}
          setShowZones={setShowZones}
          flyTo={(lat, lng, zoom) => sceneMap?.flyTo({ center: [lng, lat], zoom })}
          exitNav={exitNav}
          chatOpen={chatOpen}
          onChatToggle={() => setChatOpen((v) => !v)}
          onEquipoToggle={() => setEquipoOpen((v) => !v)}
          onMisionesToggle={() => setMisionesOpen((v) => !v)}
          onSettingsToggle={() => setSettingsOpen((v) => !v)}
        />
        {overlays}
        <div
          className="float-panel absolute inset-x-3 bottom-3 max-h-[60%] overflow-y-auto p-4"
          aria-live="polite"
        >
          {alerts.length > 1 && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
              {alerts.map((i) => (
                <button
                  key={i.id}
                  className={cx("pill shrink-0 border", i.id === basicIncident.id ? "text-fire" : "text-mut")}
                  style={{ borderColor: i.id === basicIncident.id ? "var(--fire)" : "var(--line)" }}
                  aria-pressed={i.id === basicIncident.id}
                  onClick={() => selectIncident(i.id)}
                >
                  {incidentKind(i.title).icon}{" "}
                  {i.title.length > 26 ? `${i.title.slice(0, 26)}…` : i.title}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              {/* Título SIEMPRE visible + chevron: plegada no tapa el mapa */}
              <div className="flex min-w-0 items-center gap-2">
                <span className="display flex min-w-0 items-center gap-1.5 truncate text-[17px] font-bold">
                  {kind.icon} {basicIncident.title}
                </span>
                {chevBtn}
              </div>
              {briefOpen && (
                <>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="pill" style={{ color: `var(${severity.varName})` }}>
                      Prioridad {severity.label}
                    </span>
                    <span className="pill text-mut">
                      {INCIDENT_STATUS_LABEL[basicIncident.status] ?? basicIncident.status}
                    </span>
                    {basicIncident.unitCode && (
                      <span className="pill text-rescue">Unidad {basicIncident.unitCode}</span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[13.5px] text-tx">{basicIncident.address}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {basicHydrants
                      .filter((h) => h.situation === "operativo")
                      .slice(0, 3)
                      .map((h, i) => (
                        <span key={h.id} className="pill text-hydrant">
                          {i + 1} · {hydrantLabel(h.code) ?? `Hidrante #${h.id}`} · {fmtDistance(h.meters)}
                        </span>
                      ))}
                  </div>
                  <div className="mt-1 text-[11.5px] text-mut2">
                    Reportado {timeAgo(basicIncident.createdAt)} · {fmtClock(basicIncident.createdAt)} ·{" "}
                    {user?.role === "unidad"
                      ? "acepta tu despacho para ver la ruta completa"
                      : "vista básica — el chofer de la unidad asignada ve todos los datos"}
                  </div>
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {unitPos && (
                <span
                  className="viper-speed"
                  role="status"
                  aria-label={`Velocidad actual ${speedKmh} kilómetros por hora`}
                >
                  <strong>{speedKmh}</strong>
                  <span>km/h</span>
                </span>
              )}
              <button
                className="btn"
                aria-label="Centrar en la emergencia"
                disabled={!sceneMap}
                onClick={() =>
                  sceneMap?.easeTo({
                    center: [basicIncident.lng, basicIncident.lat],
                    zoom: 15.5,
                    duration: 500,
                  })
                }
              >
                <Crosshair size={22} aria-hidden="true" /> Centrar
              </button>
            </div>
          </div>
          <p className="map-credit">© OpenStreetMap · OpenFreeMap</p>
        </div>
      </div>
    );
  }

  if (!scene) return null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <TacticalMap
        markers={markers}
        route={routeLine}
        traveled={traveledLine}
        dashed={!route && routeFailed}
        hazards={hazards}
        bounds={navMode ? [] : bounds}
        fitKey={
          navMode
            ? `nav-${active?.incident.id ?? "none"}`
            : `${active?.incident.id ?? "none"}-${departure ? "d" : "u"}-${unitKey}`
        }
        onReady={setMap}
      />

      {navMode && active && (
        <div className="absolute inset-x-0 top-0 z-10">
          <div className="flex items-center gap-3 bg-fire px-4 py-3 text-white" role="status">
            <NavigationArrow size={26} className="shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="display text-[15px] font-bold tracking-wide">EN RUTA · SEGUIMIENTO GPS</div>
              <div className="nav-sub truncate text-[12.5px] opacity-90">
                {active.incident.title} · {active.incident.address}
              </div>
            </div>
            <button
              className="btn btn-sm shrink-0"
              style={{ background: "#fff", color: "var(--fire)", border: "none" }}
              onClick={() => setSearch({ incident: String(active.incident.id) }, { replace: true })}
              aria-label="Salir del modo navegación"
            >
              <X size={18} aria-hidden="true" /> Salir
            </button>
          </div>
        </div>
      )}

      {/* Cabina VIPER: chrome de operaciones sobre el mapa */}
      <CockpitChrome
        unit={unit}
        map={map}
        scene={scene}
        unitPos={unitPos}
        preplan={active?.preplan ?? null}
        hydrants={active?.hydrants ?? []}
        otherUnits={active?.otherUnits ?? []}
        navMode={navMode}
        chatUnread={unreadChat}
        chatOpen={chatOpen}
        onChatToggle={() => setChatOpen((v) => !v)}
        onEquipoToggle={() => setEquipoOpen((v) => !v)}
        onMisionesToggle={() => setMisionesOpen((v) => !v)}
        onSettingsToggle={() => setSettingsOpen((v) => !v)}
        onFicha={() => setFichaOpen(true)}
        actions={actions}
        acceptPending={mission?.acceptedAt == null}
        showHydrants={showHydrants}
        showZones={showZones}
        setShowHydrants={setShowHydrants}
        setShowZones={setShowZones}
        flyTo={(lat, lng, zoom) => map?.flyTo({ center: [lng, lat], zoom })}
        exitNav={exitNav}
      />
      {overlays}

      {/* Panel cockpit flotante (estilo Uber) */}
      <div className="float-panel absolute inset-x-3 bottom-3 p-4" aria-live="polite">
        {scene ? (
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              {/* Cabecera estética VIPER GO: sirena + meta + título grande */}
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mission-siren grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-fire bg-fire text-white"
                  style={{ boxShadow: "0 0 0 4px color-mix(in srgb, var(--fire) 14%, transparent)" }}
                >
                  <Siren size={22} weight="fill" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-mut2">
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <CalendarBlank size={13} aria-hidden="true" /> {fmtClock(active.incident.createdAt)}
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <Clock size={13} aria-hidden="true" /> {timeAgo(active.incident.createdAt)}
                    </span>
                    <small className="display rounded-md border border-line bg-panel2 px-1.5 py-0.5 text-[10.5px] font-bold tracking-wider uppercase">
                      {unit?.station?.split(".").at(-1)?.trim() || "Camaná"}
                    </small>
                  </div>
                  <div className="display mt-0.5 truncate text-[17.5px] font-bold leading-tight">
                    {active.incident.title}
                  </div>
                  <div className="truncate text-[12.5px] text-mut">{active.incident.address}</div>
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-3">
                {unitPos && (
                  <span
                    className="viper-speed self-center"
                    role="status"
                    aria-label={`Velocidad actual ${speedKmh} kilómetros por hora`}
                  >
                    <strong>{speedKmh}</strong>
                    <span>km/h</span>
                  </span>
                )}
                {eta ? (
                  <span className="num-hero text-[clamp(24px,7vw,40px)] leading-none text-fire">{eta}</span>
                ) : (
                  <span className="text-[14px] text-mut">
                    {tripStart ? "Calculando ruta…" : "Esperando ubicación…"}
                  </span>
                )}
                {dist && (
                  <span className="num-hero text-[clamp(16px,4.2vw,24px)] leading-none opacity-80">{dist}</span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-mut2">
                {routeBusy && <span>Actualizando…</span>}
                {!route && tripStart && scene && !routeBusy && (
                  <span className="text-crash">Sin ruta vial (OSRM) — línea directa</span>
                )}
                {departure && (
                  <span className="mission-departure">
                    Saliste de {departure.station}
                    {departure.at ? ` · ${fmtClock(departure.at)}` : ""}
                  </span>
                )}
                {!position && (
                  <span className="mission-central-note">
                    Posición de la central; tu GPS toma el control al conectar
                  </span>
                )}
              </div>
              {warnings.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  {warnings.map(({ zone, metersAhead }) => (
                    <span
                      key={zone.id}
                      className="pill"
                      style={{ color: HAZARD_COLOR[zone.level], alignSelf: "flex-start" }}
                      title={zone.advisory ?? undefined}
                    >
                      ⚠ {zone.name} · en {fmtDistance(metersAhead)}
                    </span>
                  ))}
                </div>
              )}
              <div className="mission-hydrants mt-2 flex flex-wrap gap-1.5">
                {active.hydrants
                  .filter((h) => numbered.has(h.id))
                  .map((h, i) => (
                    <span key={h.id} className="pill text-hydrant">
                      {i + 1} · {hydrantLabel(h.code) ?? `Hidrante #${h.id}`} · {fmtDistance(h.meters)}
                    </span>
                  ))}
              </div>
            </div>
            <button
              className="btn"
              aria-label="Centrar en mi unidad"
              title="Centrar en mi unidad"
              disabled={!unitPos}
              onClick={() => unitPos && map?.easeTo({ center: [unitPos.lng, unitPos.lat], zoom: 16 })}
            >
              <Crosshair size={22} aria-hidden="true" /> Centrar
            </button>
          </div>
        ) : null}
        <p className="map-credit">© OpenStreetMap · OpenFreeMap</p>
      </div>
    </div>
  );
}
