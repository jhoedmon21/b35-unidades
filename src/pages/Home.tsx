// Pantalla 2 — Inicio: la MISIÓN es el hero (si la hay); debajo, el
// estado de la unidad en números grandes y los 5 botones del conductor.

import { Link } from "react-router-dom";
import { EmergencyAlertCard } from "./EmergencyAlert";
import type { ReactNode } from "react";
import {
  ArrowRight,
  CheckCircle,
  Fire,
  NavigationArrow,
  Prohibit,
  Siren,
  ArrowUUpLeft,
} from "@phosphor-icons/react";
import { cx } from "../lib/cx";
import { INCIDENT_STATUS_LABEL, SEVERITY_LABEL, UNIT_STATUS, incidentKind } from "../lib/status";
import { useApp } from "../state/AppContext";
import type { UnitStatus } from "../lib/types";

const BUTTONS: Array<{
  status: UnitStatus;
  icon: ReactNode;
  primary?: boolean;
  border: string;
}> = [
  { status: "disponible", icon: <CheckCircle size={22} aria-hidden="true" />, border: "border-ok/60 text-ok" },
  { status: "en_ruta", icon: <NavigationArrow size={22} aria-hidden="true" />, primary: true, border: "border-crash/60 text-crash" },
  { status: "en_escena", icon: <Fire size={22} weight="fill" aria-hidden="true" />, primary: true, border: "border-fire/60 text-fire" },
  { status: "regresando", icon: <ArrowUUpLeft size={22} aria-hidden="true" />, border: "border-hydrant/60 text-hydrant" },
  { status: "fuera_servicio", icon: <Prohibit size={22} aria-hidden="true" />, border: "border-mut/50" },
];

