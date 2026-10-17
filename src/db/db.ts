// Base local (IndexedDB vía Dexie): hidrantes, equipo, metadatos y la
// cola de operaciones pendientes (outbox) para trabajar sin internet.

import Dexie, { type EntityTable } from "dexie";
import type { EquipmentItemDTO, HydrantDTO, MissionPayload, SyncResponse } from "../lib/types";

/** Operación en cola — cada una lleva su opId para idempotencia */
export interface OutboxOp {
  opId: string;
  kind: "status" | "location" | "equipment_check" | "hydrant_new" | "hydrant_status" | "close_mission" | "mission_accept";
  url: string;
  method: string;
  body: unknown;
  /** Operaciones del mismo grupo se reemplazan (p. ej. la última posición GPS) */
  dedupeGroup?: string;
  status: "pendiente" | "enviada" | "error";
  attempts: number;
  lastError?: string;
  createdAt: number;
  sentAt?: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export const db = new Dexie("fuegomap-unidades") as Dexie & {
  hydrants: EntityTable<HydrantDTO, "id">;
  equipment: EntityTable<EquipmentItemDTO, "id">;
  outbox: EntityTable<OutboxOp, "opId">;
  meta: EntityTable<MetaRow, "key">;
};

db.version(1).stores({
  hydrants: "id, code, situation",
  equipment: "id, unitId, compartment, category",
  outbox: "opId, status, kind, dedupeGroup, createdAt",
  meta: "key",
});

// ---------- Helpers de metadatos (versión de sync, ETag, misión en caché) ----------

export async function getMeta<T>(key: string): Promise<T | null> {
  const row = await db.meta.get(key);
  return (row?.value as T) ?? null;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/** Guarda el sync completo local: hidrantes + equipo + zonas peligrosas + configuración */
export async function saveSyncLocally(data: SyncResponse): Promise<void> {
  await db.transaction("rw", db.hydrants, db.equipment, db.meta, async () => {
    await db.hydrants.clear();
    await db.hydrants.bulkPut(data.hydrants);
    await db.equipment.clear();
    await db.equipment.bulkPut(data.equipment);
    await setMeta("dangerZones", data.dangerZones);
    await setMeta("syncConfig", data.config);
    await setMeta("syncVersion", data.version);
    await setMeta("lastSyncAt", Date.now());
  });
}

/** Misión en caché (visible sin conexión tras recibirla) */
export async function cacheMission(mission: MissionPayload | null): Promise<void> {
  await setMeta("missionCache", mission);
}

export async function getCachedMission(): Promise<MissionPayload | null> {
  return getMeta<MissionPayload>("missionCache");
}

/** Limpia datos locales al cerrar sesión (se vuelven a bajar al entrar) */
export async function clearLocalData(): Promise<void> {
  await db.transaction("rw", db.hydrants, db.equipment, db.outbox, db.meta, async () => {
    await Promise.all([db.hydrants.clear(), db.equipment.clear(), db.outbox.clear(), db.meta.clear()]);
  });
}
