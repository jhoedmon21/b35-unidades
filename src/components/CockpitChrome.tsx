// Cabina VIPER sobre el mapa de la pantalla Mapa — la capa de chrome
// de operaciones: marca con acento, píldoras de capas, raíl de cámara,
// panel de estado operativo, hidrantes cercanos en retícula, unidades
// en la calle y la etiqueta CLARA de la ficha del edificio.
// Es la adaptación de la maqueta viper_dashboard.html conservando el
// tamaño táctil (botones ≥40 px) y los contrastes AA de la app.

import { useEffect, useState, type ReactNode } from "react";
import type { Map as MlMap } from "maplibre-gl";
import {
  ArrowsOut,
  ChatCircle,
  Clock,
  Compass,
  Crosshair,
  Drop,
  NavigationArrow,
  Toolbox,
  WarningDiamond,
} from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { cx } from "../lib/cx";
import { UNIT_STATUS } from "../lib/status";
import { fmtDistance } from "../lib/format";
import type { HydrantDTO, MissionPayload, UnitDTO } from "../lib/types";

interface Props {
  unit: UnitDTO | null;
  /** Instancia MapLibre de ESTA pantalla (TacticalMap o SceneMap) */
  map: MlMap | null;
  scene: { lat: number; lng: number } | null;
  unitPos: { lat: number; lng: number } | null;
  /** La ficha que llega en la misión (tablero «Ver plan de emergencia» del mock) */
  preplan: MissionPayload["preplan"];
  /** Hidrantes cercanos con distancia (misión, alerta básica o espera) */
  hydrants: Array<HydrantDTO & { meters?: number }>;
  /** Otras unidades despachadas al mismo incidente */
  otherUnits: MissionPayload["otherUnits"];
  navMode: boolean;
  /** Píldoras de capas del topbar */
  showHydrants: boolean;
  showZones: boolean;
  setShowHydrants: (v: boolean) => void;
  setShowZones: (v: boolean) => void;
  /** Avisos de chat sin leer (chip «Chat» del topbar) */
  chatUnread?: number;
  /** Panel de órdenes al pie de la columna derecha (solo con misión) */
  actions?: ReactNode;
  /** Mover mapa a un punto (lng,lat — orden MapLibre) */
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  /** Volver al encuadre automático: sale del modo conducción */
  exitNav: () => void;
}

const DOW = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const MON = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SET", "OCT", "NOV", "DIC"];

/** Chip de fecha+hora del mock VIPER GO, en vivo (segundo a segundo). */
function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const hhmmss = now.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return (
    <span className="viper-clock" role="timer" aria-label={`Hora actual ${hhmmss}`}>
      <Clock size={14} className="shrink-0" aria-hidden="true" />
      <strong suppressHydrationWarning>{hhmmss}</strong>
      <span suppressHydrationWarning>
        {DOW[now.getDay()]} {String(now.getDate()).padStart(2, "0")}/{MON[now.getMonth()]}
      </span>
    </span>
  );
}

