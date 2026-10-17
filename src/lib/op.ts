// Ids de operación para idempotencia (la cola sin internet reintenta con el
// mismo opId y el servidor no duplica la acción).

export function newOpId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Respaldo para navegadores viejos
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