export default function Home() {
  const { unit, user, mission, alerts, activeAlert, queue, online, setStatus, acceptMission, busy, enterLogin } = useApp();

  // ---------- Vista de bomberos SIN sesión: emergencias activas, sin clave ----------
  if (!unit) {
    // La emergencia más reciente SE MUESTRA directamente acá (tarjeta con
    // mapa e hidrantes); si es nueva (≤10 min) enciende la sirena.
    const topAlert = [...alerts].sort((a, b) => b.id - a.id)[0] ?? null;
    return (
      <div className="mx-auto max-w-xl space-y-4">
        {/* La alerta llevó directa en la sección: la más reciente arriba */}
        {topAlert && (
          <EmergencyAlertCard alert={topAlert} fresh={topAlert.id === activeAlert?.id} />
        )}

        <div className="card spine-fire p-4">
          <div className="flex items-center gap-3">
            <Siren size={34} weight="duotone" className="text-fire" aria-hidden="true" />
            <div>
              <div className="tag" style={{ color: "var(--fire)" }}>
                {user?.name ?? "Vista de bomberos"} · sin clave
              </div>
              <div className="display text-[20px] leading-tight font-bold">
                {alerts.length > 0 ? `${alerts.length} emergencia(s) activa(s)` : "Sin emergencias activas"}
              </div>
            </div>
          </div>
        </div>

        {alerts.map((inc) => {
          const kind = incidentKind(inc.title);
          const severity = SEVERITY_LABEL[inc.severity] ?? SEVERITY_LABEL.alta;
          return (
            <Link
              key={inc.id}
              to={`/mapa?incident=${inc.id}`}
              className="card spine-mut block p-4 no-underline"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl" aria-hidden="true">{kind.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="display truncate text-[18px] font-bold">{inc.title}</div>
                  <div className="truncate text-[13px] text-mut">{inc.address}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className="pill" style={{ color: `var(${severity.varName})` }}>
                      Prioridad {severity.label}
                    </span>
                    <span className="pill text-mut">{INCIDENT_STATUS_LABEL[inc.status] ?? inc.status}</span>
                    {inc.unitCode && <span className="pill text-rescue">Unidad {inc.unitCode}</span>}
                  </div>
                </div>
                <ArrowRight size={20} className="shrink-0 text-mut" aria-hidden="true" />
              </div>
            </Link>
          );
        })}

        {alerts.length === 0 && (
          <div className="card spine-mut p-4 text-center text-[15px] text-mut">
            Cuando la central registre una emergencia, sonará la alerta aquí y verás
            el mapa del accidente con sus datos básicos.
          </div>
        )}

        <section className="grid grid-cols-2 gap-2.5">
          <Link to="/mapa" className="card spine-hydrant col-span-2 p-4 no-underline">
            <div className="tag text-mut">Mapa de la zona</div>
            <div className="display mt-1 text-[17px] font-bold text-tx">Emergencias →</div>
          </Link>
        </section>

        {/* Solo el chofer ingresa con credenciales (misión completa) */}
        <button className="btn btn-lg w-full" onClick={enterLogin}>
          🚒 Conduzco una unidad — ingresar como chofer
        </button>
      </div>
    );
  }

  const status = UNIT_STATUS[unit.status];
  const unaccepted = mission && mission.acceptedAt == null;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {/* HERO — misión activa */}
      {mission ? (
        <Link
          to="/mision"
          className={cx("card block p-4 no-underline", unaccepted ? "glow-fire spine-fire" : "spine-fire")}
        >
          <div className="flex items-center gap-3">
            <Siren
              size={36}
              weight={unaccepted ? "duotone" : "regular"}
              className={cx("shrink-0", unaccepted && "anim-blink")}
              style={{ color: "var(--fire)" }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="tag" style={{ color: "var(--fire)" }}>Misión en curso</div>
              <div className="display truncate text-[22px] leading-tight font-bold">{mission.title}</div>
              <div className="text-[13px] text-mut">
                {mission.status === "despachado" ? "Despachada por la central" : "En el lugar"} ·{" "}
                {mission.acceptedAt ? "aceptada" : "sin aceptar"}
              </div>
            </div>
            <ArrowRight size={22} className="shrink-0 text-mut" aria-hidden="true" />
          </div>
          {unaccepted && (
            <button
              className="btn btn-primary btn-lg mt-3 w-full"
              disabled={busy.accept}
              onClick={(e) => {
                e.preventDefault();
                void acceptMission();
              }}
            >
              Aceptar despacho
            </button>
          )}
        </Link>
      ) : (
        <div className="card spine-mut p-4 text-center text-[15px] text-mut">
          Sin misión. La central despachará aquí y con una notificación.
        </div>
      )}

      {/* Estado actual — números grandes */}
      <section className="card p-4" aria-labelledby="estado-actual">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="estado-actual" className="tag text-mut">Estado de la unidad</h2>
            <div
              className="num-hero mt-1 text-[52px]"
              style={{ color: `var(${status.varName})` }}
            >
              {status.label.toUpperCase()}
            </div>
            <div className="text-[12.5px] text-mut2">
              {unit.statusSource === "operador"
                ? "Lo puso la central"
                : unit.statusSource === "unidad"
                  ? "Lo pusiste tú"
                  : "Sincronizado"}
            </div>
          </div>
          {!online && <span className="pill text-crash">Sin señal · en cola</span>}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {BUTTONS.map(({ status: key, icon, primary, border }) => {
            const active = unit.status === key;
            return (
              <button
                key={key}
                className={cx(
                  primary ? "btn btn-lg" : "btn",
                  !active && border,
                  key === "fuera_servicio" && "col-span-2",
                )}
                style={
                  active
                    ? { background: `var(${UNIT_STATUS[key].varName})`, borderColor: `var(${UNIT_STATUS[key].varName})`, color: "#071120" }
                    : undefined
                }
                disabled={active}
                aria-pressed={active}
                onClick={() => void setStatus(key)}
              >
                {icon}
                {UNIT_STATUS[key].label}
                {active && " ✓"}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-mut2">
          Sin señal los cambios quedan en cola y se envan solos al volver la conexión.
        </p>
      </section>

      {/* Cambios pendientes */}
      {queue.pending + queue.errors > 0 && (
        <section className="card spine-crash p-4" aria-live="polite">
          <div className="tag text-crash">Sincronización</div>
          <div className="num-hero mt-1 flex items-baseline gap-3 text-[34px] text-crash">
            {queue.pending}
            <span className="text-[15px] font-semibold tracking-normal text-mut">pendiente(s) de enviar</span>
            {queue.errors > 0 && <span className="text-[15px] text-danger">· {queue.errors} con error</span>}
          </div>
          <p className="mt-1 text-[12.5px] text-mut">Revisa y reintenta desde Ajustes.</p>
        </section>
      )}

      {/* Accesos rápidos */}
      <section className="grid grid-cols-2 gap-2.5">
        <Link to="/equipo" className="card spine-hydrant p-4 no-underline">
          <div className="tag text-mut">Equipo del vehículo</div>
          <div className="display mt-1 text-[17px] font-bold text-tx">Checklist 3D →</div>
        </Link>
        <Link to="/historial" className="card spine-mut p-4 no-underline">
          <div className="tag text-mut">Historial</div>
          <div className="display mt-1 text-[17px] font-bold text-tx">Misiones atendidas →</div>
        </Link>
      </section>
    </div>
  );
}