export default function CockpitChrome({
  unit,
  map,
  scene,
  unitPos,
  preplan,
  hydrants,
  otherUnits,
  navMode,
  showHydrants,
  showZones,
  setShowHydrants,
  setShowZones,
  chatUnread = 0,
  actions,
  flyTo,
  exitNav,
}: Props) {
  // Estado del operador a mostrar en el panel Estado operativo
  const status = unit ? UNIT_STATUS[unit.status] ?? null : null;

  return (
    /* El wrapper desplaza TODO el cromo cuando está el banner EN RUTA */
    <div
      className={cx(
        "pointer-events-none absolute inset-x-0 z-[12]",
        navMode ? "bottom-0 top-16" : "bottom-0 top-0",
      )}
    >
    <>
      {/* Marca/estado al estilo maqueta: grande arriba-izquierda con «mark» verde */}
      <div className="viper-brand pointer-events-none absolute left-3 top-2">
        {unit ? (
          <span className="pointer-events-auto flex items-center gap-2">
            <span>{unit.code}</span>
            <small>◉ {unit.station?.split(".").at(-1)?.trim() || "Camaná"}</small>
          </span>
        ) : (
          <span className="pointer-events-auto flex items-center gap-2">
            <span>
              Fuego<span className="text-ok">Map</span>
            </span>
            <small>◉ Camaná</small>
          </span>
        )}
      </div>

      {/* Píldoras de capas del topbar */}
      <div className="pointer-events-none absolute left-3 top-12 z-[12]"
      >
        <div className="pointer-events-auto flex flex-wrap gap-2">
          <button
            type="button"
            className={cx("viper-chip", showHydrants && "on")}
            onClick={() => setShowHydrants(!showHydrants)}
            aria-pressed={showHydrants}
            title="Mostrar u ocultar hidrantes"
          >
            <Drop size={15} aria-hidden="true" /> Hidrantes
          </button>
          <button
            type="button"
            className={cx("viper-chip", showZones && "on")}
            onClick={() => setShowZones(!showZones)}
            aria-pressed={showZones}
            title="Mostrar u ocultar tramos peligrosos"
          >
            <WarningDiamond size={15} aria-hidden="true" /> Zonas
          </button>
          <LiveClock />
          {/* Comandos que viven en otras pantallas: cabina como tablero único */}
          <Link to="/mensajes" className="viper-chip" title="Chat con la central">
            <ChatCircle size={15} aria-hidden="true" /> Chat
            {chatUnread > 0 && (
              <span className="viper-badge" aria-label={`${chatUnread} sin leer`}>
                {chatUnread > 9 ? "9+" : chatUnread}
              </span>
            )}
          </Link>
          <Link to="/equipo" className="viper-chip" title="Equipo del vehículo">
            <Toolbox size={15} aria-hidden="true" /> Equipo
          </Link>
        </div>
      </div>

      {/* Rail izquierdo de cámara (destino, puesto, norte, vista) */}
      <div className="viper-rail pointer-events-none">
        <button
          type="button"
          className="pointer-events-auto"
          disabled={!scene}
          onClick={() => scene && flyTo(scene.lat, scene.lng, 16.5)}
          title="Ver la escena de la emergencia"
        >
          <NavigationArrow size={17} aria-hidden="true" /> Destino
        </button>
        <button
          type="button"
          className="pointer-events-auto"
          disabled={!unitPos}
          onClick={() => unitPos && flyTo(unitPos.lat, unitPos.lng, 16.5)}
          title="Centrar en mi unidad"
        >
          <Crosshair size={17} aria-hidden="true" /> Puesto
        </button>
        <button
          type="button"
          className="pointer-events-auto"
          onClick={() => map?.easeTo({ bearing: 0 })}
          title="Norte arriba"
        >
          <Compass size={17} aria-hidden="true" /> Norte
        </button>
        {navMode && (
          <button
            type="button"
            className="pointer-events-auto"
            onClick={exitNav}
            title="Volver al encuadre automático"
          >
            <ArrowsOut size={17} aria-hidden="true" /> Vista
          </button>
        )}
      </div>

      {/* Columna de paneles a la derecha (del mock: arriba → abajo) */}
      <div className="pointer-events-none absolute right-3 top-12 z-[12] flex max-h-[calc(100dvh-9.5rem)] flex-col items-end gap-2 overflow-y-auto">
        {/* Panel Estado operativo */}
        <div className="viper-panel pointer-events-auto shrink-0">
          <div className="viper-panelhead">
            <span>● Estado operativo</span>
            <span>•••</span>
          </div>
          {status ? (
            <>
              <div className="mt-1.5 flex items-baseline justify-end gap-2">
                <span className="num-hero text-[26px]" style={{ color: `var(${status.varName})` }}>
                  {unit?.code}
                </span>
              </div>
              <p className="mt-0.5 text-right text-[10.5px] text-mut2">{status.label}</p>
            </>
          ) : (
            <p
              className="mt-2 text-right text-[12.5px] font-bold"
              style={{ color: "var(--rescue)" }}
            >
              Vista de bomberos
            </p>
          )}
        </div>

        {/* Etiqueta clara de la ficha (maplabel del mock) */}
        {preplan && (
          <div className="viper-maplabel pointer-events-auto">
            <strong>▣ {preplan.preplan.title}</strong>
            <p className="addr">{preplan.preplan.address}</p>
            <p className="addr">
              A <span className="font-bold">{fmtDistance(preplan.meters)}</span> de la escena
            </p>
            <Link to="/mision">Ver plan de emergencia →</Link>
          </div>
        )}

        {/* Panel Claves de hidrantes (retícula del mock) */}
        {hydrants.length > 0 && (
          <div className="viper-panel pointer-events-auto">
            <div className="viper-panelhead">
              <span>♧ Hidrantes</span>
              <span>•••</span>
            </div>
            <div className="viper-keys">
              {hydrants.slice(0, 4).map((h, i) => (
                <button
                  key={h.id}
                  type="button"
                  className="viper-key"
                  onClick={() => flyTo(h.lat, h.lng, 17)}
                  title={h.code || `Hidrante #${h.id}`}
                >
                  <strong>{i + 1}</strong>
                  <span>{h.meters != null ? fmtDistance(h.meters) : ""}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Panel Unidades en la calle */}
        {otherUnits.length > 0 && (
          <div className="viper-panel pointer-events-auto">
            <div className="viper-panelhead">
              <span>▣ Vehículos</span>
              <span>•••</span>
            </div>
            <div className="viper-veh">
              {otherUnits.map((u) => (
                <span
                  key={u.code}
                  className="viper-key"
                  style={{ borderColor: `var(${UNIT_STATUS[u.status]?.varName ?? "--mut"})` }}
                >
                  <strong style={{ color: `var(${UNIT_STATUS[u.status]?.varName ?? "--mut"})` }}>
                    {u.code}
                  </strong>
                  <span>{UNIT_STATUS[u.status]?.label ?? u.status}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Órdenes de la misión: aceptar, estados de unidad, ir al cierre */}
        {actions && <div className="viper-panel pointer-events-auto shrink-0">{actions}</div>}
      </div>
    </>
    </div>
  );
}
