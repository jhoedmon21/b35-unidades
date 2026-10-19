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
  CaretDown,
  ChatCircle,
  Clock,
  ClockCounterClockwise,
  Compass,
  Crosshair,
  Drop,
  GearSix,
  NavigationArrow,
  WarningDiamond,
  Wrench,
} from "@phosphor-icons/react";
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
  /** Los paneles de comando son ESTADOS de /mapa: chat y ajustes flotan aquí */
  chatOpen?: boolean;
  onChatToggle?: () => void;
  /** Equipo y misiones cerradas también son paneles flotantes */
  onEquipoToggle?: () => void;
  onMisionesToggle?: () => void;
  /** La ficha completa se abre como panel flotante (ya no existe /mision) */
  onFicha?: () => void;
  onSettingsToggle?: () => void;
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
  chatOpen,
  onChatToggle,
  onEquipoToggle,
  onMisionesToggle,
  onFicha,
  onSettingsToggle,
  actions,
  flyTo,
  exitNav,
}: Props) {
  // Estado del operador a mostrar en el panel Estado operativo
  const status = unit ? UNIT_STATUS[unit.status] ?? null : null;

  /* Colapsar: la fila de opciones se esconde a un toque (se recuerda en el
     equipo) y cada panel de la columna derecha pliega su contenido con el
     chevron — el mapa queda limpio cuando el chofer no lo necesita. */
  const [chipsOpen, setChipsOpen] = useState(() => {
    try {
      return localStorage.getItem("fw-chips") !== "1";
    } catch {
      return true;
    }
  });
  const [folds, setFolds] = useState<Record<string, boolean>>({});
  const toggleChips = () => {
    setChipsOpen((v) => {
      try {
        localStorage.setItem("fw-chips", v ? "1" : "0");
      } catch {
        /* sin almacenamiento: solo la vista */
      }
      return !v;
    });
  };
  const toggleFold = (key: string) => setFolds((f) => ({ ...f, [key]: !f[key] }));
  const foldBtn = (key: string, label: string) => (
    <button
      type="button"
      className="viper-fold"
      onClick={() => toggleFold(key)}
      aria-expanded={!folds[key]}
      aria-label={`Colapsar el panel ${label}`}
    >
      <CaretDown size={13} aria-hidden="true" />
    </button>
  );

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

      {/* Hora y fecha arriba-derecha, frente a la marca (no es un botón) */}
      <div className="pointer-events-none absolute right-3 top-2 z-[12]">
        <LiveClock />
      </div>

      {/* Píldoras de capas del topbar — COLAPSABLES: un toque las esconde,
          otro las devuelve. UNA SOLA LÍNEA desplazable: nunca crece hacia
          abajo ni tapa el raíl (Destino · Puesto · Norte) ni los paneles. */}
      <div className="pointer-events-none absolute left-3 top-12 z-[12] max-w-[calc(100vw-14rem)] md:max-w-[calc(100vw-21rem)]">
        {chipsOpen ? (
          <div className="viper-chipsrow pointer-events-auto">
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
            {/* Paneles de comando: el mapa es la única ventana de la app */}
            <button
              type="button"
              className={cx("viper-chip", chatOpen && "on")}
              onClick={onChatToggle}
              aria-pressed={chatOpen}
              title="Chat con la central"
            >
              <ChatCircle size={15} aria-hidden="true" /> Chat
              {chatUnread > 0 && !chatOpen && (
                <span className="viper-badge" aria-label={`${chatUnread} sin leer`}>
                  {chatUnread > 9 ? "9+" : chatUnread}
                </span>
              )}
            </button>
            <button
              type="button"
              className="viper-chip"
              onClick={onEquipoToggle}
              title="Equipo del vehículo: ubicación y uso"
            >
              <Wrench size={15} aria-hidden="true" /> Equipo
            </button>
            <button
              type="button"
              className="viper-chip"
              onClick={onMisionesToggle}
              title="Misiones cerradas por esta unidad"
            >
              <ClockCounterClockwise size={15} aria-hidden="true" /> Misiones
            </button>
            <button
              type="button"
              className={cx("viper-chip", "text-mut")}
              onClick={onSettingsToggle}
              title="Ajustes: alarma, sincronización, sesión"
              aria-label="Ajustes"
            >
              <GearSix size={15} aria-hidden="true" /> Ajustes
            </button>
            <button
              type="button"
              className="viper-chip text-mut"
              onClick={toggleChips}
              title="Ocultar esta fila de opciones"
              aria-label="Ocultar opciones"
            >
              <CaretDown size={15} aria-hidden="true" /> Ocultar
            </button>
          </div>
        ) : (
          <div className="pointer-events-auto">
            <button
              type="button"
              className="viper-chip"
              onClick={toggleChips}
              title="Mostrar las opciones de capas y paneles"
              aria-label="Mostrar opciones"
            >
              <CaretDown size={15} className="rotate-180" aria-hidden="true" /> Opciones
            </button>
          </div>
        )}
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
      <div className="viper-col pointer-events-none absolute right-3 top-12 z-[12] flex max-h-[calc(100dvh-9.5rem)] flex-col items-end gap-2 overflow-y-auto">
        {/* Panel Estado operativo (contenido colapsable) */}
        <div className="viper-panel pointer-events-auto shrink-0">
          <div className="viper-panelhead">
            <span>● Estado operativo</span>
            {foldBtn("estado", "Estado operativo")}
          </div>
          {!folds.estado &&
            (status ? (
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
                Sin misión asignada
              </p>
            ))}
        </div>

        {/* Etiqueta clara de la ficha (maplabel del mock) */}
        {preplan && (
          <div className="viper-maplabel pointer-events-auto">
            <strong>▣ {preplan.preplan.title}</strong>
            <p className="addr">{preplan.preplan.address}</p>
            <p className="addr">
              A <span className="font-bold">{fmtDistance(preplan.meters)}</span> de la escena
            </p>
            <button type="button" className="viper-maplabel-link" onClick={onFicha}>
              Ver plan de emergencia →
            </button>
          </div>
        )}

        {/* Panel Claves de hidrantes (retícula del mock) — colapsable */}
        {hydrants.length > 0 && (
          <div className="viper-panel pointer-events-auto">
            <div className="viper-panelhead">
              <span>♧ Hidrantes</span>
              {foldBtn("hidrantes", "Hidrantes")}
            </div>
            {!folds.hidrantes && (
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
            )}
          </div>
        )}

        {/* Panel Unidades en la calle — colapsable */}
        {otherUnits.length > 0 && (
          <div className="viper-panel pointer-events-auto">
            <div className="viper-panelhead">
              <span>▣ Vehículos</span>
              {foldBtn("vehiculos", "Vehículos")}
            </div>
            {!folds.vehiculos && (
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
            )}
          </div>
        )}

        {/* Órdenes de la misión: aceptar, estados de unidad, ir al cierre */}
        {actions && <div className="viper-panel pointer-events-auto shrink-0">{actions}</div>}
      </div>
    </>
    </div>
  );
}
