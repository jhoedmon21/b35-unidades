// Rutas por carretera con OSRM (configurable por el backend en /sync).
// La ruta de la misión se guarda en caché local: si la señal cae después
// de recibirla, el mapa sigue mostrándola. Con anotaciones por tramo para
// calcular el TIEMPO RESTANTE desde la posición actual (estilo Uber).

export interface RouteInfo {
  distanceM: number;
  durationS: number;
  /** [lat, lng] listos para el Polyline de MapLibre */
  coords: [number, number][];
  /** Distancia acumulada (m) por nodo — durations/distances[idx] = desde la salida */
  cumDistances: number[];
  /** Tiempo acumulado (s) por nodo */
  cumDurations: number[];
  cachedAt: number;
}

export async function fetchRoute(
  baseUrl: string,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<RouteInfo | null> {
  try {
    const url = `${baseUrl.replace(/\/$/, "")}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&annotations=duration,distance`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code: string;
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
        legs?: Array<{
          annotation?: { duration?: number[]; distance?: number[] };
        }>;
      }>;
    };
    const route = data.routes?.[0];
    if (data.code !== "Ok" || !route) return null;

    const coords: [number, number][] = route.geometry.coordinates.map(
      ([lng, lat]) => [lat, lng] as [number, number],
    );

    // Anotaciones por segmento → acumuladas por nodo (para el tiempo restante)
    const segDur = route.legs?.[0]?.annotation?.duration;
    const segDist = route.legs?.[0]?.annotation?.distance;
    const cumDistances: number[] = [0];
    const cumDurations: number[] = [0];
    if (segDist && segDur && segDist.length === coords.length - 1) {
      for (let i = 0; i < segDist.length; i++) {
        cumDistances.push(cumDistances[i] + segDist[i]);
        cumDurations.push(cumDurations[i] + segDur[i]);
      }
    } else {
      // Respaldo: reparto proporcional por nodo
      for (let i = 1; i < coords.length; i++) {
        const f = i / (coords.length - 1);
        cumDistances.push(route.distance * f);
        cumDurations.push(route.duration * f);
      }
    }

    return {
      distanceM: route.distance,
      durationS: route.duration,
      coords,
      cumDistances,
      cumDurations,
      cachedAt: Date.now(),
    };
  } catch {
    return null; // sin señal: el llamador usa la caché local
  }
}

/** Distancia (m) entre dos puntos — para ubicar la unidad sobre la ruta */
export type Point = { lat: number; lng: number } | [number, number];

function norm(p: Point): { lat: number; lng: number } {
  return Array.isArray(p) ? { lat: p[0], lng: p[1] } : p;
}

export function haversineM(a: Point, b: Point): number {
  const A = norm(a);
  const B = norm(b);
  const rad = Math.PI / 180;
  const R = 6_371_000;
  const dLat = (B.lat - A.lat) * rad;
  const dLng = (B.lng - A.lng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(A.lat * rad) * Math.cos(B.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Índice del nodo de ruta más cercano a la posición de la unidad */
export function nearestRouteIndex(route: RouteInfo, at: { lat: number; lng: number }): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < route.coords.length; i++) {
    const d = haversineM(route.coords[i], at);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
