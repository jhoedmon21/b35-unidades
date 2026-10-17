// Pruebas de la cola de sincronización y de la idempotencia:
// el núcleo puro (queue-core) corre contra un almacén en memoria, sin
// navegador ni IndexedDB. Ejecutar:  npm test

import { describe, expect, it } from "vitest";
import {
  enqueue,
  flushQueue,
  pendingCount,
  purgeSent,
  retryErrors,
  type QueueEntry,
  type QueueOp,
  type QueueStore,
} from "../src/db/queue-core";

class MemoryStore implements QueueStore {
  rows = new Map<string, QueueEntry>();
  clock = 1;

  async list(): Promise<QueueEntry[]> {
    return [...this.rows.values()].sort((a, b) => a.createdAt - b.createdAt);
  }
  async put(entry: QueueEntry): Promise<void> {
    this.rows.set(entry.opId, entry);
  }
  async remove(opId: string): Promise<void> {
    this.rows.delete(opId);
  }

  op(partial: Partial<QueueOp> & { opId: string }): QueueOp {
    return {
      kind: "status",
      url: "/api/units/me/status",
      method: "PATCH",
      body: { status: "en_ruta" },
      createdAt: this.clock++,
      ...partial,
    };
  }
}

const ok = async () => ({ ok: true as const });
const networkDown = async () => ({ ok: false as const, permanent: false, error: "sin conexión" });
const conflict = async () => ({ ok: false as const, permanent: true, error: "La central cambió tu estado" });

describe("cola de sincronización", () => {
  it("envía en orden FIFO y marca como enviada", async () => {
    const store = new MemoryStore();
    const order: string[] = [];
    await enqueue(store, store.op({ opId: "a", kind: "status" }));
    await enqueue(store, store.op({ opId: "b", kind: "equipment_check", url: "/api/units/me/equipment/1" }));
    const result = await flushQueue(store, async (op) => {
      order.push(op.opId);
      return ok();
    });
    expect(result).toEqual({ sent: 2, failed: 0 });
    expect(order).toEqual(["a", "b"]);
    expect((await store.list()).every((e) => e.status === "enviada")).toBe(true);
  });

  it("no duplica el mismo opId (idempotencia de intentos)", async () => {
    const store = new MemoryStore();
    await enqueue(store, store.op({ opId: "mismo" }));
    await enqueue(store, store.op({ opId: "mismo" }));
    expect((await store.list()).length).toBe(1);
  });

  it("reemplaza la posición pendiente anterior del mismo grupo (dedupeGroup)", async () => {
    const store = new MemoryStore();
    await enqueue(store, store.op({ opId: "loc-1", kind: "location", dedupeGroup: "location", body: { lat: 1 } }));
    await enqueue(store, store.op({ opId: "loc-2", kind: "location", dedupeGroup: "location", body: { lat: 2 } }));
    const rows = await store.list();
    expect(rows.length).toBe(1);
    expect(rows[0].opId).toBe("loc-2");
    expect((rows[0].body as { lat: number }).lat).toBe(2);
  });

  it("mantiene la operación pendiente si la red falla y la envía después", async () => {
    const store = new MemoryStore();
    await enqueue(store, store.op({ opId: "x" }));

    // Primer intento: sin señal → sigue pendiente, suma intento
    let result = await flushQueue(store, networkDown);
    expect(result).toEqual({ sent: 0, failed: 1 });
    let rows = await store.list();
    expect(rows[0].status).toBe("pendiente");
    expect(rows[0].attempts).toBe(1);
    expect(await pendingCount(store)).toBe(1);

    // Vuelve la señal → se envía
    result = await flushQueue(store, ok);
    expect(result).toEqual({ sent: 1, failed: 0 });
    rows = await store.list();
    expect(rows[0].status).toBe("enviada");
    expect(await pendingCount(store)).toBe(0);
  });

  it("marca error definitivo en 4xx (no reintenta) y se recupera con retryErrors", async () => {
    const store = new MemoryStore();
    await enqueue(store, store.op({ opId: "c" }));

    await flushQueue(store, conflict);
    let rows = await store.list();
    expect(rows[0].status).toBe("error");
    expect(rows[0].lastError).toContain("central");

    // El flush normal ignora las marcadas como error…
    let result = await flushQueue(store, ok);
    expect(result.sent).toBe(0);
    // …hasta que el usuario reintenta
    expect(await retryErrors(store)).toBe(1);
    result = await flushQueue(store, ok);
    expect(result.sent).toBe(1);
    rows = await store.list();
    expect(rows[0].status).toBe("enviada");
  });

  it("cuenta pendientes y errores por separado", async () => {
    const store = new MemoryStore();
    await enqueue(store, store.op({ opId: "p1" }));
    await enqueue(store, store.op({ opId: "p2" }));
    await enqueue(store, store.op({ opId: "e1" }));
    await flushQueue(store, async (op) => (op.opId === "e1" ? conflict() : networkDown()));
    // p1 y p2 siguen pendientes (falla de red), e1 quedó en error
    const rows = await store.list();
    expect(rows.filter((r) => r.status === "pendiente").length).toBe(2);
    expect(rows.filter((r) => r.status === "error").length).toBe(1);
    expect(await pendingCount(store)).toBe(3);
  });

  it("purga las enviadas antiguas para no crecer sin límite", async () => {
    const store = new MemoryStore();
    const base = { kind: "status", url: "/api/units/me/status", method: "PATCH", body: {} } as const;
    // Enviada hace 2 horas y otra recién enviada
    await store.put({
      ...base,
      opId: "vieja",
      createdAt: 1000,
      status: "enviada",
      attempts: 1,
      sentAt: Date.now() - 2 * 60 * 60 * 1000,
    });
    await store.put({
      ...base,
      opId: "nueva",
      createdAt: 2000,
      status: "enviada",
      attempts: 1,
      sentAt: Date.now(),
    });
    const removed = await purgeSent(store, 60 * 60 * 1000); // límite: 1 h
    expect(removed).toBe(1);
    const rows = await store.list();
    expect(rows.length).toBe(1);
    expect(rows[0].opId).toBe("nueva");
  });

  it("un opId repetido tras haberse enviado no se re-encola", async () => {
    const store = new MemoryStore();
    await enqueue(store, store.op({ opId: "una-vez" }));
    await flushQueue(store, ok);
    await enqueue(store, store.op({ opId: "una-vez" }));
    const rows = await store.list();
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("enviada");
  });
});
