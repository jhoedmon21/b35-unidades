// ============================================================
//  Paneles flotantes de la cabina — TODO lo que antes eran ventanas
//  independientes (Chat, Detalle de emergencia, Ficha del edificio,
//  Cierre de misión, Ajustes) vive AHORA sobre el mapa de /mapa:
//  una sola ventana, el mapa manda.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BellRinging,
  DownloadSimple,
  MapPin,
  Megaphone,
  Microphone,
  PaperPlaneTilt,
  Power,
  Siren,
  Stop,
  WifiHigh,
  X,
} from "@phosphor-icons/react";
import { api, ApiError } from "../lib/api";
import { testAlarm } from "../lib/alarm";
import { usePwaUpdate } from "../lib/pwa";
import { ensurePushSubscription, ensurePushSubscriptionPublic, permissionState } from "../lib/push";
import { enqueueOp, listQueue } from "../db/queue";
import { db, getMeta } from "../db/db";
import { newOpId } from "../lib/op";
import { fmtClock, fmtDistance, fmtMinutes, timeAgo } from "../lib/format";
import { incidentKind, SEVERITY_LABEL } from "../lib/status";
import { cx } from "../lib/cx";
import { useApp } from "../state/AppContext";
import type { EquipmentItemDTO, MissionPayload } from "../lib/types";

/* ---------- Marco común de panel flotante ---------- */

interface SheetProps {
  title: string;
  onClose: () => void;
  side?: "left" | "right";
  children: React.ReactNode;
}

function Sheet({ title, onClose, side = "right", children }: SheetProps) {
  return (
    <div
      className={cx(
        "absolute inset-y-2 z-[1010] flex w-[340px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl",
        side === "right" ? "right-2" : "left-2",
      )}
      role="dialog"
      aria-label={title}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <span className="display text-[14px] font-bold uppercase tracking-wider">{title}</span>
        <button className="btn btn-sm px-2 py-1" onClick={onClose} aria-label={`Cerrar ${title}`}>
          <X size={14} aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">{children}</div>
    </div>
  );
}

/* ---------- Zoom de fotos (compartido) ---------- */

function ZoomModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[2100] grid place-items-center bg-black/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Foto ampliada"
      onClick={onClose}
    >
      <img src={url} alt="Foto ampliada" className="max-h-full max-w-full object-contain" />
    </div>
  );
}

/** Fila de la ficha del edificio (se oculta si el dato no está precargado) */
function Row({ label, value }: { label: string; value: string | null }) {
  if (!value?.trim()) return null;
  return (
    <li>
      <span className="text-mut2">{label}: </span>
      <span>{value}</span>
    </li>
  );
}

/* ---------- CHAT con la central (antes /mensajes) ---------- */

