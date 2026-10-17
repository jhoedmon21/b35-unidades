// Ajustes: probar alarma y notificaciones, tema día/noche, estado de la
// pantalla encendida, cola de cambios sin enviar, sincronización manual,
// versión de la app (actualización controlada) y cierre de sesión.

import { useState } from "react";
import {
  BellRinging,
  DownloadSimple,
  Power,
  SignIn,
  Siren,
  WifiHigh,
} from "@phosphor-icons/react";
import { testAlarm } from "../lib/alarm";
import { usePwaUpdate } from "../lib/pwa";
import { ensurePushSubscription, ensurePushSubscriptionPublic, permissionState } from "../lib/push";
import { listQueue } from "../db/queue";
import { useApp } from "../state/AppContext";

export default function Settings() {
  const {
    user,
    unit,
    wakeLock,
    queue,
    retryQueue,
    syncNow,
    logout,
    enterLogin,
    notify,
    mission,
  } = useApp();
  const { needRefresh, updateServiceWorker } = usePwaUpdate();
  const [notifState, setNotifState] = useState(permissionState());
  const [queueList, setQueueList] = useState<Array<{ opId: string; kind: string; status: string; lastError?: string }>>([]);

  async function activarNotificaciones() {
    // Con sesión de chofer: suscripción ligada a la unidad (despachos).
    // Sin sesión (modo bombero): suscripción pública de emergencias.
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
    <div className="mx-auto max-w-xl space-y-4">
      {/* Perfil */}
      <section className="card spine-mut p-4">
        <div className="text-[13px] text-mut">{user ? "Conductor" : "Vista de bomberos"}</div>
        <div className="text-lg font-bold">{user?.name ?? "Sin credenciales"}</div>
        <div className="text-[13px] text-mut">
          {unit ? `${unit.code} — ${unit.name} · ` : ""}
          {user?.role === "jefe" ? "Jefe de guardia" : user ? "Conductor" : "Emergencias sin clave"}
        </div>
      </section>

      {/* Alertas */}
      <section className="card spine-fire space-y-3 p-4">
        <h2 className="tag text-mut">Alertas</h2>
        <button className="btn w-full" onClick={() => testAlarm()}>
          <Siren size={20} aria-hidden="true" /> Probar alarma (sonido y vibración)
        </button>
        <button className="btn w-full" onClick={() => void activarNotificaciones()}>
          <BellRinging size={20} aria-hidden="true" />
          {notifState === "granted"
            ? "Notificaciones activadas — volver a registrar"
            : unit
              ? "Activar notificaciones de despacho"
              : "Activar notificaciones de emergencia"}
        </button>
        {notifState === "denied" && (
          <p className="text-[12.5px] text-danger">
            Las notificaciones están bloqueadas para este sitio. Habilítalas en ⋮ → Configuración del sitio.
          </p>
        )}
      </section>

      {/* Conexión y datos locales (solo con sesión de chofer) */}
      {unit && (
        <section className="card spine-crash space-y-3 p-4">
          <h2 className="tag text-mut">Datos sin señal</h2>
          <div className="text-[14px]">
            <strong>{queue.pending}</strong> cambio(s) pendientes · <strong>{queue.errors}</strong> con error
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn" onClick={() => void syncNow().then(() => notify("Datos actualizados", "success"))}>
              <DownloadSimple size={20} aria-hidden="true" /> Sincronizar
            </button>
            <button className="btn" onClick={() => void retryQueue()}>
              <WifiHigh size={20} aria-hidden="true" /> Reintentar errores
            </button>
          </div>
          <button className="btn btn-ghost w-full text-[13px]" onClick={() => void cargarCola()}>
            Ver detalle de la cola
          </button>
          {queueList.length > 0 && (
            <ul className="max-h-52 space-y-1.5 overflow-y-auto rounded-lg border border-line bg-panel2 p-2 text-[12.5px]">
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
        </section>
      )}

      {/* Pantalla */}
      <section className="card spine-mut space-y-3 p-4">
        <h2 className="tag text-mut">Pantalla</h2>
        <p className="text-[13px] leading-relaxed text-mut">
          Interfaz clara para el día: paneles blancos como la central, rojo
          reservado para emergencias.
        </p>
        <p className="text-[12.5px] text-mut">
          {wakeLock.supported
            ? wakeLock.held
              ? "✓ Pantalla encendida (Wake Lock activo)"
              : "La pantalla puede apagarse: vuelve a abrir la app para mantenerla encendida"
            : "Este navegador no permite mantener la pantalla encendida"}
        </p>
      </section>

      {/* Versión / actualización */}
      <section className="card space-y-2 p-4">
        <h2 className="tag text-mut">Versión</h2>
        {needRefresh ? (
          mission ? (
            <p className="text-[13.5px] text-crash">
              Hay una actualización pendiente — se aplicará al cerrar la misión para no interrumpir la atención.
            </p>
          ) : (
            <button className="btn btn-primary w-full" onClick={() => void updateServiceWorker(true)}>
              Actualizar ahora
            </button>
          )
        ) : (
          <p className="text-[12.5px] text-mut">La app está actualizada e instalable («Agregar a pantalla de inicio»).</p>
        )}
      </section>

      {/* Sesión: el chofer cierra; el bombero sin clave puede abrir una */}
      <section className="card p-4">
        {user ? (
          <>
            <button className="btn w-full text-danger" onClick={() => void logout()}>
              <Power size={20} aria-hidden="true" /> Cerrar sesión
            </button>
            <p className="mt-2 text-[12px] text-mut2">
              La central también puede cerrar esta sesión a distancia si la tablet se pierde.
            </p>
          </>
        ) : (
          <>
            <button className="btn w-full" onClick={enterLogin}>
              <SignIn size={20} aria-hidden="true" /> Ingresar como chofer
            </button>
            <p className="mt-2 text-[12px] text-mut2">
              Las alertas se ven sin clave. Los choferes desbloquean la misión completa con sus credenciales.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
