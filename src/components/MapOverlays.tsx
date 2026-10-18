// ============================================================
//  Paneles flotantes de la cabina — TODO lo que antes eran ventanas
//  independientes (Chat, Detalle de emergencia, Ficha del edificio,
//  Cierre de misión, Ajustes) vive AHORA sobre el mapa de /mapa:
//  una sola ventana, el mapa manda.
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
  BellRinging,
  DownloadSimple,
  MapPin,
  PaperPlaneTilt,
  Power,
  Siren,
  WifiHigh,
  X,
} from "@phosphor-icons/react";
import { api, ApiError } from "../lib/api";
import { testAlarm } from "../lib/alarm";
import { usePwaUpdate } from "../lib/pwa";
import { ensurePushSubscription, ensurePushSubscriptionPublic, permissionState } from "../lib/push";
import { enqueueOp, listQueue } from "../db/queue";
import { db } from "../db/db";
import { newOpId } from "../lib/op";
import { fmtClock, fmtDistance, fmtMinutes, timeAgo } from "../lib/format";
import { incidentKind, SEVERITY_LABEL } from "../lib/status";
import { cx } from "../lib/cx";
import { useApp } from "../state/AppContext";
import type { EquipmentItemDTO } from "../lib/types";

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
  const { chat, refreshChat, sendChatMsg, markChatSeen } = useApp();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <Sheet title="Chat · Central" onClose={onClose}>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-line bg-panel2 p-2.5">
        {!chat && <p className="text-[13px] text-mut">Cargando mensajes…</p>}
        {chat?.length === 0 && (
          <p className="text-[13px] text-mut">Sin mensajes. Escribe a la central — la respuesta llega aqui al instante.</p>
        )}
        {chat?.map((m) => (
          <div key={m.id} className={cx("flex", m.from === "unidad" ? "justify-end" : "justify-start")}>
            <div
              className={cx(
                "max-w-[85%] rounded-xl border px-3 py-2 text-[14px] leading-snug",
                m.from === "unidad" ? "border-fire/50 bg-fire/10 text-tx" : "border-line bg-panel text-tx",
              )}
            >
              <p className="break-words whitespace-pre-wrap">{m.body}</p>
              <p className="mt-0.5 text-right text-[10px] text-mut" suppressHydrationWarning>
                {m.from === "unidad" ? "tú" : "central"} ·{" "}
                {new Date(m.at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={(e) => void submit(e)} className="flex shrink-0 items-center gap-2 pt-1">
        <input
          className="input flex-1 py-2.5 text-[14px]"
          placeholder="Mensaje a la central…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Escribir mensaje"
          autoComplete="off"
          maxLength={1000}
        />
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
  const { missionDetail, unit, online, setStatus, notify, refreshMe, refreshMission } = useApp();
  const [result, setResult] = useState("controlado");
  const [injured, setInjured] = useState("0");
  const [observations, setObservations] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [sendBusy, setSendBusy] = useState(false);

  const incident = missionDetail?.incident ?? null;

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
