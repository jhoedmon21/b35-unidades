// Alerta de emergencia para TODOS los bomberos que tengan la app.
// - EmergencyAlertCard: tarjeta de la emergencia (datos básicos, mini-mapa
//   e hidrantes cercanos). Se usa INLINE en Inicio y DENTRO del modal;
//   el detalle completo (fotos, ruta, bitácora) lo ve el chofer con
//   credenciales en su misión asignada.
// - EmergencyAlert (default): el modal a pantalla completa para retomar la
//   atención desde cualquier otra pestaña; en /inicio la tarjeta inline lo
//   reemplaza para no tapar la sección.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Siren } from "@phosphor-icons/react";
import SceneMap from "../components/SceneMap";
import { db } from "../db/db";
import { fmtClock, fmtDistance, hydrantLabel, timeAgo } from "../lib/format";
import { hydrantHtml, hydrantName } from "../lib/markers";
import { haversineM } from "../lib/osrm";
import { INCIDENT_STATUS_LABEL, SEVERITY_LABEL, incidentKind } from "../lib/status";
import type { BasicIncidentDTO, HydrantDTO } from "../lib/types";
import { useApp } from "../state/AppContext";

/** Tarjeta de una emergencia para TODOS los bomberos (datos básicos) */
export function EmergencyAlertCard({ alert, fresh = false }: { alert: BasicIncidentDTO; fresh?: boolean }) {
  const { ackAlert } = useApp();
  const navigate = useNavigate();
  const [near, setNear] = useState<Array<HydrantDTO & { meters: number }>>([]);
  const [now, setNow] = useState(() => Date.now());

  // Reloj para «hace X min» vivo
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Hidrantes cercanos a la escena (desde el sync local, funciona offline)
  useEffect(() => {
    let cancelled = false;
    void db.hydrants.toArray().then((all) => {
      if (cancelled) return;
      setNear(
        all
          .map((h) => ({
            ...h,
            meters: Math.round(haversineM({ lat: alert.lat, lng: alert.lng }, h)),
          }))
          .filter((h) => h.meters <= 1200)
          .sort((a, b) => a.meters - b.meters)
          .slice(0, 4),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [alert.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const markers = useMemo(
    () =>
      near.map((h, i) => ({
        id: `hyd-${h.id}`,
        lat: h.lat,
        lng: h.lng,
        html: hydrantHtml(h.situation, h.situation === "operativo" ? String(i + 1) : undefined),
        label: hydrantName(h.code, h.id, h.situation),
      })),
    [near],
  );

  const kind = incidentKind(alert.title);
  const severity = SEVERITY_LABEL[alert.severity] ?? SEVERITY_LABEL.alta;
  const statusLabel = INCIDENT_STATUS_LABEL[alert.status] ?? alert.status;

  function goToMap() {
    ackAlert(alert.id);
    navigate(`/mapa?incident=${alert.id}`);
  }

  return (
    <div className={fresh ? "card spine-fire p-3" : "card p-3"}>
      <div className="flex items-center gap-2.5">
        <Siren
          size={26}
          weight="duotone"
          className={fresh ? "text-fire anim-blink" : "text-fire"}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <div className="tag text-fire">
            {fresh ? "EMERGENCIA NUEVA · SIRENA SONANDO" : "EMERGENCIA ACTIVA"}
          </div>
          <div className="truncate text-[15px] font-bold">{alert.title}</div>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="pill" style={{ color: `var(${kind.varName})` }}>
          {kind.icon} {kind.label}
        </span>
        <span className="pill" style={{ color: `var(${severity.varName})` }}>
          Prioridad {severity.label}
        </span>
        <span className="pill text-mut">{statusLabel}</span>
        {alert.unitCode && <span className="pill text-rescue">Unidad {alert.unitCode}</span>}
      </div>

      <p className="mt-2 flex items-start gap-2 text-[13.5px] text-tx">
        <MapPin size={16} className="mt-0.5 shrink-0 text-fire" aria-hidden="true" />
        {alert.address}
      </p>
      <p className="mt-1 text-[12px] text-mut">
        Reportado {timeAgo(alert.createdAt, now)} · {fmtClock(alert.createdAt)}
      </p>

      {/* Mapa de la escena con hidrantes cercanos (datos básicos, sin ruta) */}
      <div className="mt-2.5 overflow-hidden rounded-xl border border-line">
        <div className="h-[200px] w-full">
          <SceneMap center={{ lat: alert.lat, lng: alert.lng }} title={alert.title} markers={markers} zoom={15} />
        </div>
        <div className="border-t border-line bg-panel2 px-3 py-2">
          <div className="tag text-mut">Hidrantes cerca de la escena</div>
          {near.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {near.map((h, i) => (
                <span key={h.id} className="pill text-hydrant">
                  {h.situation === "operativo" ? `${i + 1} · ` : ""}
                  {hydrantLabel(h.code) ?? `Hidrante #${h.id}`} · {fmtDistance(h.meters)}
                  {h.situation !== "operativo" ? " ⚠" : ""}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[12.5px] text-mut">Ninguno registrado a menos de 1.2 km.</p>
          )}
        </div>
      </div>

      {fresh && (
        <p className="mt-2 text-center text-[12px] leading-relaxed text-mut2">
          El chofer de la unidad asignada ve todos los datos ingresando sus credenciales.
        </p>
      )}

      <div className="mt-2.5 grid grid-cols-1 gap-2">
        <button
          className={fresh ? "btn btn-primary btn-lg" : "btn"}
          onClick={goToMap}
        >
          {fresh ? "🚨 VER EN EL MAPA" : "Ver en el mapa"}
        </button>
        {fresh && (
          <button className="btn" onClick={() => ackAlert(alert.id)}>
            Entendido (silenciar sirena)
          </button>
        )}
      </div>
    </div>
  );
}

/** Modal a pantalla completa en las demás secciones (manuel /inicio usa la tarjeta inline) */
export default function EmergencyAlert() {
  const { activeAlert, user } = useApp();

  if (!activeAlert) return null;

  return (
    <div
      className="fixed inset-0 z-[1500] flex flex-col overflow-y-auto"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--fire) 24%, var(--bg)) 0%, var(--bg) 70%)",
      }}
      role="alertdialog"
      aria-modal="true"
      aria-label="Emergencia activa"
    >
      <div className="pt-4 text-center">
        <Siren size={44} weight="duotone" className="mx-auto text-fire anim-blink" aria-hidden="true" />
        <h1 className="display mt-1 text-3xl font-bold tracking-[0.16em] text-fire">EMERGENCIA</h1>
        <p className="tag mt-1 text-mut">Alerta para todos los bomberos · toca una acción</p>
      </div>

      <div className="mx-auto mt-2 w-full max-w-lg flex-1 space-y-2.5 px-4 pb-2">
        <EmergencyAlertCard alert={activeAlert} fresh />
        <p className="px-2 text-center text-[12px] leading-relaxed text-mut2">
          {user?.role === "unidad"
            ? "La ruta completa, el ETA y los riesgos del camino se ven al aceptar tu despacho."
            : "Vista de bomberos sin clave — ingresa tus credenciales de chofer para desbloquear la misión completa."}
        </p>
      </div>
    </div>
  );
}
