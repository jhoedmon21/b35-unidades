// Shell de la app: cabecera cockpit (unidad, estado, conexión), avisos
// flotantes y navegación inferior de 64 px. `fullBleed` quita el margen
// para que el mapa ocupe toda la pantalla.

import { NavLink } from "react-router-dom";
import {
  ChatCircle,
  Fire,
  GearSix,
  MapTrifold,
  WarningCircle,
  CheckCircle,
  Info,
  House,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import { useApp } from "../state/AppContext";
import { UNIT_STATUS } from "../lib/status";

const NAV: Array<[string, string, ReactNode]> = [
  ["/inicio", "Inicio", <House key="h" size={24} aria-hidden="true" />],
  ["/mision", "Misión", <Fire key="f" size={24} aria-hidden="true" />],
  ["/mapa", "Mapa", <MapTrifold key="m" size={24} aria-hidden="true" />],
  ["/mensajes", "Chat", <ChatCircle key="c" size={24} aria-hidden="true" />],
  ["/ajustes", "Ajustes", <GearSix key="g" size={24} aria-hidden="true" />],
];

export default function Shell({ children, fullBleed = false }: { children: ReactNode; fullBleed?: boolean }) {
  const { unit, user, mission, alerts, unreadChat, connected, online, queue, notices, enterLogin } = useApp();
  const status = unit ? UNIT_STATUS[unit.status] : null;
  // El bombero sin unidad no conduce ni tiene chat con la central
  const nav = unit ? NAV : NAV.filter(([to]) => to !== "/mision" && to !== "/mensajes");

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* Cabecera cockpit */}
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-panel px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            {unit ? (
              <span className="display text-2xl font-bold leading-none tracking-[0.08em]">{unit.code}</span>
            ) : (
              /* Marca al estilo VIPER: la «M» con acento verde del mark original */
              <span className="display text-2xl font-bold leading-none tracking-[0.08em]">
                Fuego<span className="text-ok">Map</span>
              </span>
            )}
            {status ? (
              <span
                className="pill"
                style={{ color: `var(${status.varName})` }}
                title={`Estado puesto por: ${unit?.statusSource}`}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: `var(${status.varName})` }}
                  aria-hidden="true"
                />
                {status.label}
              </span>
            ) : (
              <span className="pill text-rescue" title="Información abierta para los bomberos de la compañía">
                Vista de bomberos
              </span>
            )}
          </div>
          <div className="truncate text-[11.5px] text-mut">
            {unit
              ? `${unit.name}${unit.station ? ` · ${unit.station}` : ""}`
              : user
                ? `${user.name} · alertas de todas las emergencias`
                : "Alertas de todas las emergencias"}
          </div>
        </div>
        <div className="flex-1" />
        {!unit && (
          <button
            className="btn shrink-0 px-2.5 py-1.5 text-[12px]"
            onClick={enterLogin}
            title="Ingresa con tu clave para ver la misión completa"
          >
            🚒 Chofer
          </button>
        )}
        <div className="flex items-center gap-2" role="status" aria-label="Estado de conexión">
          {queue.pending + queue.errors > 0 && (
            <span className="pill text-crash" title="Cambios guardados sin enviar">
              ↑ {queue.pending + queue.errors} pend.
            </span>
          )}
          {!online ? (
            <span className="pill text-crash anim-blink">Sin señal</span>
          ) : connected ? (
            <span className="pill text-ok">
              <span className="inline-block h-2 w-2 rounded-full bg-ok" aria-hidden="true" /> En línea
            </span>
          ) : (
            <span className="pill text-crash">Reconectando…</span>
          )}
        </div>
      </header>

      {/* Contenido */}
      <main className={cx("min-h-0 flex-1", fullBleed ? "relative overflow-hidden" : "overflow-y-auto p-3")}>
        {children}
      </main>

      {/* Avisos */}
      <div
        className="pointer-events-none fixed inset-x-3 top-3 z-50 flex flex-col items-center gap-2"
        aria-live="polite"
      >
        {notices.map((n) => (
          <div
            key={n.id}
            className={cx(
              "pointer-events-auto flex w-full max-w-md items-center gap-2.5 rounded-xl border bg-panel px-3.5 py-3 text-[14.5px] font-semibold shadow-lg",
              n.tone === "error" && "spine-danger border-danger/50 text-danger",
              n.tone === "success" && "spine-ok border-ok/50 text-ok",
              n.tone === "info" && "spine-mut text-tx",
            )}
          >
            {n.tone === "error" ? (
              <WarningCircle size={19} aria-hidden="true" />
            ) : n.tone === "success" ? (
              <CheckCircle size={19} aria-hidden="true" />
            ) : (
              <Info size={19} aria-hidden="true" />
            )}
            {n.text}
          </div>
        ))}
      </div>

      {/* Navegación inferior */}
      <nav
        className="grid shrink-0 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)]"
        style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
        aria-label="Secciones"
      >
        {nav.map(([to, label, icon]) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cx(
                "mx-1 my-1 flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-[12px] font-bold tracking-[0.1em] uppercase no-underline",
                isActive ? "bg-panel3 text-fire" : "text-mut",
              )
            }
          >
            {icon}
            <span className="flex items-center gap-1.5">
              {label}
              {to === "/mision" && mission && (
                <span className="inline-block h-2 w-2 rounded-full bg-fire anim-blink" aria-label="Misión activa" />
              )}
              {to === "/mapa" && alerts.length > 0 && (
                <span className="inline-block h-2 w-2 rounded-full bg-fire anim-blink" aria-label="Emergencias activas" />
              )}
              {to === "/mensajes" && unreadChat > 0 && (
                <span className="inline-block h-2 w-2 rounded-full bg-fire anim-blink" aria-label="Mensajes sin leer" />
              )}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
