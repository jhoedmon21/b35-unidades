// Cliente HTTP de la PWA: mismo origen (proxy en dev / mismo host en prod),
// cookies httpOnly automáticas y errores tipados.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const TIMEOUT_MS = 15_000;

/** fetch con tope de tiempo: si la central no contesta, NUNCA colgar la app */
async function send(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { credentials: "same-origin", signal: ctrl.signal, ...init });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new ApiError(0, "La central no responde");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await send(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 304) throw new ApiError(304, "Sin cambios");
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Error ${res.status}`, data);
  return data;
}

export const api = {
  get: <T>(url: string, headers?: Record<string, string>) =>
    request<T>(url, { headers }) as Promise<T>,

  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),

  patch: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
};

/** GET con soporte de ETag: devuelve null si el servidor responde 304 */
export async function getWithETag<T>(url: string, etag: string | null): Promise<{ data: T; etag: string | null } | null> {
  const res = await send(url, {
    headers: etag ? { "If-None-Match": etag } : {},
  });
  if (res.status === 304) return null;
  const newEtag = res.headers.get("etag");
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, data.error ?? `Error ${res.status}`);
  }
  return { data: (await res.json()) as T, etag: newEtag };
}
