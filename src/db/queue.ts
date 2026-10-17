// Cola sobre IndexedDB (Dexie) + motor de reenvío:
// se dispara al volver la señal, cada 30 s, al volver a la app y a mano.
// Cada cambio de estado notifica a los suscriptores (indicadores UI).

import { db, type OutboxOp } from "./db";
import {
  enqueue,
  flushQueue,
  purgeSent,
  retryErrors,
  type QueueEntry,
  type QueueOp,
  type QueueStore,
} from "./queue-core";

const dexieStore: QueueStore = {
  async list() {
    return (await db.outbox.toArray()).sort((a, b) => a.createdAt - b.createdAt);
  },
  async put(entry: QueueEntry) {
    await db.outbox.put(entry as OutboxOp);
  },
  async remove(opId: string) {
    await db.outbox.delete(opId);
  },
};

// ---------- Suscriptores (refrescan contadores en la UI) ----------

type Listener = (pending: number, errors: number, entries: QueueEntry[]) => void;
const listeners = new Set<Listener>();

async function notify() {
  const entries = await dexieStore.list();
  const pending = entries.filter((e) => e.status === "pendiente").length;
  const errors = entries.filter((e) => e.status === "error").length;
  for (const fn of [...listeners]) {
    try {
      fn(pending, errors, entries);
    } catch {
      listeners.delete(fn);
    }
  }
}

export function subscribeQueue(fn: Listener): () => void {
  listeners.add(fn);
  void notify();
  return () => listeners.delete(fn);
}

/** Cola visible para la pantalla "Cambios sin enviar" */
export async function listQueue(): Promise<QueueEntry[]> {
  return dexieStore.list();
}

export async function getQueueCounts(): Promise<{ pending: number; errors: number }> {
  const entries = await dexieStore.list();
  return {
    pending: entries.filter((e) => e.status === "pendiente").length,
    errors: entries.filter((e) => e.status === "error").length,
  };
}

// ---------- Encolar ----------

export async function enqueueOp(op: Omit<QueueOp, "createdAt"> & { createdAt?: number }): Promise<void> {
  await enqueue(dexieStore, { createdAt: op.createdAt ?? Date.now(), ...op } as QueueOp);
  void notify();
}

// ---------- Envío ----------

let flushing = false;

async function send(op: QueueOp): Promise<{ ok: true } | { ok: false; permanent: boolean; error: string }> {
  try {
    const res = await fetch(op.url, {
      method: op.method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(op.body),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    // 4xx (salvo 429): error definitivo — no reintentar
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    return { ok: false, permanent, error: data.error ?? `HTTP ${res.status}` };
  } catch {
    return { ok: false, permanent: false, error: "sin conexión" };
  }
}

/** Intenta enviar todo lo pendiente; seguro llamarlo en cualquier momento */
export async function flush(): Promise<{ sent: number; failed: number }> {
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  if (flushing || !online) return { sent: 0, failed: 0 };
  flushing = true;
  try {
    const result = await flushQueue(dexieStore, send);
    await purgeSent(dexieStore, 24 * 60 * 60 * 1000); // higiene: enviadas de hace > 24 h
    void notify();
    return result;
  } finally {
    flushing = false;
  }
}

/** Reintento manual de las operaciones con error */
export async function retryAll(): Promise<number> {
  const n = await retryErrors(dexieStore);
  void notify();
  void flush();
  return n;
}

// ---------- Disparadores automáticos ----------

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flush());
  window.addEventListener("focus", () => void flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flush();
  });
  // Reintento periódico: cubre redes que no disparan "online" (móvil inestable)
  setInterval(() => void flush(), 30_000);
}