export function ChatSheet({ onClose }: { onClose: () => void }) {
  const { chat, refreshChat, sendChatMsg, sendVoiceMsg, callUrgent, markChatSeen, notify, unreadChat } = useApp();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // ---------- Nota de voz del chofer + «Llamar» a la central ----------
  const chunksRef = useRef<Blob[]>([]);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const secsRef = useRef(0);
  const urgentNextRef = useRef(false);
  const [recSecs, setRecSecs] = useState<number | null>(null);

  // ---------- Avisos «NUEVO»: mensajes de la central sin leer ----------
  // Cuántos avisos llegaron antes de abrir el chat (se captura ANTES de
  // markChatSeen para poder marcarlos con la etiqueta NUEVO).
  const [initialUnread] = useState(unreadChat);
  // Mensajes que llegan MIENTRAS el chat está abierto: destello también
  const flashRef = useRef<number | null>(null);
  const [flashIds, setFlashIds] = useState<ReadonlySet<number>>(() => new Set());
  useEffect(() => {
    const last = (chat ?? []).filter((m) => m.from === "central").at(-1)?.id ?? null;
    if (last != null && flashRef.current != null && last !== flashRef.current) {
      setFlashIds((s) => new Set(s).add(last));
    }
    if (last != null) flashRef.current = last;
  }, [chat]);
  const newIds = useMemo(() => {
    const central = (chat ?? []).filter((m) => m.from === "central");
    return new Set(central.slice(-initialUnread).map((m) => m.id));
  }, [chat, initialUnread]);

  useEffect(() => {
    void refreshChat();
    markChatSeen();
  }, [refreshChat, markChatSeen]);

  // Vuelve a marcar visto al cerrar por si quedaron avisos en transito
  useEffect(() => () => markChatSeen(), [markChatSeen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [chat?.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    const ok = await sendChatMsg(body);
    setBusy(false);
    if (ok) setDraft("");
  }

  const stopRec = useCallback(() => {
    try {
      if (recRef.current?.state === "recording") recRef.current.stop();
    } catch {
      /* ya parada */
    }
  }, []);

  const startRec = useCallback(async () => {
    try {
      if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Este navegador no soporta grabar audio");
      }
      const mimeList = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
      const mime = mimeList.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      secsRef.current = 0;
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime || "audio/webm" });
        const urgent = urgentNextRef.current;
        urgentNextRef.current = false;
        setRecSecs(null);
        recRef.current = null;
        void sendAudioBlob(blob, urgent);
      };
      rec.start();
      recRef.current = rec;
      setRecSecs(0);
    } catch {
      urgentNextRef.current = false;
      notify("No se pudo usar el micrófono", "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cronómetro + corte a los 90 s
  useEffect(() => {
    if (recSecs == null) return;
    const id = window.setInterval(() => {
      secsRef.current = secsRef.current + 1;
      if (secsRef.current >= 90) stopRec();
      else setRecSecs(secsRef.current);
    }, 1000);
    return () => window.clearInterval(id);
  }, [recSecs, stopRec]);

  async function sendAudioBlob(blob: Blob, urgent: boolean) {
    setBusy(true);
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      const mime = (blob.type || "audio/webm").split(";")[0];
      const ok = await sendVoiceMsg(`data:${mime};base64,${btoa(bin)}`, urgent, draft.trim());
      if (ok) setDraft("");
    } finally {
      setBusy(false);
    }
  }

  function callCentral() {
    if (recSecs != null) {
      // Grabación en curso → la nota se envía como LLAMADO urgente
      urgentNextRef.current = true;
      stopRec();
      return;
    }
    void callUrgent(draft.trim());
  }

  return (
    <Sheet title="Chat · Central" onClose={onClose}>
      {/* Aviso dentro del propio chat mientras haya mensajes nuevos */}
      {(initialUnread > 0 || flashIds.size > 0) && (
        <div className="chat-alert-bar" role="status">
          <Siren size={14} weight="fill" aria-hidden="true" />
          La central te escribió — responde aquí abajo
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-line bg-panel2 p-2.5">
        {!chat && <p className="text-[13px] text-mut">Cargando mensajes…</p>}
        {chat?.length === 0 && (
          <p className="text-[13px] text-mut">Sin mensajes. Escribe a la central — la respuesta llega aqui al instante.</p>
        )}
        {chat?.map((m) => {
          // AUDIO:<url> = nota de voz · LLAMADA:<url> = llamado urgente
          const audioUrl = m.body.startsWith("AUDIO:") ? m.body.slice(6) : null;
          const callRest = m.body.startsWith("LLAMADA:") ? m.body.slice(8) : null;
          const callUrl = callRest?.startsWith("/api/media/") ? callRest : null;
          const callCaption = callRest && !callUrl ? callRest.trim() : null;
          const isVoice = audioUrl != null || callRest != null;
          const own = m.from === "unidad";
          const isNew = !own && (newIds.has(m.id) || flashIds.has(m.id));
          const hora = new Date(m.at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
          // Cuerpo (texto o nota de voz) — igual para ambos lados
          const body = isVoice ? (
            <>
              <p className="flex items-center gap-1.5 text-[11.5px] font-bold">
                {callRest != null ? (
                  <>
                    <Megaphone size={13} className="text-fire" aria-hidden="true" /> Llamado urgente de voz
                  </>
                ) : (
                  <>
                    <Microphone size={13} className="text-fire" aria-hidden="true" /> Nota de voz
                  </>
                )}
              </p>
              {audioUrl && (
                <audio className="mt-2 w-[240px]" controls preload="none" src={audioUrl}>
                  Tu navegador no reproduce este audio.
                </audio>
              )}
              {callUrl && (
                <audio className="mt-2 w-[240px]" controls preload="none" autoPlay src={callUrl}>
                  Tu navegador no reproduce este audio.
                </audio>
              )}
              {callCaption && <p className="mt-1 break-words whitespace-pre-wrap">{callCaption}</p>}
            </>
          ) : (
            <p className="break-words whitespace-pre-wrap">{m.body}</p>
          );
          return (
            <div key={m.id} className={cx("flex", own && "justify-end")}>
              {own ? (
                <div className="max-w-[85%] rounded-xl border border-fire/50 bg-fire/10 px-3 py-2 text-[14px] leading-snug text-tx">
                  {body}
                  <p className="mt-0.5 text-right text-[10px] text-mut" suppressHydrationWarning>
                    tú · {hora}
                  </p>
                </div>
              ) : (
                /* Mensaje de la CENTRAL: tarjeta de ALERTA — borde rojo,
                   rótulo y etiqueta «NUEVO» si acaba de llegar */
                <div className={cx("chat-msg-central", isNew && "chat-new")}>
                  <p className="chat-hd">
                    <Siren size={13} weight="fill" aria-hidden="true" />
                    Mensaje de la central
                    {isNew && <span className="chat-newpill">NUEVO</span>}
                    <span className="chat-time" suppressHydrationWarning>
                      {hora}
                    </span>
                  </p>
                  <div className="mt-1 text-[14.5px] leading-snug text-tx">{body}</div>
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={(e) => void submit(e)} className="flex shrink-0 items-center gap-2 pt-1">
        {recSecs != null ? (
          <button
            type="button"
            className="btn shrink-0 bg-fire px-3.5 py-2.5 text-white"
            onClick={stopRec}
            title="Detener la grabación y mandarla a la central"
            aria-label="Detener grabación"
          >
            <Stop size={15} weight="fill" aria-hidden="true" /> {recSecs}s
          </button>
        ) : (
          <button
            type="button"
            className="btn shrink-0 px-3 py-2.5"
            onClick={() => void startRec()}
            title="Grabar una nota de voz (toca de nuevo para mandarla)"
            aria-label="Grabar nota de voz"
            disabled={busy}
          >
            <Microphone size={16} aria-hidden="true" />
          </button>
        )}
        <input
          className="input min-w-0 flex-1 py-2.5 text-[14px]"
          placeholder="Mensaje a la central…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Escribir mensaje"
          autoComplete="off"
          maxLength={1000}
        />
        <button
          type="button"
          className="btn shrink-0 bg-fire px-3 py-2.5 text-white"
          onClick={callCentral}
          disabled={busy}
          title="Llamar por voz: la central sale con campana de atención"
        >
          <Megaphone size={16} aria-hidden="true" />
        </button>
        <button className="btn btn-primary shrink-0 px-3.5 py-2.5" type="submit" disabled={busy || !draft.trim()}>
          <PaperPlaneTilt size={16} aria-hidden="true" /> {busy ? "…" : "Enviar"}
        </button>
      </form>
    </Sheet>
  );
}

/* ---------- DETALLE de la emergencia (antes /mision · resumen) ---------- */

export function ReportSheet({ onClose }: { onClose: () => void }) {
  const { missionDetail } = useApp();
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null);
  const incident = missionDetail?.incident ?? null;
  const kind = incidentKind(incident?.title ?? "");
  const severity = SEVERITY_LABEL[incident?.severity ?? "alta"];

  return (
    <>
      <Sheet title="Emergencia" onClose={onClose} side="left">
        {!incident && <p className="text-[13px] text-mut">No hay misión activa.</p>}
        {incident && (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="pill" style={{ color: `var(${kind.varName})` }}>
                {kind.icon} {kind.label}
              </span>
              <span className="pill" style={{ color: `var(${severity.varName})` }}>
                Prioridad {severity.label}
              </span>
              <span className="pill text-mut">{fmtClock(incident.createdAt)} · {timeAgo(incident.createdAt)}</span>
            </div>
            <h2 className="display text-xl font-bold leading-tight">{incident.title}</h2>
            <p className="flex items-start gap-2 text-[14px] text-tx">
              <MapPin size={18} className="mt-0.5 shrink-0 text-fire" aria-hidden="true" />
              {incident.address}
            </p>
            {incident.notes && <p className="text-[13.5px] leading-relaxed text-mut">{incident.notes}</p>}
            <p className="text-[12.5px] text-mut2">
              Reportante: {incident.reporterName ?? "ciudadano"} ·{" "}
              {missionDetail?.reporterPhoneMasked || "teléfono oculto"}
            </p>
            {incident.photoUrl && (
              <button
                className="block w-full overflow-hidden rounded-lg border border-line"
                onClick={() => setZoomPhoto(incident.photoUrl!)}
                aria-label="Ampliar foto del reporte"
              >
                <img src={incident.photoUrl} alt="Foto del ciudadano" className="max-h-56 w-full object-cover" />
              </button>
            )}
          </>
        )}
      </Sheet>
      {zoomPhoto && <ZoomModal url={zoomPhoto} onClose={() => setZoomPhoto(null)} />}
    </>
  );
}

/* ---------- FICHA del edificio (antes /mision · preplan) ---------- */

export function FichaSheet({ onClose }: { onClose: () => void }) {
  const { missionDetail } = useApp();
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null);
  const ficha = missionDetail?.preplan ?? null;

  return (
    <>
      <Sheet title="Ficha del edificio" onClose={onClose} side="left">
        {!ficha && <p className="text-[13px] text-mut">La central adjunta la ficha cuando la escena cae a ≤300 m de un local precargado.</p>}
        {ficha && (
          <>
            <p className="text-[12px] text-mut">
              Edificio a <span className="font-mono">{fmtDistance(ficha.meters)}</span> de la escena
            </p>
            <h2 className="display text-lg font-bold leading-tight">{ficha.preplan.title}</h2>
            <p className="text-[12.5px] text-mut">{ficha.preplan.address}</p>
            <ul className="space-y-1.5 rounded-lg border border-line bg-panel2 p-2.5 text-[13.5px]">
              <Row label="Distribución (pisos, área, naves)" value={ficha.preplan.layout} />
              <Row label="Peligros previstos" value={ficha.preplan.hazards} />
              <Row label="Llaves de acceso / cortes" value={ficha.preplan.keysInfo} />
              <Row label="Puntos de agua" value={ficha.preplan.waterSources} />
              <Row label="Notas" value={ficha.preplan.notes} />
            </ul>
            {ficha.preplan.contactName && (
              <p className="border-t border-line pt-2.5 text-[13px]">
                Contacto: <span className="font-semibold">{ficha.preplan.contactName}</span>
                {ficha.preplan.contactPhone && (
                  <>
                    {" · "}
                    <a className="font-mono text-blue underline" href={`tel:${ficha.preplan.contactPhone}`}>
                      {ficha.preplan.contactPhone}
                    </a>
                  </>
                )}
              </p>
            )}
            {ficha.preplan.photos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {ficha.preplan.photos.map((url) => (
                  <button
                    key={url}
                    onClick={() => setZoomPhoto(url)}
                    className="shrink-0"
                    aria-label="Ampliar foto de la ficha"
                  >
                    <img src={url} alt="Foto del edificio" className="max-h-28 rounded-lg border border-line" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </Sheet>
      {zoomPhoto && <ZoomModal url={zoomPhoto} onClose={() => setZoomPhoto(null)} />}
    </>
  );
}

/* ---------- CIERRE de misión con formulario (antes /mision) ---------- */

const RESULTS: Array<[string, string]> = [
  ["controlado", "Emergencia controlada"],
  ["sin_novedad", "Sin novedad al llegar"],
  ["falsa_alarma", "Falsa alarma"],
  ["derivado", "Derivada a otra unidad"],
];

export function CloseSheet({ onClose }: { onClose: () => void }) {
  const { mission, missionDetail, unit, online, setStatus, notify, refreshMe, refreshMission } = useApp();
  const [result, setResult] = useState("controlado");
  const [injured, setInjured] = useState("0");
  const [observations, setObservations] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [sendBusy, setSendBusy] = useState(false);
  // Respaldo de CACHÉ (lo mismo que usa el mapa): con la misión activa pero
  // sin señal o con el detalle en vivo aún sin llegar, el formulario de
  // cierre debe abrir igual — antes decía «No hay misión activa».
  const [cachedIncident, setCachedIncident] = useState<MissionPayload["incident"] | null>(null);

  // Respaldo en orden: detalle en vivo → caché DE ESTA misión → mínimo
  // (id + título del resumen). Solo si hay misión activa — nunca resucitar
  // el cierre de una misión ya cerrada.
  const cachedMatches = mission != null && cachedIncident != null && cachedIncident.id === mission.id;
  const incident = missionDetail?.incident
    ? missionDetail.incident
    : mission
      ? cachedMatches
        ? cachedIncident
        : ({ id: mission.id, title: mission.title, address: "" } as MissionPayload["incident"])
      : null;

  useEffect(() => {
    if (!mission || missionDetail?.incident) return;
    let alive = true;
    void getMeta<MissionPayload>("missionCache").then((m) => {
      if (alive && m?.incident) setCachedIncident(m.incident);
    });
    return () => {
      alive = false;
    };
  }, [mission, missionDetail?.incident]);

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
  }

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
        await enqueueOp({ opId, kind: "close_mission", url: `/api/missions/${incident.id}/close`, method: "POST", body });
        notify("Cierre guardado sin señal — se enviará al volver la conexión", "info");
      }
      onClose();
      await Promise.all([refreshMe(), refreshMission()]);
      if (unit && unit.status !== "disponible") await setStatus("disponible");
    } catch {
      notify("No se pudo cerrar la misión", "error");
    } finally {
      setSendBusy(false);
    }
  }

  return (
    <div className="absolute inset-x-2 bottom-2 z-[1010] mx-auto max-w-md" role="dialog" aria-label="Cierre de misión">
      <div className="max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-panel p-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <span className="display text-[14px] font-bold uppercase tracking-wider">Cerrar misión</span>
          <button className="btn btn-sm px-2 py-1" onClick={onClose} aria-label="Cerrar panel">
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        {!incident && (
          <p className="pt-3 text-[13px] text-mut">No hay misión activa para cerrar.</p>
        )}
        {incident && (
          <div className="space-y-3 pt-3">
            <p className="text-[12.5px] font-semibold text-mut">
              {incident.title}
              {incident.address ? ` · ${incident.address}` : ""}
            </p>
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
              <button className="btn" onClick={onClose}>Cancelar</button>
              <button className="btn btn-primary" disabled={sendBusy} onClick={() => void submitClose()}>
                {sendBusy ? "Enviando…" : online ? "Cerrar misión" : "Guardar sin señal"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- AJUSTES (antes /ajustes) ---------- */

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { user, unit, wakeLock, queue, retryQueue, syncNow, logout, notify, mission } = useApp();
  const { needRefresh, updateServiceWorker } = usePwaUpdate();
  const [notifState, setNotifState] = useState(permissionState());
  const [queueList, setQueueList] = useState<Array<{ opId: string; kind: string; status: string; lastError?: string }>>([]);

  async function activarNotificaciones() {
    try {
      const state = unit ? await ensurePushSubscription() : await ensurePushSubscriptionPublic();
      setNotifState(permissionState());
      notify(
        state === "granted" ? "Notificaciones activadas en esta tablet" : "Permiso de notificaciones denegado",
        state === "granted" ? "success" : "error",
      );
    } catch {
      setNotifState(permissionState());
      notify("No se pudo registrar ahora — reintenta con señal", "error");
    }
  }

  async function cargarCola() {
    const entries = await listQueue();
    setQueueList(entries.filter((e) => e.status !== "enviada"));
  }

  return (
    <Sheet title="Ajustes" onClose={onClose}>
      {/* Perfil de sesión */}
      <div className="rounded-lg border border-line bg-panel2 p-3">
        <div className="text-[12px] text-mut">Conductor</div>
        <div className="text-[15px] font-bold">{user?.name ?? "Sin credenciales"}</div>
        <div className="text-[12px] text-mut">
          {unit ? `${unit.code} — ${unit.name}` : ""}
          {user ? (user.role === "jefe" ? " · Jefe de guardia" : " · Conductor") : ""}
        </div>
        <button className="btn mt-2 w-full py-2 text-danger" onClick={() => void logout()}>
          <Power size={18} aria-hidden="true" /> Cerrar sesión
        </button>
      </div>

      {/* Alertas: prueba de alarma + notificaciones */}
      <div className="space-y-2 rounded-lg border border-line bg-panel2 p-3">
        <div className="tag text-mut">Alertas</div>
        <button className="btn w-full" onClick={() => testAlarm()}>
          <Siren size={18} aria-hidden="true" /> Probar alarma (sonido y vibración)
        </button>
        <button className="btn w-full" onClick={() => void activarNotificaciones()}>
          <BellRinging size={18} aria-hidden="true" />
          {notifState === "granted" ? "Notificaciones activas — re-registrar" : "Activar notificaciones"}
        </button>
        {notifState === "denied" && (
          <p className="text-[12px] text-danger">
            Bloqueadas por el navegador. Habilitalas en ⋮ → Configuración del sitio.
          </p>
        )}
      </div>

      {/* Datos sin señal */}
      <div className="space-y-2 rounded-lg border border-line bg-panel2 p-3">
        <div className="tag text-mut">Datos sin señal</div>
        <div className="text-[13.5px]">
          <strong>{queue.pending}</strong> pendiente(s) · <strong>{queue.errors}</strong> con error
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn py-2" onClick={() => void syncNow().then(() => notify("Datos actualizados", "success"))}>
            <DownloadSimple size={18} aria-hidden="true" /> Sincronizar
          </button>
          <button className="btn py-2" onClick={() => void retryQueue()}>
            <WifiHigh size={18} aria-hidden="true" /> Reintentar
          </button>
        </div>
        <button className="btn btn-ghost w-full py-1.5 text-[12.5px]" onClick={() => void cargarCola()}>
          Ver detalle de la cola
        </button>
        {queueList.length > 0 && (
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded border border-line bg-panel p-2 text-[12px]">
            {queueList.map((e) => (
              <li key={e.opId} className="flex items-center justify-between gap-2">
                <span className="font-mono">{e.kind}</span>
                <span className={e.status === "error" ? "text-danger" : "text-crash"}>
                  {e.status === "error" ? (e.lastError ?? "error") : "pendiente"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pantalla */}
      <div className="rounded-lg border border-line bg-panel2 p-3 text-[12.5px] text-mut">
        {wakeLock.supported
          ? wakeLock.held
            ? "✓ Pantalla encendida (Wake Lock activo)"
            : "La pantalla puede apagarse: vuelve a abrir la app para mantenerla encendida"
          : "Este navegador no permite mantener la pantalla encendida"}
      </div>

      {/* Versión */}
      <div className="rounded-lg border border-line bg-panel2 p-3">
        <div className="tag mb-1 text-mut">Versión</div>
        {needRefresh ? (
          mission ? (
            <p className="text-[12.5px] text-crash">Hay actualización — se aplicará al cerrar la misión.</p>
          ) : (
            <button className="btn btn-primary w-full" onClick={() => void updateServiceWorker(true)}>
              Actualizar ahora
            </button>
          )
        ) : (
          <p className="text-[12px] text-mut">La app está actualizada e instalable.</p>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- EQUIPO del vehículo (antes stub /equipo) ---------- */
/* Dónde está cada material (compartimento de la máquina, c1..c6) y cómo
   usarlo (notas precargadas por el jefe de guardia en la central).        */

const CATEGORY_LABEL: Record<string, string> = {
  extintor: "Extintor",
  manguera: "Manguera",
  herramienta: "Herramienta",
  rescate: "Rescate",
  medico: "Médico",
  comunicacion: "Comunicación",
  epp: "EPP",
  equipo: "Equipo",
};

function compartimentoLabel(c: string | null): string {
  const m = /^c(\d+)$/.exec(c ?? "");
  return m ? `Compartimento ${m[1]}` : "Sin ubicación asignada";
}

/** Fecha local YYYY-MM-DD (toISOString usaría UTC y desfila el día). */
function todayDay(): string {
  return new Intl.DateTimeFormat("sv-SE").format(new Date());
}

export function EquipoSheet({ onClose }: { onClose: () => void }) {
  const { unit, notify } = useApp();
  const [items, setItems] = useState<EquipmentItemDTO[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    async function load() {
      if (!unit) return;
      try {
        const data = await api.get<{ items: EquipmentItemDTO[] }>("/api/units/me/items");
        if (live) setItems(data.items);
      } catch {
        // Sin señal: lo cargado por la última sincronización (IndexedDB)
        try {
          const local = await db.equipment.where("unitId").equals(unit.id).toArray();
          if (live) setItems(local);
        } catch {
          if (live) setItems([]);
        }
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [unit]);

  const groups = new Map<string, EquipmentItemDTO[]>();
  for (const it of items ?? []) {
    const key = it.compartment ?? "sin";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  const orderedKeys = [...groups.keys()].sort((a, b) => {
    if (a === "sin") return 1;
    if (b === "sin") return -1;
    return a.localeCompare(b, "es", { numeric: true });
  });
  const day = todayDay();

  async function markChecked(it: EquipmentItemDTO) {
    setBusyId(it.id);
    const body = { day, opId: newOpId() };
    try {
      try {
        await api.patch(`/api/units/me/equipment/${it.id}`, body);
        notify(`${it.name} marcado revisado — registro enviado`, "success");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) throw e;
        // Sin señal: la marca se guarda en la cola (idempotente por opId)
        await enqueueOp({
          opId: body.opId,
          kind: "equipment_check",
          url: `/api/units/me/equipment/${it.id}`,
          method: "PATCH",
          body,
        });
        notify(`${it.name} marcado revisado — se envía al recuperar señal`, "info");
      }
      setItems((prev) => prev?.map((x) => (x.id === it.id ? { ...x, checkedToday: true } : x)) ?? prev);
    } catch {
      notify("No se pudo marcar el material", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Sheet title="Equipo · Vehículo" onClose={onClose} side="left">
      {items == null && <p className="text-[13px] text-mut">Cargando inventario…</p>}
      {items != null && items.length === 0 && (
        <p className="text-[13px] text-mut">El jefe de guardia aún no carga materiales para esta unidad.</p>
      )}
      {items != null &&
        orderedKeys.map((key) => (
          <section key={key}>
            <div className="border-b border-line pb-1 text-[13px] font-bold">
              {compartimentoLabel(key === "sin" ? null : key)}
              <span className="ml-2 text-[11px] text-mut">{groups.get(key)!.length}</span>
            </div>
            <ul className="mt-1.5 space-y-2">
              {groups.get(key)!.map((it) => (
                <li key={it.id} className="rounded-lg border border-line bg-panel2 p-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <strong className="text-[14.5px]">{it.name}</strong>
                    {it.quantity > 1 && <span className="font-mono text-[12px] text-mut">×{it.quantity}</span>}
                    <span className="pill text-mut">{CATEGORY_LABEL[it.category] ?? it.category}</span>
                    {it.condition !== "bueno" && (
                      <span className="pill text-warn">{it.condition === "malo" ? "⚠ malo" : "regular"}</span>
                    )}
                  </div>
                  {it.notes?.trim() && (
                    <p className="mt-1 text-[12.5px] leading-snug text-mut">
                      <span className="text-mut2">Uso / ubicación: </span>
                      {it.notes}
                    </p>
                  )}
                  {it.checkedToday ? (
                    <p className="mt-1 text-[12px] text-ok">✓ Revisado hoy</p>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm mt-1.5 py-1 text-[12.5px]"
                      disabled={busyId === it.id}
                      onClick={() => void markChecked(it)}
                    >
                      {busyId === it.id ? "Marcando…" : "Marcar revisado"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
    </Sheet>
  );
}

/* ---------- MISIONES cerradas de la unidad (antes stub /historial) ---------- */

interface MissionRow {
  id: number;
  title: string;
  address: string;
  severity: string;
  createdAt: string;
  closedAt: string;
  result: string;
  injured: number;
  observations?: string | null;
}

const RESULT_LABEL: Record<string, string> = {
  controlado: "Controlado",
  sin_novedad: "Sin novedad",
  falsa_alarma: "Falsa alarma",
  derivado: "Derivado",
};

const RESULT_CLASS: Record<string, string> = {
  controlado: "text-ok",
  sin_novedad: "text-ok",
  falsa_alarma: "text-warn",
  derivado: "text-mut",
};

export function MisionesSheet({ onClose }: { onClose: () => void }) {
  const { unit } = useApp();
  const [rows, setRows] = useState<MissionRow[] | null>(null);

  useEffect(() => {
    let live = true;
    async function load() {
      if (!unit) return;
      try {
        const data = await api.get<{ missions: MissionRow[] }>("/api/units/me/missions");
        if (live) setRows(data.missions);
      } catch {
        if (live) setRows([]);
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [unit]);

  return (
    <Sheet title="Misiones cerradas" onClose={onClose}>
      {rows == null && <p className="text-[13px] text-mut">Cargando historial…</p>}
      {rows != null && rows.length === 0 && (
        <p className="text-[13px] text-mut">Sin misiones cerradas todavía. Cuando cierres una emergencia aparecerá aquí.</p>
      )}
      {rows != null && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((m) => {
            const minutes = Math.max(
              1,
              Math.round((new Date(m.closedAt).getTime() - new Date(m.createdAt).getTime()) / 60000),
            );
            return (
              <li key={m.id} className="rounded-lg border border-line bg-panel2 p-2.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <strong className="text-[14.5px]">{m.title}</strong>
                  <span className={`pill ${RESULT_CLASS[m.result] ?? "text-mut"}`}>
                    {RESULT_LABEL[m.result] ?? m.result}
                  </span>
                  {m.injured > 0 && <span className="pill text-danger">🚑 {m.injured} herido(s)</span>}
                </div>
                <p className="mt-0.5 text-[12.5px] text-mut">{m.address}</p>
                <p className="mt-0.5 text-[11.5px] text-mut2">
                  {fmtClock(m.createdAt)} · {fmtMinutes(minutes)} · cerrada {timeAgo(m.closedAt)}
                </p>
                {m.observations && <p className="mt-1 text-[12px] leading-snug text-mut">{m.observations}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
