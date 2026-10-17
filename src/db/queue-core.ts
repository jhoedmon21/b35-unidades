// ============================================================
//  Núcleo de la cola de sincronización — lógica PURA (sin Dexie ni
//  fetch) para poder probarla con vitest usando un almacén en memoria.
//  Reglas:
//  · El mismo opId nunca se encola dos veces (idempotencia de intentos)
//  · dedupeGroup: la nueva operación reemplaza a la pendiente anterior
//    del grupo (posición GPS, estado repetido)
//  · flush: FIFO · éxito → "enviada" · error 4xx (no 429) → "error"
//    definitivo visible · red caída/5xx → sigue "pendiente" y reintenta
// ============================================================

export interface QueueOp {
  opId: string;
  kind: string;
  url: string;
  method: string;
  body: unknown;
  dedupeGroup?: string;
  createdAt: number;
}

export interface QueueEntry extends QueueOp {
  status: "pendiente" | "enviada" | "error";
  attempts: number;
  lastError?: string;
  sentAt?: number;
}

export interface QueueStore {
  /** Todas las entradas ordenadas por createdAt ascendente (FIFO) */
  list(): Promise<QueueEntry[]>;
  /** Inserta o actualiza por opId */
  put(entry: QueueEntry): Promise<void>;
  remove(opId: string): Promise<void>;
}

/** Encola una operación sin duplicar intentos ni acumular del mismo grupo */
export async function enqueue(store: QueueStore, op: QueueOp): Promise<QueueEntry> {
  const existing = await store.list();

  // El mismo opId ya está en la cola → no duplicar
  if (existing.some((e) => e.opId === op.opId)) {
    return existing.find((e) => e.opId === op.opId)!;
  }

  // Reemplaza la operación pendiente anterior del mismo grupo (p. ej. GPS)
  if (op.dedupeGroup) {
    for (const e of existing) {
      if (e.dedupeGroup === op.dedupeGroup && e.status === "pendiente") {
        await store.remove(e.opId);
      }
    }
  }

  const entry: QueueEntry = { ...op, status: "pendiente", attempts: 0 };
  await store.put(entry);
  return entry;
}

/** Cambios sin enviar (pendientes + con error) */
export async function pendingCount(store: QueueStore): Promise<number> {
  const all = await store.list();
  return all.filter((e) => e.status !== "enviada").length;
}

export type DoFetch = (
  op: QueueOp,
) => Promise<{ ok: true } | { ok: false; permanent: boolean; error: string }>;

/** Recorre la cola en orden: envía pendientes, marca errores definitivos */
export async function flushQueue(
  store: QueueStore,
  doFetch: DoFetch,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const entry of await store.list()) {
    if (entry.status === "enviada") continue;
    if (entry.status === "error") continue; // requiere revisión del usuario
    const res = await doFetch(entry);
    if (res.ok) {
      sent++;
      await store.put({
        ...entry,
        status: "enviada",
        attempts: entry.attempts + 1,
        sentAt: Date.now(),
        lastError: undefined,
      });
    } else if (res.permanent) {
      failed++;
      await store.put({ ...entry, status: "error", attempts: entry.attempts + 1, lastError: res.error });
    } else {
      failed++;
      await store.put({ ...entry, attempts: entry.attempts + 1, lastError: res.error });
    }
  }
  return { sent, failed };
}

/** Pone de nuevo en "pendiente" las operaciones con error (botón Reintentar) */
export async function retryErrors(store: QueueStore): Promise<number> {
  let n = 0;
  for (const entry of await store.list()) {
    if (entry.status === "error") {
      await store.put({ ...entry, status: "pendiente", lastError: undefined });
      n++;
    }
  }
  return n;
}

/** Elimina las enviadas más antiguas que `olderThanMs` (higiene del outbox) */
export async function purgeSent(store: QueueStore, olderThanMs: number): Promise<number> {
  const cutoff = Date.now() - olderThanMs;
  let n = 0;
  for (const entry of await store.list()) {
    if (entry.status === "enviada" && (entry.sentAt ?? entry.createdAt) < cutoff) {
      await store.remove(entry.opId);
      n++;
    }
  }
  return n;
}
