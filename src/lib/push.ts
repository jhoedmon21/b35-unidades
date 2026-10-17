// Web Push: suscripción de la tablet con las claves VAPID del servidor.
// Si cambia la suscripción (reinstalación, nuevo registro del navegador)
// se reenvía al backend con el mismo endpoint (upsert).

import { api } from "./api";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export type PushState = "unsupported" | "denied" | "no-sw" | "no-key" | "granted";

/** Pide permiso de notificaciones (con gesto del usuario) */
export async function ensurePermission(): Promise<PushState> {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  const result = await Notification.requestPermission();
  return result === "granted" ? "granted" : "denied";
}

/** Registra la suscripción push de esta tablet en el backend */
export async function ensurePushSubscription(): Promise<PushState> {
  const permission = await ensurePermission();
  if (permission !== "granted") return permission;
  if (!("serviceWorker" in navigator)) return "no-sw";

  const { publicKey } = await api.get<{ publicKey: string }>("/api/push/key");
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();

  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  const json = subscription.toJSON();
  await api.post("/api/units/me/push-subscription", {
    endpoint: json.endpoint,
    keys: { p256dh: (json.keys as Record<string, string>).p256dh, auth: (json.keys as Record<string, string>).auth },
  });
  return "granted";
}

/** Registra la suscripción para ALERTAS DE EMERGENCIA sin sesión (modo
 *  bombero): va al endpoint público y conserva la unidad si esta tablet
 *  ya se suscribió como chofer (sigue recibiendo despachos además). */
export async function ensurePushSubscriptionPublic(): Promise<PushState> {
  const permission = await ensurePermission();
  if (permission !== "granted") return permission;
  if (!("serviceWorker" in navigator)) return "no-sw";

  const { publicKey } = await api.get<{ publicKey: string }>("/api/push/key");
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();

  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  const json = subscription.toJSON();
  await api.post("/api/push/subscription", {
    endpoint: json.endpoint,
    keys: { p256dh: (json.keys as Record<string, string>).p256dh, auth: (json.keys as Record<string, string>).auth },
  });
  return "granted";
}

/** Estado del permiso SIN pedirlo (para pintar la UI al cargar) */
export function permissionState(): "granted" | "denied" | "prompt" | "unsupported" {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission as "granted" | "denied" | "prompt";
}
