// Pantalla 4 — Misión: descripción, fotos del reporte (zoom), riesgos
// conocidos, otras unidades, llamada al despachador y navegación EN EL
// mapa propio de la app (modo conducción de /mapa con ?nav=1).
// Pantalla 8 (primera versión) — cierre con resultado, heridos, observaciones
// y foto; se guarda local si no hay señal (cola con opId).

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  MapPin,
  NavigationArrow,
  PhoneCall,
  WarningDiamond,
  X,
} from "@phosphor-icons/react";
import { api, ApiError } from "../lib/api";
import { fmtClock, fmtDistance, timeAgo } from "../lib/format";
import { newOpId } from "../lib/op";
import { incidentKind, SEVERITY_LABEL, UNIT_STATUS } from "../lib/status";
import { useApp } from "../state/AppContext";
import type { UnitStatus } from "../lib/types";
import { enqueueOp } from "../db/queue";
import { getMeta } from "../db/db";

const RESULTS: Array<[string, string]> = [
  ["controlado", "Emergencia controlada"],
  ["sin_novedad", "Sin novedad al llegar"],
  ["falsa_alarma", "Falsa alarma"],
  ["derivado", "Derivada a otra unidad"],
];

export default function Mission() {
  const { mission, missionDetail, unit, online, setStatus, notify, refreshMe, refreshMission } = useApp();

  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null);
  const [dispatchPhone, setDispatchPhone] = useState("");
  const [closing, setClosing] = useState(false);
  const [result, setResult] = useState("controlado");
  const [injured, setInjured] = useState("0");
  const [observations, setObservations] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [sendBusy, setSendBusy] = useState(false);

  const incident = missionDetail?.incident ?? null;
  const kind = useMemo(() => incidentKind(incident?.title ?? ""), [incident?.title]);

  // Teléfono de la central (del sync guardado en la tablet; vacío → 116)
  useEffect(() => {
    if (!missionDetail) return;
    void getMeta<{ dispatcherPhone?: string }>("syncConfig").then((config) => {
      setDispatchPhone(config?.dispatcherPhone ?? "");
    });
  }, [missionDetail]);

  if (!mission || !incident) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="card p-6 text-center text-mut">
          No hay misión activa. Cuando la central despache a tu unidad verás la alerta aquí.
        </div>
        <div className="mt-3 text-center">
          <Link to="/inicio" className="btn">← Inicio</Link>
        </div>
      </div>
    );
  }

  const severity = SEVERITY_LABEL[incident.severity] ?? SEVERITY_LABEL.alta;

  async function submitClose() {
    if (!incident) return;
    setSendBusy(true);
    const opId = newOpId();
    const body = {
      result,
      injured: Math.max(0, Number(injured) || 0),
      observations: observations.trim() || undefined,
      photoBase64: photo ?? undefined,
      opId,
    };
    try {
      try {
        await api.post(`/api/missions/${incident.id}/close`, body);
        notify("Misión cerrada — la central fue informada", "success");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) throw e;
        // Sin señal: cierre a la cola, se envía solo
        await enqueueOp({
          opId,
          kind: "close_mission",
          url: `/api/missions/${incident.id}/close`,
          method: "POST",
          body,
        });
        notify("Cierre guardado sin señal — se enviará al volver la conexión", "info");
      }
      setClosing(false);
      await Promise.all([refreshMe(), refreshMission()]);
      if (unit && unit.status !== "disponible") await setStatus("disponible");
    } catch {
      notify("No se pudo cerrar la misión", "error");
    } finally {
      setSendBusy(false);
    }
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {/* Resumen */}
      <section className="card spine-fire overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <span className="pill" style={{ color: `var(${kind.varName})` }}>
            {kind.icon} {kind.label}
          </span>
          <span className="pill" style={{ color: `var(${severity.varName})` }}>
            Prioridad {severity.label}
          </span>
          <span className="ml-auto font-mono text-[12px] text-mut">
            {fmtClock(incident.createdAt)} · {timeAgo(incident.createdAt)}
          </span>
        </div>
        <div className="p-4">
          <h1 className="display text-2xl font-bold">{incident.title}</h1>
          <p className="mt-1 flex items-start gap-2 text-[15px] text-tx">
            <MapPin size={19} className="mt-0.5 shrink-0 text-fire" aria-hidden="true" />
            {incident.address}
          </p>
          {incident.notes && <p className="mt-3 text-[14px] leading-relaxed text-mut">{incident.notes}</p>}
          <p className="mt-2 text-[12.5px] text-mut2">
            Reportante: {incident.reporterName ?? "ciudadano"} ·{" "}
            {missionDetail?.reporterPhoneMasked || "teléfono oculto"}
          </p>
        </div>

        {/* Foto del reporte con zoom */}
        {incident.photoUrl && (
          <button
            className="block w-full border-t border-line"
            onClick={() => setZoomPhoto(incident.photoUrl)}
            aria-label="Ampliar foto del reporte"
          >
            <img src={incident.photoUrl} alt="Foto enviada por el ciudadano" className="max-h-72 w-full object-cover" />
          </button>
        )}
      </section>

      {/* Riesgos conocidos */}
      {missionDetail && missionDetail.risks.length > 0 && (
        <section className="card spine-crash p-4">
          <h2 className="tag mb-2 flex items-center gap-1.5 text-crash">
            <WarningDiamond size={15} aria-hidden="true" /> Riesgos conocidos cerca
          </h2>
          <ul className="space-y-1.5 text-[14px]">
            {missionDetail.risks.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{r.name}</span>
                <span className="font-mono text-[12px] text-mut">{fmtDistance(r.meters)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Otras unidades */}
      {missionDetail && missionDetail.otherUnits.length > 0 && (
        <section className="card spine-mut p-4">
          <h2 className="tag mb-2 text-mut">Otras unidades en la calle</h2>
          <ul className="flex flex-wrap gap-2">
            {missionDetail.otherUnits.map((u) => (
              <li
                key={u.code}
                className="pill"
                style={{ color: `var(${UNIT_STATUS[u.status]?.varName ?? "--mut"})` }}
              >
                {u.code} — {UNIT_STATUS[u.status]?.label ?? u.status}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Hidrantes cercanos (lista — el mapa llega en la etapa 3) */}
      {missionDetail && missionDetail.hydrants.length > 0 && (
        <section className="card spine-hydrant p-4">
          <h2 className="tag mb-2 text-hydrant">Hidrantes cercanos</h2>
          <ol className="space-y-1.5 text-[14px]">
            {missionDetail.hydrants.slice(0, 3).map((h, i) => (
              <li key={h.id} className="flex items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-hydrant/60 font-mono font-bold text-hydrant">
                  {i + 1}
                </span>
                <span className="flex-1 truncate">{h.code ?? `Hidrante #${h.id}`}</span>
                <span className="font-mono text-[13px] text-mut">{fmtDistance(h.meters)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Cambio de estado rápido */}
      <section className="card spine-mut p-4">
        <h2 className="tag mb-2 text-mut">Estado de la unidad</h2>
        <div className="grid grid-cols-3 gap-2">
          {(["en_ruta", "en_escena", "regresando"] as UnitStatus[]).map((s) => (
            <button
              key={s}
              className={unit?.status === s ? "btn btn-primary" : "btn"}
              disabled={unit?.status === s}
              onClick={() => void setStatus(s)}
            >
              {UNIT_STATUS[s].label}
            </button>
          ))}
        </div>
      </section>

      {/* Cierre de misión */}
      <section className="card spine-ok p-4">
        {closing ? (
          <div className="space-y-3">
            <h2 className="tag text-mut">Cerrar misión</h2>
            <label className="block">
              <span className="tag text-mut">Resultado</span>
              <select className="input mt-1" value={result} onChange={(e) => setResult(e.target.value)}>
                {RESULTS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="tag text-mut">Heridos</span>
              <input
                className="input mt-1"
                type="number"
                inputMode="numeric"
                min={0}
                max={999}
                value={injured}
                onChange={(e) => setInjured(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="tag text-mut">Observaciones</span>
              <textarea
                className="input mt-1 min-h-20"
                maxLength={600}
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="Qué se hizo, estado del lugar, recomendaciones…"
              />
            </label>
            <label className="block">
              <span className="tag text-mut">Foto (opcional)</span>
              <input className="input mt-1" type="file" accept="image/*" capture="environment" onChange={onPhoto} />
            </label>
            {photo && <img src={photo} alt="Foto del cierre" className="max-h-40 rounded-lg border border-line" />}
            <div className="grid grid-cols-2 gap-2">
              <button className="btn" onClick={() => setClosing(false)}>Cancelar</button>
              <button className="btn btn-primary" disabled={sendBusy} onClick={() => void submitClose()}>
                {sendBusy ? "Enviando…" : online ? "Cerrar misión" : "Guardar sin señal"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="tag mb-2 text-mut">¿Terminaste?</h2>
            <button className="btn w-full" onClick={() => setClosing(true)}>
              Cerrar misión y reportar
            </button>
          </>
        )}
      </section>

      {/* Contacto y navegación */}
      <section className="grid grid-cols-2 gap-3">
        <a
          className="btn btn-lg"
          href={dispatchPhone ? `tel:${dispatchPhone}` : "tel:116"}
          aria-label="Llamar al despachador"
        >
          <PhoneCall size={22} aria-hidden="true" /> Llamar central
        </a>
        <Link
          className="btn btn-lg btn-primary"
          to={`/mapa?incident=${incident.id}&nav=1`}
          aria-label="Navegar en el mapa de la app"
        >
          <NavigationArrow size={22} aria-hidden="true" /> Navegar
        </Link>
      </section>

      {/* Zoom de foto */}
      {zoomPhoto && (
        <div
          className="fixed inset-0 z-[2100] grid place-items-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Foto ampliada"
          onClick={() => setZoomPhoto(null)}
        >
          <img src={zoomPhoto} alt="Foto ampliada" className="max-h-full max-w-full object-contain" />
          <button className="btn absolute top-4 right-4" aria-label="Cerrar foto">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
