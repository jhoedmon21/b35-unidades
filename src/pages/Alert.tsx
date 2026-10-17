// Pantalla 3 — Alerta de despacho: pantalla completa, sirena repetitiva y
// vibración hasta que alguien toque «Aceptar». Si nadie acepta en 60 s, la
// central ya fue avisada por el servidor (evento mission_unaccepted).

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Siren } from "@phosphor-icons/react";
import { startAlarm, stopAlarm } from "../lib/alarm";
import { incidentKind, SEVERITY_LABEL } from "../lib/status";
import { fmtClock } from "../lib/format";
import { useApp } from "../state/AppContext";

const TIMEOUT_S = 60;

export default function Alert({ overlay = false }: { overlay?: boolean }) {
  const { alertMission, missionDetail, acceptMission, dismissAlert, notify } = useApp();
  const navigate = useNavigate();
  const [left, setLeft] = useState(TIMEOUT_S);

  useEffect(() => {
    startAlarm();
    return () => stopAlarm();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  if (!alertMission) return null;

  const detail = missionDetail?.incident?.id === alertMission.id ? missionDetail : null;
  const kind = incidentKind(detail?.incident.title ?? alertMission.title);
  const severity = SEVERITY_LABEL[detail?.incident.severity ?? "alta"];

  async function accept() {
    stopAlarm();
    await acceptMission();
    dismissAlert();
    notify("Despacho aceptado — buena respuesta", "success");
    navigate("/mision");
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex flex-col"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--fire) 28%, var(--bg)) 0%, var(--bg) 70%)",
      }}
      role="alertdialog"
      aria-modal="true"
      aria-label="Nuevo despacho"
    >
      <div className="pt-6 text-center">
        <Siren size={64} weight="duotone" className="mx-auto text-fire anim-blink" aria-hidden="true" />
        <h1 className="display mt-2 text-[46px] leading-none font-bold tracking-[0.16em] text-fire">
          DESPACHO
        </h1>
        <p className="tag mt-1 text-mut">Toca Aceptar para responder</p>
      </div>

      <div className="mx-auto mt-4 w-full max-w-lg flex-1 px-4">
        <div className="card p-5">
          <div className="flex items-center justify-center gap-3">
            <span className="pill" style={{ color: `var(${kind.varName})` }}>
              {kind.icon} {kind.label}
            </span>
            <span className="pill" style={{ color: `var(${severity.varName})` }}>
              Prioridad {severity.label}
            </span>
          </div>
          <h2 className="display mt-3 text-center text-2xl font-bold">{alertMission.title}</h2>
          {detail && (
            <>
              <p className="mt-2 flex items-center justify-center gap-2 text-[15px] text-tx">
                <MapPin size={18} className="text-fire" aria-hidden="true" />
                {detail.incident.address}
              </p>
              <p className="mt-1 text-center text-[13px] text-mut">
                Reportado {fmtClock(detail.incident.createdAt)} · fotos y detalles al aceptar
              </p>
            </>
          )}
        </div>

        <p className="mt-3 text-center text-[13px] text-mut" aria-live="polite">
          {left > 0 ? (
            <>
              La central será avisada si nadie acepta en{" "}
              <span className="num-hero text-[22px] text-fire">{left} s</span>
            </>
          ) : (
            <span className="text-crash font-semibold">Se avisó a la central que nadie aceptó el despacho</span>
          )}
        </p>
      </div>

      <div className="sticky bottom-0 space-y-3 border-t border-line bg-panel/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <button className="btn btn-primary btn-lg w-full text-xl" onClick={() => void accept()}>
          ACEPTAR DESPACHO
        </button>
        {overlay && (
          <button className="btn w-full" onClick={dismissAlert}>
            Ver sin aceptar (mantiene la alerta sonando en 2.º plano…)
          </button>
        )}
      </div>
    </div>
  );
}
